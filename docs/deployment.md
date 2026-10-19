# Azure workshop operations

The React app and Fastify API share one Azure App Service Linux B1 / Node 24 host. Azure Table Storage keeps browser allowances, expiring sessions and aggregate results across restarts. Runtime managed identity calls the **existing** Microsoft Foundry agents and Decision-1 deployment; no model or agent redeployment is needed.

## Links and resources

The deployment script prints the actual Azure hostname. The attendee link is its HTTPS root; `/facilitator` shows aggregate results, not private attendee responses.

- Presentation: <https://rodanthi-alexiou.github.io/ai-decision-workshop/>
- Source: <https://github.com/rodanthi-alexiou/ai-decision-workshop>
- Resource group: `rg-decision-room-dev`, Sweden Central.
- Dedicated app: `app-decision-room-ralexiou-04dbd6`.
- Dedicated B1 plan: `asp-decision-workshop`.
- Dedicated LRS storage: `stdecisionroom04dbd6`, table `workshop`.

## Initial setup

Sign into Azure CLI using an account permitted to create hosting resources and assign resource-scoped roles:

```powershell
az login
.\infra\deploy-workshop.ps1
.\infra\deploy-workshop.ps1 -Apply
```

Preview is read-only. Apply preserves existing Foundry resources and existing event ID/closed settings. Runtime gets Storage Table Data Contributor on the storage account and Foundry User on the existing Foundry account (covering its project agents and Microsoft-model inference). Neither runtime nor deployment identity gets subscription Contributor. Publishing basic authentication is disabled.

The GitHub `production` environment allows deployments from `main` only. A separate user-assigned deployment identity trusts only `repo:rodanthi-alexiou/ai-decision-workshop:environment:production` through GitHub OIDC and has Website Contributor only on this web app. No publish profile, API key or client secret is required.

Environment variables in GitHub: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`, `AZURE_WEBAPP_NAME`, `AZURE_WEBAPP_URL`. These identifiers are not secrets. Keep `.env` and credentials out of Git and release artifacts.

## Limits and privacy

Defaults: **5 journey starts per browser/event**, **2 starts per rolling minute**, **1 active AI operation per browser**, **5 per process**, **1,000 reserved inference calls per event**. Each admitted journey reserves four calls, including one possible options repair; failures consume reservations. Thus at most 250 journeys fit the default event budget. Output tokens and request bodies are bounded; inference retries are disabled.

These are **browser limits, not verified per-person limits**. Private browsing, clearing cookies or another device gets another allowance. The event ceiling still applies. A common Wi-Fi IP does not combine attendees' allowances. Busy responses explicitly request a retry; the service does not queue unlimited work. Five active operations is an overload limit, not a guaranteed model-throughput or latency claim.

Do not enter sensitive information. Raw answers are not persisted by this application, but are processed by Foundry and may be reflected in cached AI outputs. Scenarios/results expire for API access after 24 hours. Table Storage has no automatic TTL: an operator must purge expired sessions daily and purge the completed event after its retention window. Service-side AI data handling is separate from application storage.

## Manual close after the workshop

```powershell
.\infra\manage-workshop.ps1 -Action Close
.\infra\manage-workshop.ps1 -Action Close -Apply
```

`WORKSHOP_CLOSED=true` returns `403 WORKSHOP_CLOSED` from **all attendee APIs**, including existing sessions and dashboard. The shell displays a closed-event page with public slides/code links. Settings changes restart the app, so allow propagation and verify `/api/usage` returns 403 before considering it closed. Already accepted AI inference may finish and is not refunded. GitHub redeployment does not reset the setting.

Optional scheduled closure: set `WORKSHOP_ENDS_AT` to a UTC timestamp ending in `Z`; the server checks it before every new inference. Manual closure is the chosen default. To reopen intentionally, use `-Action Open -Apply` and remove any elapsed scheduled cutoff separately.

Pause **new journeys only**, allowing admitted journeys to finish:

```powershell
.\infra\manage-workshop.ps1 -Action Pause -Apply
.\infra\manage-workshop.ps1 -Action Resume -Apply
.\infra\manage-workshop.ps1 -Action Status
```

Stop the entire host:

```powershell
.\infra\manage-workshop.ps1 -Action Stop -Apply
```

Stopping the app **does not stop B1 plan billing**. To end dedicated compute charges, separately approve deleting this app and its dedicated `asp-decision-workshop` plan after confirming it hosts no other apps. Do not delete the resource group, shared Foundry models/agents/connections or existing monitoring resources. Storage and other services can still bill.

## Event rollover and cleanup

Changing `WORKSHOP_EVENT_ID` selects a new partition and resets the new event's allowances/dashboard without erasing the old event. Never reset an active event to work around its spending cap unintentionally. Use a separate event ID and a small `EVENT_REQUEST_LIMIT` for live rehearsal, then set the intended event ID before sharing.

```powershell
az webapp config appsettings set -g rg-decision-room-dev -n app-decision-room-ralexiou-04dbd6 --settings WORKSHOP_EVENT_ID=your-next-event --output none
.\infra\manage-workshop.ps1 -Action PurgeExpired -EventId your-completed-event
.\infra\manage-workshop.ps1 -Action PurgeExpired -EventId your-completed-event -Apply
.\infra\manage-workshop.ps1 -Action PurgeEvent -EventId your-completed-event -Apply
```

Purge requires Storage Table Data Contributor for the operator, scoped to this storage account, and uses Entra authentication, not storage keys. PurgeExpired keeps quota/event counters; PurgeEvent removes the entire explicitly named event partition. Only purge completed events; deleting counters for an active event would reset its budget.

## Releases and rollback

`.github/workflows/deploy-azure.yml` checks PRs and automatically deploys successful `main` pushes. It uses pinned Actions, Node 24, lockfiles, existing tests/typechecks/lint, and an allowlisted production ZIP including prompts and production-only server dependencies. It smoke-starts the exact package on Linux before deploying it and verifies live readiness, commit SHA and built assets afterward. The separate Pages workflow remains independent.

B1 has no deployment slots. Releases restart the app and can interrupt requests; avoid pushes during the exercise. An interrupted admitted attempt is not replayed or refunded automatically.

Artifacts are retained for 14 days. To roll back, select a **successful previous run** of this workflow and supply its numeric run ID:

```powershell
gh workflow run deploy-azure.yml --ref main -f rollback_run_id=SUCCESSFUL_RUN_ID
```

Rollback redeploys the exact stored ZIP and its original SHA, not a rebuild of old source. It does not reset event data, undo incompatible schema changes or reopen a closed workshop. Deployment jobs are serialized; superseded main commits are skipped.

## Health, smoke checks and incident response

`/api/health` identifies live/mock provider and release SHA; `/api/ready` checks storage without invoking models. Neither endpoint exposes resource names or attendee content.

```powershell
node .\scripts\smoke.mjs https://ACTUAL_AZURE_HOST EXPECTED_COMMIT_SHA
# Explicitly paid: three real journeys (English, Greek, custom); use an isolated small-budget event.
node .\scripts\smoke.mjs https://ACTUAL_AZURE_HOST EXPECTED_COMMIT_SHA --live-journeys
az webapp log tail -g rg-decision-room-dev -n app-decision-room-ralexiou-04dbd6
```

Logs use sanitized failure categories, not answers, cookies, tokens or raw provider errors. Storage failures fail closed before inference; production does not silently fall back to mock. Confirm role-assignment propagation, Table availability and Foundry quotas when requests fail. Azure budget alerts are notifications, **not hard spending stops**; hosting, model tokens, storage and monitoring are billed separately. Use pause/close immediately for unexpected traffic.
