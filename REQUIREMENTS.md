# Agent Deployment Template — Requirements & Product Vision

**Owner:** Shawn Gharib, Viral Tilt
**Date:** 19 July 2026
**Status:** Agreed baseline.

---

## 1. What this is

A **reusable template for deploying bespoke client agents**, owned and operated by Viral Tilt. One template repo; each new client agent is a fresh clone of it, stood up by a human driving Claude Code through a checked-in runbook. The template makes deployment #2, #3, #10 boring: same stack, same wiring, same steps — only the agent's skills, tools, and instructions differ per client.

**Deployment #1 is a proof-of-concept agent**: an agent that performs arbitrary web search through Composio's Firecrawl integration, guided by one web-research skill, answering in Slack. Simple in function, built to the exact standard a paying client's agent will be — same auth, same billing posture, same repo shape. It is the live reference the template is extracted from.

Stand-up is **human-driven and agent-assisted**: the runbook takes a fresh clone to a live skeleton agent; everything past that point (client skills, tools, instructions) is per-case work.

---

## 2. Core decisions

| # | Layer | Decision |
|---|-------|----------|
| D1 | Agent framework | **Mastra Hosted** (managed). Zero-ops runtime for every agent; self-hosting Mastra remains available later as a config change. |
| D2 | Model access | **OpenRouter, fully model-agnostic.** Any model, switchable per client and per agent. |
| D3 | Model billing | **BYOK.** Each end user brings their own key or signs into their own OpenRouter account; their model calls bill their own balance. |
| D4 | Tools | **Composio, used natively and fully.** All agent tools come through Composio's catalog and SDK — tool auth (each end user connects their own accounts), tool execution, and triggers. The full native capability is used directly. |
| D5 | Code execution | **Composio Remote Sandbox + workspace git repo, core in every deployment.** Ephemeral per-session execution in the sandbox; persistence through a dedicated git repo per agent that it clones into the sandbox, works in, and pushes back. |
| D6 | Chat surfaces | **Mastra's native integrations — Slack first.** Additional surfaces (Telegram, WhatsApp, etc.) come from the same native integration layer, plug-and-play, per client. |
| D7 | Login | **WorkOS AuthKit from day one.** Authenticates users into the deployment's onboarding surface. Client #1 onboards the same way client #20 will. |
| D8 | Storage | **Mastra Hosted holds chat history and agent memory.** The template ships storage-free; a client agent that needs app data gets it added per-case. |
| D9 | Vendor accounts | **Agency-owned.** VT owns the Mastra, Composio, WorkOS, Vercel, and GitHub accounts; each client is a project/tenant inside them. Clients pay their own model spend (D3). |
| D10 | Reusability | **GitHub template repo + Claude Code runbook.** New client = clone, then the runbook provisions and wires the skeleton to live. Per-client agent design happens after, per case. |
| D11 | Skills | **Standard `SKILL.md` files (agentskills.io), living in each client's repo.** The template ships one worked example. The standard format keeps every skill portable across frameworks. |

---

## 3. Standard anatomy of a deployment

Every client deployment produced from this template has the same shape:

1. **A cloned repo** (from this template) — agent definition, skills, config, runbook history.
2. **A Mastra Hosted project** — runs the agent loop, tool-calling, chat history/memory, and the Slack (and other-surface) integrations.
3. **OpenRouter BYOK wiring** — each end user's model calls bill their own OpenRouter account.
4. **A Composio project** — the agent's entire tool layer: end users connect their own accounts, and every tool the agent uses executes through Composio's catalog.
5. **Composio Remote Sandbox + workspace repo** — the agent's computer and persistent filesystem: sandbox session opens, workspace repo clones in, work happens, results push back.
6. **A WorkOS-authenticated onboarding surface** — where a user signs in, connects their tool accounts (Composio auth links), and sets up their OpenRouter key/sign-in. Hosted on Vercel.

---

## 4. V1 scope

1. **The PoC agent, live**: agent on Mastra Hosted — Composio Firecrawl tool wired, one web-research `SKILL.md`, answering in Slack, WorkOS-gated onboarding page, sandbox + workspace-repo pattern working, model calls billing to the connected user's own OpenRouter account.
2. **The template extraction**: the PoC generalized into a clean clonable repo — every per-client value in one config seam (names, Slack workspace, tools, models), the example skill, the sandbox/workspace wiring.
3. **The runbook**: a checked-in Claude Code skill that takes a fresh clone to "skeleton agent live in Slack" — provisioning steps, config prompts, verification checks.
4. **The stack-docs skill**: a repo-scoped skill recording where each vendor's documentation lives in LLM-accessible form, referenced explicitly during implementation of each piece.
5. **Docs**: architecture of a deployment, per-client customization guide (adding skills, tools, surfaces).

### Acceptance criteria — V1 is done when BOTH hold

1. **PoC live**: a Slack message to the agent returns a real web-search-backed answer via the Composio Firecrawl tool; the model call bills the connected user's own OpenRouter balance; the agent completes one sandbox task whose result lands in its workspace repo.
2. **Runbook re-proven**: starting from a fresh clone of the template, the runbook is executed a second time end-to-end and produces a new skeleton agent live in Slack — reusability demonstrated as fact.

---

## 5. Standing practices

1. **Pin every version.** Lockfiles committed; dependency upgrades are deliberate, recorded actions.
2. **Skills stay in the standard `SKILL.md` format** so the IP layer remains portable.
3. **BYOK is verified, not assumed.** A two-account test (operator key vs. end-user key) confirms each call bills its own key's owner before any client relies on it.
4. **Build from the docs.** Each stack piece is implemented against its vendor's current documentation via the stack-docs skill, keeping the template aligned with what the vendors actually ship.
