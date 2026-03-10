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
