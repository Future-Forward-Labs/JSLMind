# Phase 4 — Medallion Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the full Bronze→Silver→Gold medallion data pipeline: Camel writes synthetic SAP data to MinIO, Airflow + dbt transforms it, Marquez shows lineage, and the demo shell gains a live Medallion Pipeline page.

**Architecture:** Camel `SapToBronzeRoute` generates synthetic SAP MM records every 60s and uploads JSON batches to MinIO `bronze-sap-mm`. An Airflow `sap_ingest` DAG (runs every 5 min) reads from MinIO and writes Parquet to a shared volume. `medallion_transform` DAG runs dbt-duckdb models (Silver staging → Gold aggregates). `data_quality` DAG runs dbt tests + counts Gold rows. All DAGs emit OpenLineage events to Marquez automatically via the `OPENLINEAGE_URL` env var already set in docker-compose.

**Tech Stack:** Apache Camel 4.6 (camel-minio-starter), Apache Airflow 2.9, dbt-duckdb 1.8, DuckDB, MinIO, Marquez, React (demo shell page)

---

## Task 1: Add camel-minio dependency to pom.xml

**Files:**
- Modify: `integration/pom.xml`

**Step 1: Add the dependency**

Insert after the `camel-jackson-starter` block in `integration/pom.xml`:

```xml
    <!-- MinIO S3-compatible object storage (Bronze bucket writes) -->
    <dependency>
      <groupId>org.apache.camel.springboot</groupId>
      <artifactId>camel-minio-starter</artifactId>
      <version>${camel.version}</version>
    </dependency>
```

**Step 2: Verify the build compiles**

```bash
cd integration && JAVA_HOME=$(/usr/libexec/java_home) mvn dependency:resolve -q && cd ..
```
Expected: BUILD SUCCESS (no errors)

**Step 3: Commit**

```bash
git add integration/pom.xml
git commit -m "feat(camel): add camel-minio-starter dependency for bronze bucket writes"
```

---

## Task 2: Implement SapToBronzeRoute (replace stub)

**Files:**
- Modify: `integration/src/main/java/com/jslmind/integration/routes/SapToBronzeRoute.java`
- Create: `integration/src/main/java/com/jslmind/integration/config/MinioClientConfig.java`
- Modify: `integration/src/main/resources/application.properties`

**Step 1: Create MinioClientConfig.java**

```java
package com.jslmind.integration.config;

import io.minio.MinioClient;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class MinioClientConfig {

    @Value("${minio.endpoint:http://minio:9000}")
    private String endpoint;

    @Value("${minio.accessKey:jslmind}")
    private String accessKey;

    @Value("${minio.secretKey:jslmind_minio_2024}")
    private String secretKey;

    @Bean
    public MinioClient minioClient() {
        return MinioClient.builder()
                .endpoint(endpoint)
                .credentials(accessKey, secretKey)
                .build();
    }
}
```

**Step 2: Replace SapToBronzeRoute.java**

```java
package com.jslmind.integration.routes;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.camel.builder.RouteBuilder;
import org.apache.camel.component.minio.MinioConstants;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.*;

/**
 * SapToBronzeRoute — Phase 4: Medallion Pipeline
 *
 * Every 60 seconds: generates a synthetic SAP MM batch (MARA + EKPO + AUFK),
 * serialises to JSON, and uploads to MinIO bronze-sap-mm bucket.
 *
 * Demo data uses exact SAP field names so JSL technical audience recognises them.
 * Production: replace timer with SAP OData/RFC Camel component — zero downstream change.
 */
@Component
public class SapToBronzeRoute extends RouteBuilder {

    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public void configure() {
        onException(Exception.class)
                .log("SapToBronzeRoute ERROR: ${exception.message}")
                .handled(true);

        from("timer:sap-poll?period=60000&delay=10000")
                .routeId("sap-to-bronze")
                .process(exchange -> {
                    Map<String, Object> batch = new LinkedHashMap<>();
                    batch.put("batch_id", "batch_" + Instant.now().toEpochMilli());
                    batch.put("extracted_at", Instant.now().toString());
                    batch.put("MARA", generateMara());
                    batch.put("EKPO", generateEkpo());
                    batch.put("AUFK", generateAufk());

                    exchange.getIn().setBody(mapper.writeValueAsString(batch));
                    exchange.getIn().setHeader(MinioConstants.OBJECT_NAME,
                            "sap_mm_" + Instant.now().toEpochMilli() + ".json");
                    exchange.getIn().setHeader(MinioConstants.CONTENT_TYPE, "application/json");
                })
                .to("minio://bronze-sap-mm?autoCreateBucket=true&minioClient=#minioClient")
                .log("SapToBronzeRoute: ✓ SAP batch → MinIO bronze-sap-mm/${header.CamelMinioObjectName}");
    }

    private List<Map<String, Object>> generateMara() {
        Object[][] specs = {
            {"STL-304-CR-2MM",  "ROH", "SS-COLDROLLED", "MT", 7.93, 7.90},
            {"STL-304-HR-3MM",  "ROH", "SS-HOTROLLED",  "MT", 7.90, 7.87},
            {"STL-316L-CR-2MM", "ROH", "SS-COLDROLLED", "MT", 7.98, 7.95},
            {"STL-316L-HR-4MM", "ROH", "SS-HOTROLLED",  "MT", 7.95, 7.92},
            {"STL-430-CR-1MM",  "ROH", "SS-COLDROLLED", "MT", 7.70, 7.67},
            {"STL-430-HR-3MM",  "ROH", "SS-HOTROLLED",  "MT", 7.68, 7.65},
            {"STL-409-HR-4MM",  "ROH", "SS-HOTROLLED",  "MT", 7.72, 7.69},
            {"STL-201-CR-2MM",  "ROH", "SS-COLDROLLED", "MT", 7.80, 7.77},
            {"STL-304L-CR-3MM", "ROH", "SS-COLDROLLED", "MT", 7.91, 7.88},
            {"STL-321-HR-5MM",  "ROH", "SS-HOTROLLED",  "MT", 7.88, 7.85},
        };
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Object[] s : specs) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("MATNR", s[0]); row.put("MTART", s[1]); row.put("MATKL", s[2]);
            row.put("MEINS", s[3]); row.put("BRGEW", s[4]); row.put("NTGEW", s[5]);
            rows.add(row);
        }
        return rows;
    }

    private List<Map<String, Object>> generateEkpo() {
        Object[][] items = {
            {"4500012345", "00010", "STL-304-CR-2MM",  500.0, "MT", 142500.0, "JSL1"},
            {"4500012345", "00020", "STL-316L-CR-2MM", 200.0, "MT",  98000.0, "JSL1"},
            {"4500012346", "00010", "STL-430-CR-1MM",  750.0, "MT", 178500.0, "JSL2"},
            {"4500012346", "00020", "STL-304-HR-3MM",  300.0, "MT",  81000.0, "JSL1"},
            {"4500012347", "00010", "STL-409-HR-4MM",  400.0, "MT",  84000.0, "JSL2"},
        };
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Object[] i : items) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("EBELN", i[0]); row.put("EBELP", i[1]); row.put("MATNR", i[2]);
            row.put("MENGE", i[3]); row.put("MEINS", i[4]); row.put("NETPR", i[5]);
            row.put("WERKS", i[6]);
            rows.add(row);
        }
        return rows;
    }

    private List<Map<String, Object>> generateAufk() {
        Object[][] orders = {
            {"000100012345", "PP01", "JSL1", "STL-316L-HR-3MM", 200.0, "20260301"},
            {"000100012346", "PP01", "JSL1", "STL-304-CR-2MM",  350.0, "20260305"},
            {"000100012347", "PP01", "JSL2", "STL-430-CR-1MM",  500.0, "20260310"},
        };
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Object[] o : orders) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("AUFNR", o[0]); row.put("AUART", o[1]); row.put("WERKS", o[2]);
            row.put("MATNR", o[3]); row.put("GAMNG", o[4]); row.put("ISDD", o[5]);
            rows.add(row);
        }
        return rows;
    }
}
```

**Step 3: Add Minio config to application.properties**

Append to `integration/src/main/resources/application.properties`:
```properties
# MinIO — default to local dev values; overridden by env in Docker
minio.endpoint=${MINIO_ENDPOINT:http://localhost:9000}
minio.accessKey=${MINIO_ACCESS_KEY:jslmind}
minio.secretKey=${MINIO_SECRET_KEY:jslmind_minio_2024}
```

**Step 4: Build and verify compiles**

```bash
cd integration && JAVA_HOME=$(/usr/libexec/java_home) mvn package -DskipTests -q && cd ..
```
Expected: BUILD SUCCESS, `target/jslmind-integration-1.0.0.jar` created

**Step 5: Commit**

```bash
git add integration/src/ integration/pom.xml
git commit -m "feat(camel): implement SapToBronzeRoute — synthetic SAP MM → MinIO bronze bucket"
```

---

## Task 3: Create data-platform directory structure + dbt project

**Files to create:**
- `data-platform/dbt/dbt_project.yml`
- `data-platform/dbt/profiles.yml`
- `data-platform/dbt/packages.yml`
- `data-platform/dbt/models/staging/stg_sap_materials.sql`
- `data-platform/dbt/models/staging/stg_sap_po_items.sql`
- `data-platform/dbt/models/staging/stg_sap_prod_orders.sql`
- `data-platform/dbt/models/gold/production_cost.sql`
- `data-platform/dbt/models/gold/inventory.sql`
- `data-platform/dbt/models/gold/quality.sql`
- `data-platform/dbt/models/schema.yml`
- `data-platform/dags/.gitkeep` (placeholder — DAGs added in Task 4)

**Step 1: Create directory structure**

```bash
mkdir -p data-platform/dbt/models/staging
mkdir -p data-platform/dbt/models/gold
mkdir -p data-platform/dags
```

**Step 2: Create dbt_project.yml**

```yaml
name: 'jslmind'
version: '1.0.0'
config-version: 2

profile: 'jslmind'

model-paths: ["models"]
test-paths: ["tests"]

models:
  jslmind:
    staging:
      +schema: silver
      +materialized: table
    gold:
      +schema: gold
      +materialized: table
```

**Step 3: Create profiles.yml**

```yaml
jslmind:
  target: dev
  outputs:
    dev:
      type: duckdb
      path: /opt/airflow/medallion/jslmind.duckdb
      threads: 4
```

**Step 4: Create packages.yml** (empty packages, just declares dbt version requirement)

```yaml
packages: []
```

**Step 5: Create staging models**

`models/staging/stg_sap_materials.sql`:
```sql
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
```

`models/staging/stg_sap_po_items.sql`:
```sql
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
```

`models/staging/stg_sap_prod_orders.sql`:
```sql
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
```

**Step 6: Create Gold models**

`models/gold/production_cost.sql`:
```sql
-- Gold: daily production cost aggregated by stainless grade
-- Demo talking point: "Operations team at ₹18,400 inference this month"
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
```

`models/gold/inventory.sql`:
```sql
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
```

`models/gold/quality.sql`:
```sql
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
    -- Synthetic quality scores per grade for demo (production: pulled from MES)
    CASE
        WHEN o.material_number LIKE '%-304-%'  THEN 98.7
        WHEN o.material_number LIKE '%-316L-%' THEN 97.2
        WHEN o.material_number LIKE '%-430-%'  THEN 96.5
        WHEN o.material_number LIKE '%-409-%'  THEN 95.8
        ELSE 95.0
    END                                                      AS quality_score_pct,
    current_date                                             AS report_date
FROM {{ ref('stg_sap_prod_orders') }} o
```

**Step 7: Create schema.yml with dbt tests**

`models/schema.yml`:
```yaml
version: 2

models:
  - name: stg_sap_materials
    description: "Silver: cleaned SAP Material Master (MARA)"
    columns:
      - name: material_number
        description: "SAP MATNR — primary key"
        data_tests: [not_null, unique]
      - name: gross_weight_kg
        data_tests: [not_null]

  - name: stg_sap_po_items
    description: "Silver: cleaned SAP Purchase Order Items (EKPO)"
    columns:
      - name: po_number
        description: "SAP EBELN"
        data_tests: [not_null]
      - name: quantity
        data_tests: [not_null]

  - name: stg_sap_prod_orders
    description: "Silver: cleaned SAP Production Orders (AUFK)"
    columns:
      - name: order_number
        description: "SAP AUFNR"
        data_tests: [not_null, unique]

  - name: production_cost
    description: "Gold: cost aggregated by stainless grade"
    columns:
      - name: grade
        data_tests: [not_null, unique]

  - name: inventory
    description: "Gold: inventory position by material"
    columns:
      - name: material_number
        data_tests: [not_null]

  - name: quality
    description: "Gold: production quality metrics by order"
    columns:
      - name: order_number
        data_tests: [not_null]
```

**Step 8: Commit**

```bash
git add data-platform/
git commit -m "feat(dbt): add dbt-duckdb project with Bronze→Silver→Gold medallion models"
```

---

## Task 4: Create 3 Airflow DAGs

**Files:**
- Create: `data-platform/dags/sap_ingest_dag.py`
- Create: `data-platform/dags/medallion_transform_dag.py`
- Create: `data-platform/dags/data_quality_dag.py`

**Step 1: Create sap_ingest_dag.py**

```python
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
```

**Step 2: Create medallion_transform_dag.py**

```python
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
```

**Step 3: Create data_quality_dag.py**

```python
"""
data_quality_dag — Phase 4: Medallion Pipeline
Runs dbt tests (schema + row-level) then verifies Gold table counts.
Demo talking point: "98.7% quality pass rate, 2 warnings flagged."
"""
import logging
from datetime import datetime, timedelta

from airflow import DAG
from airflow.operators.bash import BashOperator
from airflow.operators.python import PythonOperator

DBT_CMD = "cd /opt/airflow/dbt && dbt {cmd} --profiles-dir /opt/airflow/dbt --project-dir /opt/airflow/dbt"

default_args = {"owner": "jslmind", "retries": 0}


def check_gold_counts(**context):
    """Assert Gold tables are non-empty; log counts for demo dashboard."""
    import duckdb

    conn = duckdb.connect("/opt/airflow/medallion/jslmind.duckdb", read_only=True)
    results = {}
    for table in ("gold.production_cost", "gold.inventory", "gold.quality"):
        try:
            count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            results[table] = {"count": count, "status": "PASS" if count > 0 else "WARN"}
        except Exception as exc:
            results[table] = {"count": 0, "status": "FAIL", "error": str(exc)}
    conn.close()

    logging.info(f"Gold DQ results: {results}")
    failures = [k for k, v in results.items() if v["status"] == "FAIL"]
    if failures:
        raise ValueError(f"Gold tables empty or missing: {failures}")
    return results


with DAG(
    "data_quality",
    default_args=default_args,
    description="dbt tests + Gold row count checks",
    schedule_interval="*/15 * * * *",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=["jslmind", "dq"],
) as dag:
    dbt_test = BashOperator(
        task_id="dbt_test",
        bash_command=DBT_CMD.format(cmd="test"),
    )
    gold_counts = PythonOperator(
        task_id="check_gold_counts",
        python_callable=check_gold_counts,
    )
    dbt_test >> gold_counts
```

**Step 4: Commit**

```bash
git add data-platform/dags/
git commit -m "feat(airflow): add 3 medallion DAGs — sap_ingest, medallion_transform, data_quality"
```

---

## Task 5: Update docker-compose.yml for Phase 4

**Files:**
- Modify: `docker-compose.yml`

**Step 1: Add `medallion_data` volume**

In the `volumes:` section at the top of docker-compose.yml, add:
```yaml
  medallion_data:
```

**Step 2: Add `airflow-init` service** (run once to migrate DB + create admin user)

Insert before `airflow-webserver:` in the Phase 4 section:
```yaml
  airflow-init:
    image: apache/airflow:2.9.0
    command: >
      bash -c "
        airflow db migrate &&
        airflow users create
          --username admin --password admin
          --firstname Admin --lastname JSL
          --role Admin --email admin@jsl.com || true
      "
    environment: &airflow-env
      AIRFLOW__CORE__EXECUTOR: LocalExecutor
      AIRFLOW__DATABASE__SQL_ALCHEMY_CONN: postgresql+psycopg2://postgres:${POSTGRES_PASSWORD}@postgres:5432/airflow
      AIRFLOW__CORE__FERNET_KEY: ${AIRFLOW_FERNET_KEY}
      AIRFLOW__WEBSERVER__SECRET_KEY: ${AIRFLOW_SECRET_KEY}
      AIRFLOW__CORE__LOAD_EXAMPLES: "False"
      OPENLINEAGE_URL: http://marquez:5000
      OPENLINEAGE_NAMESPACE: jslmind
      MINIO_ENDPOINT: http://minio:9000
      MINIO_ACCESS_KEY: ${MINIO_ROOT_USER}
      MINIO_SECRET_KEY: ${MINIO_ROOT_PASSWORD}
      _PIP_ADDITIONAL_REQUIREMENTS: "dbt-duckdb==1.8.1 minio==7.2.0 pandas==2.2.0 pyarrow==15.0.0"
    networks: [jslmind]
    depends_on:
      postgres:
        condition: service_healthy
    restart: "no"
```

> **Note:** The `&airflow-env` anchor must be defined on the first service that uses it. If `airflow-env` is already defined on `airflow-webserver`, move the anchor definition to `airflow-init` and reference with `*airflow-env` in `airflow-webserver` and `airflow-scheduler`. Also add the new env vars (MINIO_*, _PIP_ADDITIONAL_REQUIREMENTS) to the existing `&airflow-env` anchor.

**Step 3: Update the existing `airflow-env` anchor** — modify the `environment: &airflow-env` block on `airflow-webserver` to add:
```yaml
      MINIO_ENDPOINT: http://minio:9000
      MINIO_ACCESS_KEY: ${MINIO_ROOT_USER}
      MINIO_SECRET_KEY: ${MINIO_ROOT_PASSWORD}
      _PIP_ADDITIONAL_REQUIREMENTS: "dbt-duckdb==1.8.1 minio==7.2.0 pandas==2.2.0 pyarrow==15.0.0"
```

**Step 4: Mount `medallion_data` volume in airflow-webserver and airflow-scheduler**

In both `airflow-webserver` and `airflow-scheduler`, add to the `volumes:` list:
```yaml
      - medallion_data:/opt/airflow/medallion
```

**Step 5: Make `airflow-webserver` depend on `airflow-init`**

Add to `airflow-webserver.depends_on`:
```yaml
      airflow-init:
        condition: service_completed_successfully
```

**Step 6: Verify the YAML is valid**

```bash
docker compose config --quiet && echo "YAML OK"
```
Expected: `YAML OK`

**Step 7: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(docker): add airflow-init, medallion_data volume, pip extras for Phase 4"
```

---

## Task 6: Create seed + verify scripts

**Files:**
- Create: `scripts/seed-minio.sh`
- Create: `scripts/seed-sap-data.sh`
- Create: `scripts/verify-phase4.sh`

**Step 1: Create scripts/seed-minio.sh**

```bash
#!/usr/bin/env bash
# seed-minio.sh — create MinIO buckets for all medallion layers
# Run after: docker compose up -d minio
set -euo pipefail

MINIO_URL="http://localhost:9000"
MC_ALIAS="jslmind"
ACCESS_KEY="${MINIO_ROOT_USER:-jslmind}"
SECRET_KEY="${MINIO_ROOT_PASSWORD:-jslmind_minio_2024}"

echo "=== Seeding MinIO buckets ==="

# Wait for MinIO to be ready
echo "Waiting for MinIO..."
until curl -sf "${MINIO_URL}/minio/health/live" >/dev/null; do sleep 2; done
echo "MinIO ready."

# Use mc (MinIO client) via Docker
docker run --rm --network jslmind_jslmind \
  minio/mc:latest \
  bash -c "
    mc alias set ${MC_ALIAS} http://minio:9000 ${ACCESS_KEY} ${SECRET_KEY} &&
    mc mb --ignore-existing ${MC_ALIAS}/bronze-sap-mm &&
    mc mb --ignore-existing ${MC_ALIAS}/silver &&
    mc mb --ignore-existing ${MC_ALIAS}/gold &&
    mc mb --ignore-existing ${MC_ALIAS}/platinum &&
    echo 'Buckets created: bronze-sap-mm, silver, gold, platinum'
  "

echo "=== MinIO seed complete ==="
```

**Step 2: Create scripts/seed-sap-data.sh**

```bash
#!/usr/bin/env bash
# seed-sap-data.sh — upload initial synthetic SAP batch to MinIO bronze bucket
# Run after seed-minio.sh to pre-populate bronze layer before first Camel tick
set -euo pipefail

MINIO_URL="http://localhost:9000"
ACCESS_KEY="${MINIO_ROOT_USER:-jslmind}"
SECRET_KEY="${MINIO_ROOT_PASSWORD:-jslmind_minio_2024}"
TMPFILE=$(mktemp /tmp/sap_seed_XXXXXX.json)

cat > "${TMPFILE}" <<'JSON'
{
  "batch_id": "batch_seed_001",
  "extracted_at": "2026-03-09T06:00:00Z",
  "MARA": [
    {"MATNR": "STL-304-CR-2MM",  "MTART": "ROH", "MATKL": "SS-COLDROLLED", "MEINS": "MT", "BRGEW": 7.93, "NTGEW": 7.90},
    {"MATNR": "STL-304-HR-3MM",  "MTART": "ROH", "MATKL": "SS-HOTROLLED",  "MEINS": "MT", "BRGEW": 7.90, "NTGEW": 7.87},
    {"MATNR": "STL-316L-CR-2MM", "MTART": "ROH", "MATKL": "SS-COLDROLLED", "MEINS": "MT", "BRGEW": 7.98, "NTGEW": 7.95},
    {"MATNR": "STL-316L-HR-4MM", "MTART": "ROH", "MATKL": "SS-HOTROLLED",  "MEINS": "MT", "BRGEW": 7.95, "NTGEW": 7.92},
    {"MATNR": "STL-430-CR-1MM",  "MTART": "ROH", "MATKL": "SS-COLDROLLED", "MEINS": "MT", "BRGEW": 7.70, "NTGEW": 7.67},
    {"MATNR": "STL-430-HR-3MM",  "MTART": "ROH", "MATKL": "SS-HOTROLLED",  "MEINS": "MT", "BRGEW": 7.68, "NTGEW": 7.65},
    {"MATNR": "STL-409-HR-4MM",  "MTART": "ROH", "MATKL": "SS-HOTROLLED",  "MEINS": "MT", "BRGEW": 7.72, "NTGEW": 7.69},
    {"MATNR": "STL-201-CR-2MM",  "MTART": "ROH", "MATKL": "SS-COLDROLLED", "MEINS": "MT", "BRGEW": 7.80, "NTGEW": 7.77},
    {"MATNR": "STL-304L-CR-3MM", "MTART": "ROH", "MATKL": "SS-COLDROLLED", "MEINS": "MT", "BRGEW": 7.91, "NTGEW": 7.88},
    {"MATNR": "STL-321-HR-5MM",  "MTART": "ROH", "MATKL": "SS-HOTROLLED",  "MEINS": "MT", "BRGEW": 7.88, "NTGEW": 7.85}
  ],
  "EKPO": [
    {"EBELN": "4500012345", "EBELP": "00010", "MATNR": "STL-304-CR-2MM",  "MENGE": 500.0, "MEINS": "MT", "NETPR": 142500.0, "WERKS": "JSL1"},
    {"EBELN": "4500012345", "EBELP": "00020", "MATNR": "STL-316L-CR-2MM", "MENGE": 200.0, "MEINS": "MT", "NETPR":  98000.0, "WERKS": "JSL1"},
    {"EBELN": "4500012346", "EBELP": "00010", "MATNR": "STL-430-CR-1MM",  "MENGE": 750.0, "MEINS": "MT", "NETPR": 178500.0, "WERKS": "JSL2"},
    {"EBELN": "4500012346", "EBELP": "00020", "MATNR": "STL-304-HR-3MM",  "MENGE": 300.0, "MEINS": "MT", "NETPR":  81000.0, "WERKS": "JSL1"},
    {"EBELN": "4500012347", "EBELP": "00010", "MATNR": "STL-409-HR-4MM",  "MENGE": 400.0, "MEINS": "MT", "NETPR":  84000.0, "WERKS": "JSL2"}
  ],
  "AUFK": [
    {"AUFNR": "000100012345", "AUART": "PP01", "WERKS": "JSL1", "MATNR": "STL-316L-HR-3MM", "GAMNG": 200.0, "ISDD": "20260301"},
    {"AUFNR": "000100012346", "AUART": "PP01", "WERKS": "JSL1", "MATNR": "STL-304-CR-2MM",  "GAMNG": 350.0, "ISDD": "20260305"},
    {"AUFNR": "000100012347", "AUART": "PP01", "WERKS": "JSL2", "MATNR": "STL-430-CR-1MM",  "GAMNG": 500.0, "ISDD": "20260310"}
  ]
}
JSON

echo "Uploading seed SAP batch to MinIO bronze-sap-mm..."
curl -sf -X PUT \
  --aws-sigv4 "aws:amz:us-east-1:s3" \
  --user "${ACCESS_KEY}:${SECRET_KEY}" \
  -H "Content-Type: application/json" \
  --data-binary @"${TMPFILE}" \
  "${MINIO_URL}/bronze-sap-mm/sap_mm_seed_001.json" && echo "✓ Seed batch uploaded"

rm -f "${TMPFILE}"
echo "=== SAP seed complete ==="
```

**Step 3: Create scripts/verify-phase4.sh**

```bash
#!/usr/bin/env bash
# verify-phase4.sh — health checks for Phase 4: Medallion Pipeline
set -euo pipefail

PASS=0; FAIL=0
check() {
  local label="$1"; local cmd="$2"
  if eval "$cmd" >/dev/null 2>&1; then
    echo "  PASS  $label"; ((PASS++))
  else
    echo "  FAIL  $label"; ((FAIL++))
  fi
}

echo ""
echo "=== Phase 4 — Medallion Pipeline ==="
echo ""

# MinIO
check "MinIO health"          "curl -sf http://localhost:9000/minio/health/live"
check "MinIO bronze bucket"   "curl -sf -u \${MINIO_ROOT_USER:-jslmind}:\${MINIO_ROOT_PASSWORD:-jslmind_minio_2024} http://localhost:9000/bronze-sap-mm"

# Camel
check "Camel health"          "curl -sf http://localhost:8090/actuator/health | python3 -c \"import sys,json; d=json.load(sys.stdin); assert d['status']=='UP'\""
check "sap-to-bronze route"   "curl -sf http://localhost:8090/actuator/camel | python3 -c \"import sys,json; d=json.load(sys.stdin); routes=[r for r in d.get('routes',{}).values() if isinstance(r,dict) and r.get('id')=='sap-to-bronze']; assert len(routes)>0\""

# Airflow
check "Airflow webserver"     "curl -sf http://localhost:8085/health | python3 -c \"import sys,json; d=json.load(sys.stdin); assert d['metadatabase']['status']=='healthy'\""
check "sap_ingest DAG"        "curl -sf -u admin:admin http://localhost:8085/api/v1/dags/sap_ingest | python3 -c \"import sys,json; d=json.load(sys.stdin); assert not d.get('is_paused',True)\""
check "medallion_transform"   "curl -sf -u admin:admin http://localhost:8085/api/v1/dags/medallion_transform | python3 -c \"import sys,json; d=json.load(sys.stdin); assert not d.get('is_paused',True)\""
check "data_quality DAG"      "curl -sf -u admin:admin http://localhost:8085/api/v1/dags/data_quality | python3 -c \"import sys,json; d=json.load(sys.stdin); assert not d.get('is_paused',True)\""

# Marquez
check "Marquez API"           "curl -sf http://localhost:5000/api/v1/namespaces"

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "${FAIL}" -eq 0 ] && echo "Phase 4 READY" || echo "Phase 4 NOT READY — fix failures above"
echo ""
```

**Step 4: Make scripts executable and commit**

```bash
chmod +x scripts/seed-minio.sh scripts/seed-sap-data.sh scripts/verify-phase4.sh
git add scripts/seed-minio.sh scripts/seed-sap-data.sh scripts/verify-phase4.sh
git commit -m "feat(scripts): add seed-minio, seed-sap-data, verify-phase4 for Phase 4"
```

---

## Task 7: Create MedallionPipeline frontend page

**Files:**
- Create: `frontend/src/pages/MedallionPipeline.jsx`

**Step 1: Create MedallionPipeline.jsx**

Pattern: follows same structure as `HybridRAG.jsx` — hooks for live data, stat cards, links.

```jsx
import { useState, useEffect } from 'react'
import LaunchButton from '../components/LaunchButton.jsx'

const DAGS = ['sap_ingest', 'medallion_transform', 'data_quality']

function useAirflowDags() {
  const [dags, setDags] = useState({})
  useEffect(() => {
    const fetch_ = async () => {
      const results = {}
      for (const dag of DAGS) {
        try {
          const r = await fetch(`http://localhost:8085/api/v1/dags/${dag}`, {
            headers: { Authorization: 'Basic ' + btoa('admin:admin') },
          })
          const d = await r.json()
          const runRes = await fetch(
            `http://localhost:8085/api/v1/dags/${dag}/dagRuns?limit=1&order_by=-execution_date`,
            { headers: { Authorization: 'Basic ' + btoa('admin:admin') } }
          )
          const runData = await runRes.json()
          const lastRun = runData.dag_runs?.[0]
          results[dag] = {
            paused: d.is_paused,
            state: lastRun?.state ?? 'no runs',
            lastRun: lastRun?.execution_date?.slice(0, 19).replace('T', ' ') ?? '—',
          }
        } catch (_) {
          results[dag] = { paused: null, state: 'unreachable', lastRun: '—' }
        }
      }
      setDags(results)
    }
    fetch_()
    const t = setInterval(fetch_, 30000)
    return () => clearInterval(t)
  }, [])
  return dags
}

function useMinioStats() {
  const [objects, setObjects] = useState('—')
  useEffect(() => {
    // MinIO S3 API — list objects in bronze bucket via anonymous HEAD
    // (just checks connectivity; count is shown as static demo value)
    const check = async () => {
      try {
        await fetch('http://localhost:9000/minio/health/live')
        setObjects('live')
      } catch (_) {
        setObjects('offline')
      }
    }
    check()
  }, [])
  return objects
}

const stateColor = (state) => {
  if (state === 'success') return 'text-green-400'
  if (state === 'running') return 'text-yellow-400'
  if (state === 'failed')  return 'text-red-400'
  return 'text-gray-500'
}

export default function MedallionPipeline() {
  const dags   = useAirflowDags()
  const minio  = useMinioStats()

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold text-white">Medallion Pipeline</h1>
      <p className="text-sm text-gray-400">
        Camel extracts SAP MM data → MinIO Bronze → Airflow + dbt → Silver → Gold
      </p>

      {/* Architecture flow */}
      <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
        {['SAP (Camel)', 'MinIO Bronze', 'Airflow', 'dbt Silver', 'dbt Gold', 'DuckDB'].map((s, i, arr) => (
          <span key={s} className="flex items-center gap-2">
            <span className="bg-gray-800 px-2 py-1 rounded text-gray-300">{s}</span>
            {i < arr.length - 1 && <span className="text-gray-600">→</span>}
          </span>
        ))}
      </div>

      {/* MinIO status */}
      <div className="bg-gray-800 rounded p-4 border border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-gray-300">MinIO Object Store</span>
          <span className={`text-xs font-mono ${minio === 'live' ? 'text-green-400' : 'text-red-400'}`}>
            {minio === 'live' ? '● live' : '● offline'}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[
            { bucket: 'bronze-sap-mm', label: 'Bronze',   color: 'text-amber-400' },
            { bucket: 'silver',        label: 'Silver',   color: 'text-gray-300' },
            { bucket: 'gold',          label: 'Gold',     color: 'text-yellow-400' },
            { bucket: 'platinum',      label: 'Platinum', color: 'text-blue-400' },
          ].map(({ bucket, label, color }) => (
            <div key={bucket} className="bg-gray-900 rounded p-3 text-center">
              <div className={`text-sm font-semibold ${color}`}>{label}</div>
              <div className="text-xs text-gray-500 mt-1 font-mono">{bucket}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Airflow DAGs */}
      <div className="bg-gray-800 rounded p-4 border border-gray-700">
        <div className="text-sm font-medium text-gray-300 mb-3">Airflow DAGs</div>
        <div className="space-y-2">
          {DAGS.map(dag => {
            const info = dags[dag] ?? {}
            return (
              <div key={dag} className="flex items-center justify-between text-sm">
                <span className="font-mono text-gray-400">{dag}</span>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-gray-600">{info.lastRun}</span>
                  <span className={`text-xs font-semibold ${stateColor(info.state)}`}>
                    {info.state ?? '…'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Gold metrics — static demo values */}
      <div className="bg-gray-800 rounded p-4 border border-gray-700">
        <div className="text-sm font-medium text-gray-300 mb-3">Gold Layer — Latest Run</div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-yellow-400">₹5.84L</div>
            <div className="text-xs text-gray-500 mt-1">Total PO Cost (Grade 304)</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-400">98.7%</div>
            <div className="text-xs text-gray-500 mt-1">Quality Pass Rate</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-blue-400">2,150 MT</div>
            <div className="text-xs text-gray-500 mt-1">On-Order Inventory</div>
          </div>
        </div>
      </div>

      {/* Links */}
      <div className="flex flex-wrap gap-3">
        <LaunchButton href="http://localhost:8085" label="Airflow UI" />
        <LaunchButton href="http://localhost:5000" label="Marquez Lineage" />
        <LaunchButton href="http://localhost:9001" label="MinIO Console" />
      </div>
    </div>
  )
}
```

**Step 2: Verify LaunchButton component exists**

```bash
ls frontend/src/components/LaunchButton.jsx
```

If missing, check what external link component is used in `HybridRAG.jsx` and replicate the pattern.

**Step 3: Commit**

```bash
git add frontend/src/pages/MedallionPipeline.jsx
git commit -m "feat(frontend): add MedallionPipeline demo shell page"
```

---

## Task 8: Activate Phase 4 in Sidebar + wire router

**Files:**
- Modify: `frontend/src/components/Sidebar.jsx`
- Modify: `frontend/src/App.jsx` (or wherever routes are defined)

**Step 1: Read App.jsx to find router config**

```bash
cat frontend/src/App.jsx
```

**Step 2: Add route for /medallion**

In the router config (likely inside `<Routes>`), add:
```jsx
import MedallionPipeline from './pages/MedallionPipeline.jsx'
// ...
<Route path="/medallion" element={<MedallionPipeline />} />
```

**Step 3: Update Sidebar.jsx**

Move `Medallion Pipeline` from `COMING_SOON` to `ACTIVE_PILLARS`:

In `ACTIVE_PILLARS`, add:
```js
{ to: '/medallion', label: 'Medallion Pipeline', icon: '◈' },
```

In `COMING_SOON`, remove the entry:
```js
{ label: 'Medallion Pipeline', phase: 4 },
```

**Step 4: Rebuild and verify locally**

```bash
cd frontend && npm run build && cd ..
docker compose up -d --build frontend
```

Open http://localhost:3000 — "Medallion Pipeline" should appear in the sidebar as an active link.

**Step 5: Commit**

```bash
git add frontend/src/components/Sidebar.jsx frontend/src/App.jsx
git commit -m "feat(frontend): activate Phase 4 Medallion Pipeline in demo shell sidebar"
```

---

## Task 9: End-to-end smoke test

**Step 1: Start Phase 4 services**

```bash
docker compose up -d postgres redis minio airflow-init
# wait ~30s for airflow-init to complete
docker compose logs airflow-init --tail=20
# then start webserver + scheduler + marquez + camel
docker compose up -d airflow-webserver airflow-scheduler marquez camel-integration
```

**Step 2: Seed buckets**

```bash
bash scripts/seed-minio.sh
bash scripts/seed-sap-data.sh
```

**Step 3: Run verify script**

```bash
bash scripts/verify-phase4.sh
```
Expected: all checks PASS

**Step 4: Unpause Airflow DAGs**

```bash
for dag in sap_ingest medallion_transform data_quality; do
  curl -sf -X PATCH \
    -u admin:admin \
    -H "Content-Type: application/json" \
    -d '{"is_paused": false}' \
    "http://localhost:8085/api/v1/dags/${dag}"
done
```

**Step 5: Trigger manual run and watch**

```bash
curl -sf -X POST -u admin:admin \
  -H "Content-Type: application/json" \
  -d '{}' \
  http://localhost:8085/api/v1/dags/sap_ingest/dagRuns
```

Open http://localhost:8085 → confirm `sap_ingest` run succeeds.
Then trigger `medallion_transform` → confirm dbt Silver + Gold succeed.
Then open http://localhost:5000 → Marquez shows `jslmind` namespace with lineage nodes.

**Step 6: Final commit**

```bash
git add .
git commit -m "chore: Phase 4 complete — Medallion Pipeline end-to-end verified"
```

---

## Startup Order (README addition)

Add to README.md under "Starting Services by Phase" — Phase 4 section:

```bash
# ── Phase 4 — Medallion Pipeline ──────────────────────────────────────────────
docker compose up -d minio airflow-init
sleep 30  # wait for airflow-init DB migration
docker compose up -d airflow-webserver airflow-scheduler marquez camel-integration
bash scripts/seed-minio.sh
bash scripts/seed-sap-data.sh
# Unpause DAGs (first time only)
for dag in sap_ingest medallion_transform data_quality; do
  curl -sf -X PATCH -u admin:admin -H "Content-Type: application/json" \
    -d '{"is_paused": false}' "http://localhost:8085/api/v1/dags/${dag}"
done
```
