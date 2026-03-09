-- Silver: cleaned SAP Purchase Order Items (EKPO)
{{ config(materialized='table', schema='silver') }}

SELECT
    EBELN                              AS po_number,
    EBELP                              AS po_item,
    MATNR                              AS material_number,
    TRY_CAST(MENGE AS DOUBLE)          AS quantity,
    MEINS                              AS unit,
    TRY_CAST(NETPR AS DOUBLE)          AS net_price,
    WERKS                              AS plant,
    current_timestamp                  AS _loaded_at
FROM read_parquet('/opt/airflow/medallion/bronze/sap_ekpo.parquet')
WHERE EBELN IS NOT NULL
