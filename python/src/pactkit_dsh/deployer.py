"""PactKit deployment for DeepSeek Harness (DSH).

Thin by construction: DSH needs the same artifacts as every other skill-form
Host, so this module reuses Core's sub-deployers and contributes only what is
DSH-specific — the root (`~/.agents`), the ability to do without `@import`
at all, and a managed global contract block in `AGENTS.md`.

Nothing here decides *what* a rule says or *when* a gate blocks. A Host adapter
that re-implemented either would be a second source of truth (SPEC-4.0-22).
"""

from __future__ import annotations

from pathlib import Path

from pactkit import __version__
from pactkit.config import (
    CURRENT_RULE_IDS,
    VALID_AGENTS,
    VALID_COMMANDS,
    VALID_SKILLS,
    activate_pactkit_maintainer_overlay,
    resolve_deploy_config,
    validate_config,
)
from pactkit.generators.deploy_base import DeployerBase, register_deployer
from pactkit.generators.deployer import (
    _deploy_agents,
    _deploy_commands,
    _deploy_guides,
    _deploy_rules,
    _deploy_skills,
    _enforce_deploy_integrity,
    _render_prompt,
)
from pactkit.managed_docs import upsert_managed_block
from pactkit.prompts.rules import RULE_DEFINITIONS, normalize_rule_id

from pactkit_dsh import declarations


class DshDeployer(DeployerBase):
    """Deploy PactKit artifacts into the DSH user root (`~/.agents`)."""

    profile = declarations.PROFILE
    security = declarations.SECURITY
    capabilities = declarations.CAPABILITIES
    pretool_surface = declarations.PRETOOL_SURFACE
    deployment_claim = declarations.DEPLOYMENT_CLAIM

    def deploy(self, config=None, target=None, project_root=None, no_redetect=False):
        project_root = Path(project_root or Path.cwd()).resolve()
        root = Path(target) if target is not None else Path.home() / ".agents"

        if config is None:
            config, _project_yaml = resolve_deploy_config(project_root, format="dsh")
        validate_config(config)
        config = activate_pactkit_maintainer_overlay(config, project_root)

        skills_dir = root / "skills"
        agents_dir = root / "agents"
        for directory in (root, skills_dir, agents_dir):
            directory.mkdir(parents=True, exist_ok=True)

        enabled_skills = config.get("skills", sorted(VALID_SKILLS))
        enabled_rules = config.get("rules", sorted(CURRENT_RULE_IDS - {"pactkit-maintainer"}))
        enabled_agents = config.get("agents", sorted(VALID_AGENTS))
        enabled_commands = config.get("commands", sorted(VALID_COMMANDS))

        n_skills = _deploy_skills(skills_dir, enabled_skills, profile=self.profile)
        n_rules = _deploy_rules(
            root,
            enabled_rules,
            rule_scopes=config.get("rule_scopes", {}),
            profile=self.profile,
        )
        _deploy_guides(root, profile=self.profile)
        n_agents = _deploy_agents(
            agents_dir,
            enabled_agents,
            profile=self.profile,
            agent_models=config.get("agent_models", {}),
        )
        # Command playbooks deploy in the skill form, under the skills root —
        # the same shape classic uses, because DSH keys a skill by its
        # frontmatter `name` rather than by its directory.
        n_commands = _deploy_commands(
            skills_dir, enabled_commands, profile=self.profile, config=config
        )

        agents_md = self._write_agents_md(root, enabled_rules)

        return {
            "format": "dsh",
            "root": str(root),
            "skills": n_skills,
            "commands": n_commands,
            "rules": n_rules,
            "agents": n_agents,
            "agents_md": str(agents_md),
        }

    def _write_agents_md(self, root: Path, enabled_rules) -> Path:
        """Merge PactKit's global contract into ``<root>/AGENTS.md``.

        DSH loads this file *after* ``$DSH_HOME/AGENTS.md`` and never expands
        ``@path`` inside an instruction file, so the runtime rule is written as
        text. The region is marker-delimited, so the user's own content outside
        it survives every re-deploy.
        """
        enabled_ids = {
            normalized
            for rule_id in enabled_rules
            if (normalized := normalize_rule_id(rule_id)) is not None
        }

        lines = [f"# PactKit Runtime Contract (v{__version__})", ""]
        if "runtime" in enabled_ids:
            lines.extend((RULE_DEFINITIONS["runtime"].content.strip(), ""))
        lines.extend(
            (
                "PactKit skills are opt-in: an ordinary question or coding task does not activate PDCA.",
                "When a PactKit skill is invoked explicitly, it loads only its phase contract "
                "and declared shared modules.",
                "",
            )
        )

        content = _render_prompt("\n".join(lines), self.profile)
        _enforce_deploy_integrity(content, self.profile, "AGENTS.md")

        destination = root / "AGENTS.md"
        upsert_managed_block(destination, content)
        return destination


# Auto-register on import: `get_profile("dsh")` answers only once the deployer
# has arrived, which is exactly the availability signal Core documents.
register_deployer("dsh", DshDeployer, force=True)
