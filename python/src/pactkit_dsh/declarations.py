"""DSH's own declarations (SPEC-4.0-22 shape).

Core owns the capability vocabulary and the profiling dataclasses; what a given
Host scores on them is the Host's declaration, and this module is DSH's.

Two facts drive every value here, both measured 2026-10-21:

1. DSH's filesystem skill provider drops a skill whose frontmatter has no
   `name` (a probe with the field entered the catalog, one without it did not),
   and it does not expand `@path` references in a skill body at all.
2. DSH loads two user-global instruction files, in order: `$DSH_HOME/AGENTS.md`
   then `<agentsHome>/AGENTS.md` (`~/.agents/AGENTS.md`), and scans
   `~/.agents/skills` for skills.

So the deployment root is `~/.agents`, rules are inlined at deploy time rather
than referenced, and commands use the skill form.
"""

from __future__ import annotations

from pactkit.capability import Capability, CapabilityLevel
from pactkit.profiles import (
    CLIPolicy,
    DeploymentClaim,
    FormatProfile,
    InputTranslation,
    SecurityDeclaration,
    SecurityFacts,
)

__all__ = [
    "CAPABILITIES",
    "DEPLOYMENT_CLAIM",
    "INPUT_TRANSLATION",
    "PRETOOL_SURFACE",
    "PROFILE",
    "SECURITY",
]


def _cap(name: str, level: CapabilityLevel, implemented: bool, evidence: str) -> Capability:
    return Capability(name=name, level=level, implemented=implemented, evidence=evidence)


#: The Host's profile. Core no longer owns a third-party Host's profile.
PROFILE = FormatProfile(
    name="dsh",
    display_name="DeepSeek Harness",
    global_config_dir="~/.agents",
    project_config_dir=".agents",
    skills_dir="~/.agents/skills",
    agents_dir="~/.agents/agents",
    commands_dir="~/.agents/commands",
    rules_dir="~/.agents/rules",
    project_instructions_file="AGENTS.md",
    global_instructions_file="AGENTS.md",
    pactkit_yaml_path=".agents/pactkit.yaml",
    agent_format="md",
    # The load-bearing choice: DSH does not expand `@path`. Rules MUST arrive
    # as text, not as references (measured with a probe skill).
    rules_import_style="inline",
    excluded_agent_fields=frozenset({"memory", "permissionMode", "skills", "hooks"}),
    excluded_commands=frozenset(),
    supports_model_routing=False,
    skills_path_var="~/.agents/skills",
    command_deploy_form="skill",
    agent_dialect="claude",
    command_dialect="claude",
    core_bundled=False,
    cli_policy=CLIPolicy.PREFERRED,
)

#: What this Host scores on the capability vocabulary.
CAPABILITIES: dict[str, Capability] = {
    "completion_hook": _cap(
        "completion_hook", CapabilityLevel.DEGRADED, False,
        "unverified — not measured on this Host; absence is NOT established",
    ),
    "git_hook": _cap("git_hook", CapabilityLevel.NATIVE, True, "shipped (commit_gate pre-commit chain)"),
    "global_instruction": _cap(
        "global_instruction", CapabilityLevel.EQUIVALENT, True,
        "shipped (~/.agents/AGENTS.md; DSH reads $DSH_HOME/AGENTS.md then agentsHome/AGENTS.md)",
    ),
    "native_command": _cap(
        "native_command", CapabilityLevel.DEGRADED, False,
        "no slash-command surface measured; Skills are the entry point",
    ),
    "native_skill": _cap(
        "native_skill", CapabilityLevel.NATIVE, True,
        "shipped (~/.agents/skills; skill-filesystem provider requires frontmatter `name`)",
    ),
    "persistent_session": _cap("persistent_session", CapabilityLevel.NATIVE, True, "shipped (append-only session log)"),
    "post_tool_hook": _cap("post_tool_hook", CapabilityLevel.DEGRADED, False, "unverified — not measured on this Host"),
    "pre_tool_hook": _cap(
        "pre_tool_hook", CapabilityLevel.NATIVE, True,
        "shipped by the pactkit-dsh bundle (tools/pre-execute); absent when that bundle is not mounted",
    ),
    "project_instruction": _cap(
        "project_instruction", CapabilityLevel.EQUIVALENT, True, "shipped (AGENTS.md at project root)",
    ),
    "rule_import": _cap(
        "rule_import", CapabilityLevel.EQUIVALENT, True,
        "shipped as inlined rule text plus a managed block in ~/.agents/AGENTS.md; DSH does not expand @path",
    ),
    "session_resume": _cap("session_resume", CapabilityLevel.NATIVE, True, "shipped (session log replay)"),
    "shell_execution": _cap("shell_execution", CapabilityLevel.NATIVE, True, "shipped (bash tool)"),
    "structured_tool_result": _cap("structured_tool_result", CapabilityLevel.NATIVE, True, "shipped (typed tool results)"),
    "subagent": _cap("subagent", CapabilityLevel.NATIVE, True, "shipped (subagent / workflow)"),
}

#: Files a gate must treat specially on this Host (SPEC-4.0-22 R8).
#:
#: `env_capable` and `protected` are genuinely empty for DSH: the pre-tool gate
#: is the `pactkit-dsh` plugin, which spawns the CLI with the Host's own
#: environment — no project file injects variables into that subprocess, and
#: DSH keeps no project-scoped hook file a gate must forbid outright.
#:
#: `conditional` is not empty. `.agents/pactkit.yaml` is this Host's config
#: layer: deleting its `enforcement:` entries (or a command/rule entry) weakens
#: later gates, while ordinary edits to it do not. That is exactly the
#: "removing a gate entry is tamper, other edits are not" reading, and saying
#: so is a measurement, not a placeholder.
SECURITY = SecurityDeclaration(
    env_capable=SecurityFacts.empty(),
    protected=SecurityFacts.empty(),
    conditional=SecurityFacts.declared([".agents/pactkit.yaml"]),
)

#: The measured pre-tool interception surface, provided by a bundle rather than
#: the Host core. `None` would mean unverified; this is verified by use.
PRETOOL_SURFACE = "plugin: tools/pre-execute (pactkit-dsh bundle)"

#: How this Host executes and where its verification comes from.
DEPLOYMENT_CLAIM = DeploymentClaim(
    execution_mode="portable",
    verification_source="native_dsh_session",
)

#: DSH has no separate wire format for gate payloads: the pre-tool gate is the
#: plugin's own mapping, so there is no Host translation to declare.
INPUT_TRANSLATION: InputTranslation | None = None
