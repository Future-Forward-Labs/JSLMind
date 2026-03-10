# Phase 5 — Real-Time OT / CBM Streaming Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the full real-time OT/CBM pipeline: MQTT simulator publishes realistic stainless steel plant sensor data → Camel mediates to RedPanda → Kafka Streams (inside Camel SpringBoot app) scores anomalies and triggers Temporal CBMWorkflow → raw readings written to TimescaleDB (hot store) → Airflow exports hourly aggregates to MinIO Bronze → Grafana provisioned dashboard visualises live sensor data → React demo shell shows anomaly alerts and links to Grafana.

**Architecture:**

```
MQTT Simulator
3 equipment units, 13 tags, 1Hz
(CRM-1, APL-1, CCM-1)
        ▼
Mosquitto MQTT Broker
        ▼
Apache Camel — KepwareToKafkaRoute
(tag normalisation, equipment metadata enrichment)
        ▼
RedPanda — topic: plant.sensors
        ▼
Inside camel-integration SpringBoot app:
        ├── SensorTimeScaleWriter (@KafkaListener)
        │   → JDBC insert → TimescaleDB (raw rows, HOT store)
        │
        └── KafkaStreamsAnomalyProcessor
            30-second hopping window per (equipment, tag)
            Z-score anomaly detection (|value - mean| > 3σ)
            → Temporal CBMWorkflow trigger on anomaly
                    ▼
            DetectAnomaly → ScoreConfidence →
            CreateSAPNotification → WaitForApproval →
            ScheduleMaintenance

Airflow ot_bronze_export DAG (hourly)
        ▼
TimescaleDB sensor_1min → MinIO bronze-ot-sensors (Parquet/Iceberg, COLD store)

Grafana (provisioned, port 3001)
        ▼
TimescaleDB PostgreSQL datasource
• Time-series panels per equipment
• Gauge panels for current values
• Anomaly event annotations
```

**Key decisions:**
- **Kafka Streams over PyFlink:** Kafka Streams is a library inside the existing SpringBoot JVM — zero new infrastructure. PyFlink requires a separate Flink cluster (JobManager + TaskManager). For 13 tags at 1Hz, Kafka Streams is production-appropriate with no operational overhead.
- **Z-score over Isolation Forest:** Transparent, explainable ("vibration is 4.1σ above normal"), zero ML dependencies in Java, fast to compute in a Kafka Streams aggregate. Isolation Forest is better for high-dimensional multivariate anomalies — not needed here.
- **TimescaleDB as hot store:** Sub-second time-window queries, hypertable auto-partitioning, continuous aggregates, compression. MinIO/Iceberg is the cold/historical path only.
- **Grafana for visualization:** Already in the stack, TimescaleDB PostgreSQL datasource is native, production-identical to what JSL's plant floor team would run. Provisioned via JSON — loads automatically on `docker compose up`. React OT page handles demo narrative (alerts, simulate failure, Grafana link).

**Tech Stack:** Mosquitto 2.0, Apache Camel 4.6, `camel-kafka-starter` (already present), `kafka-streams` (new dep, same Kafka client), `spring-kafka` (new dep, for @KafkaListener), TimescaleDB pg16, Temporal Java SDK, Airflow 2.9, MinIO, Grafana 10.4 (provisioned), React (alert panel)

---

## Equipment & Tag Design

Three equipment units covering JSL's core stainless steel production process. All tag names, units, and normal ranges reflect real plant operating conditions.

### CRM-1 — Cold Rolling Mill #1
Primary CBM focus. Bearing failure is the classic predictive maintenance use case.

| Tag | Description | Normal Range | Unit | Anomaly Delta |
|---|---|---|---|---|
| `bearing_temp_degC` | Work roll bearing temperature | 42–68 | °C | +22 spike |
| `vibration_mm_s` | Roll bearing vibration (RMS) | 1.2–3.8 | mm/s | +7.5 spike |
| `motor_current_amp` | Main drive motor current | 780–1020 | A | +280 spike |
| `rolling_force_kN` | Rolling force on strip | 8200–11800 | kN | ±2500 drift |
| `strip_speed_mpm` | Strip exit speed | 110–185 | m/min | — |

**Anomaly story:** bearing_temp + vibration spike together → roll bearing degradation on CRM-1 → CBMWorkflow fires → SAP PM-03 notification created.

### APL-1 — Annealing & Pickling Line #1
Heat treatment and acid descaling after cold rolling.

| Tag | Description | Normal Range | Unit | Anomaly Delta |
|---|---|---|---|---|
| `furnace_temp_degC` | Annealing furnace zone-3 temperature | 1010–1085 | °C | −60 drop (burner fault) |
| `hno3_concentration_pct` | HNO₃ acid bath concentration | 17.5–22.5 | % | −6 drift (acid dilution) |
| `strip_speed_mpm` | Strip line speed | 22–48 | m/min | — |
| `rinse_conductivity_us` | Final rinse water conductivity | 45–180 | μS/cm | +400 spike (carry-over) |

**Anomaly story:** furnace_temp drop → annealing underrun → strip may not meet microstructure spec → quality alert.

### CCM-1 — Continuous Casting Machine #1
Liquid steel to slab. Mold level and casting speed are critical safety + quality parameters.

| Tag | Description | Normal Range | Unit | Anomaly Delta |
|---|---|---|---|---|
| `mold_level_mm` | Mold liquid steel level | 102–118 | mm | ±20 oscillation (breakout risk) |
| `casting_speed_mpm` | Casting speed | 0.85–1.35 | m/min | — |
| `mold_cooling_delta_degC` | Mold cooling water ΔT (outlet − inlet) | 8–15 | °C | +9 (cooling failure) |
| `tundish_temp_degC` | Tundish steel temperature | 1525–1565 | °C | −25 drop (freeze risk) |

**Anomaly story:** mold_level oscillation + mold_cooling_delta spike → potential mold breakout → highest-priority CBMWorkflow → immediate SAP PM-01 critical notification.

---

## Task 1: MQTT Simulator (Stainless Steel Equipment)

**Files:**
- Create: `ot/mqtt-simulator/simulator.py`
- Create: `ot/mqtt-simulator/requirements.txt`
- Create: `ot/mqtt-simulator/Dockerfile`

**Step 1: Create simulator.py**

```python
"""
JSL Stainless Steel Plant — MQTT Sensor Simulator
Publishes 13 tags across 3 equipment units at 1Hz.
POST /inject-anomaly?equipment=CRM-1 to trigger a 30s anomaly window.
"""
import os, time, json, random, threading
from datetime import datetime, timezone
from http.server import HTTPServer, BaseHTTPRequestHandler

import paho.mqtt.client as mqtt

BROKER      = os.getenv("MQTT_BROKER", "localhost")
PORT        = int(os.getenv("MQTT_PORT", 1883))
RATE_HZ     = float(os.getenv("PUBLISH_RATE_HZ", 1))
SIGNAL_PORT = int(os.getenv("ANOMALY_SIGNAL_PORT", 8099))
TOPIC_BASE  = "jsl/plant/sensors"

# ── Equipment definitions ─────────────────────────────────────────────────────
EQUIPMENT = {
    "CRM-1": {
        "description": "Cold Rolling Mill #1",
        "line": "CR-LINE-1",
        "tags": {
            "bearing_temp_degC":  {"mean": 55.0,  "std": 4.5,   "unit": "degC",  "anomaly": +22.0},
            "vibration_mm_s":     {"mean": 2.5,   "std": 0.6,   "unit": "mm_s",  "anomaly": +7.5},
            "motor_current_amp":  {"mean": 900.0, "std": 55.0,  "unit": "amp",   "anomaly": +280.0},
            "rolling_force_kN":   {"mean": 10000.0,"std": 600.0,"unit": "kN",    "anomaly": +2200.0},
            "strip_speed_mpm":    {"mean": 148.0, "std": 15.0,  "unit": "mpm",   "anomaly": 0.0},
        },
    },
    "APL-1": {
        "description": "Annealing & Pickling Line #1",
        "line": "APL-LINE-1",
        "tags": {
            "furnace_temp_degC":      {"mean": 1048.0, "std": 12.0, "unit": "degC", "anomaly": -60.0},
            "hno3_concentration_pct": {"mean": 20.0,   "std": 1.2,  "unit": "pct",  "anomaly": -6.0},
            "strip_speed_mpm":        {"mean": 35.0,   "std": 5.0,  "unit": "mpm",  "anomaly": 0.0},
            "rinse_conductivity_us":  {"mean": 110.0,  "std": 28.0, "unit": "us_cm","anomaly": +400.0},
        },
    },
    "CCM-1": {
        "description": "Continuous Casting Machine #1",
        "line": "CAST-LINE-1",
        "tags": {
            "mold_level_mm":           {"mean": 110.0,  "std": 3.5,  "unit": "mm",   "anomaly": +18.0},
            "casting_speed_mpm":       {"mean": 1.10,   "std": 0.08, "unit": "mpm",  "anomaly": 0.0},
            "mold_cooling_delta_degC": {"mean": 11.5,   "std": 1.5,  "unit": "degC", "anomaly": +9.0},
            "tundish_temp_degC":       {"mean": 1545.0, "std": 8.0,  "unit": "degC", "anomaly": -25.0},
        },
    },
}

# Active anomaly set: equipment_id → expiry timestamp
anomalies: dict[str, float] = {}
anomaly_lock = threading.Lock()


class AnomalyHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path.startswith("/inject-anomaly"):
            from urllib.parse import urlparse, parse_qs
            qs = parse_qs(urlparse(self.path).query)
            equipment = qs.get("equipment", ["CRM-1"])[0]
            if equipment not in EQUIPMENT:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(f'{{"error": "unknown equipment {equipment}"}}'.encode())
                return
            with anomaly_lock:
                anomalies[equipment] = time.time() + 30  # 30-second anomaly window
            self.send_response(200)
            self.end_headers()
            self.wfile.write(
                json.dumps({"status": "injected", "equipment": equipment, "duration_s": 30}).encode()
            )
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, *args):
        pass


def is_anomaly_active(equipment_id: str) -> bool:
    with anomaly_lock:
        expiry = anomalies.get(equipment_id, 0)
        if time.time() < expiry:
            return True
        if equipment_id in anomalies:
            del anomalies[equipment_id]
        return False


def signal_server():
    HTTPServer(("0.0.0.0", SIGNAL_PORT), AnomalyHandler).serve_forever()


def publish_loop(client: mqtt.Client):
    interval = 1.0 / RATE_HZ
    while True:
        ts = datetime.now(timezone.utc).isoformat()
        for equipment_id, equip in EQUIPMENT.items():
            active = is_anomaly_active(equipment_id)
            for tag, cfg in equip["tags"].items():
                value = random.gauss(cfg["mean"], cfg["std"])
                if active and cfg["anomaly"] != 0.0:
                    value += cfg["anomaly"] * random.uniform(0.75, 1.0)
                payload = {
                    "equipment_id": equipment_id,
                    "equipment_desc": equip["description"],
                    "line_id": equip["line"],
                    "plant": "JSL1",
                    "tag": tag,
                    "value": round(value, 3),
                    "unit": cfg["unit"],
                    "timestamp": ts,
                    "anomaly_injected": active,
                }
                topic = f"{TOPIC_BASE}/{equipment_id}/{tag}"
                client.publish(topic, json.dumps(payload), qos=1)
        time.sleep(interval)


if __name__ == "__main__":
    threading.Thread(target=signal_server, daemon=True).start()
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.connect(BROKER, PORT, keepalive=60)
    client.loop_start()
    print(f"[Simulator] Publishing {sum(len(e['tags']) for e in EQUIPMENT.values())} tags "
          f"across {len(EQUIPMENT)} equipment units @ {RATE_HZ}Hz")
    publish_loop(client)
```

`ot/mqtt-simulator/requirements.txt`:
```
paho-mqtt==2.1.0
```

`ot/mqtt-simulator/Dockerfile`:
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY simulator.py .
CMD ["python", "simulator.py"]
```

**Step 2: Verify**

```bash
docker compose build mqtt-simulator
docker compose up -d mosquitto mqtt-simulator
docker compose logs mqtt-simulator --tail=5
```
Expected: `[Simulator] Publishing 13 tags across 3 equipment units @ 1.0Hz`

---

## Task 2: Mosquitto Config

**Files:**
- Create: `infra/mosquitto/mosquitto.conf`

```
listener 1883
allow_anonymous true
persistence false
log_type error
```

**Verify:**
```bash
docker compose up -d mosquitto
docker compose logs mosquitto --tail=5
```

---

## Task 3: Camel KepwareToKafkaRoute

**Files:**
- Modify: `integration/pom.xml` (add camel-paho-mqtt5-starter, camel-kafka-starter, kafka-streams, spring-kafka)
- Create: `integration/src/main/java/com/jslmind/integration/routes/KepwareToKafkaRoute.java`

**Step 1: Add dependencies to pom.xml**

```xml
    <!-- MQTT ingestion (OT/CBM) -->
    <dependency>
      <groupId>org.apache.camel.springboot</groupId>
      <artifactId>camel-paho-mqtt5-starter</artifactId>
      <version>${camel.version}</version>
    </dependency>

    <!-- RedPanda/Kafka producer (Camel route) -->
    <dependency>
      <groupId>org.apache.camel.springboot</groupId>
      <artifactId>camel-kafka-starter</artifactId>
      <version>${camel.version}</version>
    </dependency>

    <!-- Kafka Streams (anomaly processor) -->
    <dependency>
      <groupId>org.apache.kafka</groupId>
      <artifactId>kafka-streams</artifactId>
    </dependency>

    <!-- Spring Kafka (@KafkaListener for TimescaleDB writer) -->
    <dependency>
      <groupId>org.springframework.kafka</groupId>
      <artifactId>spring-kafka</artifactId>
    </dependency>

    <!-- PostgreSQL JDBC (TimescaleDB writes) -->
    <dependency>
      <groupId>org.postgresql</groupId>
      <artifactId>postgresql</artifactId>
      <scope>runtime</scope>
    </dependency>
```

**Step 2: Create KepwareToKafkaRoute.java**

```java
package com.jslmind.integration.routes;

import org.apache.camel.builder.RouteBuilder;
import org.springframework.stereotype.Component;

@Component
public class KepwareToKafkaRoute extends RouteBuilder {

    @Override
    public void configure() {
        // Subscribe to all equipment tags: jsl/plant/sensors/#
        from("paho-mqtt5:jsl/plant/sensors/#"
                + "?brokerUrl=tcp://{{mqtt.broker.host:mosquitto}}:{{mqtt.broker.port:1883}}"
                + "&clientId=camel-kepware-consumer"
                + "&cleanStart=true")
            .routeId("kepware-to-kafka")
            .log("OT tag received: ${header.CamelMqttTopic}")
            // Forward verbatim — payload is already enriched JSON from simulator
            .to("kafka:plant.sensors"
                + "?brokers={{kafka.brokers:redpanda:29092}}"
                + "&valueSerializer=org.apache.kafka.common.serialization.StringSerializer");
    }
}
```

**Step 3: Verify**

```bash
cd integration && JAVA_HOME=$(/usr/libexec/java_home) mvn compile -q && cd ..
docker compose up -d camel-integration
docker compose exec redpanda rpk topic consume plant.sensors --num 5
```
Expected: 5 JSON payloads with `equipment_id`, `tag`, `value`, `timestamp`

---

## Task 4: TimescaleDB Schema

**Files:**
- Create: `infra/timescaledb/init.sql`
- Modify: `docker-compose.yml` (mount init.sql, add named volume)

**Step 1: Create init.sql**

```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ── Raw sensor readings ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sensor_readings (
    time            TIMESTAMPTZ      NOT NULL,
    equipment_id    TEXT             NOT NULL,   -- CRM-1, APL-1, CCM-1
    equipment_desc  TEXT,
    line_id         TEXT             NOT NULL,
    plant           TEXT             NOT NULL DEFAULT 'JSL1',
    tag             TEXT             NOT NULL,
    value           DOUBLE PRECISION NOT NULL,
    unit            TEXT,
    anomaly_injected BOOLEAN         DEFAULT FALSE
);

SELECT create_hypertable('sensor_readings', 'time', if_not_exists => TRUE);

-- Index for Grafana panel queries (equipment + tag time-series)
CREATE INDEX IF NOT EXISTS idx_sensor_equipment_tag
    ON sensor_readings (equipment_id, tag, time DESC);

-- ── 1-minute continuous aggregate ────────────────────────────────────────────
-- Used by Grafana dashboards and Airflow Bronze export
CREATE MATERIALIZED VIEW IF NOT EXISTS sensor_1min
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', time)  AS bucket,
    equipment_id,
    line_id,
    tag,
    unit,
    AVG(value)                     AS avg_val,
    MIN(value)                     AS min_val,
    MAX(value)                     AS max_val,
    STDDEV(value)                  AS stddev_val,
    COUNT(*)                       AS sample_count
FROM sensor_readings
GROUP BY bucket, equipment_id, line_id, tag, unit
WITH NO DATA;

SELECT add_continuous_aggregate_policy('sensor_1min',
    start_offset      => INTERVAL '10 minutes',
    end_offset        => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists     => TRUE
);

-- ── Compression: raw data older than 7 days ───────────────────────────────────
ALTER TABLE sensor_readings SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'equipment_id, tag'
);
SELECT add_compression_policy('sensor_readings', INTERVAL '7 days', if_not_exists => TRUE);

-- ── Retention: drop raw data older than 30 days ───────────────────────────────
SELECT add_retention_policy('sensor_readings', INTERVAL '30 days', if_not_exists => TRUE);

-- ── Anomaly events log (written by Kafka Streams processor) ──────────────────
CREATE TABLE IF NOT EXISTS anomaly_events (
    time            TIMESTAMPTZ      NOT NULL,
    equipment_id    TEXT             NOT NULL,
    tag             TEXT             NOT NULL,
    value           DOUBLE PRECISION NOT NULL,
    mean_val        DOUBLE PRECISION NOT NULL,
    stddev_val      DOUBLE PRECISION NOT NULL,
    z_score         DOUBLE PRECISION NOT NULL,
    workflow_id     TEXT,
    sap_notif_id    TEXT
);

SELECT create_hypertable('anomaly_events', 'time', if_not_exists => TRUE);
```

**Step 2: Update docker-compose.yml timescaledb service**

```yaml
  timescaledb:
    image: timescale/timescaledb:latest-pg16
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: sensors
    volumes:
      - ./infra/timescaledb/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
      - timescaledb_data:/var/lib/postgresql/data
    ports:
      - "5433:5432"
    networks: [jslmind]
    restart: unless-stopped
```

Add `timescaledb_data:` to the `volumes:` block at the bottom of docker-compose.yml.

**Step 3: Verify**

```bash
docker compose up -d timescaledb
sleep 8
docker compose exec timescaledb psql -U postgres -d sensors \
  -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public';"
```
Expected: `sensor_readings`, `anomaly_events` listed

---

## Task 5: SensorTimescaleWriter (@KafkaListener)

Raw sensor rows written directly to TimescaleDB. Decoupled from anomaly detection — simple, single-responsibility.

**Files:**
- Create: `integration/src/main/java/com/jslmind/integration/ot/SensorTimescaleWriter.java`
- Create: `integration/src/main/java/com/jslmind/integration/ot/SensorReading.java`

**Step 1: SensorReading.java (DTO)**

```java
package com.jslmind.integration.ot;

import com.fasterxml.jackson.annotation.JsonProperty;

public record SensorReading(
    @JsonProperty("equipment_id")   String equipmentId,
    @JsonProperty("equipment_desc") String equipmentDesc,
    @JsonProperty("line_id")        String lineId,
    @JsonProperty("plant")          String plant,
    @JsonProperty("tag")            String tag,
    @JsonProperty("value")          double value,
    @JsonProperty("unit")           String unit,
    @JsonProperty("timestamp")      String timestamp,
    @JsonProperty("anomaly_injected") boolean anomalyInjected
) {}
```

**Step 2: SensorTimescaleWriter.java**

```java
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
```

**Step 3: TimescaleDB DataSource config**

Create `integration/src/main/java/com/jslmind/integration/config/TimescaleDbConfig.java`:

```java
package com.jslmind.integration.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.kafka.clients.consumer.ConsumerConfig;
import org.apache.kafka.common.serialization.StringDeserializer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.DefaultKafkaConsumerFactory;

import javax.sql.DataSource;
import java.util.Map;

@Configuration
public class TimescaleDbConfig {

    @Bean("timescaleDataSource")
    public DataSource timescaleDataSource(
            @Value("${timescaledb.url}") String url,
            @Value("${timescaledb.username:postgres}") String username,
            @Value("${timescaledb.password}") String password) {
        HikariConfig cfg = new HikariConfig();
        cfg.setJdbcUrl(url);
        cfg.setUsername(username);
        cfg.setPassword(password);
        cfg.setMaximumPoolSize(5);
        cfg.setPoolName("timescale-pool");
        return new HikariDataSource(cfg);
    }

    @Bean("sensorKafkaListenerFactory")
    public ConcurrentKafkaListenerContainerFactory<String, String> sensorKafkaListenerFactory(
            @Value("${kafka.brokers:redpanda:29092}") String brokers) {
        ConsumerFactory<String, String> cf = new DefaultKafkaConsumerFactory<>(Map.of(
            ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, brokers,
            ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class,
            ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class
        ));
        var factory = new ConcurrentKafkaListenerContainerFactory<String, String>();
        factory.setConsumerFactory(cf);
        return factory;
    }
}
```

Add to `integration/src/main/resources/application.properties`:
```properties
timescaledb.url=jdbc:postgresql://${TIMESCALEDB_HOST:timescaledb}:5432/sensors
timescaledb.username=postgres
timescaledb.password=${POSTGRES_PASSWORD}
```

**Step 4: Verify**

```bash
docker compose up -d camel-integration
sleep 15
docker compose exec timescaledb psql -U postgres -d sensors \
  -c "SELECT equipment_id, tag, count(*) FROM sensor_readings GROUP BY equipment_id, tag ORDER BY equipment_id, tag;"
```
Expected: 13 rows (one per tag), counts climbing

---

## Task 6: KafkaStreamsAnomalyProcessor

Z-score anomaly detection on a 30-second hopping window. Runs inside the same SpringBoot app. On anomaly: writes to `anomaly_events` table + triggers Temporal `CBMWorkflow`.

**Files:**
- Create: `integration/src/main/java/com/jslmind/integration/ot/AnomalyState.java`
- Create: `integration/src/main/java/com/jslmind/integration/ot/KafkaStreamsAnomalyProcessor.java`

**Step 1: AnomalyState.java (Kafka Streams state store value)**

```java
package com.jslmind.integration.ot;

/** Welford's online algorithm state for incremental mean + variance. */
public class AnomalyState {
    public long count = 0;
    public double mean = 0.0;
    public double m2   = 0.0;   // sum of squared deviations

    public void update(double value) {
        count++;
        double delta = value - mean;
        mean += delta / count;
        m2   += delta * (value - mean);
    }

    public double stddev() {
        return count < 2 ? 0.0 : Math.sqrt(m2 / (count - 1));
    }

    public double zScore(double value) {
        double sd = stddev();
        return sd == 0.0 ? 0.0 : Math.abs(value - mean) / sd;
    }
}
```

**Step 2: KafkaStreamsAnomalyProcessor.java**

```java
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

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
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
    private static final int WINDOW_SECONDS = 30;
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
                    log.warn("[ANOMALY] {}/{} value={} z={:.2f} (mean={:.2f} σ={:.2f})",
                        r.equipmentId(), r.tag(), r.value(), zScore, state.mean, state.stddev());
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
```

**Step 3: Update docker-compose.yml environment for camel-integration**

Add to the `camel-integration` service environment:
```yaml
      TIMESCALEDB_HOST: timescaledb
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      TEMPORAL_ADDRESS: temporal:7233
```

Add `timescaledb` to `depends_on`.

**Step 4: Verify**

```bash
docker compose up -d camel-integration
# Inject an anomaly on CRM-1
curl -X POST "http://localhost:8099/inject-anomaly?equipment=CRM-1"
sleep 35
docker compose logs camel-integration --tail=20 | grep ANOMALY
docker compose exec timescaledb psql -U postgres -d sensors \
  -c "SELECT equipment_id, tag, z_score, time FROM anomaly_events ORDER BY time DESC LIMIT 5;"
```
Expected: anomaly_events rows for CRM-1 bearing_temp and vibration tags

---

## Task 7: Temporal CBMWorkflow

**Files:**
- Create: `workflows/src/main/java/com/jslmind/workflows/CBMWorkflow.java`
- Create: `workflows/src/main/java/com/jslmind/workflows/CBMWorkflowImpl.java`
- Create: `workflows/src/main/java/com/jslmind/workflows/CBMActivities.java`
- Create: `workflows/src/main/java/com/jslmind/workflows/CBMActivitiesImpl.java`
- Create: `workflows/src/main/java/com/jslmind/workflows/CBMWorker.java`

**Step 1: CBMWorkflow.java**

```java
package com.jslmind.workflows;

import io.temporal.workflow.SignalMethod;
import io.temporal.workflow.WorkflowInterface;
import io.temporal.workflow.WorkflowMethod;
import java.util.Map;

@WorkflowInterface
public interface CBMWorkflow {
    @WorkflowMethod
    void execute(Map<String, Object> anomalyEvent);

    @SignalMethod
    void approveMaintenanceSchedule();
}
```

**Step 2: CBMActivities.java**

```java
package com.jslmind.workflows;

import io.temporal.activity.ActivityInterface;
import io.temporal.activity.ActivityMethod;
import java.util.Map;

@ActivityInterface
public interface CBMActivities {
    @ActivityMethod String detectAnomaly(Map<String, Object> event);
    @ActivityMethod double scoreConfidence(String anomalyId, Map<String, Object> event);
    @ActivityMethod String createSAPNotification(String anomalyId, double confidence, Map<String, Object> event);
    @ActivityMethod void scheduleMaintenance(String sapNotificationId, String equipmentId);
}
```

**Step 3: CBMWorkflowImpl.java**

```java
package com.jslmind.workflows;

import io.temporal.activity.ActivityOptions;
import io.temporal.common.RetryOptions;
import io.temporal.workflow.Workflow;
import java.time.Duration;
import java.util.Map;

public class CBMWorkflowImpl implements CBMWorkflow {

    private boolean approved = false;

    private final CBMActivities activities = Workflow.newActivityStub(
        CBMActivities.class,
        ActivityOptions.newBuilder()
            .setStartToCloseTimeout(Duration.ofMinutes(5))
            .setRetryOptions(RetryOptions.newBuilder().setMaximumAttempts(3).build())
            .build()
    );

    @Override
    public void execute(Map<String, Object> event) {
        String equipment = (String) event.getOrDefault("equipment_id", "UNKNOWN");
        String tag       = (String) event.getOrDefault("tag", "UNKNOWN");

        String anomalyId  = activities.detectAnomaly(event);
        double confidence = activities.scoreConfidence(anomalyId, event);
        String sapId      = activities.createSAPNotification(anomalyId, confidence, event);

        // Human-in-loop: wait up to 24h for maintenance manager approval
        Workflow.await(Duration.ofHours(24), () -> approved);

        if (approved) {
            activities.scheduleMaintenance(sapId, equipment);
        }
    }

    @Override
    public void approveMaintenanceSchedule() {
        this.approved = true;
    }
}
```

**Step 4: CBMActivitiesImpl.java**

```java
package com.jslmind.workflows;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import java.util.Map;
import java.util.UUID;

public class CBMActivitiesImpl implements CBMActivities {

    private static final Logger log = LoggerFactory.getLogger(CBMActivitiesImpl.class);

    @Override
    public String detectAnomaly(Map<String, Object> event) {
        String id = "ANOM-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
        log.info("[CBM] Anomaly detected: {} | equipment={} tag={} value={} z_score={}",
            id, event.get("equipment_id"), event.get("tag"),
            event.get("value"), event.get("z_score"));
        return id;
    }

    @Override
    public double scoreConfidence(String anomalyId, Map<String, Object> event) {
        double zScore = ((Number) event.getOrDefault("z_score", 3.0)).doubleValue();
        // Map z-score to 0-100% confidence (sigmoid-like scaling)
        double confidence = Math.min(0.99, 1.0 - Math.exp(-(zScore - 3.0) / 1.5));
        log.info("[CBM] {} confidence={:.1f}% (z={:.2f})", anomalyId, confidence * 100, zScore);
        return confidence;
    }

    @Override
    public String createSAPNotification(String anomalyId, double confidence, Map<String, Object> event) {
        // DEMO: stub — production fires Camel temporal-to-sap-pm route (SAP PM-03 / PM-01)
        String equipment = (String) event.getOrDefault("equipment_id", "UNKNOWN");
        String priority  = confidence > 0.9 ? "PM-01" : "PM-03";
        String notifId   = priority + "-" + System.currentTimeMillis();
        log.info("[CBM] SAP {} notification created: {} for {} (confidence={:.1f}%)",
            priority, notifId, equipment, confidence * 100);
        return notifId;
    }

    @Override
    public void scheduleMaintenance(String sapNotificationId, String equipmentId) {
        log.info("[CBM] Maintenance scheduled: SAP={} equipment={}", sapNotificationId, equipmentId);
    }
}
```

**Step 5: CBMWorker.java**

```java
package com.jslmind.workflows;

import io.temporal.client.WorkflowClient;
import io.temporal.serviceclient.WorkflowServiceStubs;
import io.temporal.serviceclient.WorkflowServiceStubsOptions;
import io.temporal.worker.Worker;
import io.temporal.worker.WorkerFactory;

public class CBMWorker {
    public static void main(String[] args) throws InterruptedException {
        String address = System.getenv().getOrDefault("TEMPORAL_ADDRESS", "localhost:7233");
        WorkflowServiceStubs service = WorkflowServiceStubs.newServiceStubs(
            WorkflowServiceStubsOptions.newBuilder().setTarget(address).build()
        );
        WorkflowClient client   = WorkflowClient.newInstance(service);
        WorkerFactory  factory  = WorkerFactory.newInstance(client);
        Worker         worker   = factory.newWorker("cbm-task-queue");

        worker.registerWorkflowImplementationTypes(CBMWorkflowImpl.class);
        worker.registerActivitiesImplementations(new CBMActivitiesImpl());

        factory.start();
        System.out.println("[CBM Worker] Listening on cbm-task-queue @ " + address);
        Thread.currentThread().join();
    }
}
```

**Step 6: Verify**

```bash
docker compose build cbm-worker && docker compose up -d cbm-worker
sleep 5
docker compose logs cbm-worker --tail=5
```
Expected: `[CBM Worker] Listening on cbm-task-queue`

---

## Task 8: Airflow Bronze Export DAG

**Files:**
- Create: `data-platform/dags/ot_bronze_export_dag.py`

```python
"""
ot_bronze_export_dag — runs hourly.
Exports sensor_1min continuous aggregate from TimescaleDB
to MinIO bronze-ot-sensors as Parquet (partitioned by equipment/date/hour).
"""
from __future__ import annotations
import io, os
from datetime import datetime, timedelta

import boto3, pandas as pd, psycopg2
from airflow.decorators import dag, task
from airflow.utils.dates import days_ago
from botocore.client import Config

TSDB_DSN = os.getenv("TIMESCALEDB_DSN",
    "host=timescaledb port=5432 dbname=sensors user=postgres password=postgres")
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "http://minio:9000")
MINIO_ACCESS   = os.getenv("MINIO_ROOT_USER", "jslmind")
MINIO_SECRET   = os.getenv("MINIO_ROOT_PASSWORD", "jslmind123")
BUCKET         = "bronze-ot-sensors"


@dag(dag_id="ot_bronze_export", schedule_interval="@hourly",
     start_date=days_ago(1), catchup=False, tags=["ot", "bronze"],
     default_args={"retries": 2, "retry_delay": timedelta(minutes=5)})
def ot_bronze_export_dag():

    @task()
    def export_aggregates(**context):
        end_ts   = context["data_interval_end"]
        start_ts = end_ts - timedelta(hours=1)

        conn = psycopg2.connect(TSDB_DSN)
        df = pd.read_sql("""
            SELECT bucket, equipment_id, line_id, tag, unit,
                   avg_val, min_val, max_val, stddev_val, sample_count
            FROM sensor_1min
            WHERE bucket >= %s AND bucket < %s
            ORDER BY equipment_id, tag, bucket
        """, conn, params=(start_ts, end_ts))
        conn.close()

        if df.empty:
            print(f"No data for {start_ts} → {end_ts}")
            return

        s3 = boto3.client("s3", endpoint_url=MINIO_ENDPOINT,
                          aws_access_key_id=MINIO_ACCESS,
                          aws_secret_access_key=MINIO_SECRET,
                          config=Config(signature_version="s3v4"))
        try:
            s3.create_bucket(Bucket=BUCKET)
        except Exception:
            pass

        # Partition by equipment for efficient downstream reads
        for equipment_id, group in df.groupby("equipment_id"):
            key = (f"equipment={equipment_id}/"
                   f"year={end_ts.year}/month={end_ts.month:02d}/"
                   f"day={end_ts.day:02d}/hour={end_ts.hour:02d}/data.parquet")
            buf = io.BytesIO()
            group.to_parquet(buf, index=False)
            buf.seek(0)
            s3.put_object(Bucket=BUCKET, Key=key, Body=buf.getvalue())
            print(f"Exported {len(group)} rows → s3://{BUCKET}/{key}")

    export_aggregates()


ot_bronze_export_dag()
```

---

## Task 9: Grafana Provisioned Dashboard

**Visualization choice:** Grafana (provisioned, auto-loads on `docker compose up`) for the sensor monitoring view. TimescaleDB is added as a PostgreSQL datasource. React OT page in the demo shell handles the narrative layer (anomaly alerts, simulate failure button, Grafana deep-link).

**Files:**
- Create: `infra/grafana/datasources/timescaledb.yaml`
- Create: `infra/grafana/dashboards/dashboards.yaml`
- Create: `infra/grafana/dashboards/ot-sensor-dashboard.json`

**Step 1: TimescaleDB datasource**

`infra/grafana/datasources/timescaledb.yaml`:
```yaml
apiVersion: 1
datasources:
  - name: TimescaleDB
    type: postgres
    uid: timescaledb-uid
    url: timescaledb:5432
    database: sensors
    user: postgres
    secureJsonData:
      password: ${POSTGRES_PASSWORD}
    jsonData:
      sslmode: disable
      postgresVersion: 1600
      timescaledb: true
    isDefault: false
    editable: false
```

**Step 2: Dashboard provisioning config**

`infra/grafana/dashboards/dashboards.yaml`:
```yaml
apiVersion: 1
providers:
  - name: JSLMind OT Dashboards
    folder: JSLMind
    type: file
    options:
      path: /etc/grafana/provisioning/dashboards
```

**Step 3: Dashboard JSON**

`infra/grafana/dashboards/ot-sensor-dashboard.json` — create a dashboard with the following panels. Generate the JSON using Grafana's dashboard JSON model format:

```json
{
  "title": "JSL Plant OT — Live Sensor Monitoring",
  "uid": "jsl-ot-sensors",
  "tags": ["jsl", "ot", "cbm"],
  "refresh": "5s",
  "time": {"from": "now-15m", "to": "now"},
  "templating": {
    "list": [
      {
        "name": "equipment",
        "type": "query",
        "datasource": {"uid": "timescaledb-uid"},
        "query": "SELECT DISTINCT equipment_id FROM sensor_readings ORDER BY 1",
        "multi": true,
        "includeAll": true,
        "current": {"text": "All", "value": "$__all"}
      }
    ]
  },
  "panels": [
    {
      "title": "CRM-1 — Bearing Temperature (°C)",
      "type": "timeseries",
      "gridPos": {"x": 0, "y": 0, "w": 12, "h": 8},
      "datasource": {"uid": "timescaledb-uid"},
      "targets": [{
        "rawSql": "SELECT time, value FROM sensor_readings WHERE equipment_id = 'CRM-1' AND tag = 'bearing_temp_degC' AND $__timeFilter(time) ORDER BY time",
        "format": "time_series"
      }],
      "fieldConfig": {
        "defaults": {"unit": "celsius", "color": {"mode": "palette-classic"},
          "thresholds": {"steps": [
            {"value": null, "color": "green"},
            {"value": 75, "color": "yellow"},
            {"value": 85, "color": "red"}
          ]}
        }
      }
    },
    {
      "title": "CRM-1 — Vibration (mm/s)",
      "type": "timeseries",
      "gridPos": {"x": 12, "y": 0, "w": 12, "h": 8},
      "datasource": {"uid": "timescaledb-uid"},
      "targets": [{
        "rawSql": "SELECT time, value FROM sensor_readings WHERE equipment_id = 'CRM-1' AND tag = 'vibration_mm_s' AND $__timeFilter(time) ORDER BY time",
        "format": "time_series"
      }],
      "fieldConfig": {"defaults": {"unit": "velocityms"}}
    },
    {
      "title": "CRM-1 — Motor Current (A)",
      "type": "timeseries",
      "gridPos": {"x": 0, "y": 8, "w": 8, "h": 8},
      "datasource": {"uid": "timescaledb-uid"},
      "targets": [{
        "rawSql": "SELECT time, value FROM sensor_readings WHERE equipment_id = 'CRM-1' AND tag = 'motor_current_amp' AND $__timeFilter(time) ORDER BY time",
        "format": "time_series"
      }],
      "fieldConfig": {"defaults": {"unit": "amp"}}
    },
    {
      "title": "APL-1 — Furnace Temperature (°C)",
      "type": "timeseries",
      "gridPos": {"x": 8, "y": 8, "w": 8, "h": 8},
      "datasource": {"uid": "timescaledb-uid"},
      "targets": [{
        "rawSql": "SELECT time, value FROM sensor_readings WHERE equipment_id = 'APL-1' AND tag = 'furnace_temp_degC' AND $__timeFilter(time) ORDER BY time",
        "format": "time_series"
      }],
      "fieldConfig": {
        "defaults": {"unit": "celsius",
          "thresholds": {"steps": [
            {"value": null, "color": "red"},
            {"value": 1000, "color": "green"},
            {"value": 1090, "color": "yellow"}
          ]}
        }
      }
    },
    {
      "title": "APL-1 — HNO₃ Concentration (%)",
      "type": "timeseries",
      "gridPos": {"x": 16, "y": 8, "w": 8, "h": 8},
      "datasource": {"uid": "timescaledb-uid"},
      "targets": [{
        "rawSql": "SELECT time, value FROM sensor_readings WHERE equipment_id = 'APL-1' AND tag = 'hno3_concentration_pct' AND $__timeFilter(time) ORDER BY time",
        "format": "time_series"
      }],
      "fieldConfig": {"defaults": {"unit": "percent"}}
    },
    {
      "title": "CCM-1 — Mold Level (mm)",
      "type": "timeseries",
      "gridPos": {"x": 0, "y": 16, "w": 12, "h": 8},
      "datasource": {"uid": "timescaledb-uid"},
      "targets": [{
        "rawSql": "SELECT time, value FROM sensor_readings WHERE equipment_id = 'CCM-1' AND tag = 'mold_level_mm' AND $__timeFilter(time) ORDER BY time",
        "format": "time_series"
      }],
      "fieldConfig": {
        "defaults": {"unit": "lengthmm",
          "thresholds": {"steps": [
            {"value": null, "color": "red"},
            {"value": 100, "color": "green"},
            {"value": 120, "color": "red"}
          ]}
        }
      }
    },
    {
      "title": "CCM-1 — Tundish Temperature (°C)",
      "type": "timeseries",
      "gridPos": {"x": 12, "y": 16, "w": 12, "h": 8},
      "datasource": {"uid": "timescaledb-uid"},
      "targets": [{
        "rawSql": "SELECT time, value FROM sensor_readings WHERE equipment_id = 'CCM-1' AND tag = 'tundish_temp_degC' AND $__timeFilter(time) ORDER BY time",
        "format": "time_series"
      }],
      "fieldConfig": {"defaults": {"unit": "celsius"}}
    },
    {
      "title": "Anomaly Events (last 1 hour)",
      "type": "table",
      "gridPos": {"x": 0, "y": 24, "w": 24, "h": 7},
      "datasource": {"uid": "timescaledb-uid"},
      "targets": [{
        "rawSql": "SELECT time, equipment_id, tag, round(value::numeric,2) as value, round(z_score::numeric,2) as z_score, round(mean_val::numeric,2) as mean, workflow_id FROM anomaly_events WHERE $__timeFilter(time) ORDER BY time DESC LIMIT 50",
        "format": "table"
      }],
      "fieldConfig": {
        "overrides": [{
          "matcher": {"id": "byName", "options": "z_score"},
          "properties": [{"id": "thresholds", "value": {
            "steps": [{"value": null, "color": "green"}, {"value": 3, "color": "yellow"}, {"value": 5, "color": "red"}]
          }}, {"id": "custom.displayMode", "value": "color-background"}]
        }]
      }
    }
  ]
}
```

**Step 4: Verify**

```bash
docker compose restart grafana
```
Open http://localhost:3001 → Dashboards → JSLMind → "JSL Plant OT — Live Sensor Monitoring"

Expected: time-series panels populating within 5 seconds, anomaly events table empty until failure is simulated.

---

## Task 10: React OT Demo Shell Page

Lean narrative layer — current values table, anomaly alert feed, "Simulate Failure" button with equipment selector, Grafana deep-link.

**Files:**
- Create: `frontend/src/pages/OTStreaming.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/App.jsx`

**Step 1: OTStreaming.jsx**

```jsx
import { useEffect, useState } from 'react'

const BACKEND  = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001'
const GRAFANA  = 'http://localhost:3001/d/jsl-ot-sensors'
const EQUIPMENT = ['CRM-1', 'APL-1', 'CCM-1']

const EQUIPMENT_META = {
  'CRM-1': 'Cold Rolling Mill #1',
  'APL-1': 'Annealing & Pickling Line #1',
  'CCM-1': 'Continuous Casting Machine #1',
}

export default function OTStreaming() {
  const [readings, setReadings]     = useState({})
  const [alerts, setAlerts]         = useState([])
  const [target, setTarget]         = useState('CRM-1')
  const [injecting, setInjecting]   = useState(false)

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`${BACKEND}/ot/latest`)
        if (res.ok) setReadings(await res.json())
      } catch (_) {}
    }, 2000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const ws = new WebSocket(`${BACKEND.replace('http', 'ws')}/ot/alerts`)
    ws.onmessage = e => setAlerts(prev => [JSON.parse(e.data), ...prev].slice(0, 30))
    return () => ws.close()
  }, [])

  const injectAnomaly = async () => {
    setInjecting(true)
    try {
      await fetch(`http://localhost:8099/inject-anomaly?equipment=${target}`, { method: 'POST' })
    } catch (_) {}
    setTimeout(() => setInjecting(false), 3000)
  }

  // Group readings by equipment
  const byEquipment = {}
  Object.entries(readings).forEach(([key, r]) => {
    const eq = r.equipment_id
    if (!byEquipment[eq]) byEquipment[eq] = []
    byEquipment[eq].push({ tag: key, ...r })
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">OT / CBM Streaming</h1>
          <p className="text-sm text-gray-400 mt-1">
            MQTT → Camel → RedPanda → Kafka Streams → TimescaleDB → Temporal CBMWorkflow
          </p>
        </div>
        <a href={GRAFANA} target="_blank" rel="noreferrer"
           className="text-xs text-jsl-steel hover:underline mt-1">
          Open Grafana dashboard ↗
        </a>
      </div>

      {/* Simulate failure */}
      <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded px-4 py-3">
        <span className="text-sm text-gray-400">Inject anomaly on:</span>
        <select
          value={target}
          onChange={e => setTarget(e.target.value)}
          className="bg-gray-800 text-white text-sm rounded px-2 py-1 border border-gray-700"
        >
          {EQUIPMENT.map(eq => (
            <option key={eq} value={eq}>{eq} — {EQUIPMENT_META[eq]}</option>
          ))}
        </select>
        <button
          onClick={injectAnomaly}
          disabled={injecting}
          className="px-4 py-1.5 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm rounded font-medium transition-colors"
        >
          {injecting ? 'Anomaly Active (30s)…' : 'Simulate Failure'}
        </button>
      </div>

      {/* Live readings per equipment */}
      {EQUIPMENT.map(eq => (
        <div key={eq} className="bg-gray-900 rounded border border-gray-800 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {eq} — {EQUIPMENT_META[eq]}
            </span>
            <span className="text-xs text-gray-600">{byEquipment[eq]?.length ?? 0} tags</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-600 text-xs border-b border-gray-800">
                <th className="text-left px-4 py-2">Tag</th>
                <th className="text-right px-4 py-2">Value</th>
                <th className="text-right px-4 py-2">Unit</th>
                <th className="text-right px-4 py-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {(byEquipment[eq] ?? []).map(r => (
                <tr key={r.tag} className="border-b border-gray-800 last:border-0">
                  <td className="px-4 py-2 text-gray-300 font-mono text-xs">{r.tag}</td>
                  <td className="px-4 py-2 text-right text-white font-mono">{r.value.toFixed(2)}</td>
                  <td className="px-4 py-2 text-right text-gray-500 text-xs">{r.unit}</td>
                  <td className="px-4 py-2 text-right text-gray-600 text-xs">
                    {new Date(r.timestamp).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
              {!byEquipment[eq] && (
                <tr><td colSpan={4} className="px-4 py-4 text-center text-gray-600 text-xs">Waiting for data…</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ))}

      {/* Anomaly alert feed */}
      <div className="bg-gray-900 rounded border border-gray-800 overflow-hidden">
        <div className="px-4 py-2 border-b border-gray-800">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Anomaly Alerts — Temporal CBMWorkflow
          </span>
        </div>
        {alerts.length === 0 ? (
          <p className="px-4 py-6 text-gray-600 text-sm text-center">
            No anomalies detected. Click "Simulate Failure" to trigger one.
          </p>
        ) : (
          <ul className="divide-y divide-gray-800">
            {alerts.map((a, i) => (
              <li key={i} className="px-4 py-3 flex items-start gap-3">
                <span className="text-red-400 mt-0.5 shrink-0">⚠</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm">
                    <span className="font-medium">{a.equipment_id}</span> / {a.tag}
                    {' '}— value <span className="font-mono">{Number(a.value).toFixed(2)}</span>
                    {' '}(z={Number(a.z_score).toFixed(1)}σ)
                  </p>
                  <p className="text-gray-500 text-xs mt-0.5">
                    CBMWorkflow: <span className="font-mono text-gray-400">{a.workflow_id ?? '—'}</span>
                    {' '}· {new Date(a.detected_at).toLocaleTimeString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
```

**Step 2: Update Sidebar.jsx** — move OT/CBM from COMING_SOON to ACTIVE_PILLARS, remove from COMING_SOON:

```jsx
const ACTIVE_PILLARS = [
  { to: '/',          label: 'Overview',           icon: '⬡' },
  { to: '/ot',        label: 'OT / CBM',           icon: '◈' },
  { to: '/rag',       label: 'Hybrid RAG',         icon: '◈' },
  { to: '/catalog',   label: 'Agent Catalog',      icon: '◉' },
  { to: '/observe',   label: 'Observability',      icon: '◎' },
  { to: '/medallion', label: 'Medallion Pipeline', icon: '⬟' },
]

const COMING_SOON = [
  { label: 'Agent Builder', phase: 7 },
]
```

**Step 3: Update App.jsx**

```jsx
import OTStreaming from './pages/OTStreaming.jsx'
// add inside <Routes>:
<Route path="/ot" element={<OTStreaming />} />
```

**Step 4: Rebuild frontend**

```bash
docker compose build frontend && docker compose up -d frontend
```

---

## Task 11: FastAPI /ot Endpoints

**Files:**
- Modify: `rag/app.py`

```python
import psycopg2, asyncio
from fastapi import WebSocket, WebSocketDisconnect

TSDB_DSN = os.getenv("TIMESCALEDB_DSN",
    "host=timescaledb port=5432 dbname=sensors user=postgres password=postgres")

_alert_subscribers: list[WebSocket] = []

@app.get("/ot/latest")
def ot_latest():
    """Most recent reading per (equipment_id, tag)."""
    conn = psycopg2.connect(TSDB_DSN)
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT ON (equipment_id, tag)
                equipment_id, tag, value, unit, time
            FROM sensor_readings
            ORDER BY equipment_id, tag, time DESC
        """)
        rows = cur.fetchall()
    conn.close()
    return {
        f"{r[0]}|{r[1]}": {
            "equipment_id": r[0],
            "tag":          r[1],
            "value":        r[2],
            "unit":         r[3],
            "timestamp":    r[4].isoformat(),
        }
        for r in rows
    }

@app.websocket("/ot/alerts")
async def ot_alerts_ws(ws: WebSocket):
    await ws.accept()
    _alert_subscribers.append(ws)
    try:
        while True:
            await asyncio.sleep(30)
    except WebSocketDisconnect:
        _alert_subscribers.remove(ws)

@app.post("/ot/alert")
async def receive_alert(alert: dict):
    """Kafka Streams processor POSTs here on anomaly detection."""
    dead = []
    for ws in _alert_subscribers:
        try:
            await ws.send_json(alert)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _alert_subscribers.remove(ws)
    return {"status": "broadcast", "subscribers": len(_alert_subscribers)}
```

---

## End-to-End Smoke Test

```bash
# 1. Confirm 13 tags flowing into TimescaleDB
docker compose exec timescaledb psql -U postgres -d sensors \
  -c "SELECT equipment_id, tag, count(*) FROM sensor_readings GROUP BY equipment_id, tag ORDER BY 1,2;"

# 2. Inject CRM-1 anomaly (bearing scenario)
curl -X POST "http://localhost:8099/inject-anomaly?equipment=CRM-1"

# 3. Watch Kafka Streams detect it
docker compose logs camel-integration --follow --tail=20 | grep -E "ANOMALY|CBMWorkflow"

# 4. Check anomaly_events written to TimescaleDB
docker compose exec timescaledb psql -U postgres -d sensors \
  -c "SELECT equipment_id, tag, round(z_score::numeric,2), time FROM anomaly_events ORDER BY time DESC LIMIT 5;"

# 5. Temporal UI — see CBMWorkflow execution graph
open http://localhost:8088

# 6. Grafana — sensor time-series with anomaly spike visible
open http://localhost:3001/d/jsl-ot-sensors

# 7. Demo shell OT page
open http://localhost:3000/ot

# 8. Trigger Airflow Bronze export
docker compose exec airflow-webserver airflow dags trigger ot_bronze_export
# Verify: http://localhost:9001 → bronze-ot-sensors bucket
```

---

## Updated Architecture Summary

```
MQTT Simulator
• CRM-1: bearing_temp, vibration, motor_current, rolling_force, strip_speed
• APL-1: furnace_temp, hno3_concentration, strip_speed, rinse_conductivity
• CCM-1: mold_level, casting_speed, mold_cooling_delta, tundish_temp
13 tags, 3 equipment units, 1Hz, anomaly injection via HTTP
        ▼
Mosquitto → Camel KepwareToKafkaRoute → RedPanda plant.sensors
        ▼
Inside camel-integration SpringBoot (no new containers):
  ├── SensorTimescaleWriter (@KafkaListener, group: tsdb-writer)
  │       → TimescaleDB sensor_readings hypertable (raw, HOT)
  │       → sensor_1min continuous aggregate (auto-refreshed)
  └── KafkaStreamsAnomalyProcessor
          30s in-memory window, Welford Z-score per (equipment, tag)
          threshold: |value - mean| > 3σ, min 10 samples
          → TimescaleDB anomaly_events
          → Temporal CBMWorkflow (async start)
          → POST /ot/alert → WebSocket → React demo shell

Temporal CBMWorkflow (cbm-worker)
  DetectAnomaly → ScoreConfidence → CreateSAPNotification
  → WaitForApproval (24h) → ScheduleMaintenance
  SAP priority: PM-01 (confidence >90%) or PM-03

Airflow ot_bronze_export (hourly)
  TimescaleDB sensor_1min → MinIO bronze-ot-sensors
  Partitioned: equipment={id}/year/month/day/hour/data.parquet

Grafana (provisioned, http://localhost:3001)
  TimescaleDB PostgreSQL datasource
  • Per-equipment time-series panels with threshold bands
  • Anomaly events table with z-score heatmap colouring
  • 5-second auto-refresh, 15-minute default window

React OT page (http://localhost:3000/ot)
  • Live readings table per equipment (2s poll → /ot/latest)
  • Anomaly alert feed (WebSocket /ot/alerts)
  • Simulate Failure button with equipment selector
  • Grafana deep-link ↗
```

**Demo talking points:**
- *"Grafana is what JSL's plant floor team sees — real-time sensor data, threshold bands, anomaly history. No custom code, same dashboard they'd deploy on-prem."*
- *"The moment bearing temperature hits 4σ above normal, Kafka Streams inside our integration layer detects it without any separate infrastructure. Temporal picks it up and starts the CBM workflow — durable, survives a server restart, human approval built in."*
- *"Every raw reading lands in TimescaleDB. Every hour, Airflow aggregates it into MinIO alongside the SAP medallion data. Same lineage graph, same DuckDB query layer."*
