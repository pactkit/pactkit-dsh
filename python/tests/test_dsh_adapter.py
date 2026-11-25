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
    # Project-scoped default: a shared pactkit.yaml makes the workflow the
    # default for changes, and the old blanket opt-in sentence must be gone.
    assert "pactkit.yaml" in agents_md
    assert "go through the PactKit workflow" in agents_md
    assert "skills are opt-in" not in agents_md


def test_deploy_writes_the_manifest_doctor_reads(tmp_path):
    """Without it, `doctor` cannot verify this root: `~/.agents` reads as
    "deployed outside `pactkit update`" forever (measured 2026-11-03)."""
    import json

    root = tmp_path / "agents"
    DshDeployer().deploy(config={}, target=root)

    manifest = json.loads((root / ".pactkit-deployed.json").read_text(encoding="utf-8"))
    assert manifest["format"] == "dsh"
    assert "pactkit-analyze" in manifest["skills"]
    assert manifest["commands"], "command playbooks are components too"
    # The files this adapter writes outside the component set are declared with
    # the digest that actually landed, not with a claim about them.
    assert manifest["artifacts"]["AGENTS.md"]["mode"] == "managed_block"
    assert len(manifest["artifacts"]["AGENTS.md"]["digest"]) >= 8


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


def test_global_only_does_not_read_or_write_the_project(tmp_path):
    """STORY-slim-20261125f4db76f08fc5: a global Host deployment must not read
    the project config nor write any project file.

    The project restricts skills to a single entry. A global-only deploy with no
    supplied config must ignore that restriction (full default set) and leave the
    project byte-identical; the non-global control reads it (restricted set), so
    the flag is proven to change behavior rather than being a no-op.
    """
    proj = tmp_path / "proj"
    proj.mkdir()
    (proj / "pactkit.yaml").write_text(
        "schema_version: 1\nskills:\n  - project-act\n", encoding="utf-8"
    )
    before = {p.relative_to(proj): p.read_bytes() for p in proj.rglob("*") if p.is_file()}

    global_root = tmp_path / "global"
    DshDeployer().deploy(config=None, target=global_root, project_root=proj, global_only=True)
    assert (global_root / "skills" / "pactkit-analyze").exists(), (
        "global-only must use the default full set, not the project's restricted skills"
    )
    after = {p.relative_to(proj): p.read_bytes() for p in proj.rglob("*") if p.is_file()}
    assert after == before, "global-only must not write any project file"

    # Positive control: without global_only the project config IS read.
    project_root = tmp_path / "project"
    DshDeployer().deploy(config=None, target=project_root, project_root=proj, global_only=False)
    assert not (project_root / "skills" / "pactkit-analyze").exists(), (
        "the non-global control must honor the project's restricted skill set"
    )
