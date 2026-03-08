# Pattern C — LLM Virtual Key Provisioning

Drop a YAML file here to request a per-team LiteLLM virtual key with budget limits. `scripts/seed-litellm-keys.sh` reads these files and calls the LiteLLM `/key/generate` API.

## Example

```yaml
# platform/llm-keys/operations-team.yaml
team_name: operations
team_id: operations-team
monthly_budget_inr: 50000
model_tier: jsl-quality   # jsl-fast | jsl-quality | jsl-cloud | jsl-embed
```

## INR budget conversion

LiteLLM tracks spend in USD. The `seed-litellm-keys.sh` script converts INR budget to USD at the configured exchange rate (default: 1 USD = 84 INR).

## How provisioning works

`seed-litellm-keys.sh`:
1. Reads every `*.yaml` in this directory
2. Calls `POST /key/generate` on LiteLLM proxy with team_id, budget, allowed models
3. Saves generated keys to `platform/llm-keys/.generated/<team>.key` (gitignored)
4. These keys are used by n8n automation workflows and Dify
