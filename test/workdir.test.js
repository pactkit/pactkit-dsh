import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { resolveWorkdir } from "../lib/workdir.js";

const SESSION = path.resolve("/tmp/workspace/project");

test("bash resolves an explicit relative workdir against the session", () => {
  assert.equal(resolveWorkdir("bash", { command: "ls", workdir: "sub" }, SESSION), path.join(SESSION, "sub"));
});

test("bash keeps an absolute workdir", () => {
  assert.equal(resolveWorkdir("bash", { command: "ls", workdir: "/elsewhere/repo" }, SESSION), "/elsewhere/repo");
});

test("bash without a workdir uses the session directory", () => {
  assert.equal(resolveWorkdir("bash", { command: "ls" }, SESSION), SESSION);
});

test("write judges the containing directory of its target", () => {
  assert.equal(resolveWorkdir("write", { file_path: "docs/specs/a.md" }, SESSION), path.join(SESSION, "docs", "specs"));
});

test("an absolute write target needs no session directory", () => {
  assert.equal(resolveWorkdir("write", { file_path: "/repo/docs/a.md" }, undefined), "/repo/docs");
});

test("an unknown directory is reported, never substituted", () => {
  assert.equal(resolveWorkdir("bash", { command: "ls" }, undefined), undefined);
  assert.equal(resolveWorkdir("edit", { file_path: "relative.md" }, undefined), undefined);
  assert.equal(resolveWorkdir("write", { content: "x" }, SESSION), SESSION);
});
