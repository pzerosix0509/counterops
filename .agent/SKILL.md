---
name: ship-pr
description: Ship the current branch as a PR. Checks git state, suggests atomic commits if dirty, runs focused tests and a correctness/security/intent review, then pushes and opens a PR following team conventions.
argument-hint: "[pr description brief]"
metadata:
  author: c-hao
  version: "1.1"
  source: merged with cursor-team-kit/review-and-ship
---

# Ship PR

Push the current branch and open a pull request following Viedoo team conventions.

## When to Use

- Work is done on a feature branch and ready for review
- User says "ship this", "create PR", "open MR", "/ship-pr"
- After completing a series of related commits

## Prerequisites

This skill requires `git` and `gh` CLI. The `gh` CLI must be authenticated (`gh auth status`).

## Workflow

### 1. Check current state

```bash
git status --porcelain
git branch --show-current
```

### 2. If dirty — suggest atomic commits

List changed files grouped by area (services, pipelines, docs, config, etc.). For each logical group, propose a commit message following the team convention:

```
<author>/<type>(<scope>): <subject>
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `style`, `revert`.
Authors: `c-hao`, `n-anh`, `d-phu`, `l-vien`, `t-van`.

Ask the user: "I see these changes. Here's how I'd group them into atomic commits. Ok to proceed?"

Do NOT commit without confirmation. Skip files that look like local overrides (`.env`, `.env.local`, local config, personal editor files) — flag them and move on.

### 3. If clean — prepare to push

Run `git log @{u}..HEAD --oneline` to see what commits will be pushed.

Verify:
- All commits follow the conventional format (commitlint would pass)
- Branch name follows `<author>/<type>/<description>` convention
- No WIP or debug commits ("wip", "tmp", "fixup", "debug")

If issues found, offer to squash/fix before pushing.

### 3.5. Pre-push review and targeted tests

Before pushing, run a focused review pass and the tests that cover the changed behavior.

```bash
git fetch origin main
git diff origin/main...HEAD --stat
gh pr checks --json name,bucket,state,workflow,link   # when a PR already exists
```

Run targeted tests for the changed code (e.g. `pytest pipelines/<pkg>/tests/<file>.py -x` or `services/frontend`'s focused Jest/Vitest). If no focused tests exist for the change, decide whether to add them or document the gap explicitly in the PR description.

Review for correctness, regressions, security, and intent fit. For larger diffs, fan out to parallel subagents (one per logical area: pipeline, searcher, API, frontend). Address critical findings before pushing. Use the project's quality bar:

- `thermo-nuclear-code-quality-review` — strict structural pass.
- `deslop` — minimal-delta cleanup of AI slop.

Do not bypass hooks (`--no-verify`) to force progress. If pre-commit checks fail, fix them rather than skipping.

### 4. Push

```bash
git push origin <branch>
```

Do NOT:
- Push to `main` directly. Always push to a feature branch first.
- Force push (`git push --force`, `git push --force-with-lease`).

If push fails (behind remote), offer to rebase or pull first.

### 5. Gather PR content

Read `.github/pull_request_template.md` for the template.

Gather context:
- `git log main..HEAD --oneline` — what's in this branch
- `git diff main..HEAD --stat` — files changed
- Any related issues (`gh issue list`)

Draft the PR description using the template. Sections:

**What changed**: bullet list of changes, grouped logically.

**Why**: motivation, problem this solves, link related issues.

**How to test**: concrete commands a reviewer can run.

**Checklist**: pre-check items that are obviously done.

### 6. Create PR

```bash
gh pr create \
  --repo viedoo/viedoo \
  --base main \
  --head <branch> \
  --title "<author>/<type>(<scope>): <description>" \
  --body "<description>"
```

The PR title must follow the same convention as commits: `<author>/<type>(<scope>): <description>`.

After creating, print the PR URL.

### 7. Assign yourself and add labels

```bash
gh pr edit <number> --repo viedoo/viedoo --add-assignee @me
```

Labels follow these conventions:

**Type labels** (`type::*`):
| Label | When |
|---|---|
| `type::Feat` | New feature, new pipeline, new service |
| `type::Fix` | Bug fix |
| `type::Docs` | Documentation only |
| `type::Refactor` | Code restructure, no behavior change |
| `type::Chore` | Build, CI, tooling, maintenance |
| `type::Perf` | Performance improvement |
| `type::Test` | Test addition or improvement |

**Priority labels** (`priority::*`):
| Label | When |
|---|---|
| `priority::Critical` | Blocks release, data loss, security |
| `priority::High` | Blocks team member, needed this sprint |
| `priority::Medium` | Normal priority, standard review cadence |
| `priority::Low` | Nice to have, can wait |

Pick the best-matching type and priority, then apply:

```bash
gh pr edit <number> --repo viedoo/viedoo --add-label "type::<Type>,priority::<Priority>"
```

Ask for confirmation if the choice isn't obvious. Default: `type::Feat` + `priority::Medium`.

## PR title conventions

Match the branch name and the primary commit's type:
- `c-hao/feat(viedoo): add research entries`
- `n-anh/fix(api): handle empty search results`
- `d-phu/refactor(searcher): simplify fusion pipeline`

## What NOT to do

- Don't push without checking commit quality
- Don't create PR with WIP titles or empty descriptions
- Don't force-push unless the user explicitly asks
- Don't commit changes without user confirmation
- Don't include files the user didn't intend to ship (check `git diff --cached`)

## Related skills

- `thermo-nuclear-code-quality-review` — the strict review pass; run before pushing, in the 3.5 pre-push review step.
- `deslop` — minimal-delta cleanup of AI slop; run before `thermo-nuclear-code-quality-review`.
- `make-pr-easy-to-review` — tighten history and PR description; typically runs after review but before `gh pr create`.
- `fix-merge-conflicts` — call this first if `git status` shows conflict markers. Don't push a branch that won't build.
- `triage` — for GitHub Issues lifecycle; this skill handles PRs once they're open.
- `changelog` — run after the PR merges, before the next release.

## Chat Output

Print the shipping report. Use this shape:

```text
- pr: <number> | <url>
  branch: <branch>
  base: <base branch, usually main>
  commits: <count>
  files-changed: <count>
  loc-delta: <+added/-removed>

- findings:
  - critical: <count>
  - warning: <count>
  - note: <count>

- tests:
  - command: <e.g. "uv run pytest pipelines/searcher/tests/ -x">
    outcome: pass | fail | skipped | not-applicable

- ci-status:
  - gh-pr-checks: <pending | passing | failing | not-available>
  - link: <url if available>

- labels-applied: <type::* , priority::*>

verdict: SHIPPED | SHIPPED_WITH_FOLLOWUPS | BLOCKED
followups: <bullet list, or "none">
summary: <1-3 sentences: net state of the PR and what the reviewer should look at first>
```

Verdict rules:

- `SHIPPED` — PR opened, all targeted tests pass, no critical findings, CI green or N/A.
- `SHIPPED_WITH_FOLLOWUPS` — PR opened but a non-blocking follow-up remains (test gap, nit, optional cleanup). List in `followups`.
- `BLOCKED` — refused to ship: critical finding unresolved, tests failing, or pre-push review returned `REQUEST_CHANGES`. Do not push or open the PR.

## Artifacts

When the report is long enough to risk pushing the agent out of useful context (default: total findings > 20, or LOC delta > 1000 lines), offer to write the full report to disk and keep only the pr + verdict + followups + summary in chat.

Default artifact path:

```text
/tmp/ship-pr/<branch>/
```

`<branch>` is the current feature branch. Ephemeral — under `/tmp`, not committed, not in the repo. Same convention as every other Viedoo skill.

Ask before writing. If the user declines, keep the full report in chat and accept the context cost.

On-disk file format:

```text
# Ship PR — Report
branch: <branch>
pr: <number>
base: <base branch, usually main>
shipped-at: <ISO-8601>
verdict: SHIPPED | SHIPPED_WITH_FOLLOWUPS | BLOCKED

## Summary
<1-3 sentences>

## Followups
<bullet list, or "none">

## Full Report
<full shipping report using the schema above>
```

Reference the file path in the chat reply so the user can `cat`/`Read` it back later if context has rolled over.
