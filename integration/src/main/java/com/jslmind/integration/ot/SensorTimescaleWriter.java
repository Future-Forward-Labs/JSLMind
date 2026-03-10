package com.jslmind.integration.ot;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.OffsetDateTime;

@Component
public class SensorTimescaleWriter {

    private static final Logger log = LoggerFactory.getLogger(SensorTimescaleWriter.class);
    private static final String INSERT_SQL = """
        INSERT INTO sensor_readings
          (time, equipment_id, equipment_desc, line_id, plant, tag, value, unit, anomaly_injected)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """;

    private final DataSource timescaleDs;
    private final ObjectMapper mapper;

    public SensorTimescaleWriter(
            @Value("#{@timescaleDataSource}") DataSource timescaleDs,
            ObjectMapper mapper) {
        this.timescaleDs = timescaleDs;
        this.mapper = mapper;
    }

    @KafkaListener(topics = "plant.sensors", groupId = "tsdb-writer",
                   containerFactory = "sensorKafkaListenerFactory")
    public void onMessage(String payload) {
        try {
            SensorReading r = mapper.readValue(payload, SensorReading.class);
            try (Connection conn = timescaleDs.getConnection();
                 PreparedStatement ps = conn.prepareStatement(INSERT_SQL)) {
                ps.setTimestamp(1, Timestamp.from(OffsetDateTime.parse(r.timestamp()).toInstant()));
                ps.setString(2, r.equipmentId());
                ps.setString(3, r.equipmentDesc());
                ps.setString(4, r.lineId());
                ps.setString(5, r.plant());
                ps.setString(6, r.tag());
                ps.setDouble(7, r.value());
                ps.setString(8, r.unit());
                ps.setBoolean(9, r.anomalyInjected());
                ps.executeUpdate();
            }
        } catch (Exception e) {
            log.error("Failed to write sensor reading to TimescaleDB: {}", e.getMessage());
        }
    }
}
