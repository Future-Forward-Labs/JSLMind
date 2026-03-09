-- Silver: cleaned SAP Production Orders (AUFK)
{{ config(materialized='table', schema='silver') }}

SELECT
    AUFNR                              AS order_number,
    AUART                              AS order_type,
    WERKS                              AS plant,
    MATNR                              AS material_number,
    TRY_CAST(GAMNG AS DOUBLE)          AS target_qty,
    ISDD                               AS start_date,
    current_timestamp                  AS _loaded_at
FROM read_parquet('/opt/airflow/medallion/bronze/sap_aufk.parquet')
WHERE AUFNR IS NOT NULL
