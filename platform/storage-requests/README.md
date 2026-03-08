# Pattern B — Storage Provisioning

Drop a YAML file here to request a MinIO bucket. `scripts/seed-minio.sh` reads these files.

## Example

```yaml
# platform/storage-requests/bronze-sap.yaml
bucket_name: bronze-sap-mm
tier: bronze
team: data-platform
versioning: false
```

## Tier conventions

| Tier | Purpose | Retention |
|---|---|---|
| `bronze` | Raw ingest from SAP / OT / SharePoint | Indefinite |
| `silver` | Cleaned, typed, deduped | Indefinite |
| `gold` | Aggregated, business-ready | Indefinite |
| `platinum` | ML feature store, curated | Indefinite |

## How provisioning works

`seed-minio.sh`:
1. Reads every `*.yaml` in this directory
2. Calls `mc mb jsl/<bucket_name>` on the MinIO instance
3. Sets lifecycle policy based on `tier`
