"""
medallion_transform_dag — Phase 4: Medallion Pipeline
Runs dbt models in sequence: staging (Silver) then gold (Gold).
Airflow auto-emits OpenLineage events for each task via OPENLINEAGE_URL env var.
"""
import json
import logging
import os
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.operators.python import PythonOperator

DBT_CMD = "cd /opt/airflow/dbt && /home/airflow/.local/bin/dbt {cmd} --profiles-dir /opt/airflow/dbt --project-dir /opt/airflow/dbt"

default_args = {
    "owner": "jslmind",
    "retries": 1,
    "retry_delay": timedelta(minutes=2),
}


def publish_gold_summary(**context):
    """Read Gold DuckDB tables and write KPI summary JSON to MinIO gold/summary.json."""
    import duckdb
    from minio import Minio
    import io

    con = duckdb.connect("/opt/airflow/medallion/jslmind.duckdb", read_only=True)
    try:
        cost_row = con.execute(
            "SELECT total_cost_inr, total_qty_mt FROM main_gold.production_cost WHERE grade = 'Grade 304'"
        ).fetchone()
        inv_row = con.execute(
            "SELECT SUM(on_order_qty) FROM main_gold.inventory WHERE on_order_qty > 0 AND grade = 'Grade 304'"
        ).fetchone()
        qual_row = con.execute(
            "SELECT AVG(quality_score_pct), COUNT(*) FROM main_gold.quality"
        ).fetchone()
    finally:
        con.close()

    summary = {
        "po_cost_grade_304_inr": round(cost_row[0]) if cost_row and cost_row[0] else 0,
        "qty_grade_304_mt": round(cost_row[1]) if cost_row and cost_row[1] else 0,
        "on_order_qty_mt": round(inv_row[0]) if inv_row and inv_row[0] else 0,
        "quality_pass_pct": round(qual_row[0], 1) if qual_row and qual_row[0] else 0,
        "order_count": qual_row[1] if qual_row else 0,
        "updated_at": datetime.utcnow().isoformat(),
    }
    logging.info(f"Gold summary: {summary}")

    endpoint = os.environ.get("MINIO_ENDPOINT", "minio:9000").replace("http://", "").replace("https://", "")
    client = Minio(endpoint, access_key=os.environ["MINIO_ACCESS_KEY"], secret_key=os.environ["MINIO_SECRET_KEY"], secure=False)
    data = json.dumps(summary).encode()
    client.put_object("gold", "summary.json", io.BytesIO(data), len(data), content_type="application/json")
    logging.info("Published gold/summary.json to MinIO")


with DAG(
    "medallion_transform",
    default_args=default_args,
    description="dbt Bronze → Silver (staging) → Gold transforms",
    schedule_interval="*/10 * * * *",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=["jslmind", "medallion", "dbt"],
) as dag:
    dbt_silver = BashOperator(
        task_id="dbt_run_silver",
        bash_command=DBT_CMD.format(cmd="run --select staging"),
    )
    dbt_gold = BashOperator(
        task_id="dbt_run_gold",
        bash_command=DBT_CMD.format(cmd="run --select gold"),
    )
    publish_summary = PythonOperator(
        task_id="publish_gold_summary",
        python_callable=publish_gold_summary,
    )
    dbt_silver >> dbt_gold >> publish_summary
