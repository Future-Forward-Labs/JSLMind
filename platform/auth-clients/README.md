# Pattern E — Auth Client Provisioning

Drop a YAML file here to register an OIDC client in Keycloak. `scripts/provision-platform.sh` applies these via the Keycloak Admin REST API.

## Example

```yaml
# platform/auth-clients/dify.yaml
client_id: dify
client_name: JSLMind Dify Agent Builder
redirect_uris:
  - http://localhost:3003/*
  - http://localhost:5001/*
post_logout_redirect_uris:
  - http://localhost:3003/
web_origins:
  - http://localhost:3003
public_client: false
service_accounts_enabled: false
```

## How provisioning works

`provision-platform.sh`:
1. Obtains admin token from Keycloak master realm
2. Creates the OIDC client in the `jslmind` realm
3. Outputs `client_secret` to `.env.generated` (not committed to git)
