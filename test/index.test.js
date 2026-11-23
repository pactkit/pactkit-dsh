// STORY-slim-2026112357e873e9d81c: index.js host registration + interception wiring.
// Uses the local @deepseek-ai/dsh-tools stub (test/fixtures/dsh-tools-stub) so the
// unpublished peer dependency does not block CI. The gate decision logic itself is
// covered by gate.test.js; here we prove index.js wires it into the host context.
import { test } from "node:test";
import assert from "node:assert/strict";

import { apply } from "../index.js";

function mockCtx() {
  const handlers = {};
  const registered = [];
  const sections = [];
  const warnings = [];
  const ctx = {
    logger: { warn: (m) => warnings.push(m), debug: () => {} },
    on: (ev, h) => { handlers[ev] = h; },
    inject: (_deps, cb) => cb({
      effect: (fn) => fn(),
      tools: { register: (t) => { registered.push(t); return () => {}; } },
      systemPrompt: { section: (s) => { sections.push(s); return () => {}; } },
    }),
  };
  return { ctx, handlers, registered, sections, warnings };
}

test("apply registers the pactkit tool and a tools/pre-execute listener", () => {
  const { ctx, handlers, registered } = mockCtx();
  apply(ctx, { enforce: false });
  assert.equal(typeof handlers["tools/pre-execute"], "function", "no gate listener attached");
  assert.ok(registered.some((t) => t.name === "pactkit"), "pactkit tool not registered");
  const tool = registered.find((t) => t.name === "pactkit");
  assert.equal(typeof tool.execute, "function", "registered tool has no execute");
});

test("apply is re-entrant safe on the same context", () => {
  const { ctx, registered, warnings } = mockCtx();
  apply(ctx, { enforce: false });
  apply(ctx, { enforce: false });
  assert.equal(registered.filter((t) => t.name === "pactkit").length, 1, "double registration");
  assert.ok(warnings.some((m) => /re-entry/.test(m)), "re-entry not warned");
});

test("apply ignores a non-object context without throwing", () => {
  assert.doesNotThrow(() => apply(null, {}));
  assert.doesNotThrow(() => apply(undefined, {}));
  assert.doesNotThrow(() => apply(42, {}));
});

test("pre-execute abstains (next) when enforcement is off", async () => {
  const { ctx, handlers } = mockCtx();
  apply(ctx, { enforce: false });
  let nextCalled = false;
  const result = await handlers["tools/pre-execute"](
    { name: "Bash", arguments: { command: "ls" } },
    () => { nextCalled = true; return "passed"; },
  );
  assert.ok(nextCalled, "gate did not abstain when enforce=false");
  assert.equal(result, "passed");
});

test("registered tool execute rejects an empty argv", async () => {
  const { ctx, registered } = mockCtx();
  apply(ctx, { enforce: false });
  const tool = registered.find((t) => t.name === "pactkit");
  await assert.rejects(() => tool.execute({ argv: [] }, {}), /argv/);
});