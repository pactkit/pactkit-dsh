"""DSH adapter against a real deployment root.

These tests exercise the production path — the same sub-deployers classic uses
— rather than asserting that fields exist.
"""

from __future__ import annotations

from pathlib import Path

import pytest

import pactkit_dsh  # noqa: F401  (import registers the host)
from pactkit.profiles import get_profile
from pactkit_dsh.deployer import DshDeployer


def _frontmatter(text: str) -> str:
    assert text.startswith("---\n")
    end = text.find("\n---", 4)
    assert end != -1
    return text[4:end]


def test_dsh_profile_is_registered():
    profile = get_profile("dsh")
    assert profile.skills_dir == "~/.agents/skills"
    assert profile.rules_import_style == "inline"
    assert profile.command_deploy_form == "skill"
    assert profile.global_instructions_file == "AGENTS.md"


def test_deploy_writes_dsh_loadable_skills(tmp_path):
    root = tmp_path / "agents"
    DshDeployer().deploy(config={}, target=root)

    skill = root / "skills" / "project-act" / "SKILL.md"
    assert skill.is_file(), "command playbooks must land in the skills root"

    text = skill.read_text(encoding="utf-8")
    assert "name: project-act" in _frontmatter(text), "DSH drops a skill without frontmatter name"
    assert "@~/.claude/skills/" not in text, "DSH does not expand @path references"
    assert "@~/.agents/skills/" not in text, "inline style must not emit @ references at all"
    # The rule text itself must be present, not a reference to it.
    assert "PDCA Lifecycle" in text or "Active PactKit Contract" in text


def test_deploy_writes_the_global_contract(tmp_path):
    root = tmp_path / "agents"
    DshDeployer().deploy(config={}, target=root)

    agents_md = (root / "AGENTS.md").read_text(encoding="utf-8")
    assert "PactKit Runtime Contract" in agents_md
    assert agents_md.count("<!-- pactkit:start") == 1


def test_redeploy_is_idempotent(tmp_path):
    root = tmp_path / "agents"
    DshDeployer().deploy(config={}, target=root)
    first = (root / "AGENTS.md").read_text(encoding="utf-8")

    DshDeployer().deploy(config={}, target=root)
    second = (root / "AGENTS.md").read_text(encoding="utf-8")

    assert first == second
    assert second.count("<!-- pactkit:start") == 1


def test_deploy_does_not_touch_the_dsh_home_contract(tmp_path):
    """The user's own `~/.dsh/AGENTS.md` is a different file and must survive."""
    root = tmp_path / "agents"
    DshDeployer().deploy(config={}, target=root)

    written = {p.name for p in root.iterdir()}
    assert "AGENTS.md" in written
    assert not (root / ".dsh").exists()
    assert DshDeployer().profile.global_config_dir != "~/.dsh"
