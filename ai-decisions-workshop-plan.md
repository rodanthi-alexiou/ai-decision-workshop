# The Decision Room — Skill Up Forum 2026 Workshop Plan & Prototype Brief

**Format: individual, Open Day session, 100% digital.** Tue 27 Oct 2026, Technopolis Athens. Every attendee works alone, on their own decision, on their own phone. There are no printed materials, so every fallback is digital (see §9).

> **How to use this file**
> - Sections 1–6: workshop design (audience, research, flow, cases).
> - Section 7: architecture (one Foundry prompt agent + Microsoft-Decision-1 as an independent scorer) and the decision model.
> - Section 8: **GitHub Copilot build brief** — in VS Code: *"Read `ai-decisions-workshop-plan.md` section 8 and build Phase 1. Ask me before choosing between open options."*
> - `[Brackets]` = a decision or detail for you.
> - **Core design:** the attendee-facing interaction is one 8–10 minute flow — commit, see three AI-generated options, pick one, see an independent model ranking, compare. It runs inside a 50-minute stage wrapper (intro/demo, hands-on run, debrief). There is exactly one generative agent (a Foundry prompt agent) and one independent scoring model (Microsoft-Decision-1); there is no multi-agent chain, no challenger/devil's-advocate agent, and no "AI Boss" in the MVP. A challenger mode is an explicit later option (§7, §8), not part of this build.

---

## 1. Event & audience

- **Event:** Skill Up Forum 2026 (Envolve Entrepreneurship & linq), 5th edition.
  - **Your session: Open Day**, Tue 27 Oct 2026, 10:00–19:00, Technopolis Athens — free, keynotes, panels, open workshops. Drop-in audience, so expect people to arrive late and leave early.
  - `[Confirm your slot time, length and room capacity with the organisers.]`
- **Who:** middle managers with 2–5 years' experience leading teams of up to 15, often in their first real leadership role; also emerging leaders, directors, founders, HR/L&D.
- **Their AI reality:** "expected to go digital" without a roadmap or formal training. The forum promises tools "you can use on Monday".

**Why individual suits this audience:** most of them make decisions **alone**, squeezed between leadership and their team, with no one to pressure-test them. The workshop gives each person a private thinking partner. They can work on a real (anonymised) decision without exposing it to strangers in the room.

**Core message:** *"AI doesn't make the call — you do. Use it to pressure-test your decision, not to replace your judgment."*

---

## 2. Research backbone

| Claim for the stage | What the source says | Use it for |
|---|---|---|
| Trusting AI more → thinking less | Lee et al. (Microsoft Research, CHI '25), 319 knowledge workers: higher confidence in GenAI goes with less critical thinking; higher self-confidence goes with more | **Main individual-level finding.** Why the app makes you commit first |
| Critical thinking shifts to checking | Same study: GenAI shifts critical thinking toward verification, integration and stewardship | "Your job is now quality control of the AI" |
| Overreliance is the default risk | Microsoft overreliance review: people accept incorrect AI outputs; cognitive forcing functions (make people think before seeing the AI) reduce it | Design rule: gut pick before AI answer |
| An AI devil's advocate helps | Chiang et al. (IUI '24): an *interactive* devil's advocate that argues **against the AI's recommendation** significantly improved decision accuracy. One arguing against the group majority didn't. | Rationale for the **deferred, optional challenger mode** (§7, §8 "Later, optional"), not part of the MVP flow. **Note:** studied in small groups, so present any future version as "evidence from group decisions; we're applying it to you one-to-one" |
| Feeling challenged ≠ doing worse | Same study: people with that devil's advocate rated their own performance lowest while their actual accuracy was highest | Supports adding a challenger mode later; cite in the debrief as "what we'd add next," not as something attendees experienced today |
| WTI 2026: starting point | 86% of AI users treat AI output as a starting point, not an answer | Opening stat |
| WTI 2026: human skills | Top human skills: quality control of AI output (50%), critical thinking (46%) | "The skill you're practising today" |
| WTI 2026: managers matter | +17 pt lift in recognised AI value when managers actively model AI use | Monday move: model it for your team |
| WTI 2026: transformation paradox | 65% fear falling behind, 45% feel safer sticking to current goals; only 13% feel rewarded for reinvention | Empathy hook |
| EU AI Act Art. 14 | Humans must be able to stay aware of automation bias, override or reverse output, and stop the system | Rationale for hiding Decision-1's ranking until the attendee commits, and for the "stay/change" question (§5, §7b) |

⚠️ **Not verified:** the 2025 UNIST study on anonymous minority opinions. It's also a group finding, so drop it for the individual format.

---

## 3. Concepts (all individual)

**The Decision Room (one flow, 8–10 minutes).** QR → attendee picks a case → writes their own unaided answer → **one Foundry prompt agent** neutrally restates the decision and generates exactly three distinct, realistic options (no recommendation) → attendee picks A/B/C → **Microsoft-Decision-1**, an independent scoring model, ranks the same scenario and options against a fixed rubric → reveal and compare: their pick vs. the model's ranking, plus the group's live distribution → "Would you stay with your choice?". There is one conversational agent and one independent scorer — no agent chain, no per-step agree/push-back/edit, no one-page brief to assemble, no AI Boss.

**Digital fallback (same flow, as prompts).** The same four moves — restate + 3 options, your pick, independent ranking, compare — as a short, copy-paste prompt sequence on a lightweight static page, for attendees to run in Copilot Chat or any assistant they already have. No app dependency. (See §9.)

**Later, optional: a challenger mode.** After the MVP is validated, an optional second pass can add an interactive agent that argues against either the attendee's pick or the model's top choice (research in §2 supports this for small groups). It is explicitly **out of scope for this build** and only runs after someone has already compared their own judgment with Decision-1's.

**Open Day set-up:** demo on stage (facilitator runs one case live) → each attendee runs their own 8–10 minute flow on their phone → group debrief on the aggregate dashboard. Nothing printed; output is the on-screen comparison and the dashboard.

---

## 4. 50-minute flow (Open Day)

The attendee-facing interaction is 8–10 minutes; the rest of the slot is facilitation around it.

| Time | Segment | Detail |
|---|---|---|
| 0–5 | Hook | Anonymous poll on phones: "What decision are you sitting on right now?" (word cloud). One stat: 86% treat AI as a starting point. |
| 5–8 | Frame the exercise | "AI doesn't make the call — you do." Explain the two kinds of AI in the app: one that talks (the prompt agent generates options), one that scores (Decision-1 ranks them), and that you commit **before** either answers. |
| 8–16 | Live demo | Facilitator runs the Northstar Services case on stage end to end: commit → 3 options → pick → reveal Decision-1's ranking → "would you stay with your choice?" |
| 16–28 | Hands-on, solo | Each attendee runs their own 8–10 minute flow: choose a case (or the custom scenario) → commit → 3 options → pick → reveal → stay/change. |
| 28–40 | Debrief | Anonymous dashboard: option distribution per case, human/model alignment rate, changed-after-reveal rate, how many said the AI surfaced an option they hadn't considered. Volunteers may share one insight, but nobody has to. |
| 40–45 | Monday move | Do this alone in 10 minutes with Copilot Chat + the fallback prompt sequence. Managers who model AI use matter (+17 pts). |
| 45–50 | Close | Final slide: one QR to the app (stays live after the event) and to the fallback page. |

---

## 5. Flow (one person, one decision)

1. **Choose a case.** Customer-support AI rollout (Northstar Services), redesigning an open role with AI (BrightGoods), or a custom scenario.
2. **Commit before seeing AI.** The attendee writes "What would you do?" in 250 characters or fewer. This is their unaided position — private, never shown to the group, never persisted server-side (§8).
3. **One Foundry prompt agent generates three options.** It neutrally restates the decision (no recommendation) and produces exactly three distinct, realistic options, A/B/C. For a custom scenario, it first extracts the decision, the owner, the constraint and the desired outcome from the attendee's free text, then generates the three options from that.
4. **Attendee selects A/B/C.** The app also records, as a yes/no, whether the agent surfaced an option the attendee had not considered.
5. **Microsoft-Decision-1 ranks independently.** After the attendee commits to A/B/C, the app sends the same scenario and the same three options to Decision-1 with the shared rubric (§7b). It returns a probability/score per option. The attendee's selection is not included in the scoring request, so the ranking remains independent and cannot anchor the choice.
6. **Reveal and compare.** Show the attendee's selected option next to Decision-1's ranking and confidence, show the group's live A/B/C distribution once enough responses exist, then ask: **"Would you stay with your choice?"**

This is the full attendee-facing sequence — there is no additional challenge, brief-assembly or manager-review step in the MVP.

---

## 6. Cases

| Case | Scenario | Prompt | Option A | Option B | Option C |
|---|---|---|---|---|---|
| Customer-support AI rollout | **Northstar Services**, a 300-person service company. Average wait time has risen from 4 to 11 minutes. Leadership wants visible AI progress within three months. Employees have quality and job-impact concerns. Customers expect faster responses. | "What action would you take as the support manager?" | AI-first rollout: AI handles common requests, humans handle exceptions. | A controlled eight-week pilot for one request category, with human review and defined success thresholds. | Improve the knowledge base and process first, before putting AI in front of customers. |
| Redesigning an open role with AI | **BrightGoods**, a growing consumer-products business. An operations role opened up after someone left; the work is getting delayed; leaders are asking whether AI could absorb the work before they approve a replacement hire. | "What would you do before requesting permission to hire?" | Backfill the role immediately, like-for-like. | Automate selected tasks, redesign the remaining responsibilities, and hire a more specialised role. | Run a 60–90 day no-hire experiment: automate what you can and redistribute the rest, then decide. |
| Custom scenario | The attendee describes their own decision in free text. | The Foundry prompt agent first extracts the decision, the owner, the constraint and the desired outcome, then generates three options in the same A/B/C shape as above. | Generated | Generated | Generated |

Each built-in case card: the scenario context above, the fixed prompt, and the three options, shown in Greek and English. Built into the app and the fallback page; nothing printed.

---

## 7. Architecture

**Key point:** hve-squad is a *builder* toolkit (it runs in VS Code or the Copilot CLI for you). Use it to **build** the app; use a lightweight runtime to **serve** it to attendees.

**Flow:** attendee's initial action (committed, private) → **one Foundry prompt agent** normalizes the scenario and generates exactly 3 options → attendee commits to A/B/C → **Microsoft-Decision-1** independently ranks A/B/C against the fixed rubric → comparison screen and aggregate dashboard.

```
[attendee writes initial action, private, ≤250 chars]
            │
            ▼
[Foundry prompt agent — restates decision, generates exactly 3 options (A/B/C)]
            │
            ▼
[attendee commits to A/B/C]
            │
            ▼
[Microsoft-Decision-1 — independently ranks
 the same A/B/C against the fixed rubric;
 the attendee's selection is not scoring input]
            │
            ▼
[reveal + compare: attendee's pick vs. model ranking,
 group A/B/C distribution, "would you stay with your choice?"]
            │
            ▼
[aggregate dashboard — attendee view + facilitator view]
```

There is exactly one generative, conversational step (the Foundry prompt agent) and one independent, non-conversational scoring step (Decision-1). A second, challenger conversational agent is **explicitly deferred** to an optional later mode, run only after the MVP flow above is validated (§3, §8).

| | **Option 1 — Web app + Azure OpenAI / Foundry (recommended)** | **Option 2 — Web app + GitHub Copilot SDK** | **Option 3 — Copilot Studio agent** |
|---|---|---|---|
| Runtime | Server calls the Foundry prompt agent and Decision-1 per request, with structured output | SDK drives the Copilot agent loop | Low-code agent |
| Fit for ~100 anonymous individuals | ✅ Stateless, scales easily, no login | ⚠️ Built for agentic tool use; needs a Copilot subscription or BYOK, so check terms for public users and load | ⚠️ Usually needs sign-in |
| Best use | The live workshop | Richer version for later demos | Showing "what you can build in your own tenant" |

**hve-squad's role:** use `/squad` (product profile) and HVE Core's RPI and DT Coach to plan and build the app and the deck. Pin APM CLI 0.29.0; needs PowerShell 7+.

---

## 7b. Decision model (Microsoft-Decision-1)

**What it is:** a decision-scoring model in Microsoft Foundry. Given fixed options, it returns a **calibrated probability/score per option**. It supports ranking, classification, grading and structured decisions — built for routing, prioritisation and verification, not for open-ended conversation. In this app it plays exactly one role: it independently ranks the same three options the Foundry prompt agent generated, against a fixed rubric, and that ranking is withheld from the attendee until they have already committed to their own pick.

**Teaching idea: "Two kinds of AI".** One generative agent *talks* (restates the decision, generates three options). One model *scores* (ranks the same options against a rubric, with a confidence per option). The attendee commits twice before either kind of AI can influence them: once on their own unaided answer, once on their A/B/C pick, before seeing the model's ranking. The reveal is the teaching moment — not a slider the facilitator operates live, but the simple fact that two independent judgments (yours, the model's) can agree or disagree, and it's still your call.

**Shared rubric (used for every case):**
1. Expected business impact
2. Customer or employee impact
3. Implementation risk
4. Reversibility
5. Time to measurable value

The five criteria are fixed across cases; only the **weighting** changes by scenario — e.g. customer impact is weighted more heavily for the support case, workforce impact and reversibility more heavily for the hiring case. The app should make this weighting explicit in the scenario config, not hide it.

| Use in the app | Decision-1 call | What the attendee sees |
|---|---|---|
| Independent ranking | Score A/B/C against the shared rubric (scenario-specific weights) | After the attendee commits to A/B/C: "Decision-1 ranks: B 58% · A 31% · C 11%" |
| Reveal/compare | Attendee's pick vs. Decision-1's top choice | "You picked A. Decision-1 ranked B highest." plus "Would you stay with your choice?" |
| Dashboard aggregate | Aggregate of ranks and confidence across sessions | Facilitator view: average confidence, alignment rate, most common option per case |

**On stage (part of the live demo, §4):** run the Northstar Services case and show the attendee pick next to Decision-1's ranking, asking the room: "Would you act on this score? Who decides when the model and you disagree?" This replaces any live threshold-adjustment showpiece — the point is the comparison itself, not an adjustable gate.

**Caveats:** it's a relatively new capability and the benchmarks for calibration are Microsoft's own, so validate it against both case rubrics before the event. It suits well-defined, fixed-option tasks — the three generated options — rather than open-ended strategy. A visible score can anchor people, which is why it is hidden until after the attendee's own A/B/C commitment. Check region and EU data residency for the deployment.

---

## 8. GitHub Copilot build brief — "The Decision Room" (individual)

> **Copilot: build in phases; stop after each phase and summarise what you built and assumed.**

### Principles
- **One user, one session, one decision.** No rooms, teams, sharing or multiplayer features.
- **One generative agent, one scoring model.** Exactly one Foundry prompt agent drives the generative layer (restate + generate 3 options). Microsoft-Decision-1 is an independent scoring/ranking call, not a second conversational agent. No agent chain, no challenger/devil's-advocate agent, no "AI Boss" in this build.
- **No per-step agree/push-back/edit and no one-page brief.** The attendee moves through exactly the six steps in §5 (commit → 3 options → pick → independent ranking, hidden until commit → reveal/compare → stay/change). Nothing to assemble or download as a brief.
- Anonymous: no login. The attendee's free-text answers (initial commit and, where used, the custom-scenario description) are **never persisted server-side** — see the privacy rule below.
- The only shared view is the facilitator dashboard of anonymous aggregates.
- Target attendee duration: **8–10 minutes** for the core flow, run inside the 50-minute stage format in §4 — not a 15-minute own-decision walkthrough.

### Stack (default: Option 1)
- Frontend: React + Vite + TypeScript, Tailwind, mobile-first PWA, EL/EN i18n.
- Backend: Node.js + TypeScript (Fastify/Express); one endpoint for the Foundry prompt agent call, one for the Decision-1 ranking call, SSE streaming for the agent's response.
- LLM: Azure OpenAI / Foundry via env config (`MODEL_ENDPOINT`, `MODEL_DEPLOYMENT`); JSON structured output (exactly 3 options).
- Decision model: Microsoft-Decision-1 in Foundry (`DECISION_ENDPOINT`, `DECISION_DEPLOYMENT`) behind one `rank(options, rubric, weights, context)` service so it can be swapped or mocked. Check aka.ms/decision-1 for the exact schema.
- State: the attendee's free-text commit lives only in the browser (sessionStorage) and in server memory for the duration of the single request that generates the 3 options; it is never written to a database or log. Only the fields listed under "Persisted data" below go to the dashboard store.
- Hosting: Azure Container Apps or App Service. `[Choose]`

### Phase 1 — Core solo flow
- QR landing → language toggle → privacy notice ("Your written answer is never stored or shown to anyone.") → case picker: Northstar Services / BrightGoods / custom scenario.
- Commit screen: "What would you do?", max 250 characters, private, not shown again to anyone.
- For a custom scenario: the Foundry prompt agent first extracts decision, owner, constraint and desired outcome from the attendee's text before generating options.

### Phase 2 — Foundry prompt agent (generative layer)
- One prompt agent, versioned instructions, neutrally restates the decision and returns exactly 3 distinct, realistic options (A/B/C) with no recommended option and no ranking of its own.
- Prompt in `/prompts/options-agent.md`, both languages, structured JSON output `{ restatement, options: [A, B, C] }`.
- Attendee selects A/B/C; app records a yes/no: did this include an option they had not considered.

### Phase 3 — Decision-1 independent ranking
- Call Decision-1 with the same scenario and the same three options plus the shared rubric and scenario-specific weights (§7b): expected business impact, customer/employee impact, implementation risk, reversibility, time to measurable value.
- After the attendee commits to A/B/C, call Decision-1 without including the attendee's selected option in the scoring input.
- When the ranking returns, reveal the attendee's pick, Decision-1's ranked options with score/confidence per option, then ask "Would you stay with your choice?".

### Phase 4 — Aggregate dashboard
- **Attendee view** (their own session only): their original written action (shown back to them only, never to anyone else), their selected option, Decision-1's ranking, whether they matched the model's top choice, the live group A/B/C distribution, and their stay/change answer.
- **Facilitator view** (`/facilitator`, PIN): responses and completion count, option percentages per case, human/model alignment rate, changed-after-reveal rate, most common option by case, average Decision-1 confidence, and the percent who said the agent introduced an option they hadn't considered.
- Presenter mode for projector (1280×720).

### Privacy and persisted data
- Never display the attendee's original free text publicly, and never persist it server-side — not the initial commit, not the custom-scenario description.
- Persist only: an anonymous session ID, the case ID, the selected option (A/B/C), the Decision-1 ranking/scores, the stay/change response, the "introduced a new option" flag, and completion state. These are the minimum fields needed to compute every metric listed under the attendee and facilitator views above — no metric should be promised that isn't backed by one of these stored fields.

### Phase 5 — Resilience
- Load test: 120 concurrent individual sessions; under 4 s to first response from the Foundry prompt agent.
- Rate limiting, timeouts, graceful retry, low-bandwidth text mode.
- **Demo mode** (`?demo=1`): replays a pre-recorded run of the 6-step flow (commit → 3 options → pick → ranking → reveal → stay/change) from local JSON, with realistic delays. No network or model calls. Must work from the presenter laptop with Wi-Fi off (`npm run demo`).
- **Fallback page**: a static, single-file prompt sequence page (EL/EN, under 100 KB, no JavaScript framework) covering the same 6 steps as copy-paste prompts, hosted separately from the app (e.g. GitHub Pages or Azure Static Web Apps), so it survives an app outage and loads on weak mobile data.
- Content safety filter; block obvious personal data (emails, phone numbers, IDs) in the commit and custom-scenario fields with a gentle anonymise prompt.

### Acceptance criteria
- [ ] One person on a phone completes the full flow (commit → 3 options → pick → reveal → stay/change) in **8–10 minutes**, with no help from anyone else.
- [ ] Exactly one Foundry prompt agent generates exactly 3 distinct options; it never recommends one.
- [ ] Decision-1 is called only after the attendee commits to A/B/C, and the selected option is not included in the scoring request.
- [ ] Reveal screen shows the attendee's pick, Decision-1's ranking/confidence, the group's live distribution, and asks "Would you stay with your choice?".
- [ ] No free-text attendee input (initial commit or custom-scenario description) is persisted server-side or shown to anyone but the attendee themselves; only the fields listed under "Privacy and persisted data" are stored.
- [ ] Greek and English throughout.
- [ ] Survives 120 concurrent sessions in a load test.
- [ ] Demo mode runs the full flow with the network disabled.
- [ ] Fallback page is reachable on a different host and loads in under 2 s on 3G.
- [ ] No challenger/devil's-advocate agent, no "AI Boss", no per-step agree/push-back/edit, and no one-page decision brief are present in this build — those remain explicitly deferred (§3, §7).

---

## 9. Fallback plan (all digital, nothing physical)

Each level is a switch you can make in under 30 seconds without leaving the stage.

| Level | If this fails… | Switch to | Attendees still… |
|---|---|---|---|
| 0 | Nothing (plan A) | Live app on phones + live dashboard | Run their own 8–10 minute flow |
| 1 | Venue Wi-Fi is slow | Ask people to switch to mobile data (QR page is light); you use your own hotspot | Run their own 8–10 minute flow |
| 2 | Model is slow or down (the Foundry prompt agent or Decision-1) | App's built-in **backup model deployment** in a second region (env switch) | Run their own 8–10 minute flow |
| 3 | App is down | Slide with QR to the **fallback page** (separate host): the same 6 steps as copy-paste prompts for Copilot Chat or any assistant | Run the same flow in their own AI tool |
| 4 | Attendees can't get online at all | **Demo mode** on your laptop (offline replay of a full run) + facilitate: everyone answers each step in their head or notes app, show of hands at each step | Follow one case and think along |
| 5 | Your laptop / projector fails | **2–3 min recorded demo video** on a second device or USB, then talk through the slides | Watch and discuss |

**Prepare in advance**
- [ ] Confirm slot time, length, room capacity, projector input (HDMI/USB-C) and whether Wi-Fi is shared venue-wide.
- [ ] Presenter laptop with the app's demo mode installed and tested with Wi-Fi off.
- [ ] Second device (phone or tablet) with the recorded video downloaded locally, plus your own 4G/5G hotspot.
- [ ] Deck exported to PDF on a USB stick and on the second device. Backup slides contain screenshots of every app step.
- [ ] Fallback page live on a different host; QR tested from several phones.
- [ ] Backup model deployment in a second region; switch tested.
- [ ] Dry run with 10 non-technical managers working alone; time each step; also rehearse levels 3 and 4.
- [ ] Decide model and region (EU data residency); state it on the privacy screen.
- [ ] Tell the room upfront: "If the app misbehaves, that's part of the lesson: AI fails, and you stay in charge."

---

## 10. Sources

**Event**
- Skill Up Forum 2026: https://skillup.gr/

**Research**
- Lee et al. — *The Impact of Generative AI on Critical Thinking* (CHI '25): https://www.microsoft.com/en-us/research/publication/the-impact-of-generative-ai-on-critical-thinking-self-reported-reductions-in-cognitive-effort-and-confidence-effects-from-a-survey-of-knowledge-workers/
- Microsoft — Overreliance on AI literature review: https://www.microsoft.com/en-us/research/wp-content/uploads/2022/06/Aether-Overreliance-on-AI-Review-Final-6.21.22.pdf
- Microsoft — Addressing Overreliance on AI: https://www.microsoft.com/en-us/research/publication/addressing-overreliance-on-ai/
- Chiang, Lu, Li, Yin — *LLM-Powered Devil's Advocate* (IUI '24): https://mingyin.org/paper/IUI-24/devil.pdf
- Microsoft 2026 Work Trend Index — Key takeaways: https://assets-c4akfrf5b4d3f4b7.z01.azurefd.net/assets/2026/05/2026_Work_Trend_Index_Annual_Report_Key_Takeaways_050526-4_69fa647c6d8f1.pdf
- Microsoft — Guidelines for Human-AI Interaction (HAX): https://www.microsoft.com/en-us/research/project/guidelines-for-human-ai-interaction/
- EU AI Act, Article 14: https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-14
- Anthropic — Effective context engineering for AI agents: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

**Decision models**
- Microsoft-Decision-1: https://commandline.microsoft.com/microsoft-decision-1-model-foundry/ · Foundry: aka.ms/decision-1

**Build stack**
- hve-squad: https://github.com/Peter-N91/hve-squad · docs https://peter-n91.github.io/hve-squad/index.html
- HVE Core: https://github.com/microsoft/hve-core
- GitHub Copilot SDK: https://github.com/github/copilot-sdk
