"""
medallion_transform_dag — Phase 4: Medallion Pipeline
Runs dbt models in sequence: staging (Silver) then gold (Gold).
Airflow auto-emits OpenLineage events for each task via OPENLINEAGE_URL env var.
"""
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.bash import BashOperator

DBT_CMD = "cd /opt/airflow/dbt && dbt {cmd} --profiles-dir /opt/airflow/dbt --project-dir /opt/airflow/dbt"

default_args = {
    "owner": "jslmind",
    "retries": 1,
    "retry_delay": timedelta(minutes=2),
}

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
    dbt_silver >> dbt_gold
