import assert from "node:assert/strict";
import test from "node:test";

import { runCommand } from "../lib/run.js";

const NODE = process.execPath;

test("captures stdout, stderr and the exit code", async () => {
  const result = await runCommand(NODE, [
    "-e",
    "process.stdout.write('out');process.stderr.write('err');process.exit(3)",
  ]);

  assert.equal(result.code, 3);
  assert.equal(result.stdout, "out");
  assert.equal(result.stderr, "err");
  assert.equal(result.truncated, false);
  assert.equal(result.missing, false);
});

test("writes stdin to the child", async () => {
  const result = await runCommand(NODE, ["-e", "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>process.stdout.write(s.toUpperCase()))"], {
    input: "abc",
  });

  assert.equal(result.stdout, "ABC");
});

test("over-long output is truncated and marked", async () => {
  const result = await runCommand(NODE, ["-e", "process.stdout.write('x'.repeat(500))"], { maxBytes: 100 });

  assert.equal(result.truncated, true);
  assert.ok(result.stdout.length <= 100);
});

test("a missing binary is reported as missing", async () => {
  const result = await runCommand("/nonexistent/pactkit-binary-for-tests", []);

  assert.equal(result.missing, true);
  assert.equal(result.code, null);
});

test("a deadline is reported and the child is terminated", async () => {
  const result = await runCommand(NODE, ["-e", "setTimeout(() => {}, 10000)"], { timeoutMs: 150 });

  assert.equal(result.timedOut, true);
  assert.equal(result.code, null);
});

test("aborting resolves promptly and reports the abort", async () => {
  const controller = new AbortController();
  const pending = runCommand(NODE, ["-e", "setTimeout(() => {}, 10000)"], { signal: controller.signal });
  setTimeout(() => controller.abort(), 100);

  const result = await pending;
  assert.equal(result.aborted, true);
});

test("an already-aborted signal does not leave the caller waiting", async () => {
  const controller = new AbortController();
  controller.abort();

  const result = await runCommand(NODE, ["-e", "setTimeout(() => {}, 10000)"], { signal: controller.signal });
  assert.equal(result.aborted, true);
});
