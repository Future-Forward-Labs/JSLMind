# Wiring the JslMindEntityProcessor into Backstage

## When this is needed
The `app-config.yaml` allowlist fix is enough for entities to **ingest**.
This processor adds **validation** (missing spec field warnings) and **spec.type enrichment**
so Backstage UI components (icons, colour coding, kind filters) work correctly.

## Steps

### 1. Copy the processor into the Backstage backend package

```bash
cp -r infra/backstage/custom-catalog-processor/src/* \
  packages/backend/src/plugins/jslmind/
```

### 2. Wire into catalog.ts

In `packages/backend/src/plugins/catalog.ts`, add:

```typescript
import { JslMindEntityProcessor } from './jslmind';

export default async function createPlugin(
  env: PluginEnvironment,
): Promise<Router> {
  const builder = await CatalogBuilder.create(env);

  // JSLMind custom entity kinds
  builder.addProcessor(new JslMindEntityProcessor());

  // ... rest of existing setup
  const { processingEngine, router } = await builder.build();
  await processingEngine.start();
  return router;
}
```

### 3. New Backstage backend (v1.20+)

If using the new backend system (`packages/backend/src/index.ts`):

```typescript
import { jslMindEntityProcessorExtension } from './jslmind';

backend.add(import('@backstage/plugin-catalog-backend/alpha'));
backend.add(jslMindEntityProcessorExtension);
```

With the extension factory in `packages/backend/src/jslmind/extension.ts`:

```typescript
import { createBackendModule } from '@backstage/backend-plugin-api';
import { catalogProcessingExtensionPoint } from '@backstage/plugin-catalog-node/alpha';
import { JslMindEntityProcessor } from './JslMindEntityProcessor';

export const jslMindEntityProcessorExtension = createBackendModule({
  pluginId: 'catalog',
  moduleId: 'jslmind-entity-processor',
  register(reg) {
    reg.registerInit({
      deps: { catalog: catalogProcessingExtensionPoint },
      async init({ catalog }) {
        catalog.addProcessor(new JslMindEntityProcessor());
      },
    });
  },
});
```

## Without a custom Backstage build (Docker demo)

If you're running the official `backstage/backstage` Docker image and can't rebuild:
- The `app-config.yaml` allowlist fix alone is sufficient for the demo
- Entities ingest and appear in the catalog
- Kind filtering works (Backstage stores `kind` as a field)
- The only missing piece is per-kind UI tab customisation — not needed for the demo

## Verification

After wiring, confirm in Backstage UI:
- Catalog → filter by Kind → should show Agent, AIModel, Integration, DataProduct as options
- Each entity page shows the correct spec fields
- No "Entity kind not allowed" errors in Backstage backend logs
