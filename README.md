# pactkit-dsh

PactKit governance for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

PactKit ships fail-closed pre-tool gates — commit, secrets, spec, tamper, push —
but on a host with no pre-tool hook they can only be *asked for* in a prompt.
This bundle gives DSH the hook DSH does not have: every gated tool call passes
through PactKit's own `commit-gate --hook` before dispatch, so a blocked call
never runs. It also exposes the `pactkit` CLI as a native tool.

Nothing is re-implemented in JavaScript. The plugin maps the call, spawns the
CLI, and reports what the CLI decided — one implementation, no second truth.

## What it registers

| Registration | Effect |
|---|---|
| `tools/pre-execute` listener | Sends `bash`, `write` and `edit` calls through `pactkit commit-gate --hook`; a gate that exits 2 denies the dispatch with the gate's own reason. |
| `pactkit` tool | Runs a PactKit subcommand (`doctor`, `regression`, `spec-lint`, `audit`, `report`, `board`, `gate`, …) and returns its exit code and output. |
| `pactkit:gates` prompt section | One sentence inside a PactKit project saying calls are adjudicated before dispatch, so the model fixes a blocked call instead of retrying it. |

The listener abstains — leaving the call untouched — for a tool it does not map,
a call outside a PactKit project, or a gate that could not answer.

## Requirements

- DSH `>= 0.2.1-rc.2`.
- The `pactkit` CLI reachable from the Host process. Install it (`pip install pactkit`)
  and, if the Host's `PATH` does not include it, point `pactkitPath` at the binary.
- A project with a shared `pactkit.yaml` at its root. See [Project anchor](#project-anchor).

## Install

From a checkout of this repository:

```
plugin_manager install_bundle  target=/absolute/path/to/pactkit-dsh
```

or add it to the profile's bundle list and restart. The patch row is `pactkit-dsh`
in `cordis.patch.yml`.

## Configuration

Every key is optional; defaults are in `lib/options.js`.

| Key | Default | Meaning |
|---|---|---|
| `enforce` | `true` | Run the pre-tool gate. Only an explicit `false` disables it. |
| `pactkitPath` | `"pactkit"` | CLI to spawn. An absolute path is safest when the Host's `PATH` is not your shell's. |
| `gateTimeoutMs` | `300000` | Deadline for one gate. A `git commit` gate runs the selected tests, so this is generous. |
| `toolTimeoutMs` | `120000` | Deadline for one `pactkit` tool call. |
| `injectContext` | `true` | Add the gate notice to the system prompt. |
| `denyWhenGateUnavailable` | `false` | Block when the gate cannot run at all (CLI missing, timeout, unexpected exit). |
| `extraGatedTools` | `[]` | Additional tool names to forward to the gate. Their arguments are passed verbatim; PactKit decides whether an unknown name is write-capable. |

## What happens to a call

| Gate outcome | Dispatch |
|---|---|
| exit 0 | allowed, unchanged |
| exit 2 | denied; the gate's stderr becomes the reason the model sees |
| CLI missing | allowed by default (logged, and the prompt notice says so); denied with `denyWhenGateUnavailable: true` |
| timeout | as above |
| unexpected exit status | as above — reported as a failed gate, never as a denial |
| abort | abstain; the dispatch is already cancelled |
| no project / no known directory | abstain, no subprocess |

An unavailable gate defaults to allowing on purpose: it mirrors PactKit's own
self-lock protection, where a gate that cannot run must not make the host
unusable. Flip `denyWhenGateUnavailable` for the opposite posture.

## Project anchor

A project is recognized by the shared `pactkit.yaml` at its root (or, for
projects initialized before that layer existed, by `.pactkit/continuations` /
`.pactkit/workflow-runs`). The nearest ancestor wins.

Host-keyed copies (`.claude/`, `.codex/`, `.github/pactkit.yaml`) deliberately do
**not** anchor a project. They are overrides on the shared layer, and PactKit
itself reports a directory carrying only host copies as ambiguous and blocked.
Measured 2026-10-21: a stray `~/.codex/pactkit.yaml` made the home directory look
like a project, which would have run every gate against `$HOME`.

The trade-off is explicit: a legacy project that has only a host copy is not
gated until it gains a shared layer (`pactkit init` / `pactkit reconcile`).

## Scope and limits

- Only `bash`, `write` and `edit` are mapped. A newly enabled write-capable tool
  is not gated until its name is added to `extraGatedTools`.
- The gate is synchronous from the model's point of view: a gated `git commit`
  blocks that tool call while PactKit runs the selected tests. That is the point,
  but it is a real latency cost.
- Unmapped read-only tools cost nothing: no subprocess is spawned.
- The gate judges the directory the call operates in: `workdir` for `bash`,
  the target's directory for `write`/`edit`. A relative target with no known
  session directory abstains rather than guessing.

## Verification

Local unit suite (49 tests):

```
node --test test/*.test.js
```

Measured 2026-10-21 against the real CLI:

| Case | Result |
|---|---|
| `write` to `.pactkit/enforcement/…` in a project with `tamper_guard: true` | denied, PactKit's tamper-guard reason |
| `bash` in the same project | allowed |
| `bash` under a directory with no shared `pactkit.yaml` | abstained (`no-project`) |
| `bash` in `$HOME` (stray host-only config) | abstained (`no-project`) |
| `bash` in a nested subdirectory of a real project | allowed, rooted at the project |
| `read` | abstained (`no-opinion`) |

## Rollback

```
plugin_manager remove_bundle  target=pactkit-dsh
```

or delete the `pactkit-dsh` row from `cordis.patch.yml` and restart. No project
state is written by this plugin; everything it records is written by PactKit.

## License

MIT.
