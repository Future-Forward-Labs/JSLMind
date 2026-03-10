/**
 * JslMindEntityProcessor
 *
 * Registers and validates the four JSLMind custom entity kinds so Backstage
 * can ingest, render, and filter them like first-class catalog entities.
 *
 * Custom kinds:
 *   Agent       — AI agents (Dify, LangGraph)
 *   AIModel     — LLMs, embedding models, fine-tuned models, custom ML models
 *   Integration — Apache Camel routes / connectors
 *   DataProduct — RAG pipelines, data assets served to agents
 *
 * Wiring (packages/backend/src/plugins/catalog.ts):
 *   builder.addProcessor(new JslMindEntityProcessor());
 */

import {
  CatalogProcessor,
  CatalogProcessorEmit,
  processingResult,
} from '@backstage/plugin-catalog-node';
import { LocationSpec } from '@backstage/plugin-catalog-common';
import { Entity } from '@backstage/catalog-model';

const JSLMIND_KINDS = ['Agent', 'AIModel', 'Integration', 'DataProduct'] as const;
type JslMindKind = typeof JSLMIND_KINDS[number];

// Minimum required spec fields per kind — used for validation warnings
const REQUIRED_SPEC_FIELDS: Record<JslMindKind, string[]> = {
  Agent:       ['lifecycle', 'owner', 'system', 'agent_type'],
  AIModel:     ['lifecycle', 'owner', 'system', 'model_type', 'serving'],
  Integration: ['lifecycle', 'owner', 'system', 'integration_type', 'protocol'],
  DataProduct: ['lifecycle', 'owner', 'system', 'data_product_type'],
};

export class JslMindEntityProcessor implements CatalogProcessor {
  getProcessorName(): string {
    return 'JslMindEntityProcessor';
  }

  async validateEntityKind(entity: Entity): Promise<boolean> {
    return (JSLMIND_KINDS as readonly string[]).includes(entity.kind);
  }

  async postProcessEntity(
    entity: Entity,
    _location: LocationSpec,
    emit: CatalogProcessorEmit,
  ): Promise<Entity> {
    if (!(JSLMIND_KINDS as readonly string[]).includes(entity.kind)) {
      return entity;
    }

    const kind = entity.kind as JslMindKind;
    const spec = (entity.spec ?? {}) as Record<string, unknown>;
    const required = REQUIRED_SPEC_FIELDS[kind];

    // Emit warnings for missing required spec fields (non-fatal — entity still ingests)
    for (const field of required) {
      if (spec[field] === undefined) {
        emit(
          processingResult.generalError(
            { type: 'url', target: '' },
            `${kind} entity "${entity.metadata.name}" is missing spec.${field}`,
          ),
        );
      }
    }

    // Enrich: ensure spec.type mirrors the kind for Backstage UI compatibility
    // (some Backstage UI components key off spec.type for icon/colour selection)
    const typeMap: Record<JslMindKind, string> = {
      Agent:       'ai-agent',
      AIModel:     spec.model_type as string ?? 'ml-model',
      Integration: spec.integration_type as string ?? 'integration',
      DataProduct: spec.data_product_type as string ?? 'data-product',
    };

    return {
      ...entity,
      spec: {
        type: typeMap[kind],
        ...spec,
      },
    };
  }
}
