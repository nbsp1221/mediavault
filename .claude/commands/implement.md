---
name: implement
description: Implement a scoped change using the repository's current architecture, decision, verification, and Git rules.
argument-hint: [task description]
---

# Implement a change

1. Read [AGENTS.md](../../AGENTS.md), the canonical repository guidance, and the relevant current product/source contracts. Inspect existing code before proposing changes. Load applicable available skills before acting; use official ecosystem documentation when behavior or compatibility is uncertain. Do not require an extra model, CLI, dependency, or delegation just to begin.
2. Clarify the intended outcome and affected ownership boundaries. Ask a contextual question with a recommended option for consequential architecture, ambiguous security/product policy, or expensive-to-reverse choices. Make researched routine reversible choices without unnecessary approval loops. Do not silently implement placeholders or preserve a vulnerability as product policy.
3. Plan concrete steps for nontrivial work, then make focused changes on a task branch. Keep temporary research, plans, logs, and QA evidence outside Git. Preserve unrelated edits, stashes, developer files, and generated primitive internals.
4. Use the supported Node.js/pnpm contract and [verification matrix](../../docs/verification-contract.md). Run focused checks while iterating, then the required completion gates, including runtime, storage-integrity, and isolated personal browser QA when applicable. Never weaken assertions, coverage, or baselines to obtain a pass.
5. Report the implemented outcome, important decisions, exact verification scope, and anything failed or unverified. A successful HTTP response or mounted player is not proof of a browser-only outcome or decoded playback.

Implementation does not authorize staging, committing, pushing, or opening a pull request. Follow the canonical Git guards; an explicitly authorized commit requires the `commit` skill, and publication requires separate permission. Never modify production data or use actual local secrets/storage as test fixtures.
