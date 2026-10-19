# Azure workshop operations

The React app and Fastify API share one Azure App Service Linux B1 / Node 24 host. Azure Table Storage keeps browser allowances, expiring sessions and aggregate results across restarts. Runtime managed identity calls the **existing** Microsoft Foundry agents and Decision-1 deployment; no model or agent redeployment is needed.

The subscription enforces private-only storage. App Service VNet integration, a Table private endpoint and private DNS provide the compliant path; the attendee web app remains public. Private endpoint/DNS add charges beyond B1 hosting. Do not enable public storage access or exempt the governance policy.

## Links and resources

Attendee app: <https://app-decision-room-ralexiou-04dbd6.azurewebsites.net/>. `/facilitator` shows aggregate results, not private attendee responses. The infrastructure script also prints the actual Azure hostname.

- Presentation: <https://rodanthi-alexiou.github.io/ai-decision-workshop/>
- Source: <https://github.com/rodanthi-alexiou/ai-decision-workshop>
- Resource group: `rg-decision-room-dev`, Sweden Central.
- Dedicated app: `app-decision-room-ralexiou-04dbd6`.
- Dedicated B1 plan: `asp-decision-workshop`.
- Dedicated LRS storage: `stdecisionroom04dbd6`, table `workshop`.
- Dedicated VNet: `vnet-decision-workshop`, integration and private-endpoint subnets; private endpoint `pe-decision-workshop-table`.

## Initial setup

Sign into Azure CLI using an account permitted to create hosting resources and assign resource-scoped roles:

```powershell
az login
.\infra\deploy-workshop.ps1
.\infra\deploy-workshop.ps1 -Apply
```

Preview is read-only. Apply preserves existing Foundry resources and existing event ID/closed settings. Runtime gets Storage Table Data Contributor on the storage account and Foundry User on the existing Foundry account (covering its project agents and Microsoft-model inference). Neither runtime nor deployment identity gets subscription Contributor. Publishing basic authentication is disabled.

The GitHub `production` environment allows deployments from `main` only. A separate user-assigned deployment identity trusts the exact emitted subject `repo:rodanthi-alexiou@61449673/ai-decision-workshop@1423521874:environment:production` through GitHub OIDC and has Website Contributor only on this web app. The numeric identifiers are GitHub's immutable owner/repository IDs; keep the federation aligned with the actual token claims rather than assuming the legacy name-only format. No publish profile, API key or client secret is required.

Environment variables in GitHub: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`, `AZURE_WEBAPP_NAME`, `AZURE_WEBAPP_URL`. These identifiers are not secrets. Keep `.env` and credentials out of Git and release artifacts.

The existing Dockerfile is not used by this native ZIP deployment. Container builds must supply `--build-arg BUILD_SHA=<40-character commit SHA>` to generate the required immutable `release.json`, and must provide the same live Foundry/durable-storage production configuration at runtime.

## Limits and privacy

Defaults: **5 journey starts per browser/event**, **2 starts per rolling minute**, **1 active AI operation per browser**, **5 per process**, **1,000 reserved inference calls per event**. Each admitted journey reserves four calls, including one possible options repair; failures consume reservations. Thus at most 250 journeys fit the default event budget. Agent responses are capped at 8,000 output tokens, including reasoning; request bodies are bounded and inference retries are disabled. Existing agent reasoning configuration is preserved because Foundry rejects per-request reasoning overrides on named agents. Comparison displays retain up to four overlap/gap items.

These are **browser limits, not verified per-person limits**. Private browsing, clearing cookies or another device gets another allowance. The event ceiling still applies. A common Wi-Fi IP does not combine attendees' allowances. Busy responses explicitly request a retry; the service does not queue unlimited work. Five active operations is an overload limit, not a guaranteed model-throughput or latency claim.

The expected workshop size is about 50 attendees. With approval, the existing GlobalStandard allocations were raised to GPT-5-mini 100 requests/minute / 100K tokens/minute and Decision-1 30 requests/minute, preserving their model versions and agents. This allocates existing pay-per-token quota, not reserved PTUs. Five active operations still means attendees may need to retry in waves.

Deployment rehearsal completed real English, Greek and custom journeys using runtime managed identity, both existing agents and Decision-1. Five parallel real journeys completed in approximately 21-31 seconds; the separate deterministic 50-browser overload test admitted five and returned busy responses to 45. These observations are not a latency SLA. Pause/close, restart persistence, private Table transactions/purge and exact-artifact rollback/restoration were also exercised. The attendee event is `workshop-20261018`; deployment rehearsal used a separate partition and allowance.

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

Pause/resume also wait for App Service settings propagation. A successful settings write is not proof the running process has switched; verify the requested behavior before relying on it.

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

Purge requires Storage Table Data Contributor for the operator, scoped to this storage account, and uses Entra authentication, not storage keys. **Run data-plane purge commands from an approved machine connected to this VNet**; an ordinary public workstation cannot access the private Table endpoint. PurgeExpired keeps quota/event counters; PurgeEvent removes the entire explicitly named event partition. Only purge completed events; deleting counters for an active event would reset its budget.

Alternatively, use the web app's authenticated **Development Tools > SSH** in Azure Portal. This runs inside the already-approved private network using runtime managed identity, without adding a VM or exposing an admin API:

```bash
cd /home/site/wwwroot
node --input-type=module -e "const {AzureStore}=await import('./server/dist/store.js'); console.log(await new AzureStore(process.env.TABLE_ENDPOINT,'your-completed-event').purgeExpired())"
# Destructive: removes all data in only the explicitly named completed event.
node --input-type=module -e "const {AzureStore}=await import('./server/dist/store.js'); console.log(await new AzureStore(process.env.TABLE_ENDPOINT,'your-completed-event').purgeEvent())"
```

`purgeEvent()` refuses to remove the currently active open event. Keep the literal event argument intentional; do not substitute the active event merely to obtain more allowance.

## Releases and rollback

`.github/workflows/deploy-azure.yml` checks PRs and automatically deploys successful `main` pushes. It uses pinned Actions, Node 24, lockfiles, existing tests/typechecks/lint, and an allowlisted production ZIP including prompts and production-only server dependencies. Azure CLI's Kudu ZIP Deploy with `WEBSITE_RUN_FROM_PACKAGE=1` mounts the immutable ZIP read-only instead of OneDeploy copying thousands of dependency files into the live directory. It smoke-starts the exact package on Linux before deploying it and verifies live readiness, commit SHA and built assets afterward. The live SHA comes from the package's immutable `release.json`, not merely an app setting that could change before deployment finishes. The separate Pages workflow remains independent.

B1 has no deployment slots. Releases restart the app and can interrupt requests; avoid pushes during the exercise. An interrupted admitted attempt is not replayed or refunded automatically.

Wait for the GitHub deployment run to finish successfully before starting paid rehearsal. A new health SHA can become visible before the platform completes all deployment/restart work.

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
