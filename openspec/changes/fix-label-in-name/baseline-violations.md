# Baseline violations (red)

Recorded 2026-10-29 with `@axe-core/playwright@4.14.0` / `axe-core@4.14.0`, before any fix. Setup as in CI: production build with `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000`, API with `ENV=test`, `CI=true pnpm --dir apps/web e2e`.

Result: **2 failed, 8 passed**. Every serious/critical violation is `label-content-name-mismatch` (24 node results across both tests and their retries); no other rule fails.

## `/topology` audit (`a11y-and-journeys.spec.ts:22`, failed on both attempts)

| Element | Target | Accessible name (truncated by axe) | Visible text | Fix task |
|---|---|---|---|---|
| LOD toggle | `button[aria-pressed]` in toolbar | `Toggle Level of Detail Grouping` | `LOD: Detail` | 3.1 |
| Edge RPS pill | `button[data-edge-id="edge:svc:api-gateway..."]` | `Edge edge:svc:api-ga...` | `<n> rps` | 3.3 |
| Node card | `div[data-testid="node-svc:orders-svc"]` | `Service orders-svc, ...` | label + metrics strip | 4.x |
| Node card | `div[data-testid="node-svc:search-svc"]` | `Service search-svc, ...` | label + metrics strip | 4.x |

## Chaos journey (`a11y-and-journeys.spec.ts:207`, first attempt)

| Element | Target | Accessible name (truncated) | Fix task |
|---|---|---|---|
| LOD toggle | toolbar button | `Toggle Level of Detail Grouping` | 3.1 |
| Node cards | `node-client-edge`, `node-ext:payments-provider`, `node-ext:smtp-relay`, `node-proc:10100:…`, `node-proc:10103:…`, `node-proc:10200:…`, `node-proc:10201:…`, `node-proc:10202:…`, `node-proc:10302:…`, `node-proc:10303:…`, `node-proc:10400:…`, `node-proc:10401:…` | `Service …` / `External …` | 4.x |

Every reported element maps to a fix task; nothing outside design.md came up. Not reported by the scan, but covered by the spec and fixed anyway: the group expand/collapse button (3.2; it renders only in LOD-grouped mode, which no scan uses) and `EvidenceChip` (3.4; the insights journey scan passed, but visible kind text before the label is missing from the name, so the chip fails as soon as a kind renders).

## Chaos retry

The retry of the chaos journey fails on `expect(activateRes.ok())`, not on axe. API access log from the same run:

```
POST /api/v1/simulation/scenarios/request-storm/activate  200 OK               (attempt 1)
POST /api/v1/simulation/scenarios/request-storm/activate  429 Too Many Requests (retry, ~2 s later)
```

Reproduced directly against a fresh `ENV=test` API (no code changes, no temporary logging needed):

```
attempt 1 → 200 application/json
attempt 2 → 429, retry-after: 10, application/problem+json
            {"title":"Too Many Requests","status":429,
             "detail":"Rate limit exceeded: scenario activations are restricted to 1 per 10 seconds. Please retry after 10s.", ...}
POST /simulation/reset → 204
attempt 3 → 429   (reset does not refill the bucket)
```

Cause: `check_scenario_rate_limit` uses a per-client-IP `TokenBucketLimiter(rate_per_second=0.1, capacity=1.0)` created once in `create_app`. Playwright retries in CI (`retries: 1`, one worker, one long-lived API) from the same `127.0.0.1` within 10 s. Neither `/simulation/reset` nor `ENV=test` resets or bypasses the bucket. Side effects:
- The retry reports a misleading failure that hides the original one.
- The first attempt fails before its `/simulation/reset` call, so the scenario stays active for the retry and any later test.

Not fixed in this change (report only).
