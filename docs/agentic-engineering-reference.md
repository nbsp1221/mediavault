# Agentic Engineering Reference

Status: Reference note  
Last reviewed: 2026-05-13  
Purpose: Preserve current external guidance on agentic engineering, coding-agent harnesses, and software fundamentals for future work in this repository.

## How To Use This Document

Use this document when planning agent-assisted work in Mediavault, especially when deciding:

- whether a task is suitable for an agent
- whether a change needs a tighter feedback loop
- whether a task should be decomposed into a smaller vertical slice
- whether code must be read line-by-line by a human before handoff
- whether the existing verification contract is enough
- whether browser, runtime, Docker, or data-integrity checks are required

This document intentionally separates three concerns:

- Agent runtime harness: tools, state, sandboxing, approvals, tracing, handoffs, and evals.
- Codebase harness: architecture, deep modules, tests, ubiquitous language, and feedback loops.
- Human control: task suitability, critical-code review, generated-code review limits, and refusal to delegate important decisions blindly.

Direct quotation excerpts are kept short. Longer guidance is recorded as source-grounded operational notes to avoid misquoting or over-quoting external material.

## Core Position

The strongest shared lesson across the reviewed sources is not that one specific coding agent, SDK, or editor setup is essential. The stronger conclusion is:

- Agents work best inside clear constraints.
- Agents need fast, objective feedback loops.
- Agents amplify the quality of the codebase they operate in.
- Bad architecture makes agents produce bad code faster.
- Tool permissions and sandboxing matter, but they do not replace software design.
- Critical code still needs human understanding.

For this repository, Claude Code settings are implementation details. The more durable harness is the combination of:

- Clean Architecture boundaries in `app/modules/*`
- route thinness in `app/routes/*`
- server dependency assembly in `app/composition/server/*`
- FSD-lite frontend slices
- strict TypeScript
- hermetic test input rules
- browser smoke tests
- Docker/runtime readiness checks
- data-integrity verification
- domain-specific architecture documents

## Reference 1: OpenAI Reasoning Models And Agent Workflows

Source: OpenAI, "Using GPT-5.5", section "Using reasoning models"  
URL: https://developers.openai.com/api/docs/guides/latest-model#using-reasoning-models

Direct excerpt:

> "Put most tool-specific guidance in the tool descriptions themselves"

Operational notes for this repository:

- Do not hide tool policy only in a global prompt or a general agent instruction.
- Verification commands should carry specific semantics:
  - `bun run check`: base completion authority.
  - `bun run verify:e2e-smoke`: browser-visible owner-flow smoke gate.
  - `bun run verify:data-integrity`: storage and media-artifact integrity gate.
  - `bun run verify:docker-compose-smoke`: production readiness and Docker preflight gate.
- Tool descriptions should state:
  - when the command is required
  - whether it is safe to retry
  - what side effects it has
  - what failure usually means
  - whether it depends on Docker, browser tooling, media binaries, or temporary runtime state
- Stable context should be kept at the start of prompts and dynamic task context near the end when using prompt-caching-aware systems.
- Long-running work should preserve:
  - completed actions
  - assumptions
  - IDs and file paths
  - tool outcomes
  - unresolved blockers
  - next concrete goal

Repository implication:

- `docs/verification-contract.md` already behaves like a tool policy document.
- A future improvement would be `scripts/select-verification.ts`, which maps changed files to required verification commands.

## Reference 2: OpenAI Agents SDK

Source: OpenAI, "Agents SDK"  
URL: https://developers.openai.com/api/docs/guides/agents

Direct excerpt:

> "Agents are applications that plan, call tools, collaborate across specialists"

Operational notes for this repository:

- Use an Agents SDK-style mental model only when the application owns orchestration, tool execution, approvals, and state.
- A simple model API call is enough when the task only needs a short answer and no durable workspace.
- Use agent orchestration only when the workflow actually needs:
  - stateful multi-step execution
  - tool routing
  - file or shell access
  - approval pauses
  - specialist handoffs
  - traceability
  - resumability
- Prefer one capable agent first. Split into specialists only when a single agent has too much instruction complexity or tool ambiguity.

Repository implication:

- Mediavault currently needs agentic assistance for development, not product runtime.
- The product itself should not gain agent runtime complexity unless a concrete owner workflow justifies it.
- Development agents should follow repository contracts rather than inventing new orchestration inside application code.

## Reference 3: OpenAI Tools In Agents SDK

Source: OpenAI, "Using tools", section "Usage in the Agents SDK"  
URL: https://developers.openai.com/api/docs/guides/tools#usage-in-the-agents-sdk

Direct excerpt:

> "Keep shell, apply patch, and computer-use harnesses in your runtime"

Operational notes for this repository:

- Shell, patch, browser, and computer-use tools are not optional decorations for coding-agent work.
- They are the execution plane that lets the agent inspect, change, and verify real behavior.
- If a manager agent needs to preserve control over the user-facing answer, expose a specialist as a tool rather than handing off ownership permanently.
- If a specialist owns a whole slice of work, handoff can be appropriate.

Repository implication:

- For code changes, the useful harness is:
  - shell for search and verification
  - patch editing for controlled changes
  - Playwright/browser tools for rendered behavior
  - Docker for runtime-sensitive parity
- For review-only tasks, specialist agents should return findings rather than modify files.

## Reference 4: OpenAI Sandbox Agents

Source: OpenAI, "Sandbox Agents"  
URL: https://developers.openai.com/api/docs/guides/agents/sandboxes

Direct excerpt:

> "The key split is the boundary between the harness and compute."

Operational notes for this repository:

- Harness means:
  - model loop
  - tool routing
  - approvals
  - tracing
  - recovery
  - run state
  - policy decisions
- Compute means:
  - filesystem changes
  - shell commands
  - package installs
  - test servers
  - previews
  - snapshots
  - mounted data
- Keep sensitive control-plane logic outside the sandbox when possible.
- Treat workspace manifests as fresh-session contracts, not as the full source of truth for live work.
- Do not put secrets in prompts, task files, committed manifests, or generated artifacts.

Repository implication:

- `verify:ci-worktree:docker` already approximates this split:
  - host repository remains controlled
  - dirty worktree can be tested in a container
  - root-owned build artifacts should not leak back into the host checkout
- Playwright hermetic smoke already uses a temporary runtime workspace for storage and SQLite state.
- A stronger future agent harness would store per-run artifacts under an ignored directory such as:

```text
.agent-runs/
  <run-id>/
    task.md
    plan.md
    changes.md
    verification.md
    trace.jsonl
    artifacts/
```

## Reference 5: OpenAI Guardrails And Human Review

Source: OpenAI, "Guardrails and human review"  
URL: https://developers.openai.com/api/docs/guides/agents/guardrails-approvals

Direct excerpt:

> "Use guardrails for automatic checks and human review for approval decisions."

Operational notes for this repository:

- Use automatic checks for:
  - lint
  - typecheck
  - unit tests
  - integration tests
  - smoke tests
  - data-integrity checks
  - Docker readiness checks
- Use human approval for:
  - destructive storage changes
  - migration cleanup
  - deletion of runtime data
  - deployment changes
  - secret handling
  - broad architecture changes
  - critical security behavior
- Put validation close to the tool or action that creates the side effect.
- Do not rely only on a global instruction that says "be careful."

Repository implication:

- The current docs already require explicit escalation for storage, auth, playback, browser-visible, and runtime-sensitive changes.
- The missing part is mechanical enforcement around risky commands and changed-file detection.

## Reference 6: OpenAI Observability And Agent Evals

Sources:

- OpenAI, "Integrations and observability"  
  URL: https://developers.openai.com/api/docs/guides/agents/integrations-observability
- OpenAI, "Evaluate agent workflows"  
  URL: https://developers.openai.com/api/docs/guides/agent-evals

Direct excerpts:

> "Tracing is built into the Agents SDK"

> "Start with traces when you are still debugging behavior"

Operational notes for this repository:

- One-off agent success is not enough.
- A useful run record should show:
  - what the task was
  - what context was read
  - which files changed
  - which tests ran
  - which tests were skipped
  - which assumptions were made
  - which risks remain
- Move from trace inspection to repeatable evals only after the behavior is stable enough to score.

Repository implication:

- Current verification output is strong, but agent run observability is weak.
- Future work should add a lightweight run log convention for agent-assisted changes.

## Reference 7: Anthropic Building Effective Agents

Source: Anthropic, "Building effective agents"  
URL: https://www.anthropic.com/engineering/building-effective-agents

Direct excerpt:

> "simple, composable patterns rather than complex frameworks"

Operational notes for this repository:

- Do not introduce a heavyweight agent framework into the application unless product requirements demand it.
- Prefer simple loops:
  - inspect
  - plan
  - change
  - verify
  - report
- Prefer composable tools and narrow workflows over large autonomous flows.
- Use agents for workflows where traditional deterministic automation is insufficient, not for every task.

Repository implication:

- The existing verification contract is more valuable than a new agent framework.
- Keep agent workflow rules close to repository-specific commands and architecture boundaries.

## Reference 8: Claude Code Subagents

Source: Claude Code Docs, "Create custom subagents"  
URL: https://code.claude.com/docs/en/subagents

Direct excerpt:

> "Subagents are specialized AI assistants that handle specific types of tasks."

Operational notes for this repository:

- Subagents are useful for context isolation, not just parallel speed.
- Use subagents when a side task would flood the main conversation with:
  - search results
  - logs
  - file contents
  - review findings
  - exploratory dead ends
- Good subagent tasks are bounded and produce concise outputs.
- Do not delegate the immediate critical-path task if the main agent is blocked on its result.

Repository implication:

- Good specialist candidates:
  - playback reviewer
  - auth/security reviewer
  - data-integrity reviewer
  - browser QA reviewer
  - architecture-boundary reviewer
- These specialists should mostly be read-only unless they own a clearly disjoint file set.

## Reference 9: Claude Code Settings And Hooks

Sources:

- Claude Code Docs, "Settings"  
  URL: https://code.claude.com/docs/en/settings
- Claude Code Docs, "Hooks reference"  
  URL: https://docs.anthropic.com/en/docs/claude-code/hooks

Direct excerpts:

> "settings.json is the official mechanism for configuring Claude Code"

> "Hooks can modify, delete, or access any files"

Operational notes for this repository:

- Claude Code settings are a tool-specific implementation detail, not the whole harness.
- Shared project settings can help encode:
  - allowed commands
  - denied sensitive reads
  - tool access
  - project-level defaults
- Hooks are powerful but dangerous because they execute shell commands.
- Hooks should be small, testable, and defensive.
- Hook inputs must be validated and shell variables quoted.
- Hooks should not read secrets or mutate broad paths.

Repository implication:

- It is acceptable that the durable repository harness lives mostly in docs and scripts rather than `.claude/*`.
- If hooks are added later, they should enforce existing contracts, not create hidden behavior.

## Reference 10: Claude Agent SDK And MCP

Source: Claude Code Docs, "Connect to external tools with MCP"  
URL: https://code.claude.com/docs/en/agent-sdk/mcp

Direct excerpt:

> "You can configure MCP servers in code"

Operational notes for this repository:

- MCP should be added deliberately.
- Read-heavy MCP tools are safer first candidates:
  - docs
  - issue trackers
  - PR metadata
  - search
- Write-capable MCP tools need:
  - explicit allowlists
  - audit logs
  - approval gates
  - scoped credentials
  - clear ownership
- Connection failures should be detected before the agent begins work.

Repository implication:

- Avoid giving an agent direct database or storage mutation tools until authorization and audit boundaries are explicit.
- Prefer routing mutations through existing app commands, APIs, tests, and verification scripts.

## Reference 11: Model Context Protocol Specification

Source: Model Context Protocol, "Specification"  
URL: https://modelcontextprotocol.io/specification/latest

Direct excerpt:

> "Tools represent arbitrary code execution"

Operational notes for this repository:

- MCP tools are not inherently trusted.
- Tool descriptions from untrusted servers should not be treated as authoritative.
- Users should understand data access and operations before authorizing them.
- Hosts need explicit consent, authorization, access controls, and privacy boundaries.
- MCP is a protocol foundation, not a complete production safety layer.

Repository implication:

- If Mediavault ever exposes MCP tools, each tool should map to an existing application use case or read model.
- Do not expose raw filesystem, raw SQLite, encryption keys, or media artifact mutation as general-purpose tools.

## Reference 12: Matt Pocock, Software Fundamentals Matter More Than Ever

Sources:

- YouTube: "Software Fundamentals Matter More Than Ever"  
  URL: https://youtu.be/v4F1gFy-hqg
- SummYT summary  
  URL: https://summyt.app/summaries/technology/software-fundamentals-matter-more-than-ever-matt-pocock-v4F1gFy-hqg
- Stefan Christoph write-up  
  URL: https://schristoph.online/blog/software-fundamentals-matter-more/

Direct excerpt from the secondary write-up:

> "Bad code is the most expensive it’s ever been"

Operational notes for this repository:

- The central lesson is that AI does not make software fundamentals obsolete.
- AI makes architecture, naming, tests, and module boundaries more important because agents build on the structure they see.
- "Specs to code" without code review or design ownership increases entropy.
- Shared design concepts matter before implementation.
- Ubiquitous language reduces confusion between humans, domain concepts, code, and agents.
- TDD keeps the agent inside a small feedback loop.
- Deep modules let a human design the interface and let an agent work inside the boundary.
- Shallow modules increase cognitive load and make agents chase scattered dependencies.

Repository implication:

- Mediavault is already aligned with this direction through:
  - bounded contexts
  - Clean Architecture
  - route thinness
  - application use cases
  - strict tests
  - verification contracts
- Missing improvement:
  - a repository-specific ubiquitous language document
  - a critical module map
  - a clearer distinction between interface design and delegated implementation

Recommended file:

```text
docs/ubiquitous-language.md
```

Initial terms to include:

- site viewer
- shared-password auth
- protected page session
- protected API session
- staged upload
- commit to library
- canonical video metadata
- playback token
- ClearKey license
- media asset
- thumbnail envelope
- runtime workspace
- hermetic fixture
- owner flow

## Reference 13: Mario Zechner, Building pi In A World Of Slop

Sources:

- YouTube: "Building pi in a World of Slop"  
  URL: https://youtu.be/RjfbvDXpFls
- YouTLDR transcript  
  URL: https://you-tldr.com/transcript/RjfbvDXpFls
- Datakami conference write-up  
  URL: https://datakami.com/blog/2026-05-01-ai-engineer-europe-2026-day-3
- StartupHub summary  
  URL: https://www.startuphub.ai/ai-news/artificial-intelligence/2026/ai-agents-from-slop-to-sufficiently-detailed-specs

Direct excerpt from the transcript:

> "Critical code, read every"

Direct excerpt from the Datakami write-up:

> "well-scoped work"

Operational notes for this repository:

- More agent features do not automatically mean better agent work.
- Context control, observability, model choice, and extensibility matter.
- Generated code volume must stay reviewable.
- Agents compound mistakes when there is no bottleneck and no immediate feedback.
- Suitable agent work has three properties:
  - scoped
  - closed-loop
  - non-mission-critical
- Strong candidates for agent work:
  - boring repetitive code changes
  - reproduction cases from user issues
  - test additions around known behavior
  - focused refactors inside a clear module boundary
  - documentation alignment
  - read-only code review
  - local debugging with strong verification
- Weak candidates for agent work:
  - broad rewrites
  - ambiguous product direction
  - critical security decisions
  - storage deletion
  - encryption/key handling changes without human review
  - architecture changes where the interface is not designed yet

Repository implication:

- A future `docs/agent-task-suitability.md` should classify tasks by:
  - scope
  - closed-loop verification path
  - criticality
  - expected generated-code volume
  - required human review depth

Recommended policy:

```text
If a task cannot be scoped, cannot be verified by tests or browser/runtime checks,
and touches critical code, do not delegate it as an autonomous implementation task.
Use the agent for exploration, review, or test design only.
```

## Reference 14: LangGraph Durable Execution

Source: LangGraph Docs, "Durable execution"  
URL: https://docs.langchain.com/oss/python/langgraph/durable-execution

Direct excerpt:

> "wrap any non-deterministic operations"

Operational notes for this repository:

- Durable execution matters when agent work spans interruptions, approvals, retries, or long-running state.
- Side effects and nondeterministic operations need explicit boundaries.
- Human-in-the-loop workflows need persisted state, not just a chat transcript.

Repository implication:

- Mediavault does not need LangGraph inside the app for current product goals.
- Development workflows can still borrow the principle:
  - store task state
  - store verification state
  - record approvals
  - make resumability explicit

## Reference 15: Google ADK And A2A

Sources:

- Google Agent Development Kit overview  
  URL: https://google.github.io/adk-docs/get-started/about/
- Agent2Agent Protocol specification  
  URL: https://google-a2a.github.io/A2A/specification/

Direct excerpts:

> "Memory: Enables agents to recall information"

> "communication and interoperability between independent"

Operational notes for this repository:

- ADK-style concepts are useful when building agents as a product capability.
- A2A-style interoperability matters when independent agents from different systems need to discover and coordinate with each other.
- These are not immediate needs for Mediavault development workflow.

Repository implication:

- Do not introduce A2A or ADK-style runtime abstractions into Mediavault unless there is a concrete product-level agent feature.
- For repository development, simpler local conventions are enough.

## Repository-Specific Critical Code Map

Treat these areas as critical or high-risk:

- authentication and session lifecycle
  - `app/modules/auth/**`
  - `app/composition/server/auth*.ts`
  - `app/routes/api.auth.*`
- playback token, manifest, media segment, and ClearKey handling
  - `app/modules/playback/**`
  - `app/composition/server/playback.ts`
  - `app/routes/videos.$videoId.*`
  - `app/widgets/player-surface/**`
- thumbnail encryption and protected serving
  - `app/modules/thumbnail/**`
  - `app/composition/server/thumbnails.ts`
  - `app/routes/api.thumbnail.$id.ts`
- ingest commit and media preparation
  - `app/modules/ingest/**`
  - `app/routes/api.uploads*`
  - media preparation adapters
- SQLite schema, migrations, and data integrity
  - `app/modules/storage/infrastructure/sqlite/**`
  - primary storage migration files
  - `scripts/verify-data-integrity.ts`
- production runtime readiness
  - `app/server.ts`
  - `app/routes/health.ready.ts`
  - `app/modules/runtime/**`
  - `Dockerfile`
  - `docker-compose.yaml`
- browser-visible protected owner flows
  - login
  - home library
  - add videos
  - player
  - playlists

For these areas, agent-generated code should be reviewed more strictly than ordinary UI polish or documentation changes.

## Task Suitability Matrix

| Task type | Agent suitability | Required human role | Required feedback loop |
| --- | --- | --- | --- |
| Documentation alignment | High | Review final wording and accuracy | `bun run check` by repo contract |
| Focused module test addition | High | Define behavior and inspect assertions | targeted test, then `check` |
| UI polish in existing pattern | Medium to high | Inspect screenshot/browser behavior | UI tests, `verify:e2e-smoke` when browser-visible |
| Playback route behavior | Medium | Design policy and review critical code | module tests, integration tests, e2e, browser QA as needed |
| Auth/session change | Medium | Review security behavior line-by-line | module/integration/smoke/Docker as applicable |
| Storage migration or deletion | Low to medium | Own migration policy and approval | data-integrity, Docker, clean export |
| Encryption/key handling | Low | Human owns design and line-level review | focused crypto tests, integration, e2e where applicable |
| Broad architecture rewrite | Low | Human owns module design and boundaries | staged plan, tests per slice |
| Generated large feature with unclear scope | Poor | Refine scope first | no autonomous implementation until scoped |

## Practical Agent Workflow For This Repository

Use this loop for non-trivial work:

1. Establish shared design concept.
   - Ask clarifying questions when the request is ambiguous.
   - Identify affected bounded contexts.
   - Identify critical paths.

2. Define the smallest vertical slice.
   - Prefer one route, one use case, one adapter, or one UI flow at a time.
   - Avoid broad rewrites.

3. Define the verification target before implementation.
   - Unit/module test
   - Integration test
   - UI test
   - Browser smoke
   - Data integrity
   - Docker readiness

4. Implement with tight feedback.
   - Prefer TDD for module behavior.
   - Keep generated diffs reviewable.
   - Stop if the agent needs to invent architecture.

5. Run the required verification.
   - Use `docs/verification-contract.md` as the authority.
   - Use `docs/browser-qa-contract.md` for browser-visible runtime behavior.

6. Report honestly.
   - State what changed.
   - State what verification ran.
   - State what was not run.
   - State remaining risk.
   - State which critical files require human review.

## Recommended Follow-Up Documents

These would improve this repository's agent readiness more than adding tool-specific configuration:

```text
docs/ubiquitous-language.md
docs/agent-task-suitability.md
docs/critical-code-map.md
docs/agent-run-report-template.md
```

Recommended script:

```text
scripts/select-verification.ts
```

Recommended behavior for `scripts/select-verification.ts`:

- inspect changed files
- classify touched domains
- detect critical areas
- output required verification commands
- explain why each command is required
- warn when Playwright MCP or equivalent browser QA may be needed

## Bottom Line

The durable lesson from these references is:

- Do not optimize for maximum generated code.
- Optimize for scoped work, closed loops, clear language, deep modules, and human control over critical decisions.
- Treat agent tools as accelerators inside a disciplined engineering system, not as replacements for that system.

For Mediavault, the most valuable next step is not more agent machinery. It is making the existing engineering harness more explicit for agents:

- clearer domain language
- clearer critical-code map
- clearer task suitability rules
- automatic verification selection
- explicit generated-code review expectations
