-- Gold: inventory position by material with on-order quantities
{{ config(materialized='table', schema='gold') }}

WITH on_order AS (
    SELECT
        material_number,
        SUM(quantity)      AS total_ordered_mt,
        SUM(net_price)     AS total_value_inr,
        COUNT(*)           AS open_po_count
    FROM {{ ref('stg_sap_po_items') }}
    GROUP BY material_number
)
SELECT
    m.material_number,
    CASE
        WHEN m.material_number LIKE '%-304L-%' THEN 'Grade 304L'
        WHEN m.material_number LIKE '%-304-%'  THEN 'Grade 304'
        WHEN m.material_number LIKE '%-316L-%' THEN 'Grade 316L'
        WHEN m.material_number LIKE '%-430-%'  THEN 'Grade 430'
        WHEN m.material_number LIKE '%-409-%'  THEN 'Grade 409'
        ELSE 'Other'
    END                                AS grade,
    m.material_group,
    m.base_unit,
    COALESCE(p.total_ordered_mt, 0)    AS on_order_qty,
    COALESCE(p.total_value_inr, 0)     AS on_order_value_inr,
    COALESCE(p.open_po_count, 0)       AS open_po_count,
    current_date                       AS snapshot_date
FROM {{ ref('stg_sap_materials') }} m
LEFT JOIN on_order p ON m.material_number = p.material_number
