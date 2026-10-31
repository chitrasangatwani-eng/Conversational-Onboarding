# Conversational AI Fintech Onboarding Assistant – PRD

**Author:** Chitra Sangatwani · **Status:** Draft v2 · Oct 31, 2026 · @Chitra Sangatwani

## 1. About

Customers abandon fintech onboarding when they cannot tell what is missing, why a step failed, or what to do next. The current flow is structured but static, so support is slow and repetitive. \[Assumed: no internal funnel or support-volume data yet; see Section 2.\]

**TL;DR:** Add an optional, context-aware assistant to the existing onboarding flow. It reads verified onboarding state, explains the current step, answers a narrow set of requirements questions from approved content, resolves one confirmed high-frequency blocker, and hands off to a human with full context. Sensitive data stays in secure components outside the model. The assistant never approves anything or takes consequential action without the appropriate controls.

**Core principle:** The structured flow remains the system of record and the fallback. The assistant adds clarity; it does not replace the flow.

## 2. Market Insights

- **Market saturation:** \[To be validated. Insert the count and category of comparable digital onboarding and support-chat offerings in target markets.\]
- **Differentiation hypothesis:** Most onboarding chat tools are generic FAQ bots. \[Patterned; verify in competitor scan.\] Our differentiator is grounding in the customer's verified state and a strict action boundary, which reduces the risk of wrong or unauthorized guidance in a regulated context.

### Competitor Analysis

| Competitor type | Typical approach | Gap we target |
| --- | --- | --- |
| Generic support chatbots | FAQ retrieval, no account state | No awareness of where the customer is in onboarding |
| Fintech in-app help centers | Static articles | Customers must self-diagnose |
| Human-led chat | High quality, high cost, slow | Repetitive intake; context lost on handoff |

*Populate with verified competitor data before the roadmap review.*

### Market Analysis

&#91;Market size, customer acquisition volume, onboarding funnel drop-off rates, and support contact rate during onboarding. Insert internal funnel data here.\]

### Technology Analysis

**What AI-specific solutions are competitors leveraging?** \[Complete after competitor scan. Likely patterns: retrieval-augmented FAQ bots, scripted agent flows, and vendor-hosted conversational platforms.\]

### Customer Segments

1. **Primary:** New applicants who have started but not completed onboarding.
2. **Secondary:** Applicants who have stalled at a known blocker step.
3. **Excluded in v1:** Existing customers, non-English speakers, voice users, and proactive outreach recipients.

### User Persona: "Arjun, the Cautious First-Time Applicant"

- **Age and context:** 27–35, first financial product with this provider, mobile-first, time-constrained.
- **Goal:** Open an account in one sitting without making an error.
- **Behavior:** Reads requirements carefully, distrusts automated answers about money and identity, abandons when unsure which document is acceptable. \[Patterned; validate in customer research.\]
- **Trigger for abandonment:** A rejected or pending step with no explanation.
- **Design implication:** Show verified facts first, cite the source of every requirements answer, and make a human one tap away.

## 3. The Problem

### Use Cases

1. Understand what the current onboarding step requires.
2. Check which steps are complete, pending, or blocked.
3. Find out what to do next.
4. Confirm whether a specific document or detail is acceptable.
5. Recover from a known, frequent failure (see F4).
6. Reach a person when the case is outside the assistant's scope, without re-explaining everything.

### Pain Points

- Customers cannot see the state of their application in plain language.
- Requirements are spread across help pages and are hard to interpret.
- Failed steps show error codes without actionable next steps.
- Support handoffs force customers to repeat their details and history.
- Customers who get stuck late in the flow are the most expensive to recover.

### Problem Statement

> Arjun spends too much time working out what his onboarding is still missing and what to do about it, and he abandons the application when he cannot resolve a blocker on his own.

### Hypotheses and Mission Statement

**Main hypothesis:** By giving customers verified status, grounded answers, and a clear recovery path, we will make onboarding easier and faster to complete, and reduce avoidable human support contacts without increasing errors.

**Secondary hypotheses (to validate):**

- H1: Contextual help at the current step increases step completion versus the unaided flow.
- H2: Verified status reduces "what's next" support contacts.
- H3: Grounded answers resolve requirements questions without escalation for a majority of in-scope queries.
- H4: A single blocker-recovery flow reduces abandonment at that step.
- H5: Context-carrying handoffs reduce repeated information and handle time.

### What would make us wrong

- **Main hypothesis** is wrong if the holdout comparison shows no gain in verified completions, or no change in error rate, at the pre-agreed sample size.
- **H1 and H2** are wrong if exposed customers complete at or below the holdout rate, or "what's next" contacts do not fall.
- **H3** is wrong if self-resolution stays at or below 50%, or correct-or-abstain misses 98% on the evaluation set.
- **H4** is wrong if blocker resolution in the exposed arm is not higher than holdout.

### Premortem: most likely ways this fails

1. Customers skip the assistant and go straight to a person, so contacts do not fall.
2. Redaction misses sensitive values in free text, which pauses the pilot.
3. The eval set is too small to trust the accuracy bar, so launch decisions rest on noise.
4. Status freshness slips, and Arjun stops trusting the status view.
5. The holdout is underpowered and the team reads a small, noisy difference as success.
6. Gains come from the deterministic fixes (status, recovery, handoff), not the AI, and the team credits the assistant for them. See decision 2 in the review log.

## 4. The Solution

### Ideation

Prioritized features are in bold.

- **Structured onboarding with optional assistance**
- **Verified status and next action**
- **Grounded requirements answers**
- **One blocker-recovery flow**
- **Visible human escalation**
- **Secure collection and action boundaries**
- **Outcome instrumentation**
- Proactive reminders (deferred)
- Voice assistant (deferred)
- Multi-language support (deferred)
- Free-form account actions via chat (rejected: action risk and control boundary)
- Automated approval decisions via chat (rejected: must never imply approval)

### Leveraging AI

**Why AI is appropriate:** Customer questions are open-ended, phrased inconsistently, and often mix a requirements question with a status question. Rule-based menus fail on this variety. Language models can interpret intent and map it to the right verified source.

**Used for:** intent interpretation, plain-language explanation, retrieval-grounded answers, and summarizing context for handoff.

**Not used for:** approval or rejection decisions, identity or document verification, risk scoring, or any financial action. These remain deterministic or human-controlled.

**How AI helps our users:** It turns a confusing, multi-step, partially documented process into a conversation that reads the customer's real state, explains it in plain language, answers requirements questions from approved content, and routes exceptions to a human without making the customer start over.

### Feature Prioritization (RICE)

Score = (Reach × Impact × Confidence) / Effort. Reach is the percentage of new applicants affected per quarter; Impact, Confidence, and Effort are on a 1–10 scale. Scores are directional and will be re-estimated after the pilot.

| Feature | Reach (%) | Impact (1–10) | Confidence (1–10) | Effort (1–10) | Score | Priority |
| --- | --- | --- | --- | --- | --- | --- |
| Verified status and next action | 100 | 7 | 8 | 3 | 1,867 | P0 |
| Structured onboarding with optional assistance | 100 | 8 | 8 | 4 | 1,600 | P0 |
| Outcome instrumentation | 100 | 6 | 8 | 3 | 1,600 | P0 |
| Secure collection and action boundaries | 100 | 9 | 8 | 7 | 1,029 | P0 (gate) |
| Grounded requirements answers | 60 | 7 | 6 | 6 | 420 | P0 |
| One blocker-recovery flow | 25 | 9 | 6 | 5 | 270 | P0 |
| Visible human escalation | 20 | 6 | 7 | 4 | 210 | P0 |
| More languages, voice, proactive outreach, broader flows | Deferred | — | — | — | — | Later |

Secure collection is a gate: no other feature ships without it, regardless of score. Visible human escalation has a low reach score but is required, because every assistant-driven flow needs a safe exit. Blocker recovery has narrow reach by design, because we validate one confirmed failure before expanding.

### Feature Specifications

**F1. Structured onboarding with optional assistance (P0).** Existing steps remain fully usable without chat. A contextual help entry point appears at the current step.

- Acceptance: every step completable without the assistant; opening it does not change step state; dismissing returns the user to the exact field they left; a visible option turns assistance off for the rest of the session (the opt-out path in Risks).
- Data: `oa_help_exposed`, `oa_help_opened`, `oa_help_dismissed`, `step_completed` (with assist flag). Derived: completion rate with versus without assist exposure.

**F2. Verified status and next action (P0).** Read onboarding state through a read-only API and show each item as completed, pending, or actionable, with one next action.

- Acceptance: status matches the system of record within 60 seconds, with a last-verified timestamp shown; if state cannot be read, the assistant says so and does not guess; every next action maps to an existing flow.
- Data: `oa_status_viewed`, `oa_next_action_shown`, `oa_next_action_taken`, `oa_state_read_failed`. Derived: "what's next" contacts per 100 applicants.

**F3. Grounded requirements answers (P0).** Answer a narrow set of document and process questions (accepted ID types, address proof rules, processing timelines) from approved, versioned content. Cite the source section. If the answer is not in approved content, say so and offer a handoff.

- Acceptance: correct-or-abstain at 98% or higher on the evaluation set (governing bar; see Section 8); every answer shows source document and version date; no answers about fees, rates, eligibility decisions, or approval likelihood.
- Data: `oa_question_asked` (intent code, no raw text), `oa_answer_returned`, `oa_answer_abstained`, `oa_answer_feedback`. Raw conversation text lives only in the restricted conversation store, with retention and redaction.

**F4. One blocker-recovery flow (P0).** Select one confirmed, frequent failure (candidate: document image-quality rejection at the identity-document step, to be confirmed against failure logs). Provide permitted next steps: retake guidance, accepted-document checklist, and a retry path. No changes to verification outcomes.

- Acceptance: reachable only when the blocker is verified in F2; each step is Compliance-approved; the assistant cannot override or promise a re-review outcome.
- Data: `oa_blocker_detected`, `oa_recovery_started`, `oa_recovery_step_completed`, `oa_blocker_resolved`, `oa_blocker_unresolved`.

**F5. Visible human escalation (P0).** A "Talk to a person" option at every assistant state. The handoff carries a structured summary: current step, verified status snapshot, intent codes, redacted last message, blocker code, and actions already attempted. Show real queue status (for example, "Position in queue: 3, estimated wait: 8 minutes").

- Acceptance: handoff within two taps; agent receives the summary before the first message; sensitive fields are excluded and only a reference is passed.
- Data: `oa_escalation_requested`, `oa_escalation_context_sent`, `oa_escalation_status_shown`, `oa_escalation_connected`, `oa_escalation_resolved`. Derived: repeated-question rate on handoff.

**F6. Secure collection and action boundaries (P0, gate).** Sensitive inputs (ID numbers, bank details, documents, selfies) are collected only in dedicated secure components. The assistant never displays, repeats, or logs sensitive values, and never states or implies approval unless the system of record says so. Consequential actions (submission, resubmission, upload, consent) require customer-initiated confirmation through the standard UI.

- Acceptance: zero sensitive values in model context, logs, or analytics; zero outputs implying an unrecorded approval; every consequential action has a documented confirmation step.
- Data: `oa_sensitive_component_opened`, `oa_sensitive_component_completed`, `oa_guardrail_triggered`, `oa_consequential_action_confirmed`. No field values in any event.

**F7. Outcome instrumentation (P0).** A versioned event schema recording assistance exposure, blocker type, resolution, completion, and escalation, using pseudonymous identifiers and no free text.

- Acceptance: a 10% holdout group with no assistant exposure; dashboard compares completion, time to complete, escalation, and blocker resolution for exposed versus holdout users; Privacy sign-off before pilot launch.
- Data: `oa_experiment_assigned` (arm, cohort ID), journey events with consistent `session_id`, `step_id`, and `arm`, and `onboarding_completed` / `onboarding_abandoned`.

### Later (not in v1)

More languages, voice interface, proactive outreach, and broader flows. Each item becomes eligible only after the narrow use case shows a statistically meaningful benefit against holdout, sustained for a defined period, with no increase in guardrail triggers or sensitive-data incidents.

### AI MVP

**How the model works (high level):**

1. **Intent interpretation:** Before the model sees it, a deterministic redaction step removes sensitive patterns such as ID, card, and account numbers. The model then classifies the redacted message into an approved intent set (status question, requirements question, blocker help, handoff request, out of scope).
2. **Verified context retrieval:** For status intents, the system reads onboarding state through the read-only API. The model receives only the fields it needs, never sensitive values.
3. **Grounded answering:** For requirements intents, the system retrieves passages from the approved, versioned content store. The model answers only from retrieved passages and cites them. If retrieval confidence is low, it abstains.
4. **Guardrails:** Input and output checks for sensitive data, prohibited topics, and implied decisions. Failed checks route to a safe fallback.
5. **Action boundary:** The model can suggest a next action but cannot execute one. Execution happens through the standard UI, initiated by the customer.
6. **Handoff summarization:** A deterministic template fills the structured summary from permitted fields only; model-generated free text is restricted.

**Techniques (high level):** Retrieval-augmented generation over approved content, intent classification, output guardrails, and confidence-based abstention. Model choice and fine-tuning belong to the Science team.

### Roadmap

| Phase | Timing | Scope | Exit criteria |
| --- | --- | --- | --- |
| Phase 0: Foundations | Weeks 0–4 | F6 secure boundaries, F7 instrumentation, holdout design, content approval process, Privacy review | Guardrail tests pass; event schema approved; content owner named; state API and redaction available (or Phase 1 re-scoped) |
| Phase 1: Status and Guidance | Weeks 4–8 | F1 contextual entry point, F2 verified status, F3 grounded answers (limited topic list) | Correct-or-abstain target met on eval set; status freshness SLA met; moderated usability test passed on journeys 1–5 with first-time applicants |
| Phase 2: Recovery and Handoff | Weeks 8–12 | F4 single blocker flow, F5 visible escalation | Blocker resolution measured against holdout; handoff context accepted by agents |
| Phase 3: Pilot and Review | Weeks 12–14 (pilot length to be set) | Shadow test, controlled pilot (5% exposure), analysis against success criteria; go, iterate, or stop | Decision memo approved by stakeholders |
| Later | After Phase 3 | Languages, voice, proactive outreach, broader flows | Entry criteria met |

*Timings are relative to project start and assume Phase 0 dependencies are staffed.*

### Technical Architecture (High Level)

1. **Client (mobile and web):** Renders onboarding steps, the assistant panel, and secure collection components. Secure components send sensitive data directly to the Identity/Document service, bypassing the assistant.
2. **Assistant service (server):** Orchestrates intent classification, retrieval, answer generation, guardrails, and handoff summaries. Receives only minimal, permitted context.
3. **Onboarding state API (read-only):** Source of truth for step and status. Returns status codes and item states, not sensitive values. A 60-second freshness target requires either events or short-lived caching; Engineering to confirm which.
4. **Approved content store:** Versioned requirements documents with owners and review dates.
5. **Model provider:** Receives sanitized prompts and retrieved passages only. Data handling terms to be confirmed by Legal and Security.
6. **Handoff service:** Creates support tickets or queue entries with the structured summary, and exposes queue status to the client.
7. **Analytics pipeline:** Accepts only schema-approved events; redaction and pseudonymization applied at ingestion.
8. **Conversation store:** Restricted access, encrypted, with a defined retention period.

**Data flow:** Client → Assistant service (redacted message, minimal state) → Onboarding state API and content store (read) → Model provider (sanitized prompt) → Assistant service (guardrails) → Client. Escalation: Assistant service → Handoff service → Support tooling. Events: Client and services → Analytics pipeline (redacted).

**Security boundary:** Sensitive data never crosses from secure components into the assistant service or the model provider.

*Software Engineers and Scientists will produce the detailed design document.*

### Assumptions and Constraints

**Assumptions:**

- A read-only onboarding state API exists or can be built within Phase 0.
- Approved requirements content exists or can be produced and owned by Operations or Compliance.
- Failure logs can confirm one blocker with sufficient frequency for Phase 2.
- Support tooling can accept a structured handoff payload.
- Legal confirms the assistant's disclosure language and consent requirements. Phase 0 is four weeks, which assumes the read-only state API and the redaction component are built or already in progress; if not, Phase 1 slips.

**Constraints:**

- Sensitive data cannot enter model context, logs, or analytics. Customer free text is redacted before it reaches the model. If redaction fails or cannot classify a message, the message is not sent to the model; the customer is routed to the standard flow or a person.
- The assistant cannot make, imply, or change any approval or verification decision.
- All consequential actions require customer-initiated confirmation through the standard UI.
- Launch is limited to one language and the in-scope topic list.
- Data residency and model-provider terms must satisfy applicable regulations; exact requirements to be confirmed.

### Risks and Mitigation

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Model gives an incorrect requirements answer | Medium | High | Correct-or-abstain design; approved content only; eval set gate; source citation on every answer |
| Assistant implies an approval decision | Low | Very high | Output guardrail; prohibited-phrase and state-consistency checks; decision-adjacent prompts in eval set |
| Sensitive data leaks into prompts, logs, or analytics | Low | Very high | Secure components outside assistant path; automated redaction tests; schema review; sampling audits |
| Status displayed is stale | Medium | Medium | Freshness SLA; timestamp shown; fallback message when state cannot be read |
| Customers prefer human support and ignore the assistant | Medium | Medium | Holdout measurement; handoff in two taps; no forced flows |
| Handoff summary is incomplete or includes sensitive content | Medium | High | Deterministic template; field allowlist; agent acceptance review |
| Blocker recovery promises an outcome the company cannot guarantee | Low | High | Scripted, Compliance-approved language; no re-review promises |
| Model provider outage or latency | Medium | Medium | Timeout to static help and handoff; degrade gracefully to unaided flow |
| Regulatory or consent issues with AI disclosure | Medium | High | Legal review before pilot; clear AI labeling; opt-out path |
| Overreliance on pilot results for broad rollout | Medium | Medium | Staged rollout; Later items gated by explicit criteria |

## 5. Requirements

### User Journeys

1. **Stuck at a step:** Customer opens help → assistant reads current step → explains requirements → customer proceeds or asks a follow-up.
2. **Checking progress:** Customer asks "what's left?" → assistant shows verified status and one next action → customer takes it.
3. **Requirements question:** Customer asks whether a document is accepted → assistant answers from approved content with source → customer uploads or asks for a person.
4. **Blocker:** Verification fails with a confirmed reason → assistant shows recovery checklist → customer retries or escalates.
5. **Escalation:** Customer asks for a person, or the assistant cannot help → structured handoff with visible queue status → agent continues without repeated questions.
6. **Sensitive input:** Customer reaches an ID or bank step → secure component handles input → assistant only confirms status, never the value. If a customer types a sensitive value into chat, the assistant does not repeat or store it and directs them to the secure component.

### Functional Requirements

- **FR1:** Display the current step with optional contextual help.
- **FR2:** Read verified onboarding state and display completed, pending, and actionable items with one next action.
- **FR3:** Answer requirements questions within the approved topic list, with source citation and version date.
- **FR4:** Abstain and offer handoff when an answer is out of scope or retrieval confidence is low.
- **FR5:** Provide one confirmed blocker-recovery flow, available only when the blocker is verified.
- **FR6:** Offer human handoff at all assistant states, with structured context and real queue status.
- **FR7:** Route all sensitive inputs to secure components.
- **FR8:** Require customer-initiated confirmation for consequential actions.
- **FR9:** Emit schema-approved events for exposure, blockers, resolution, completion, and escalation.
- **FR10:** Maintain a holdout group with no assistant exposure.
- **FR11:** Allow the assistant to be disabled instantly through a feature flag without affecting the core flow.

**Why algorithms are needed:** Intent classification and retrieval map varied phrasing to the right verified source. Confidence scoring lets the assistant abstain rather than guess. These behaviors make the assistant trustworthy in a regulated context.

### Non-Functional Requirements

- **Performance:** First response p95 ≤ 2 seconds for status intents; ≤ 4 seconds for grounded answers. Redaction and guardrails sit inside these budgets; Engineering to publish the per-stage latency breakdown in the design doc.
- **Availability:** Assistant 99.9% monthly. The core onboarding flow must not depend on assistant availability.
- **Scalability:** Support pilot volume with 3x headroom; scale plan documented before Phase 2.
- **Security:** Encryption in transit and at rest; least-privilege access to the conversation store; penetration test before pilot.
- **Privacy:** Data minimization; defined retention; deletion on request within regulatory timelines.
- **Accessibility:** WCAG 2.2 AA for the assistant panel and secure components. Assistant replies are announced to screen readers as they arrive, and the handoff action is reachable by keyboard.
- **Auditability:** Log every consequential action trigger and guardrail event with a traceable ID.
- **Observability:** Dashboards for guardrail triggers, abstention rate, handoff rate, and status read failures.
- **Usability:** Assistant dismissible in one tap; no step blocked behind a chat interaction.

### AI & Data Requirements

**Data sources:** Onboarding state API (status codes, step IDs, timestamps); approved requirements content (versioned, with owners and review dates); failure and blocker logs; historical support tickets (de-identified); analytics events (F1–F7).

**Data types:** Structured (step states, status codes, event records); unstructured (requirements documents, restricted conversation text, de-identified ticket text).

**Collection and management:**

- Content ownership: each document has a named owner, review cadence, and version control.
- Eval dataset: built from de-identified historical questions, labeled by intent and correct answer or abstention. Refreshed quarterly.
- Conversation data: restricted store, redacted, retained per policy; used for quality review only, with access logging.
- Data labeling: performed by trained reviewers under Privacy-approved guidelines.
- Deletion: process to honor requests across the conversation store and pseudonymous analytics identifiers.

## 6. Challenges

**Will we have enough data?**

- The eval set requires several hundred de-identified, labeled questions. Set a minimum size per intent so the 98% bar has a usable confidence interval; a rate near 98% on a few hundred items is still uncertain. \[Confirm availability from support history.\]
- Blocker frequency must be confirmed from failure logs before the Phase 2 commitment.
- Holdout sizing must be validated against expected effect size; the pilot may be underpowered for small effects.

**How do we acquire it?** Historical support tickets (de-identified), content owners' existing documentation, and a labeled review sprint in Phase 0.

**Do we have enough funds?** \[To be confirmed by Finance: model usage costs at pilot volume, labeling, engineering, and Compliance review.\]

**Do we have enough user conviction?**

- Customer research should confirm that clarity and handoff are the top onboarding needs. \[Insert research findings or plan.\]
- Stakeholder conviction depends on the pilot's holdout comparison. A clear go/no-go criterion must be agreed before launch.

**Key open tension:** The assistant must be helpful enough to be used and constrained enough to be trusted. The grounded, abstain-by-default design accepts lower coverage in exchange for higher trust.

## 7. Positioning

| Use Case | Pain Point | Possible Solutions | Impact of Solution |
| --- | --- | --- | --- |
| Understanding current status | Customers can't tell what's missing | Verified status and next action | Fewer "what's next" contacts; faster progression |
| Checking requirements | Requirements are scattered and hard to interpret | Grounded answers with citations | Self-service resolution; fewer repeat questions |
| Recovering from a failed step | Errors lack actionable next steps | One blocker-recovery flow | Higher blocker resolution; less abandonment |
| Getting help beyond the assistant | Handoffs force customers to repeat themselves | Visible escalation with structured context | Lower handle time; better customer experience |
| Completing sensitive steps safely | Fear of misplacing sensitive data or receiving wrong guidance | Secure components and strict action boundaries | Trust retained; compliance maintained |

## 8. Measuring Success

### Product Metrics

| Metric | Definition | Direction | Pilot target (set after baseline) |
| --- | --- | --- | --- |
| Onboarding completion rate | Completed ÷ started, exposed vs holdout | ↑ | +\[X\] pts vs holdout |
| Time to complete | Median minutes from start to completion | ↓ | −\[X\]% vs holdout |
| Step-level abandonment | Abandonment at each step | ↓ at target steps | Defined per step |
| "What's next" contact rate | Support contacts per 100 applicants citing status | ↓ | −\[X\]% |
| Escalation rate | Handoffs ÷ assistant sessions | Monitor | Within range set with Operations |
| Repeat-question rate on handoff | Agent-reported repeated questions | ↓ | −\[X\]% |
| Blocker resolution rate | Resolved ÷ detected, for the selected blocker | ↑ | +\[X\] pts vs holdout |
| Retention of assisted customers | 30-day post-onboarding activity | ≥ holdout | Non-inferior |

**Added in review (proposed, to confirm before the roadmap review):**

- **Application error rate:** failed verification or validation attempts, including resubmissions, ÷ submissions, exposed vs holdout. Launch bar: no worse than holdout. This tests the "without increasing errors" clause of the main hypothesis.
- **Requirements self-resolution rate:** in-scope requirements questions answered without a handoff ÷ in-scope requirements questions. Target: above 50%, which tests H3.

### AI-Specific Metrics

**What does quality mean from a strategic perspective?** Quality means the assistant gives correct, grounded answers or honestly abstains, never implies decisions it cannot make, and never mishandles sensitive data. Speed and engagement matter only after those conditions hold.

| Metric | Definition | Launch bar |
| --- | --- | --- |
| Grounded accuracy | Correct answers ÷ in-scope answered questions (eval set) | Diagnostic (governed by correct-or-abstain) |
| Correct-or-abstain rate | Correct answers or appropriate abstentions ÷ in-scope questions | ≥ 98% |
| Unsupported-claim rate | Answers without retrievable source ÷ answers | 0% on eval set |
| Guardrail miss rate | Unsafe outputs passed through ÷ unsafe test prompts | 0 on the full adversarial test suite; any production occurrence halts the assistant |
| Sensitive-data leakage | Sensitive values found in logs, prompts, or analytics | 0 (automated and sampled) |
| Abstention precision | Correct abstentions ÷ total abstentions | ≥ 90% |
| Status accuracy | Status shown matching system of record ÷ sampled checks (sample size to be set) | ≥ 99.5% |
| Handoff context completeness | Handoffs with required fields ÷ total handoffs | ≥ 98% |
| Handoff acceptance | Agent-rated usefulness of summary | ≥ target set with Operations |

**Quality gate:** The assistant advances to a broader pilot only when every launch bar is met on the eval set and in a staged shadow test, and no open guardrail incidents remain.

### North Star Metric

**Verified onboarding completions per 100 new applicants, measured against holdout.** This measures what the business wants (customers who finish onboarding correctly) and credits the assistant only against a control. Supporting inputs: completion rate, time to complete, and blocker resolution.

## 9. Launching

### Stakeholders & Communication

| Stakeholder | Interest | Communication |
| --- | --- | --- |
| Product (Chitra Sangatwani) | Scope, outcomes, roadmap | Weekly progress; phase reviews |
| Compliance and Legal | Permitted actions, disclosures, content approval | Pre-launch review; monthly guardrail review |
| Privacy and Security | Data minimization, access, retention | Schema review before each change; pen test sign-off |
| Engineering and Science | Architecture, eval, model behavior | Daily standups; eval results per iteration |
| Operations and Support | Handoff quality, queue impact, content ownership | Handoff feedback loop; pilot reviews |
| Finance | Usage costs, labeling budget | Monthly cost review |
| Customers | AI disclosure, control, how to reach a person | In-product labeling; help content; feedback option |

**Internal cadence:** Weekly status, biweekly metrics review, and a phase-gate decision memo.

**Customer communication:**

- Label the assistant clearly as AI.
- Explain what it can and cannot do, in one line, at first use.
- Provide a visible path to a person at all times.
- Provide feedback controls on answers.
- Notify customers of material changes to assistant behavior where policy requires it.

### Roll-out Strategy

1. **Internal dogfood:** Staff complete onboarding with the assistant on test accounts (Phase 1 exit).
2. **Shadow test:** Assistant generates responses for real sessions without showing them, to check quality and guardrails.
3. **Controlled pilot:** 5% of new applicants exposed, with a 10% holdout that never sees the assistant, limited to in-scope topics and the single blocker flow.
4. **Expansion:** 25%, then 50% exposure, if launch bars hold and no guardrail incidents occur.
5. **Decision point:** Go, iterate, or stop, based on pre-agreed criteria.

**Kill switch:** Disable the assistant instantly by feature flag. The core flow continues unaffected.

**Strategic considerations:**

- Regulatory review must be complete before any customer-facing exposure.
- Support staffing must be ready for handoff volume at each expansion step.
- The pilot should avoid peak onboarding periods that would confound the holdout comparison.

## Open Items Before Review

1. Market and competitor data (Section 2).
2. Onboarding baseline metrics for completion, abandonment, and "what's next" contacts.
3. Confirmed blocker selection from failure logs (F4).
4. Approved requirements content and named owners (F3).
5. Model-provider data handling terms, data residency, and retention windows (Privacy, Legal).
6. Customer research findings or plan (Section 6).
7. Budget for model usage, labeling, and review (Finance).
8. Regulatory disclosure requirements for AI-assisted onboarding (Legal).
9. Go/no-go criteria agreed with stakeholders before pilot start.
10. Contributor names for Compliance, Engineering, Design, Operations, and Data Science.

## Review log and decisions needed

**Four-lens review (PM Twin, CTO, UX Lead, Evals Lead). Changes made in this revision:**

- **Hypotheses:** added falsification criteria and a premortem.
- **Evidence:** tagged unverified claims (abandonment cause, support volume, competitor pattern, persona behavior) as Assumed or Patterned.
- **Accuracy:** correct-or-abstain (98% or higher) is the governing F3 bar; grounded accuracy is now diagnostic only. Pending team confirmation.
- **Evals:** eval set needs a minimum size per intent; zero-tolerance guardrail metrics are measured on an adversarial test suite, and any production occurrence halts the assistant; status accuracy needs a sample size.
- **Safety:** redaction fails closed, so an unclassified message is never sent to the model.
- **Feasibility:** Phase 0 exit requires the state API and redaction to be available or Phase 1 re-scoped; latency budget and freshness mechanism flagged for Engineering.
- **UX:** last-verified timestamp on status, opt-out path in F1, sensitive-input journey, screen-reader announcements, usability testing before pilot.

**Decisions needed:**

1. Confirm correct-or-abstain at 98% as the governing F3 bar (PM, Evals).
2. Decide whether to add a non-AI arm (structured status and recovery without chat) so gains can be attributed to the assistant (PM Twin, Marily).
3. Confirm the redaction approach and its false-negative tolerance (CTO, Privacy).
4. Set the pilot length and sample sizes for the holdout and status checks (Data Science, Finance).
5. Confirm which P0 features are needed for the first pilot read; seven features are currently P0 (PM).
6. Define the usability test plan and participant count (UX).
