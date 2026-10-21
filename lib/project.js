/**
 * PactKit project discovery.
 *
 * The anchor is the shared `pactkit.yaml`: it is the policy file every reader
 * without a host signal resolves to, and the file `pactkit init` writes at the
 * repository root. Host-keyed copies (`.claude/`, `.codex/`, `.github/`) are
 * overrides on top of it, and PactKit itself refuses to adjudicate a directory
 * that carries only host copies ("ambiguous host-only configs … BLOCKED").
 * Using one as the anchor here would gate where PactKit reports the project as
 * unresolved — measured 2026-10-21: a stray `~/.codex/pactkit.yaml` made the
 * home directory a "project", which would have run every gate against $HOME.
 *
 * Legacy state markers are accepted because PactKit accepts them for projects
 * initialized before a local `pactkit.yaml` was mandatory.
 */

import fs from "node:fs";
import path from "node:path";

// Only the shared policy layer anchors a project (see the module docstring).
const YAML_MARKERS = Object.freeze(["pactkit.yaml"]);

// State markers PactKit accepts for projects initialized before a local
// `pactkit.yaml` was mandatory.
const STATE_MARKERS = Object.freeze([".pactkit/continuations", ".pactkit/workflow-runs"]);

function isFile(target, fsModule) {
  try {
    return fsModule.statSync(target).isFile();
  } catch {
    return false;
  }
}

function isDirectory(target, fsModule) {
  try {
    return fsModule.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

export function isPactkitRoot(directory, fsModule = fs) {
  if (typeof directory !== "string" || !directory) return false;
  for (const marker of YAML_MARKERS) {
    if (isFile(path.join(directory, marker), fsModule)) return true;
  }
  for (const marker of STATE_MARKERS) {
    if (isDirectory(path.join(directory, marker), fsModule)) return true;
  }
  return false;
}

/**
 * Nearest initialized PactKit ancestor of `startDirectory`, or null.
 * Returns null rather than guessing when no ancestor is initialized.
 */
export function findPactkitRoot(startDirectory, fsModule = fs) {
  if (typeof startDirectory !== "string" || !startDirectory.trim()) return null;

  let directory;
  try {
    directory = path.resolve(startDirectory);
  } catch {
    return null;
  }

  const filesystemRoot = path.parse(directory).root;
  for (;;) {
    if (isPactkitRoot(directory, fsModule)) return directory;
    if (directory === filesystemRoot) return null;
    const parent = path.dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}
