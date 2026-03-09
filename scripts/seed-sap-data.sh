#!/usr/bin/env bash
# seed-sap-data.sh — upload initial synthetic SAP batch to MinIO bronze-sap-mm
# Run after seed-minio.sh to pre-populate bronze layer before first Camel tick
set -euo pipefail

ACCESS_KEY="${MINIO_ROOT_USER:-jslmind}"
SECRET_KEY="${MINIO_ROOT_PASSWORD:-jslmind_minio_2024}"

echo ""
echo "=== Seeding SAP data into MinIO bronze-sap-mm ==="

# Wait for MinIO
until curl -sf "http://localhost:9000/minio/health/live" >/dev/null 2>&1; do
  sleep 2
done

# Upload seed batch via mc
docker run --rm --network jslmind_jslmind \
  minio/mc:latest \
  sh -c "
    mc alias set jslmind http://minio:9000 ${ACCESS_KEY} ${SECRET_KEY} --quiet
    cat > /tmp/sap_seed.json << 'ENDJSON'
{
  \"batch_id\": \"batch_seed_001\",
  \"extracted_at\": \"2026-03-09T06:00:00Z\",
  \"MARA\": [
    {\"MATNR\": \"STL-304-CR-2MM\",  \"MTART\": \"ROH\", \"MATKL\": \"SS-COLDROLLED\", \"MEINS\": \"MT\", \"BRGEW\": 7.93, \"NTGEW\": 7.90},
    {\"MATNR\": \"STL-304-HR-3MM\",  \"MTART\": \"ROH\", \"MATKL\": \"SS-HOTROLLED\",  \"MEINS\": \"MT\", \"BRGEW\": 7.90, \"NTGEW\": 7.87},
    {\"MATNR\": \"STL-316L-CR-2MM\", \"MTART\": \"ROH\", \"MATKL\": \"SS-COLDROLLED\", \"MEINS\": \"MT\", \"BRGEW\": 7.98, \"NTGEW\": 7.95},
    {\"MATNR\": \"STL-316L-HR-4MM\", \"MTART\": \"ROH\", \"MATKL\": \"SS-HOTROLLED\",  \"MEINS\": \"MT\", \"BRGEW\": 7.95, \"NTGEW\": 7.92},
    {\"MATNR\": \"STL-430-CR-1MM\",  \"MTART\": \"ROH\", \"MATKL\": \"SS-COLDROLLED\", \"MEINS\": \"MT\", \"BRGEW\": 7.70, \"NTGEW\": 7.67},
    {\"MATNR\": \"STL-430-HR-3MM\",  \"MTART\": \"ROH\", \"MATKL\": \"SS-HOTROLLED\",  \"MEINS\": \"MT\", \"BRGEW\": 7.68, \"NTGEW\": 7.65},
    {\"MATNR\": \"STL-409-HR-4MM\",  \"MTART\": \"ROH\", \"MATKL\": \"SS-HOTROLLED\",  \"MEINS\": \"MT\", \"BRGEW\": 7.72, \"NTGEW\": 7.69},
    {\"MATNR\": \"STL-201-CR-2MM\",  \"MTART\": \"ROH\", \"MATKL\": \"SS-COLDROLLED\", \"MEINS\": \"MT\", \"BRGEW\": 7.80, \"NTGEW\": 7.77},
    {\"MATNR\": \"STL-304L-CR-3MM\", \"MTART\": \"ROH\", \"MATKL\": \"SS-COLDROLLED\", \"MEINS\": \"MT\", \"BRGEW\": 7.91, \"NTGEW\": 7.88},
    {\"MATNR\": \"STL-321-HR-5MM\",  \"MTART\": \"ROH\", \"MATKL\": \"SS-HOTROLLED\",  \"MEINS\": \"MT\", \"BRGEW\": 7.88, \"NTGEW\": 7.85}
  ],
  \"EKPO\": [
    {\"EBELN\": \"4500012345\", \"EBELP\": \"00010\", \"MATNR\": \"STL-304-CR-2MM\",  \"MENGE\": 500.0, \"MEINS\": \"MT\", \"NETPR\": 142500.0, \"WERKS\": \"JSL1\"},
    {\"EBELN\": \"4500012345\", \"EBELP\": \"00020\", \"MATNR\": \"STL-316L-CR-2MM\", \"MENGE\": 200.0, \"MEINS\": \"MT\", \"NETPR\":  98000.0, \"WERKS\": \"JSL1\"},
    {\"EBELN\": \"4500012346\", \"EBELP\": \"00010\", \"MATNR\": \"STL-430-CR-1MM\",  \"MENGE\": 750.0, \"MEINS\": \"MT\", \"NETPR\": 178500.0, \"WERKS\": \"JSL2\"},
    {\"EBELN\": \"4500012346\", \"EBELP\": \"00020\", \"MATNR\": \"STL-304-HR-3MM\",  \"MENGE\": 300.0, \"MEINS\": \"MT\", \"NETPR\":  81000.0, \"WERKS\": \"JSL1\"},
    {\"EBELN\": \"4500012347\", \"EBELP\": \"00010\", \"MATNR\": \"STL-409-HR-4MM\",  \"MENGE\": 400.0, \"MEINS\": \"MT\", \"NETPR\":  84000.0, \"WERKS\": \"JSL2\"}
  ],
  \"AUFK\": [
    {\"AUFNR\": \"000100012345\", \"AUART\": \"PP01\", \"WERKS\": \"JSL1\", \"MATNR\": \"STL-316L-HR-3MM\", \"GAMNG\": 200.0, \"ISDD\": \"20260301\"},
    {\"AUFNR\": \"000100012346\", \"AUART\": \"PP01\", \"WERKS\": \"JSL1\", \"MATNR\": \"STL-304-CR-2MM\",  \"GAMNG\": 350.0, \"ISDD\": \"20260305\"},
    {\"AUFNR\": \"000100012347\", \"AUART\": \"PP01\", \"WERKS\": \"JSL2\", \"MATNR\": \"STL-430-CR-1MM\",  \"GAMNG\": 500.0, \"ISDD\": \"20260310\"}
  ]
}
ENDJSON
    mc cp /tmp/sap_seed.json jslmind/bronze-sap-mm/sap_mm_seed_001.json &&
    echo 'Seed batch uploaded to bronze-sap-mm/sap_mm_seed_001.json'
  "

echo "=== SAP seed complete ==="
echo ""
