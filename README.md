<p align="center">
  <img src="docs/assets/APIshift.png" alt="ApiShift Logo" width="280">
</p>

# ApiShift - 3scale to Connectivity Link Migration

**Language:** Documentation and contributions are **English only**. Program policy: [rhcl-ai AGENTS.md — Language policy](https://github.com/Everything-is-Code/rhcl-ai/blob/main/AGENTS.md#language-policy).

[![Build](https://github.com/Everything-is-Code/ApiShift/actions/workflows/build-push-quay.yml/badge.svg)](https://github.com/Everything-is-Code/ApiShift/actions/workflows/build-push-quay.yml)
[![Artifact Hub](https://img.shields.io/endpoint?url=https://artifacthub.io/badge/repository/ApiShift)](https://artifacthub.io/packages/search?repo=ApiShift)
[![Quay.io Backend](https://img.shields.io/badge/quay.io-backend-blue)](https://quay.io/repository/everythingascode/apishift-backend)
[![Quay.io Frontend](https://img.shields.io/badge/quay.io-frontend-blue)](https://quay.io/repository/everythingascode/apishift)
[![OpenShift](https://img.shields.io/badge/OpenShift-4.21-red)](https://docs.openshift.com/)
[![Documentation](https://img.shields.io/badge/docs-GitHub%20Pages-blue)](https://everything-is-code.github.io/ApiShift/)

AI-powered migration platform for transitioning from **Red Hat 3scale API Management** to **Red Hat Connectivity Link** (Kuadrant) on OpenShift. Built with **Quarkus** (backend), **Angular** (frontend), **PostgreSQL** (persistence), and **LangChain4j** (AI).

> **v0.3.0** -- Architecture hardening, post-hardening maintainability (docs, contracts, backend decomposition, tests, wizard state service).

### About this project

> **ApiShift** is an independent open-source project licensed under Apache 2.0. It is **not** an official Red Hat product. It integrates with Red Hat 3scale, Red Hat Connectivity Link, and Red Hat Developer Hub but is maintained independently. No commercial support or SLAs are offered at this time.

---

## Architecture Overview

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for module boundaries, data flows, and contributor navigation.

| Layer | Technology | Description |
|-------|-----------|-------------|
| **Frontend** | Angular 19 | SPA served by Nginx (UBI9) |
| **Backend** | Quarkus 3.x, Java 17 | REST API, AI agent, MCP servers, kuadrantctl integration |
| **Persistence** | PostgreSQL 15 | Migration plans, audit trail, federated logs |
| **DB Migrations** | Flyway | Versioned schema evolution (`db/migration/V*.sql`) |
| **AI** | LangChain4j, deepseek-r1-distill-qwen-14b | Migration analysis, resource generation, chat assistant |
| **MCP Servers** | 3scale, Connectivity Link, Kubernetes | Tool calling for AI agent via Model Context Protocol |
| **Migration** | Fabric8 K8s Client | Generate HTTPRoute, AuthPolicy, RateLimitPolicy from 3scale configs |
| **Developer Hub** | ApiShift Plugin (backend + frontend) | Observability tabs, Policy Topology, Component editing, catalog enrichment |
| **Packaging** | Helm Chart, Podman Compose | OpenShift deployment + local development |

**Containers:** Backend uses `registry.access.redhat.com/ubi9/openjdk-17`. Frontend uses `registry.access.redhat.com/ubi9/nginx-124`. PostgreSQL uses `registry.redhat.io/rhel9/postgresql-15`.

---

## Policy Mapping & Core Migration Engine

ApiShift's foundation is an automated **3scale → Connectivity Link (Kuadrant) translation engine**. Analysis always generates the full resource set; cluster readiness is checked separately at apply time (see [Migration prerequisites](#migration-prerequisites)).

Reference API: `GET /api/migration/policy-mapping` returns the consolidated mapping catalog (same source as this documentation).

### RHCL 1.3 policy taxonomy

| Layer | API group | Resources |
|-------|-----------|-----------|
| **Gateway API** | `gateway.networking.k8s.io/v1` | Gateway, HTTPRoute |
| **Core RHCL** | `kuadrant.io/v1` | AuthPolicy, RateLimitPolicy, TokenRateLimitPolicy, DNSPolicy, TLSPolicy |
| **Extensions** | `extensions.kuadrant.io/v1alpha1` | PlanPolicy, OIDCPolicy, TelemetryPolicy |
| **Developer Portal** | `devportal.kuadrant.io/v1alpha1` | APIProduct, APIKey |
| **Platform** | `v1`, `route.openshift.io/v1` | Secret, Route, Service, ServiceEntry |

> **OIDCPolicy ≠ AuthPolicy JWT** — `OIDCPolicy` orchestrates OAuth Authorization Code (browser) flows. Bearer JWT validation uses `AuthPolicy` with `jwt.issuerUrl`. Token introspection uses `AuthPolicy` with `oauth2Introspection`.

### Consolidated mapping (3scale → RHCL 1.3)

| 3scale | RHCL 1.3 | ApiShift today |
|--------|----------|-----------------|
| Product / exposure | Gateway + HTTPRoute + Route | Generated |
| Backend / mapping rules | HTTPRoute.rules + backendRefs | Generated |
| Application (API Key) | Secret + AuthPolicy.apiKey | Generated |
| Application (OIDC) | AuthPolicy.jwt (no Secret) | Generated |
| Application Plan + limits | PlanPolicy (`extensions.kuadrant.io`) | Generated |
| Global / edge limit | RateLimitPolicy (`kuadrant.io`) | Generated (derived from plan limits; placeholder when none) |
| Token-based limit (LLM) | TokenRateLimitPolicy | Suggested only |
| TLS termination | TLSPolicy | Suggested only |
| DNS / multicluster | DNSPolicy | Suggested only |
| Custom metrics labels | TelemetryPolicy | Generated when observability enabled |
| OAuth browser flow | OIDCPolicy | Suggested only |
| API catalog / discovery | APIProduct | Generated when Developer Hub enabled |
| Custom Lua policies | EnvoyFilter / WASM Extension SDK | Manual — no auto-migration |
| Header / URL rewrite | HTTPRoute filters (Gateway API) | Suggested only |

### 3scale APIcast policies → RHCL 1.3

| APIcast policy | RHCL 1.3 target | ApiShift |
|----------------|-----------------|-----------|
| API Key | AuthPolicy apiKey + Secret | Generated |
| OIDC (Bearer JWT) | AuthPolicy jwt.issuerUrl | Generated |
| JWT Claim Check | AuthPolicy authorization (patternMatching / OPA) | Suggested |
| OAuth 2.0 Token Introspection | AuthPolicy oauth2Introspection | Partial |
| RH-SSO / Keycloak Role Check | AuthPolicy authorization on JWT claims | Suggested |
| OAuth Authorization Code (browser) | OIDCPolicy extension | Suggested |
| OAuth mTLS / TLS Client Cert | TLSPolicy + AuthPolicy x509 | Suggested |
| Edge Limiting | RateLimitPolicy + PlanPolicy | Partial |
| Custom Metrics | TelemetryPolicy + Envoy/Istio metrics | Partial |
| Web Assembly Plug-In | Envoy WASM / Extension SDK | Manual |
| Auth Caching / Batcher / Referrer | N/A | 3scale-specific |
| CORS, Retry, SOAP, Content Caching | HTTPRoute filters / Istio / WASM | Manual |

### 3scale object mapping (detail)

| 3scale concept | Connectivity Link / Kubernetes resource | Notes |
|----------------|----------------------------------------|-------|
| **Product** | `Gateway` + `HTTPRoute` + `AuthPolicy` + `RateLimitPolicy` + `APIProduct` + `Route` | One bundle per selected product |
| **Backend** | `HTTPRoute.spec.rules[].backendRefs` | Single-backend or multi-backend path routing |
| **Mapping rules** | `HTTPRoute` path/method matches (`PathPrefix`) | Regex `$` anchor removed; `{id}` params normalized |
| **Application plans** | `PlanPolicy` (`extensions.kuadrant.io`) | Per-tier limits + tier predicates |
| **Application keys** (API Key mode) | `Secret` per app (`stringData.api_key` from `user_key`) | `secret.kuadrant.io/plan-id` annotation links plan tier |
| **OIDC applications** | `AuthPolicy` JWT + `PlanPolicy` OIDC predicates | No API key Secrets; tiers match JWT `clientID` |
| **Proxy auth config** | `AuthPolicy` — `apiKey` selector or `jwt.issuerUrl` | API Key and OIDC are **mutually exclusive** per API |
| **Metrics / analytics** | `TelemetryPolicy` (optional) | Labels: product, auth_type, plan, user |
| **External hostname** | OpenShift `Route` (edge TLS) | Points to Istio Gateway service |

### Gateway strategies

| Strategy | Behavior |
|----------|----------|
| **shared** (default) | One `ApiShift-shared` Gateway for all products |
| **dual** | Separate internal and external Gateways |
| **dedicated** | One Gateway per product (`{systemName}-gw`) |

### HTTPRoute generation pipeline

1. **Resolve backends** — map 3scale backend usages to cluster Services (by Admin API ID or name).
2. **OpenAPI discovery** — try `/q/openapi`, `/openapi.json`, `/swagger.json`, etc. on the backend URL.
3. **Synthetic OpenAPI** — if no spec is found, build OpenAPI 3.0 from 3scale mapping rules (method + path pairs).
4. **kuadrantctl** — generate `HTTPRoute` from OpenAPI when the product has a single backend.
5. **Fallback templates** — Java-built `HTTPRoute` when kuadrantctl fails or multi-backend routing is required.
6. **Rule consolidation** — Gateway API allows max **16 rules**; excess rules collapse to `PathPrefix` segments (fallback: `/`).

### Authentication mapping

**API Key mode** (`user_key` / `app_id`):

- `AuthPolicy` selects Secrets labeled `app: <productSystemName>` (Authorino-managed).
- Each 3scale application with a `user_key` becomes a dedicated `Secret` preserving the original key value.
- `PlanPolicy` tiers use predicates on `secret.kuadrant.io/plan-id`.

**OIDC mode** (`application_id` / `application_key`):

- `AuthPolicy` uses `jwt.issuerUrl` from 3scale `oidc_issuer_endpoint` (credentials stripped from URL).
- No consumer Secrets are generated.
- `PlanPolicy` tiers match `auth.identity.metadata.annotations["clientID"]` to 3scale `application_id`.
- Clients keep the same IdP, token endpoint, and `Authorization: Bearer` flow.

### Plan & rate-limit mapping

- **Application plan limits** (`minute`, `hour`, `day`, `week`, `month`, `year`) map to `PlanPolicy.spec.plans[].limits` (`daily`, `monthly`, `weekly`, `yearly`, or custom windows).
- A **global** `RateLimitPolicy` is attached to each `HTTPRoute`, derived from the highest application plan `minute` or `hour` limit when available (placeholder 100 req/60s otherwise).
- Custom 3scale metrics (`metricMethodRef`) are reflected in synthetic OpenAPI operation summaries for kuadrantctl.

### Generated resources & apply order

Per product, ApiShift may emit (in apply order):

`Gateway` → `HTTPRoute` → `APIProduct` (when Developer Hub enabled) → `PlanPolicy` → `Secret`(s) → `AuthPolicy` → `RateLimitPolicy` → `TelemetryPolicy` → `Route`

Optional `catalog-info.yaml` for Red Hat Developer Hub registration is generated when Developer Hub integration is enabled.

### Migration prerequisites

`POST /api/migration/analyze` returns a `prerequisites[]` list derived from generated resources. These are **required for apply, not for analysis**:

| Prerequisite | Triggered by |
|--------------|--------------|
| Gateway API | `Gateway`, `HTTPRoute` |
| RHCL / Kuadrant core | `AuthPolicy`, `RateLimitPolicy` |
| Kuadrant extensions | `PlanPolicy`, `TelemetryPolicy` |
| Developer Portal | `APIProduct` |
| OpenShift Routes | `Route` |
| Authorino API key secrets | `Secret` with `api_key` |

Use `GET /api/cluster/readiness?planId={id}` to probe CRD/install status on the target cluster before applying.

### Analysis workflow (Migration Wizard)

1. **Select products** — live discovery (CRD / Admin API) **or** upload a 3scale export `.zip` for offline import; filter, paginate, multi-select.
2. **Choose strategy** — shared / dual / dedicated + optional target cluster.
3. **Analyze** — generates plan, AI pre-migration review, prerequisites, and editable YAML per resource.
4. **Review** — collapsible panels for prerequisites and AI analysis; per-resource YAML edit/toggle.
5. **Apply / Revert** — apply to target cluster or bulk-revert to 3scale with full audit trail.

### Discovery & UI (3scale Explorer)

- Products and backends from **CRD inspection** and **Admin API** (multi-source).
- **Refresh discovery** (`POST /api/threescale/refresh`) evicts cache and reloads live 3scale state.
- Full-page loading overlay blocks navigation during refresh and analysis operations.

### Offline integration (M2)

**Status:** complete (issues [#14](https://github.com/Everything-is-Code/ApiShift/issues/14), [#16](https://github.com/Everything-is-Code/ApiShift/issues/16), [#18](https://github.com/Everything-is-Code/ApiShift/issues/18), [#19](https://github.com/Everything-is-Code/ApiShift/issues/19)).

Analyze and plan migrations **without live 3scale Admin API access** by importing a `threescale-export` archive produced by [3scaleextract](https://github.com/Everything-is-Code/3scaleextract). The same analyze/apply pipeline runs after import; only product discovery changes.

```mermaid
flowchart LR
    subgraph extract [3scaleextract]
        Seed[threescale-seed lab fixtures]
        Export[threescale-export]
        Tar[export-minimal-1.0.tar.gz]
        Seed --> Export --> Tar
    end
    subgraph ApiShift [ApiShift]
        Zip[Zip export directory]
        API[POST /api/migration/import-export]
        Products[GET /api/threescale/products]
        Analyze[POST /api/migration/analyze]
        Apply[POST /api/migration/plans/id/apply]
        Zip --> API --> Products --> Analyze --> Apply
    end
    Export -.->|manual zip| Zip
    Tar -.->|tests only| ApiShift
```

#### Cross-repo contract

| Artifact | Owner | Purpose |
|----------|-------|---------|
| `threescale-export` directory (schema **1.0**) | 3scaleextract | Canonical offline export layout (`manifest.json`, `products/`, `backends/`, `applications/`) |
| `export-minimal-1.0.tar.gz` | [3scaleextract `testdata/`](https://github.com/Everything-is-Code/3scaleextract/tree/main/testdata) | Versioned fixture for visualize tests and ApiShift import tests |
| `POST /api/migration/import-export` | ApiShift | Accepts `.zip` only (v1); loads products into memory for analyze |
| Migration Wizard **Import offline export** | ApiShift UI | Upload `.zip` in step 1, then continue wizard |

Imported products are tagged with `source` containing `export-v1` and `sourceCluster: offline`. `POST /api/threescale/refresh` is skipped for export-backed products during analyze.

The import parser accepts **schema 1.0** exports from live `threescale-export` runs, including:

- `backend_usages.json` as either a JSON object (`backend_usages` array) or a top-level array (3scaleextract default)
- Product metadata in `products/{systemName}.yaml` as a direct `spec` block or a `kind: List` of `Product` items
- Incidental `oidc_configuration.json` sidecars on API-key products (auth mode is inferred from proxy flags, not sidecar presence alone)

#### Manual workflow (lab or air-gapped)

1. **Export** from a 3scale tenant (lab or production read-only):

   ```bash
   threescale-export --admin-url https://3scale-admin.example.com \
     --access-token "$TOKEN" --output ./export
   ```

   Or use the published minimal fixture: download and unzip [export-minimal-1.0.tar.gz](https://github.com/Everything-is-Code/3scaleextract/raw/main/testdata/export-minimal-1.0.tar.gz).

2. **Package** as `.zip` (ApiShift API expects zip, not tar.gz):

   ```bash
   cd export && zip -r ../threescale-export.zip .
   ```

3. **Import** via API or Migration Wizard:
   - **UI:** Migration Wizard → **Import offline export** → choose `.zip` → **Import export** → select products → Analyze.
   - **API:**

   ```bash
   curl -f -X POST http://localhost:8080/api/migration/import-export \
     -F "file=@threescale-export.zip"
   curl -s http://localhost:8080/api/threescale/products | jq '.[].name'
   curl -X POST http://localhost:8080/api/migration/analyze \
     -H 'Content-Type: application/json' \
     -d '{"gatewayStrategy":"shared","products":["Seed Alpha Product"],"targetClusterId":"local"}'
   ```

4. **Apply** when the target cluster has RHCL prerequisites satisfied (`GET /api/cluster/readiness?planId={id}`).

#### Test fixture maintenance

ApiShift tests consume the 3scaleextract tarball (not a vendored directory tree):

```bash
./scripts/fixtures/sync-export-minimal-fixture.sh   # THREESCALEEXTRACT_ROOT or ../3scaleextract
./scripts/ci/verify-export-minimal-fixture.sh
cd backend && mvn test
```

See [3scaleextract testdata/README.md](https://github.com/Everything-is-Code/3scaleextract/blob/main/testdata/README.md) for checksums and release assets.

### E2E lab pipeline (M3)

Automated **seed → export → visualize → ApiShift analyze** for lab validation ([rhcl-ai #2](https://github.com/Everything-is-Code/rhcl-ai/issues/2)):

```bash
# Terminal 1 — ApiShift stack
cp .env.example .env   # THREESCALE_*, AI_*, optional THREESCALEEXTRACT_ROOT
./scripts/dev/local-up.sh

# Terminal 2 — full lab E2E (requires 3scale Admin API + 3scaleextract checkout)
export THREESCALE_ADMIN_URL=... THREESCALE_ACCESS_TOKEN=...
export THREESCALEEXTRACT_ROOT=../3scaleextract   # optional if repo is beside ApiShift
./scripts/e2e/seed-export-analyze.sh

# Smoke without live 3scale (fixture tarball + offline import only)
E2E_MODE=fixture ./scripts/e2e/seed-export-analyze.sh
```

| `E2E_MODE` | Behavior |
|------------|----------|
| `auto` (default) | Seed/export/visualize when 3scale creds set; **offline** import + analyze via ApiShift API |
| `live` | Same seed/export/visualize; `POST /api/threescale/refresh` instead of zip import |
| `offline` | Explicit offline import path |
| `fixture` | Skip seed; use vendored `export-minimal` tarball (2-product smoke) |

| Variable | Purpose |
|----------|---------|
| `THREESCALEEXTRACT_ROOT` | Path to [3scaleextract](https://github.com/Everything-is-Code/3scaleextract) checkout (default: `../3scaleextract`) |
| `E2E_SKIP_SEED=1` | Reuse existing `export/` directory (skip `threescale-seed`) |

The script asserts `product_count >= 4`, `incomplete: false`, visualize report, and analyze output with AuthPolicy resources (API key + OIDC JWT when full lab fixtures are used). Tenants with pre-existing products may report `product_count > 4`.

**Refresh UI screenshots** (optional, requires Podman + Playwright):

```bash
cd scripts/docs && npm ci && npx playwright install chromium
npm run capture-screenshots
```

Or use the **Capture screenshots** GitHub Actions workflow (`workflow_dispatch`) to download PNG artifacts.

---

## Key Features (v0.3.0)

### Phase 1: Multiple 3scale Sources
- Connect to **N 3scale Admin API endpoints** simultaneously
- Products tagged by source cluster (`sourceCluster` field)
- REST API for source management (`/api/threescale/sources`)
- Environment variable `THREESCALE_SOURCES` for JSON array configuration

### Phase 2: Multi-Cluster Deployment
- **Target cluster selector** in Migration Wizard
- Dynamic Fabric8 `KubernetesClient` per target cluster
- **ArgoCD cluster secret auto-discovery** from `openshift-gitops` namespace
- Per-cluster RBAC validation via `SelfSubjectAccessReview`
- REST API for cluster management (`/api/cluster/targets`)

### Phase 4: AI-Powered Analysis
- **Context injection** (not RAG) — live cluster state is injected into each LLM prompt
- **FAQ cache** with Data Grid (24h TTL) — 10 pre-defined prompts warmed at startup (lighter cluster context, up to 3 retries); check `GET /api/chat/faq-status` or trigger `POST /api/chat/warm-faq`
- **kuadrantctl integration** — 5 CLI commands for resource generation and topology
- **Verification** — AI reviews generated resources post-generation for correctness

### Phase 5: Developer Hub Integration
- **Software Template Registration**: Components registered via standard RHDH Software Templates (`ApiShift-register-component` / `ApiShift-unregister-component`)
- **Observability Tab**: Prometheus/Thanos metrics embedded in RHDH entity pages (request rate, error rate, latency percentiles)
- **Policy Topology Tab**: Kuadrant policy DAG visualization (Gateway → HTTPRoute → policies → APIProduct → APIKey)
- **Component Editor**: Inline editing for platformadmin (no repo required) — annotations, tags, description
- **Pre-registration Editing**: Edit Component definition before catalog registration
- **Catalog Enrichment**: `ApiShiftKuadrantProcessor` enriches 3scale API entities with `kuadrant.io/*` annotations

### Phase 6: APICast Discovery and Migration (v0.3.0)
- **APIManager CRD scanning**: Discovers `APIManager` resources cluster-wide via Fabric8 client
- **Self-managed detection**: Filters for APIManagers with `spec.apicast` (self-managed) and `Available` condition
- **Configuration analysis**: Extracts staging/production specs, custom policies, TLS, OpenTracing settings
- **Istio/Connectivity Link mapping**: Maps APICast config to Gateway, EnvoyFilter, DestinationRule, TelemetryPolicy, ServiceEntry
- **Multi-tenant support**: Detects tenant configurations within APIManager CRDs
- **4 test scenarios** in GitOps with Microcks-backed mocks (API Key, OIDC, Multi-Tenant, Custom Policies+TLS)
- **3scale entity deregistration**: Post-migration unregistration of 3scale-discovered entities to prevent catalog conflicts
- **Bug fixes**: ObservabilityTab null guard for metrics, ComponentEditorTab broadened ApiShift detection

### Phase 7: Offline integration (M2)
- **Export parser** (`io.apishift.service.export`) — `threescale-export` schema 1.0 → `ThreeScaleProduct` without Admin API
- **Import API** — `POST /api/migration/import-export` (multipart `.zip`, max 50 MB default)
- **Wizard upload** — **Import offline export** product source in Migration Wizard step 1
- **Shared fixture** — `export-minimal-1.0.tar.gz` from [3scaleextract](https://github.com/Everything-is-Code/3scaleextract); ApiShift tests verify SHA256 and extract via `ExportMinimalFixture`

### Phase 3: Hub-Spoke Architecture
- **PostgreSQL persistence** for migration plans and audit entries (replaces in-memory storage)
- **Flyway migrations** for versioned schema evolution (`src/main/resources/db/migration/`)
- **Federated audit log** with cluster/action filtering (`/api/hub/audit`)
- **Hub overview API** with aggregated stats (`/api/hub/overview`)
- **Topology API** showing all clusters and sources (`/api/hub/topology`)

---

## APICast Discovery Architecture

```mermaid
sequenceDiagram
    actor User
    participant API as ApiShift API
    participant Svc as APICastDiscoveryService
    participant K8s as Kubernetes API

    User->>API: GET /api/apicast/discover
    API->>Svc: discoverAllAPIManagers
    Svc->>K8s: List APIManagers all namespaces
    K8s-->>Svc: N APIManagers
    Svc->>Svc: Filter self-managed and ready
    loop Each APIManager
        Svc->>K8s: List Products in namespace
        Svc->>K8s: List APIcast pods
        Svc->>Svc: analyzeAPICast extracts config
    end
    Svc-->>API: List of APICastConfig
    API-->>User: JSON with discovered APIManagers
```

```mermaid
flowchart LR
    subgraph apicast [3scale APICast]
        Deploy[Deployment staging/production]
        Policies[Custom Policies Lua]
        TLS[TLS Config]
        Tracing[OpenTracing]
    end
    subgraph cl [Connectivity Link]
        Gateway[Istio Gateway]
        EFilter[EnvoyFilter WASM]
        DRule[DestinationRule TLS]
        Telemetry[TelemetryPolicy OTel]
    end
    Deploy --> Gateway
    Policies --> EFilter
    TLS --> DRule
    Tracing --> Telemetry
```

---

## Prerequisites

**Full migration to Connectivity Link (OpenShift):**

* **OpenShift 4.21** with cluster-admin or least-privilege RBAC
* **3scale Operator** installed (for CRD discovery)
* **Kuadrant Operator** / Connectivity Link installed
* **Helm 3** for deployment

**Local development / discovery-only (no Kuadrant required):**

* **Podman** + **podman-compose**
* **3scale Admin API** URL and access token (inventory and effort estimation via Admin API)
* Optional: **LiteLLM** API key for the AI assistant
* Optional: **OpenShift API** token only if you enable CRD or APICast discovery in `.env`

**Traditional dev (without containers):**

* **Java 17** + **Maven 3.9+** for backend development
* **Node.js 20** for frontend development

---

## Running the Solution

### Local Development

**Backend:**

```bash
cd backend
mvn quarkus:dev
```

**Offline export fixture (tests):** See [Offline integration (M2)](#offline-integration-m2) for the full cross-repo flow. Quick refresh from a local 3scaleextract checkout:

```bash
./scripts/fixtures/sync-export-minimal-fixture.sh
./scripts/ci/verify-export-minimal-fixture.sh
```

**Frontend:**

```bash
cd frontend
npm install
npm start
```

Open **http://localhost:4200**. The Angular dev server proxies `/api` to `http://localhost:8080`.

### Containers (Podman Compose) — recommended for contributors

Local stack uses **public** images (PostgreSQL, Infinispan) — no Red Hat registry login required.

**Requirements:** [Podman](https://podman.io/) and [podman-compose](https://github.com/containers/podman-compose). The first `./scripts/dev/local-up.sh` run builds backend and frontend images and may take several minutes.

**Quick start:**

```bash
cp .env.example .env
# Edit .env: THREESCALE_ACCESS_TOKEN, AI_API_KEY, AI_ENDPOINT, AI_MODEL, AI_TIMEOUT (default 600s), optional KUBE_*
./scripts/dev/local-up.sh
```

**Stop / reset:**

```bash
./scripts/dev/local-down.sh          # stop containers
podman-compose down -v         # stop and delete DB volume
```

**Endpoints:**

| Service | URL |
|---------|-----|
| UI | http://localhost:4200 |
| API | http://localhost:8080/api |
| Health | http://localhost:8080/q/health/ready |
| 3scale status | http://localhost:8080/api/threescale/status |
| PostgreSQL | localhost:5432 (`ApiShift` / `ApiShift`) |

**Discovery-only mode (default in compose):** `THREESCALE_CRD_DISCOVERY=false` and `APICAST_DISCOVERY=false` — enough to explore 3scale products/backends via Admin API and run migration **analysis** without Kuadrant or cluster write access. Set both to `true` in `.env` plus `KUBE_*` for CRD/APICast inventory (read-only RBAC is sufficient; cluster-admin is not required).

**Verify:**

```bash
curl -sf http://localhost:8080/q/health/ready
curl -sf http://localhost:8080/api/threescale/status
```

See [.env.example](.env.example) for all variables.

### Helm Chart (OpenShift)

```bash
helm repo add ApiShift https://everything-is-code.github.io/ApiShift/
helm install ApiShift ApiShift/ApiShift \
  --set ai.apiKey=YOUR_KEY \
  --set threescale.adminApi.url=https://3scale-admin.apps.example.com \
  --set threescale.adminApi.accessToken=YOUR_TOKEN \
  --set clusterDomain=apps.cluster.example.com
```

### Multi-Source Configuration

Pass additional 3scale sources as a JSON array:

```bash
helm install ApiShift ApiShift/ApiShift \
  --set threescale.sources='[{"id":"prod","label":"Production 3scale","adminUrl":"https://3scale-admin.prod.example.com","accessToken":"TOKEN","enabled":true}]'
```

### Multi-Cluster Configuration

Add target clusters or enable ArgoCD discovery:

```bash
helm install ApiShift ApiShift/ApiShift \
  --set argocd.clusterDiscovery=true \
  --set targetClusters='[{"id":"staging","label":"Staging Cluster","apiServerUrl":"https://api.staging.example.com:6443","token":"TOKEN","authType":"token","verifySsl":false,"enabled":true}]'
```

---

## REST API authentication

Authentication is **disabled by default** (`APISHIFT_AUTH_ENABLED=false`). When enabled, the backend validates OIDC JWT bearer tokens (production) or HTTP Basic with embedded users (dev profile only).

| Flag / env | Default | Purpose |
|------------|---------|---------|
| `APISHIFT_AUTH_ENABLED` | `false` | Master switch; when off, all endpoints behave as pre-auth releases |
| `APISHIFT_AUTH_PROTECT_READS` | `false` | When `true`, sensitive GET paths require viewer, operator, or admin |
| `OIDC_AUTH_SERVER_URL` | — | Keycloak (or compatible) issuer URL for bearer validation |
| `OIDC_CLIENT_ID` | `apishift-backend` | Resource-server client ID |
| `OIDC_ROLE_CLAIM_PATH` | `realm_access.roles` | JWT claim containing role names |

### Roles

| Role | Mutations | Reads (when `protect-reads=true`) |
|------|-----------|-------------------------------------|
| `admin` | apply, revert, targets/sources CRUD, APICast map, chat | all protected reads |
| `operator` | analyze, import-export, threescale refresh | all protected reads |
| `viewer` | — | protected reads only |

### Local dev (Basic auth)

```bash
# .env
APISHIFT_AUTH_ENABLED=true

# frontend/public/auth-config.local.js (copy from auth-config.local.example.js)
# enabled: true, basicUsername: admin, basicPassword: admin
```

Embedded dev users: `admin/admin`, `operator/operator`, `viewer/viewer`.

### Production (Helm + OIDC)

See [helm/apishift/README.md](helm/apishift/README.md#enabling-auth-on-helm-installs). Map IdP groups to JWT roles `admin`, `operator`, and `viewer`. The SPA sends `Authorization: Bearer` via the frontend interceptor; configure SSO token handoff separately (RHDH plugin out of scope for #102).

### Always public (even when auth enabled)

Health/metrics probes, `/api/migration/policy-mapping`, `/api/cluster/features`, `/api/cluster/readiness`, `/api/threescale/status`, `/api/chat/status`, `/api/apicast/discover*`.

---

## API Endpoints

### Core APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/cluster/projects | GET | List all cluster projects |
| /api/threescale/products | GET | List 3scale Products (all sources, CRD + Admin API) |
| /api/threescale/backends | GET | List 3scale Backends (all sources) |
| /api/threescale/status | GET | Admin API connectivity status |
| /api/threescale/refresh | POST | Evict discovery cache and reload products/backends |
| /api/migration/policy-mapping | GET | Consolidated 3scale → RHCL 1.3 mapping reference |
| /api/migration/analyze | POST | Analyze and plan migration (returns `prerequisites[]`) |
| /api/migration/import-export | POST | Upload 3scale export `.zip` (`multipart/form-data`, field `file`); loads products for analyze |
| /api/cluster/readiness | GET | Probe RHCL readiness on target cluster (optional `planId`) |
| /api/migration/plans | GET | List migration plans |
| /api/migration/plans/{id}/apply | POST | Apply plan to target cluster |
| /api/migration/plans/{id}/revert | POST | Revert plan from target cluster |
| /api/migration/revert-bulk | POST | Bulk revert to 3scale |
| /api/audit/reports | GET | View audit log |
| /api/chat | POST | AI migration assistant (FAQ cache when prompt matches) |
| /api/chat/warm-faq | POST | Trigger FAQ cache refresh (background) |
| /api/chat/faq-status | GET | FAQ cache status (`cached` / `total`) |

### Multi-Source APIs (Phase 1)

| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/threescale/sources | GET | List all 3scale sources |
| /api/threescale/sources | POST | Add a new 3scale source |
| /api/threescale/sources/{id} | DELETE | Remove a 3scale source |
| /api/threescale/sources/{id}/status | GET | Check source connectivity |

### Multi-Cluster APIs (Phase 2)

| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/cluster/targets | GET | List target clusters |
| /api/cluster/targets | POST | Add a target cluster |
| /api/cluster/targets/{id} | DELETE | Remove a target cluster |
| /api/cluster/targets/{id}/validate | GET | Validate RBAC access on target |

### Developer Hub Integration APIs (Phase 5)

| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/migration/plans/{id}/catalog-info/{product} | GET | Serve generated catalog-info.yaml for catalog:register |
| /api/migration/plans/{id}/confirm-registration | POST | Confirm Component registration (with optional edits) |

### APICast Discovery APIs (Phase 6)

| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/apicast/discover | GET | Discover all APIManagers with self-managed APICast |
| /api/apicast/discover/{namespace} | GET | Discover APIManagers in a specific namespace |
| /api/apicast/analyze/{namespace}/{name} | GET | Analyze specific APIManager configuration |
| /api/apicast/map | POST | Map APICast config to Istio/Connectivity Link resources |
| /api/apicast/map-all | POST | Batch map all discovered APICasts |

### Hub-Spoke APIs (Phase 3)

| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/hub/overview | GET | Aggregated hub stats (plans, clusters, audit) |
| /api/hub/audit | GET | Federated audit log (filter by cluster, action) |
| /api/hub/plans | GET | Federated plans (filter by cluster, status) |
| /api/hub/topology | GET | Cluster + source topology graph |

---

## Helm Chart Values

| Value | Default | Description |
|-------|---------|-------------|
| `backend.image.tag` | v0.3.0 | Backend image tag |
| `frontend.image.tag` | v0.3.0 | Frontend image tag |
| `ai.enabled` | true | Enable AI features |
| `ai.endpoint` | litellm-prod... | LLM endpoint URL (RHDP MaaS: `https://maas-rhdp.apps.maas.redhatworkshops.io/v1`) |
| `ai.model` | deepseek-r1-distill-qwen-14b | AI model name (use provider slug allowed by your key; no `openai/` prefix on RHDP MaaS) |
| `ai.apiKey` | "" | LLM API key |
| `ai.timeout` | 600s | LLM request timeout (`AI_TIMEOUT` in compose) |
| `threescale.adminApi.url` | "" | 3scale Admin Portal URL |
| `threescale.adminApi.accessToken` | "" | 3scale access token |
| `threescale.sources` | "" | JSON array of additional 3scale sources |
| `targetClusters` | "" | JSON array of target clusters |
| `argocd.clusterDiscovery` | false | Auto-discover clusters from ArgoCD secrets |
| `postgresql.enabled` | true | Deploy PostgreSQL for persistence |
| `postgresql.username` | ApiShift | Database username |
| `postgresql.password` | ApiShift | Database password |
| `connectivityLink.gatewayStrategy` | shared | shared / dual / dedicated |
| `connectivityLink.gatewayClassName` | istio | Gateway class |
| `rbac.clusterAdmin` | false | Use cluster-admin (dev only) vs least-privilege |
| `developerHub.scaffolderUrl` | "" | RHDH Scaffolder API URL for Component registration |
| `developerHub.scaffolderToken` | "" | Bearer token for Scaffolder API authentication |
| `route.enabled` | true | Create OpenShift Route |

**Helm vs local compose defaults:** The chart does not template `THREESCALE_CRD_DISCOVERY` or `APICAST_DISCOVERY`; the application defaults both to **`true`** on OpenShift. Local [podman-compose.yml](podman-compose.yml) / [`.env.example`](.env.example) default both to **`false`** for Admin-API-only discovery. See [helm/ApiShift/README.md](helm/ApiShift/README.md#values-documented-but-not-wired-in-the-chart) for the full env mapping.

For module layout and API contracts, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and the [architecture hardening archive](docs/archive/2026-06-16-architecture-hardening.md).

---

## Official Documentation

* [Red Hat Connectivity Link](https://docs.redhat.com/en/documentation/red_hat_connectivity_link)
* [Kuadrant Docs](https://docs.kuadrant.io/)
* [kuadrantctl](https://github.com/Kuadrant/kuadrantctl)
* [3scale API Management](https://docs.redhat.com/en/documentation/red_hat_3scale_api_management)
* [3scale Operator](https://github.com/3scale/3scale-operator)
* [Gateway API](https://gateway-api.sigs.k8s.io/)
* [Quarkus LangChain4j + MCP](https://quarkus.io/blog/quarkus-langchain4j-mcp/)
* [Migration Guide (ONLU)](https://onlu.ch/en/migration-path-from-red-hat-3scale-api-management-to-red-hat-connectivity-link/)

---

## License

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

This software is licensed under the [Apache License 2.0](LICENSE).
