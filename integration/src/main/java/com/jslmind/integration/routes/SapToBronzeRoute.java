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
