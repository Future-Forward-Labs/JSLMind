-- Gold: daily production cost aggregated by stainless grade
{{ config(materialized='table', schema='gold') }}

WITH grade_mapping AS (
    SELECT
        material_number,
        CASE
            WHEN material_number LIKE '%-304L-%' THEN 'Grade 304L'
            WHEN material_number LIKE '%-304-%'  THEN 'Grade 304'
            WHEN material_number LIKE '%-316L-%' THEN 'Grade 316L'
            WHEN material_number LIKE '%-430-%'  THEN 'Grade 430'
            WHEN material_number LIKE '%-409-%'  THEN 'Grade 409'
            WHEN material_number LIKE '%-201-%'  THEN 'Grade 201'
            WHEN material_number LIKE '%-321-%'  THEN 'Grade 321'
            ELSE 'Other'
        END AS grade
    FROM {{ ref('stg_sap_materials') }}
),
cost_by_material AS (
    SELECT
        material_number,
        SUM(quantity)                                       AS total_qty_mt,
        SUM(net_price)                                      AS total_cost_inr,
        AVG(net_price / NULLIF(quantity, 0))                AS avg_cost_per_mt
    FROM {{ ref('stg_sap_po_items') }}
    GROUP BY material_number
)
SELECT
    g.grade,
    COUNT(DISTINCT c.material_number)                       AS sku_count,
    ROUND(SUM(c.total_qty_mt), 2)                           AS total_qty_mt,
    ROUND(SUM(c.total_cost_inr), 2)                         AS total_cost_inr,
    ROUND(AVG(c.avg_cost_per_mt), 2)                        AS avg_cost_per_mt,
    current_date                                            AS report_date
FROM cost_by_material c
JOIN grade_mapping g ON c.material_number = g.material_number
GROUP BY g.grade
ORDER BY total_cost_inr DESC
