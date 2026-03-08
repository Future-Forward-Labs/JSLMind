# Pattern A — Database Provisioning

Drop a YAML file here to request a database schema. `scripts/provision-platform.sh` reads these files and applies them on startup.

## Supported Types

| `type` | Service | Notes |
|---|---|---|
| `postgres` | Shared `postgres` container | Creates schema + user |
| `timescaledb` | `timescaledb` container (Phase 5) | Creates hypertable |
| `qdrant` | `qdrant` container (Phase 6) | Creates collection |

## Example: PostgreSQL schema

```yaml
# platform/db-requests/my-service.yaml
type: postgres
schema: my_schema
team: operations-team
tables: []  # provisioning creates schema only; DDL in application migrations
```

## Example: TimescaleDB hypertable

```yaml
# platform/db-requests/cbm-timeseries.yaml
type: timescaledb
schema: cbm_sensors
team: maintenance-team
tables:
  - name: sensor_readings
    hypertable_column: time
    retention_policy: 90d
```

## How provisioning works

`provision-platform.sh`:
1. Reads every `*.yaml` in this directory
2. Connects to the appropriate database service
3. Creates the schema and grants access to the requesting team
4. Injects credentials as env vars into the requesting service's `.env.generated`
