# SpecGuard

SpecGuard is a VSCode extension that turns a plain-English spec into typed,
EARS-formatted constraints, hands code generation off to your own coding
agent, then generates and runs one test per constraint in an isolated git
worktree and scores the result 0-100 — blocking a task as "done" until it
passes a quality gate.

## The pipeline

1. **Extract constraints.** You describe what you want in plain English.
   A reasoning provider extracts discrete, testable constraints and
   classifies each one into an [EARS](#ears-constraints) pattern.
2. **Review & approve.** Every constraint is shown in a webview — EARS text,
   type, severity, description — and is editable. Nothing generates until
   you click Approve.
3. **Generate code.** A coding agent (bring-your-own-agent, see below) is
   handed the approved constraints and writes an implementation inside an
   isolated git worktree, never touching your real working tree directly.
4. **Generate & run tests.** One test is generated per constraint, targeting
   whatever framework the target project uses (vitest or pytest, v1), and
   run inside the same worktree with a per-test timeout.
5. **Retry with context.** If tests fail, the failures are fed back into the
   next code-generation attempt, up to a configured retry budget.
6. **Score quality.** A scoring provider — which can be a *different*
   provider than the one that generated the code — rates the result across
   six dimensions (correctness, completeness, type safety, security,
   maintainability, test coverage) and renders a dashboard.
7. **Gate.** The run only completes, and the worktree is only promoted into
   your real workspace, if the overall score clears the configured
   threshold *and* no high-severity constraint has a failing test.
   Otherwise it's marked failed and the worktree is left in place for you
   to inspect.

## Bring your own agent

SpecGuard never talks to a model or agent directly — every call goes
through a `Provider` interface (`src/providers/provider.ts`). You choose,
independently, which provider handles each of the four stages:

- constraint extraction
- code generation
- test generation
- scoring

Because the scoring provider is configured separately from the
code-generation provider, you can generate with one model and score with a
completely different one (e.g. generate with a large hosted model, score
with a small local one) so the quality check isn't just the same model
grading its own homework. Turn on
`specguard.scoring.enforceDifferentProvider` to make SpecGuard warn (and let
you block) a run where they're the same.

SpecGuard ships with:

- **`fake`** — a deterministic, canned provider with no network calls. It's
  what every test in this codebase runs against, and it also works as a
  zero-config demo: with all four stages set to `fake` (the default),
  running the pipeline produces a real, working, gate-passing example end
  to end.
- **`claude-agent-sdk`** — backed by the
  [Claude Agent SDK](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
  in headless/programmatic mode. For code generation it runs the SDK with
  its working directory pinned to the isolated worktree, so the agent's
  file writes never land anywhere else. Authentication is read from the
  environment (`ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`) or the
  Claude CLI's own login — never from a VSCode setting, so a secret never
  ends up in `settings.json`.

## EARS constraints

Every extracted constraint is classified into one of the five
[EARS](https://en.wikipedia.org/wiki/Requirements_Easy_Approach) (Easy
Approach to Requirements Syntax) patterns and formatted accordingly:

| Pattern | Form |
|---|---|
| Ubiquitous | "The system shall &lt;response&gt;." |
| Event-driven | "When &lt;trigger&gt;, the system shall &lt;response&gt;." |
| State-driven | "While &lt;state&gt;, the system shall &lt;response&gt;." |
| Unwanted | "If &lt;condition&gt;, then the system shall &lt;response&gt;." |
| Optional | "Where &lt;feature&gt;, the system shall &lt;response&gt;." |

## Settings reference

| Setting | Type | Default | Description |
|---|---|---|---|
| `specguard.providers.constraintExtraction` | string | `"fake"` | Provider id used to extract and classify constraints. |
| `specguard.providers.codeGeneration` | string | `"fake"` | Provider id used to generate code. |
| `specguard.providers.testGeneration` | string | `"fake"` | Provider id used to generate tests. |
| `specguard.providers.scoring` | string | `"fake"` | Provider id used to score quality. |
| `specguard.scoring.enforceDifferentProvider` | boolean | `false` | Warn/block when the scoring provider matches the code-generation provider. |
| `specguard.gate.minScore` | number | `75` | Minimum overall score (0-100) required to pass the gate. |
| `specguard.testFramework` | `"auto" \| "vitest" \| "pytest"` | `"auto"` | Test framework for generated tests. `"auto"` detects it from the target project. |
| `specguard.claudeAgentSdk.model` | string | `""` | Model name/alias for the Claude Agent SDK provider. Empty uses the SDK's default. |

Built-in provider ids: `fake`, `claude-agent-sdk`.

## Running it

### From source (F5)

```bash
npm install
npm run compile
```

Then press **F5** in VSCode (or Run → Start Debugging) — this compiles and
opens an Extension Development Host with SpecGuard loaded. Open a folder in
that window, run **"SpecGuard: Run Pipeline"** from the Command Palette, and
answer the three prompts (title, description, spec). With the default
`fake` provider on every stage, no network access or API key is required —
the pipeline runs end to end against canned, deterministic output.

### Installing the packaged extension

```bash
npm run package
```

produces `specguard-<version>.vsix`. Install it into any VSCode with:

```bash
code --install-extension specguard-<version>.vsix
```

## Deferred to v2

Agent-to-agent handoff, team/shared workspaces, a GitHub PR gate as a CI
Action, spec drift detection, Living Rules, coverage % display, parallel
multi-feature worktrees, and additional providers (Cursor/Copilot/Windsurf)
are explicitly out of scope for this build.
