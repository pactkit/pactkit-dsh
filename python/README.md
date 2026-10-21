# pactkit-dsh (Python adapter)

PactKit's deployment adapter for **DeepSeek Harness (DSH)** — the Python half of
this repository. The other half is the TypeScript/JavaScript plugin in the
repository root, which enforces PactKit's pre-tool gates inside a DSH session.

| Half | Question it answers |
|---|---|
| `..` (npm plugin) | *Will a blocked call actually be stopped?* |
| `python/` (this package) | *Will the skill and its rules even load?* |

## Why an adapter and not a core format

Core owns the built-in host (`classic`); every other host declares its own
profile in an adapter package (SPEC-4.0-22 Step 7). DSH is an external host, so
it follows the same shape as `pactkit-codex` / `pactkit-opencode`.

## What it declares

| Field | Value | Why |
|---|---|---|
| `skills_dir` | `~/.agents/skills` | DSH scans it; `~/.dsh/skills` is the other scanned root, left alone |
| `rules_import_style` | `inline` | DSH does not expand `@path` (measured: a probe body came back verbatim) |
| `command_deploy_form` | `skill` | DSH keys a skill by frontmatter `name`, not by directory |
| `global_instructions_file` | `AGENTS.md` | DSH loads `$DSH_HOME/AGENTS.md` then `~/.agents/AGENTS.md` |

The adapter writes skills, command playbooks, rules, agents, guides, and a
marker-delimited PactKit block inside `~/.agents/AGENTS.md`. It does **not**
touch `~/.dsh/AGENTS.md` — that file belongs to the user.

## Install

```bash
pip install -e ./python            # from the repository root
pactkit update --format dsh        # deploys to ~/.agents
```

Verify:

```bash
pactkit doctor | grep -i "dsh"     # the host is registered
ls ~/.agents/skills/project-act/   # SKILL.md with `name:` and inlined rules
```

## A note on `pactkit update --format dsh` warnings

The CLI prints lines like `NOT enforced on this host: secrets_gate, auth_gate,
tamper_guard, spec_guard — the dsh channel installs no pre-tool hook`. That is
true **of this adapter** and is not a defect: the Python half installs no hook,
because DSH's pre-tool interception is the JavaScript plugin in the repository
root (`tools/pre-execute`). The two halves are deliberately separate — the
adapter answers "will the skill load", the plugin answers "will a blocked call
be stopped". Read the warning as *this deployer installed no hook*, not as
*gates are absent in a DSH session*.

## Limits

- Rule text is embedded at deploy time, so a rule edit needs a re-deploy
  (`pactkit update --format dsh`). That is the price of a host without
  `@import`, and it is cheaper than a silent dangling reference.
- `~/.dsh/skills` is not written; if you prefer DSH's own home, pass
  `--target ~/.dsh`.
