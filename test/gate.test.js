import assert from "node:assert/strict";
import test from "node:test";

import { buildGateRequest, decideGate, denyReason } from "../lib/gate.js";

const ROOT = "/repo";
const WORKDIR = "/repo/src";

const baseRequest = {
  payload: { tool_name: "Bash", tool_input: { command: "git commit -m x" } },
  workdir: WORKDIR,
};

function harness({ root = ROOT, result = { code: 0, stdout: "", stderr: "" }, ...overrides } = {}) {
  const calls = [];
  const deps = {
    findRoot(workdir) {
      calls.push({ kind: "findRoot", workdir });
      return root;
    },
    async runPactkit(bin, args, options) {
      calls.push({ kind: "run", bin, args, options });
      return { missing: false, aborted: false, timedOut: false, stdout: "", stderr: "", truncated: false, ...result };
    },
    pactkitPath: "pactkit",
    timeoutMs: 1000,
    signal: undefined,
    denyWhenUnavailable: false,
    ...overrides,
  };
  return { calls, deps };
}

test("an unmapped call produces no request", () => {
  assert.equal(buildGateRequest({ toolName: "read", toolArgs: {} }), null);
});

test("a request carries the canonical payload and the resolved workdir", () => {
  const request = buildGateRequest({ toolName: "bash", toolArgs: { command: "ls" }, sessionCwd: "/repo" });
  assert.deepEqual(request, { payload: { tool_name: "Bash", tool_input: { command: "ls" } }, workdir: "/repo" });
});

test("a request without a known directory is reported, not substituted", () => {
  const request = buildGateRequest({ toolName: "bash", toolArgs: { command: "ls" }, sessionCwd: undefined });
  assert.deepEqual(request, { payload: { tool_name: "Bash", tool_input: { command: "ls" } }, workdir: undefined });

  return decideGate(request, harness().deps).then((outcome) => {
    assert.deepEqual(outcome, { decision: null, status: "no-workdir" });
  });
});

test("no PactKit ancestor means no adjudication and no CLI run", async () => {
  const { calls, deps } = harness({ root: null });
  const outcome = await decideGate(baseRequest, deps);

  assert.deepEqual(outcome, { decision: null, status: "no-project" });
  assert.equal(calls.filter((call) => call.kind === "run").length, 0);
});

test("a discovery error is treated as no project, not as an allow signal", async () => {
  const { deps } = harness({
    findRoot() {
      throw new Error("boom");
    },
  });

  assert.deepEqual(await decideGate(baseRequest, deps), { decision: null, status: "no-project" });
});

test("exit 0 allows, and the hook receives the canonical payload with the project root", async () => {
  const { calls, deps } = harness();
  const outcome = await decideGate(baseRequest, deps);

  assert.deepEqual(outcome, { decision: null, status: "allowed" });

  const run = calls.find((call) => call.kind === "run");
  assert.deepEqual(run.args, ["commit-gate", "--hook"]);
  assert.equal(run.options.cwd, ROOT);
  assert.deepEqual(JSON.parse(run.options.input), {
    tool_name: "Bash",
    tool_input: { command: "git commit -m x" },
    cwd: ROOT,
  });
});

test("exit 2 denies and carries the gate's own reason", async () => {
  const { deps } = harness({
    result: { code: 2, stdout: "", stderr: "PactKit blocked this commit: tests are not green\n" },
  });
  const outcome = await decideGate(baseRequest, deps);

  assert.equal(outcome.status, "denied");
  assert.equal(outcome.decision.kind, "deny");
  assert.equal(outcome.decision.reason, "PactKit blocked this commit: tests are not green");
});

test("exit 2 with no text still denies with an actionable reason", async () => {
  const { deps } = harness({ result: { code: 2, stdout: "", stderr: "" } });
  const outcome = await decideGate(baseRequest, deps);

  assert.equal(outcome.decision.kind, "deny");
  assert.notEqual(outcome.decision.reason, "");
});

test("denyReason prefers stderr and falls back to stdout", () => {
  assert.equal(denyReason({ stderr: "err", stdout: "out" }), "err\nout");
  assert.equal(denyReason({ stderr: "", stdout: "out" }), "out");
  assert.equal(denyReason({ stderr: "", stdout: "" }), "PactKit blocked this call.");
});

test("a missing CLI allows by default and is reported as missing", async () => {
  const { deps } = harness({ result: { missing: true } });
  const outcome = await decideGate(baseRequest, deps);

  assert.deepEqual(outcome, { decision: null, status: "missing" });
});

test("denyWhenGateUnavailable closes the door when the CLI is missing", async () => {
  const { deps } = harness({ result: { missing: true }, denyWhenUnavailable: true });
  const outcome = await decideGate(baseRequest, deps);

  assert.equal(outcome.decision.kind, "deny");
  assert.match(outcome.decision.reason, /not found/i);
});

test("a timeout is reported, and denies only when configured to", async () => {
  const allowed = await decideGate(baseRequest, harness({ result: { timedOut: true } }).deps);
  assert.deepEqual(allowed, { decision: null, status: "timeout" });

  const closed = await decideGate(
    baseRequest,
    harness({ result: { timedOut: true }, denyWhenUnavailable: true }).deps,
  );
  assert.equal(closed.decision.kind, "deny");
  assert.match(closed.decision.reason, /timed out/i);
});

test("an abort abstains even when unavailable gates would deny", async () => {
  const { deps } = harness({ result: { aborted: true }, denyWhenUnavailable: true });
  assert.deepEqual(await decideGate(baseRequest, deps), { decision: null, status: "aborted" });
});

test("an unexpected exit status is a failed gate, not a denial", async () => {
  const outcome = await decideGate(baseRequest, harness({ result: { code: 1 } }).deps);
  assert.deepEqual(outcome, { decision: null, status: "failed" });

  const closed = await decideGate(
    baseRequest,
    harness({ result: { code: 1 }, denyWhenUnavailable: true }).deps,
  );
  assert.equal(closed.decision.kind, "deny");
  assert.match(closed.decision.reason, /exit 1/);
});
