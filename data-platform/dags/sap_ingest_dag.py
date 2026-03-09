"""
sap_ingest_dag — Phase 4: Medallion Pipeline
Reads JSON batches from MinIO bronze-sap-mm, stages as Parquet for dbt.
Runs every 5 min in demo (production: triggered by Camel S3 event notification).
"""
import json
import logging
import os
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.python import PythonOperator

default_args = {
    "owner": "jslmind",
    "retries": 1,
    "retry_delay": timedelta(minutes=2),
}

SEED_MARA = [
    {"MATNR": "STL-304-CR-2MM",  "MTART": "ROH", "MATKL": "SS-COLDROLLED", "MEINS": "MT", "BRGEW": 7.93, "NTGEW": 7.90},
    {"MATNR": "STL-304-HR-3MM",  "MTART": "ROH", "MATKL": "SS-HOTROLLED",  "MEINS": "MT", "BRGEW": 7.90, "NTGEW": 7.87},
    {"MATNR": "STL-316L-CR-2MM", "MTART": "ROH", "MATKL": "SS-COLDROLLED", "MEINS": "MT", "BRGEW": 7.98, "NTGEW": 7.95},
    {"MATNR": "STL-316L-HR-4MM", "MTART": "ROH", "MATKL": "SS-HOTROLLED",  "MEINS": "MT", "BRGEW": 7.95, "NTGEW": 7.92},
    {"MATNR": "STL-430-CR-1MM",  "MTART": "ROH", "MATKL": "SS-COLDROLLED", "MEINS": "MT", "BRGEW": 7.70, "NTGEW": 7.67},
    {"MATNR": "STL-430-HR-3MM",  "MTART": "ROH", "MATKL": "SS-HOTROLLED",  "MEINS": "MT", "BRGEW": 7.68, "NTGEW": 7.65},
    {"MATNR": "STL-409-HR-4MM",  "MTART": "ROH", "MATKL": "SS-HOTROLLED",  "MEINS": "MT", "BRGEW": 7.72, "NTGEW": 7.69},
    {"MATNR": "STL-201-CR-2MM",  "MTART": "ROH", "MATKL": "SS-COLDROLLED", "MEINS": "MT", "BRGEW": 7.80, "NTGEW": 7.77},
    {"MATNR": "STL-304L-CR-3MM", "MTART": "ROH", "MATKL": "SS-COLDROLLED", "MEINS": "MT", "BRGEW": 7.91, "NTGEW": 7.88},
    {"MATNR": "STL-321-HR-5MM",  "MTART": "ROH", "MATKL": "SS-HOTROLLED",  "MEINS": "MT", "BRGEW": 7.88, "NTGEW": 7.85},
]

SEED_EKPO = [
    {"EBELN": "4500012345", "EBELP": "00010", "MATNR": "STL-304-CR-2MM",  "MENGE": 500.0, "MEINS": "MT", "NETPR": 142500.0, "WERKS": "JSL1"},
    {"EBELN": "4500012345", "EBELP": "00020", "MATNR": "STL-316L-CR-2MM", "MENGE": 200.0, "MEINS": "MT", "NETPR":  98000.0, "WERKS": "JSL1"},
    {"EBELN": "4500012346", "EBELP": "00010", "MATNR": "STL-430-CR-1MM",  "MENGE": 750.0, "MEINS": "MT", "NETPR": 178500.0, "WERKS": "JSL2"},
    {"EBELN": "4500012346", "EBELP": "00020", "MATNR": "STL-304-HR-3MM",  "MENGE": 300.0, "MEINS": "MT", "NETPR":  81000.0, "WERKS": "JSL1"},
    {"EBELN": "4500012347", "EBELP": "00010", "MATNR": "STL-409-HR-4MM",  "MENGE": 400.0, "MEINS": "MT", "NETPR":  84000.0, "WERKS": "JSL2"},
]

SEED_AUFK = [
    {"AUFNR": "000100012345", "AUART": "PP01", "WERKS": "JSL1", "MATNR": "STL-316L-HR-3MM", "GAMNG": 200.0, "ISDD": "20260301"},
    {"AUFNR": "000100012346", "AUART": "PP01", "WERKS": "JSL1", "MATNR": "STL-304-CR-2MM",  "GAMNG": 350.0, "ISDD": "20260305"},
    {"AUFNR": "000100012347", "AUART": "PP01", "WERKS": "JSL2", "MATNR": "STL-430-CR-1MM",  "GAMNG": 500.0, "ISDD": "20260310"},
]


def ingest_bronze_from_minio(**context):
    """Pull JSONs from MinIO bronze-sap-mm, write to /opt/airflow/medallion/bronze/ as Parquet."""
    import pandas as pd

    staging_dir = "/opt/airflow/medallion/bronze"
    os.makedirs(staging_dir, exist_ok=True)

    mara_rows, ekpo_rows, aufk_rows = [], [], []

    try:
        from minio import Minio
        endpoint = os.environ.get("MINIO_ENDPOINT", "minio:9000").replace("http://", "").replace("https://", "")
        client = Minio(
            endpoint,
            access_key=os.environ.get("MINIO_ACCESS_KEY", "jslmind"),
            secret_key=os.environ.get("MINIO_SECRET_KEY", "jslmind_minio_2024"),
            secure=False,
        )
        objects = list(client.list_objects("bronze-sap-mm"))
        logging.info(f"Found {len(objects)} objects in bronze-sap-mm")
        for obj in objects:
            response = client.get_object("bronze-sap-mm", obj.object_name)
            batch = json.loads(response.read().decode("utf-8"))
            mara_rows.extend(batch.get("MARA", []))
            ekpo_rows.extend(batch.get("EKPO", []))
            aufk_rows.extend(batch.get("AUFK", []))
    except Exception as exc:
        logging.warning(f"MinIO unavailable ({exc}), falling back to seed data")
        mara_rows, ekpo_rows, aufk_rows = list(SEED_MARA), list(SEED_EKPO), list(SEED_AUFK)

    pd.DataFrame(mara_rows).to_parquet(f"{staging_dir}/sap_mara.parquet", index=False)
    pd.DataFrame(ekpo_rows).to_parquet(f"{staging_dir}/sap_ekpo.parquet", index=False)
    pd.DataFrame(aufk_rows).to_parquet(f"{staging_dir}/sap_aufk.parquet", index=False)
    logging.info(f"Staged: {len(mara_rows)} MARA | {len(ekpo_rows)} EKPO | {len(aufk_rows)} AUFK")


with DAG(
    "sap_ingest",
    default_args=default_args,
    description="Extract SAP MM data from MinIO bronze and stage for dbt",
    schedule_interval="*/5 * * * *",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=["jslmind", "medallion", "bronze"],
) as dag:
    PythonOperator(task_id="ingest_bronze", python_callable=ingest_bronze_from_minio)
