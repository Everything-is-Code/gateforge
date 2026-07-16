# ApiShift Helm Chart

<p align="center">
  <img src="https://everything-is-code.github.io/apishift/assets/logo.svg" alt="ApiShift Logo" width="100">
</p>

AI-powered migration platform for transitioning from **Red Hat 3scale API Management** to **Red Hat Connectivity Link** (Kuadrant) on OpenShift 4.21.

## Prerequisites

- OpenShift 4.21+ with cluster-admin access
- 3scale Operator installed (for CRD discovery)
- Kuadrant Operator / Connectivity Link installed
- Helm 3

## Installation

```bash
helm repo add apishift https://everything-is-code.github.io/apishift/
helm repo update
helm install apishift apishift/apishift
```

### With custom configuration

```bash
helm install apishift apishift/apishift \
  --set ai.apiKey=YOUR_LLM_KEY \
  --set threescale.adminApi.url=https://3scale-admin.apps.example.com \
  --set threescale.adminApi.accessToken=YOUR_3SCALE_TOKEN \
  --set connectivityLink.gatewayStrategy=shared
```

## Architecture

| Layer | Technology | Description |
|-------|-----------|-------------|
| **Frontend** | Angular 19, @rhds/elements | SPA with Red Hat Design System, served by Nginx (UBI9) |
| **Backend** | Quarkus 3.x, Java 17 | REST API, AI agent, MCP servers, kuadrantctl integration |
| **AI** | LangChain4j, deepseek-r1-distill-qwen-14b | Migration analysis and chat assistant via LiteLLM |
| **MCP Servers** | 3scale, Connectivity Link, Kubernetes | Tool calling for AI agent via Model Context Protocol |
| **Migration** | kuadrantctl, Fabric8 K8s Client | Generate HTTPRoute, AuthPolicy, RateLimitPolicy |

## 3scale to Connectivity Link Mapping (RHCL 1.3)

| 3scale concept | Connectivity Link resource | Notes |
|----------------|---------------------------|-------|
| Product / exposure | `Gateway` + `HTTPRoute` + OpenShift `Route` | Per product or shared gateway strategy |
| Backend / mapping rules | `HTTPRoute` rules + `backendRefs` | PathPrefix consolidation from mapping rules |
| Application (API key) | `Secret` + `AuthPolicy` (`apiKey`) | |
| Application (OIDC JWT) | `AuthPolicy` (`jwt.issuerUrl`) | Bearer validation, not OIDCPolicy |
| Application plans + limits | `PlanPolicy` (`extensions.kuadrant.io`) | Primary tier/limits vehicle |
| Global / edge limit | `RateLimitPolicy` | Optional ceiling alongside PlanPolicy |
| API catalog | `APIProduct` (`devportal.kuadrant.io`) | Optional; requires Developer Portal |
| DNS / TLS | `DNSPolicy`, `TLSPolicy` | When multicluster or TLS policies apply |

See the root [README.md](../../README.md) for the full consolidated mapping and wizard behavior.

## Gateway Strategies

| Strategy | Description |
|----------|-------------|
| `shared` | Single Gateway for all migrated applications (simplest) |
| `dual` | Two Gateways: internal services + external-facing APIs |
| `dedicated` | One Gateway per application (maximum isolation) |

## Values

| Value | Default | Description |
|-------|---------|-------------|
| `backend.image.repository` | `quay.io/everythingascode/apishift-backend` | Backend image |
| `backend.image.tag` | `v0.3.0` | Backend image tag |
| `frontend.image.repository` | `quay.io/everythingascode/apishift` | Frontend image |
| `frontend.image.tag` | `v0.3.0` | Frontend image tag |
| `ai.endpoint` | `https://litellm-prod.apps.maas.redhatworkshops.io/v1` | LLM endpoint URL (RHDP MaaS: `https://maas-rhdp.apps.maas.redhatworkshops.io/v1`) |
| `ai.model` | `deepseek-r1-distill-qwen-14b` | AI model name |
| `ai.timeout` | `600s` | LLM request timeout (`AI_TIMEOUT`) |
| `ai.apiKey` | `""` | LLM API key (stored in release Secret) |
| `threescale.adminApi.url` | `""` | 3scale Admin Portal URL |
| `threescale.adminApi.accessToken` | `""` | 3scale provider access token (Secret) |
| `threescale.sources` | `""` | JSON array of additional 3scale sources (`adminUrl`, `accessToken`) |
| `connectivityLink.targetNamespace` | `kuadrant-system` | Target namespace for Kuadrant resources |
| `connectivityLink.gatewayStrategy` | `shared` | Gateway strategy: shared / dual / dedicated |
| `connectivityLink.gatewayClassName` | `istio` | Gateway class name |
| `clusterDomain` | `apps.cluster.example.com` | Cluster apps domain for generated hostnames |
| `cors.allowedOrigins` | `""` | Allowed browser origins (`CORS_ALLOWED_ORIGINS`); defaults to `https://<route.host>` when set |
| `auth.enabled` | `false` | Enable REST authentication (`APISHIFT_AUTH_ENABLED`) |
| `auth.protectReads` | `false` | Protect sensitive GET endpoints (`APISHIFT_AUTH_PROTECT_READS`) |
| `auth.oidc.authServerUrl` | `""` | OIDC issuer URL for JWT bearer validation |
| `auth.oidc.clientId` | `apishift-backend` | OIDC client ID |
| `auth.oidc.roleClaimPath` | `realm_access.roles` | JWT claim path for roles |
| `auth.oidc.tenantEnabled` | `true` | Enable Quarkus OIDC when `authServerUrl` is set |
| `rbac.clusterAdmin` | `false` | Bind cluster-admin role to backend SA (dev only) |
| `route.enabled` | `true` | Create OpenShift Route |
| `route.host` | `""` | Route hostname (auto-generated if empty) |
| `route.tls.termination` | `edge` | TLS termination type |

> **Note:** `global.clusterDomain` in `values.yaml` is unused; use top-level `clusterDomain`.

### Environment variable mapping (wired)

Helm values below are rendered into the backend container environment and map to Quarkus `application.properties` keys.

| Helm value | Container env | Application property |
|------------|---------------|----------------------|
| `ai.endpoint` | `AI_ENDPOINT` | `quarkus.langchain4j.openai.base-url` |
| `ai.model` | `AI_MODEL` | `quarkus.langchain4j.openai.chat-model.model-name` |
| `ai.timeout` | `AI_TIMEOUT` | `quarkus.langchain4j.openai.timeout` |
| `ai.apiKey` (Secret) | `AI_API_KEY` | `quarkus.langchain4j.openai.api-key` |
| `threescale.adminApi.url` | `THREESCALE_ADMIN_URL` | `apishift.threescale.admin-url` |
| `threescale.adminApi.accessToken` (Secret) | `THREESCALE_ACCESS_TOKEN` | `apishift.threescale.access-token` |
| `threescale.sources` | `THREESCALE_SOURCES` | `apishift.threescale.sources` |
| `connectivityLink.targetNamespace` | `CL_TARGET_NAMESPACE` | `apishift.connectivity-link.target-namespace` |
| `connectivityLink.gatewayStrategy` | `CL_GATEWAY_STRATEGY` | `apishift.connectivity-link.gateway-strategy` |
| `connectivityLink.gatewayClassName` | `CL_GATEWAY_CLASS` | `apishift.connectivity-link.gateway-class-name` |
| `clusterDomain` | `CLUSTER_DOMAIN` | `apishift.cluster-domain` |
| `cors.allowedOrigins` (or derived from `route.host`) | `CORS_ALLOWED_ORIGINS` | `quarkus.http.cors.origins` |
| `developerHub.enabled` | `DEVELOPER_HUB_ENABLED` | `apishift.developer-hub.enabled` |
| `developerHub.url` | `DEVELOPER_HUB_URL` | `apishift.developer-hub.url` |
| `developerHub.scaffolderUrl` | `DEVHUB_SCAFFOLDER_URL` | `apishift.developer-hub.scaffolder-url` |
| `developerHub.scaffolderToken` | `DEVHUB_SCAFFOLDER_TOKEN` | `apishift.developer-hub.scaffolder-token` |
| `developerHub.componentSuffix` | `DEVHUB_COMPONENT_SUFFIX` | `apishift.developer-hub.component-suffix` |
| `targetClusters` | `TARGET_CLUSTERS` | `apishift.target-clusters` |
| `argocd.clusterDiscovery` | `ARGOCD_CLUSTER_DISCOVERY` | `apishift.argocd.cluster-discovery` |
| `postgresql.url` | `DATASOURCE_URL` | `quarkus.datasource.jdbc.url` |
| `postgresql.*` (Secret) | `DATASOURCE_USERNAME`, `DATASOURCE_PASSWORD` | `quarkus.datasource.*` |
| `observability.enabled` | `OBSERVABILITY_ENABLED` | `apishift.observability.enabled` |
| `observability.otelCollectorEndpoint` | `OTEL_ENDPOINT` (when enabled) | `quarkus.otel.exporter.otlp.endpoint` |
| `datagrid.*` (when enabled) | `DATAGRID_HOST`, `DATAGRID_PORT`, credentials | `quarkus.infinispan-client.*` |
| `auth.enabled` | `APISHIFT_AUTH_ENABLED` | `apishift.auth.enabled` |
| `auth.protectReads` | `APISHIFT_AUTH_PROTECT_READS` | `apishift.auth.protect-reads` |
| `auth.oidc.authServerUrl` | `OIDC_AUTH_SERVER_URL` | `quarkus.oidc.auth-server-url` |
| `auth.oidc.clientId` | `OIDC_CLIENT_ID` | `quarkus.oidc.client-id` |
| `auth.oidc.roleClaimPath` | `OIDC_ROLE_CLAIM_PATH` | `quarkus.oidc.roles.role-claim-path` |
| `auth.oidc.tenantEnabled` | `OIDC_TENANT_ENABLED` | `quarkus.oidc.tenant-enabled` |

When `auth.enabled=true`, the chart mounts a frontend `auth-config.js` ConfigMap so the Angular interceptor sends credentials to the backend. Operators must supply JWT tokens via browser SSO or extend the ConfigMap; embedded Basic auth is dev-only (`QUARKUS_PROFILE=dev`).

### Enabling auth on Helm installs

```bash
helm upgrade --install apishift apishift/apishift \
  --set auth.enabled=true \
  --set auth.protectReads=true \
  --set auth.oidc.authServerUrl=https://keycloak.example.com/realms/apishift \
  --set auth.oidc.clientId=apishift-backend
```

**Upgrade path:** existing releases keep `auth.enabled=false` (chart default). Enable auth only after upgrading to a release that includes PR1–PR3 backend/frontend changes and configuring OIDC roles (`admin`, `operator`, `viewer`).

> **Important:** In production, `auth.enabled=true` requires a non-empty `auth.oidc.authServerUrl`. Without it, mutations are protected but no valid auth mechanism exists (HTTP Basic is dev-only).

### Values documented but **not wired** in the chart

These appear in `values.yaml` or older docs but are **not** set on the backend Deployment. The application uses its built-in defaults instead.

| Helm value | Effective default (app) | Local compose (`.env`) | Notes |
|------------|-------------------------|------------------------|-------|
| `ai.enabled` | AI always configured via endpoint/key env | N/A | Toggle not implemented in templates |
| `threescale.adminApi.enabled` | URL/token presence | N/A | No separate enable flag in deployment |
| `threescale.crdDiscovery.enabled` | `true` (`apishift.threescale.crd-discovery`) | `false` in `.env.example` | **Not templated** — Helm installs enable CRD discovery by default |
| `threescale.crdDiscovery.namespace` | — | N/A | **Not implemented** — scans cluster-wide |
| `kuadrantctl.enabled` | `/usr/local/bin/kuadrantctl` in image | N/A | Path not overridden by Helm |
| `APICAST_DISCOVERY` | `true` (`apishift.apicast.discovery`) | `false` in `.env.example` | **Not templated** |
| `KUBE_API_URL` / `KUBE_TOKEN` | In-cluster SA when on OpenShift | Set in `.env` for local | **Not templated** — use backend ServiceAccount RBAC on cluster |

For discovery-only analysis without cluster CRD scans, set env overrides manually on the Deployment or use [local compose](../../podman-compose.yml) defaults.

## API Endpoints

The REST surface is documented in the root [README.md](../../README.md#api-endpoints) and [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md). OpenAPI schema: `GET /q/openapi` on the backend Route.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/q/health/ready` | GET | Readiness probe |
| `/q/health/live` | GET | Liveness probe |
| `/q/openapi` | GET | OpenAPI 3 schema (JSON or YAML) |

## Container Images

| Image | Description |
|-------|-------------|
| `quay.io/everythingascode/apishift-backend` | Quarkus backend with kuadrantctl (UBI9 OpenJDK 17) |
| `quay.io/everythingascode/apishift` | Angular frontend with Nginx (UBI9 Nginx 124) |

## Official Documentation

- [Red Hat Connectivity Link](https://docs.redhat.com/en/documentation/red_hat_connectivity_link)
- [Kuadrant Docs](https://docs.kuadrant.io/)
- [kuadrantctl](https://github.com/Kuadrant/kuadrantctl)
- [3scale API Management](https://docs.redhat.com/en/documentation/red_hat_3scale_api_management)
- [3scale Operator CRDs](https://github.com/3scale/3scale-operator)
- [Gateway API](https://gateway-api.sigs.k8s.io/)
- [Quarkus LangChain4j + MCP](https://quarkus.io/blog/quarkus-langchain4j-mcp/)
- [Red Hat Design System](https://ux.redhat.com/)
- [Migration Guide (ONLU)](https://onlu.ch/en/migration-path-from-red-hat-3scale-api-management-to-red-hat-connectivity-link/)

## License

Apache 2.0
