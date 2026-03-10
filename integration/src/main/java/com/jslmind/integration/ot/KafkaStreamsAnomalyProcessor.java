package com.jslmind.integration.ot;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.temporal.client.WorkflowClient;
import io.temporal.client.WorkflowOptions;
import io.temporal.serviceclient.WorkflowServiceStubs;
import io.temporal.serviceclient.WorkflowServiceStubsOptions;
import org.apache.kafka.common.serialization.Serdes;
import org.apache.kafka.streams.*;
import org.apache.kafka.streams.kstream.*;
import org.apache.kafka.streams.state.Stores;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import javax.sql.DataSource;
import java.sql.*;
import java.time.Duration;
import java.time.Instant;
import java.util.Properties;
import java.util.UUID;

@Component
public class KafkaStreamsAnomalyProcessor {

    private static final Logger log = LoggerFactory.getLogger(KafkaStreamsAnomalyProcessor.class);
    private static final double Z_SCORE_THRESHOLD = 3.0;
    private static final int MIN_SAMPLES = 10; // minimum window samples before scoring

    private KafkaStreams streams;

    @Value("${kafka.brokers:redpanda:29092}")
    private String kafkaBrokers;

    @Value("${temporal.address:temporal:7233}")
    private String temporalAddress;

    private final DataSource timescaleDs;
    private final ObjectMapper mapper;

    public KafkaStreamsAnomalyProcessor(
            @Value("#{@timescaleDataSource}") DataSource timescaleDs,
            ObjectMapper mapper) {
        this.timescaleDs = timescaleDs;
        this.mapper = mapper;
    }

    @PostConstruct
    public void start() {
        Properties props = new Properties();
        props.put(StreamsConfig.APPLICATION_ID_CONFIG, "jsl-anomaly-detector");
        props.put(StreamsConfig.BOOTSTRAP_SERVERS_CONFIG, kafkaBrokers);
        props.put(StreamsConfig.DEFAULT_KEY_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        props.put(StreamsConfig.DEFAULT_VALUE_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        props.put(StreamsConfig.STATE_DIR_CONFIG, "/tmp/kafka-streams");

        StreamsBuilder builder = new StreamsBuilder();

        // In-memory state store: key = "equipment_id|tag", value = AnomalyState
        builder.addStateStore(
            Stores.keyValueStoreBuilder(
                Stores.inMemoryKeyValueStore("anomaly-state-store"),
                Serdes.String(),
                Serdes.serdeFrom(
                    (topic, data) -> serialize(data),
                    (topic, data) -> deserialize(data)
                )
            )
        );

        builder.stream("plant.sensors", Consumed.with(Serdes.String(), Serdes.String()))
            .process(() -> new AnomalyDetectProcessor(), "anomaly-state-store");

        streams = new KafkaStreams(builder.build(), props);
        streams.start();
        log.info("[AnomalyProcessor] Kafka Streams started — watching plant.sensors");
    }

    @PreDestroy
    public void stop() {
        if (streams != null) streams.close(Duration.ofSeconds(10));
    }

    // ── Processor ─────────────────────────────────────────────────────────────
    private class AnomalyDetectProcessor implements Processor<String, String> {
        private ProcessorContext ctx;
        private org.apache.kafka.streams.state.KeyValueStore<String, AnomalyState> store;

        @Override
        @SuppressWarnings("unchecked")
        public void init(ProcessorContext ctx) {
            this.ctx = ctx;
            this.store = ctx.getStateStore("anomaly-state-store");
        }

        @Override
        public void process(String key, String value) {
            try {
                SensorReading r = mapper.readValue(value, SensorReading.class);
                String storeKey = r.equipmentId() + "|" + r.tag();

                AnomalyState state = store.get(storeKey);
                if (state == null) state = new AnomalyState();

                double zScore = state.count >= MIN_SAMPLES ? state.zScore(r.value()) : 0.0;
                state.update(r.value());
                store.put(storeKey, state);

                if (zScore >= Z_SCORE_THRESHOLD) {
                    log.warn("[ANOMALY] {}/{} value={} z={} (mean={} σ={})",
                        r.equipmentId(), r.tag(), r.value(),
                        String.format("%.2f", zScore),
                        String.format("%.2f", state.mean),
                        String.format("%.2f", state.stddev()));
                    persistAnomaly(r, state, zScore);
                    triggerCBMWorkflow(r, zScore, state);
                }
            } catch (Exception e) {
                log.error("Anomaly processor error: {}", e.getMessage());
            }
        }

        @Override public void close() {}
    }

    // ── TimescaleDB anomaly_events write ──────────────────────────────────────
    private void persistAnomaly(SensorReading r, AnomalyState state, double zScore) {
        try (Connection conn = timescaleDs.getConnection();
             PreparedStatement ps = conn.prepareStatement("""
                 INSERT INTO anomaly_events
                   (time, equipment_id, tag, value, mean_val, stddev_val, z_score)
                 VALUES (?,?,?,?,?,?,?)
                 """)) {
            ps.setTimestamp(1, Timestamp.from(Instant.now()));
            ps.setString(2, r.equipmentId());
            ps.setString(3, r.tag());
            ps.setDouble(4, r.value());
            ps.setDouble(5, state.mean);
            ps.setDouble(6, state.stddev());
            ps.setDouble(7, zScore);
            ps.executeUpdate();
        } catch (Exception e) {
            log.error("Failed to persist anomaly event: {}", e.getMessage());
        }
    }

    // ── Temporal CBMWorkflow trigger ──────────────────────────────────────────
    private void triggerCBMWorkflow(SensorReading r, double zScore, AnomalyState state) {
        try {
            WorkflowServiceStubs service = WorkflowServiceStubs.newServiceStubs(
                WorkflowServiceStubsOptions.newBuilder().setTarget(temporalAddress).build()
            );
            WorkflowClient client = WorkflowClient.newInstance(service);

            String workflowId = "cbm-" + r.equipmentId() + "-" + UUID.randomUUID().toString().substring(0, 8);
            var options = WorkflowOptions.newBuilder()
                .setTaskQueue("cbm-task-queue")
                .setWorkflowId(workflowId)
                .build();

            // Start asynchronously — don't block the Kafka Streams thread
            com.jslmind.workflows.CBMWorkflow wf =
                client.newWorkflowStub(com.jslmind.workflows.CBMWorkflow.class, options);

            WorkflowClient.start(wf::execute, java.util.Map.of(
                "equipment_id",  r.equipmentId(),
                "line_id",       r.lineId(),
                "tag",           r.tag(),
                "value",         r.value(),
                "z_score",       zScore,
                "mean",          state.mean,
                "stddev",        state.stddev(),
                "detected_at",   r.timestamp()
            ));
            log.info("[AnomalyProcessor] CBMWorkflow started: {}", workflowId);
        } catch (Exception e) {
            log.error("Failed to trigger CBMWorkflow: {}", e.getMessage());
        }
    }

    // Trivial Java serialization for in-memory store (demo only)
    private byte[] serialize(AnomalyState s) {
        try { return mapper.writeValueAsBytes(s); } catch (Exception e) { return new byte[0]; }
    }
    private AnomalyState deserialize(byte[] data) {
        try { return mapper.readValue(data, AnomalyState.class); } catch (Exception e) { return new AnomalyState(); }
    }
}
