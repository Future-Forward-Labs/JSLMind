-- Silver: cleaned SAP Material Master (MARA)
-- Source: Parquet staged from MinIO bronze-sap-mm by sap_ingest DAG
{{ config(materialized='table', schema='silver') }}

SELECT
    MATNR                              AS material_number,
    MTART                              AS material_type,
    MATKL                              AS material_group,
    MEINS                              AS base_unit,
    TRY_CAST(BRGEW AS DOUBLE)          AS gross_weight_kg,
    TRY_CAST(NTGEW AS DOUBLE)          AS net_weight_kg,
    current_timestamp                  AS _loaded_at
FROM read_parquet('/opt/airflow/medallion/bronze/sap_mara.parquet')
WHERE MATNR IS NOT NULL
