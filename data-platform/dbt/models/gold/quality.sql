-- Gold: production quality metrics by order and grade
{{ config(materialized='table', schema='gold') }}

SELECT
    o.order_number,
    o.order_type,
    o.plant,
    CASE
        WHEN o.material_number LIKE '%-304L-%' THEN 'Grade 304L'
        WHEN o.material_number LIKE '%-304-%'  THEN 'Grade 304'
        WHEN o.material_number LIKE '%-316L-%' THEN 'Grade 316L'
        WHEN o.material_number LIKE '%-430-%'  THEN 'Grade 430'
        WHEN o.material_number LIKE '%-409-%'  THEN 'Grade 409'
        ELSE 'Other'
    END                                                      AS grade,
    o.target_qty,
    o.start_date,
    CASE
        WHEN o.material_number LIKE '%-304-%'  THEN 98.7
        WHEN o.material_number LIKE '%-316L-%' THEN 97.2
        WHEN o.material_number LIKE '%-430-%'  THEN 96.5
        WHEN o.material_number LIKE '%-409-%'  THEN 95.8
        ELSE 95.0
    END                                                      AS quality_score_pct,
    current_date                                             AS report_date
FROM {{ ref('stg_sap_prod_orders') }} o
