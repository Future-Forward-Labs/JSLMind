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
