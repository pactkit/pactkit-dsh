import assert from "node:assert/strict";
import test from "node:test";

import { toCanonicalPayload } from "../lib/payload.js";

test("bash maps its command to the canonical Bash payload", () => {
  assert.deepEqual(toCanonicalPayload("bash", { description: "commit", command: "git commit -m x" }), {
    tool_name: "Bash",
    tool_input: { command: "git commit -m x" },
  });
});

test("a bash call with no command is not adjudicated", () => {
  assert.equal(toCanonicalPayload("bash", {}), null);
  assert.equal(toCanonicalPayload("bash", { command: "   " }), null);
  assert.equal(toCanonicalPayload("bash", { command: 42 }), null);
});

test("write carries file_path and content", () => {
  assert.deepEqual(toCanonicalPayload("write", { file_path: "a/b.md", content: "hi" }), {
    tool_name: "Write",
    tool_input: { file_path: "a/b.md", content: "hi" },
  });
});

test("write without a file_path is not adjudicated", () => {
  assert.equal(toCanonicalPayload("write", { content: "hi" }), null);
});

test("edit carries replace_all only when it is true", () => {
  assert.deepEqual(toCanonicalPayload("edit", { file_path: "x", old_string: "a", new_string: "b" }), {
    tool_name: "Edit",
    tool_input: { file_path: "x", old_string: "a", new_string: "b" },
  });
  assert.deepEqual(
    toCanonicalPayload("edit", { file_path: "x", old_string: "a", new_string: "b", replace_all: true }),
    { tool_name: "Edit", tool_input: { file_path: "x", old_string: "a", new_string: "b", replace_all: true } },
  );
});

test("edit defaults missing anchors to empty strings", () => {
  assert.deepEqual(toCanonicalPayload("edit", { file_path: "x" }), {
    tool_name: "Edit",
    tool_input: { file_path: "x", old_string: "", new_string: "" },
  });
});

test("a read-only tool is never adjudicated", () => {
  for (const name of ["read", "glob", "grep", "todo_write", "pactkit"]) {
    assert.equal(toCanonicalPayload(name, { file_path: "x", command: "ls" }), null, name);
  }
});

test("extraGatedTools forwards arguments verbatim under the tool's own name", () => {
  const payload = toCanonicalPayload("apply_patch", { patch: "*** Begin Patch" }, ["apply_patch"]);
  assert.deepEqual(payload, { tool_name: "apply_patch", tool_input: { patch: "*** Begin Patch" } });
});

test("an extra tool is inert until it is listed", () => {
  assert.equal(toCanonicalPayload("apply_patch", { patch: "x" }), null);
  assert.equal(toCanonicalPayload("apply_patch", { patch: "x" }, []), null);
});
