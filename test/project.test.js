import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { findPactkitRoot, isPactkitRoot } from "../lib/project.js";

function tempDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pactkit-dsh-project-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("the shared pactkit.yaml marks a root and the nearest ancestor wins", (t) => {
  const root = tempDir(t);
  fs.writeFileSync(path.join(root, "pactkit.yaml"), "schema_version: 1\n");
  const nested = path.join(root, "src", "pkg");
  fs.mkdirSync(nested, { recursive: true });

  assert.equal(isPactkitRoot(root), true);
  assert.equal(findPactkitRoot(nested), root);
});

test("a host-only config is not a gate anchor", (t) => {
  // PactKit reports a directory with only host copies as ambiguous/blocked, so
  // gating there would enforce a policy the project has not resolved. Measured
  // 2026-10-21: a stray ~/.codex/pactkit.yaml made $HOME look like a project.
  const root = tempDir(t);
  fs.mkdirSync(path.join(root, ".claude"));
  fs.writeFileSync(path.join(root, ".claude", "pactkit.yaml"), "schema_version: 1\n");

  assert.equal(findPactkitRoot(root), null);
});

test("a host override beside the shared layer is still one project", (t) => {
  const root = tempDir(t);
  fs.writeFileSync(path.join(root, "pactkit.yaml"), "schema_version: 1\n");
  fs.mkdirSync(path.join(root, ".codex"));
  fs.writeFileSync(path.join(root, ".codex", "pactkit.yaml"), "schema_version: 1\n");
  const nested = path.join(root, "src");
  fs.mkdirSync(nested);

  assert.equal(findPactkitRoot(nested), root);
});

test("legacy state markers are accepted", (t) => {
  const root = tempDir(t);
  fs.mkdirSync(path.join(root, ".pactkit", "continuations"), { recursive: true });

  assert.equal(findPactkitRoot(root), root);
});

test("an empty .pactkit directory is not a project", (t) => {
  const root = tempDir(t);
  fs.mkdirSync(path.join(root, ".pactkit"));

  assert.equal(findPactkitRoot(root), null);
});

test("an unrelated directory resolves to null", (t) => {
  const root = tempDir(t);
  const nested = path.join(root, "a", "b");
  fs.mkdirSync(nested, { recursive: true });

  assert.equal(findPactkitRoot(nested), null);
});

test("an empty or non-string start resolves to null", () => {
  assert.equal(findPactkitRoot(""), null);
  assert.equal(findPactkitRoot(undefined), null);
  assert.equal(findPactkitRoot(null), null);
});
