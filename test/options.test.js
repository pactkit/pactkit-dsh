import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULTS, resolveOptions, unwrapConfig } from "../lib/options.js";

test("an absent config resolves to the defaults", () => {
  assert.deepEqual(resolveOptions(undefined), { ...DEFAULTS });
  assert.deepEqual(resolveOptions({}), { ...DEFAULTS });
});

test("a string 'false' cannot switch the gate off", () => {
  assert.equal(resolveOptions({ enforce: "false" }).enforce, true);
  assert.equal(resolveOptions({ enforce: false }).enforce, false);
});

test("only an explicit true opts into closing on an unavailable gate", () => {
  assert.equal(resolveOptions({ denyWhenGateUnavailable: "true" }).denyWhenGateUnavailable, false);
  assert.equal(resolveOptions({ denyWhenGateUnavailable: true }).denyWhenGateUnavailable, true);
});

test("timeouts fall back when they are not positive numbers", () => {
  assert.equal(resolveOptions({ gateTimeoutMs: -1 }).gateTimeoutMs, DEFAULTS.gateTimeoutMs);
  assert.equal(resolveOptions({ gateTimeoutMs: "1000" }).gateTimeoutMs, DEFAULTS.gateTimeoutMs);
  assert.equal(resolveOptions({ gateTimeoutMs: 1500 }).gateTimeoutMs, 1500);
});

test("extraGatedTools keeps only non-empty strings", () => {
  assert.deepEqual(resolveOptions({ extraGatedTools: ["apply_patch", "", "  ", 3] }).extraGatedTools, ["apply_patch"]);
  assert.deepEqual(resolveOptions({ extraGatedTools: "apply_patch" }).extraGatedTools, []);
});

test("volatile config references are unwrapped", () => {
  const live = { get: () => "absolute/pactkit" };
  assert.equal(unwrapConfig({ pactkitPath: live }).pactkitPath, "absolute/pactkit");
  assert.equal(resolveOptions({ pactkitPath: live }).pactkitPath, "absolute/pactkit");
});
