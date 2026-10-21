/**
 * Plugin options.
 *
 * The Loader may hand `config` values that are live references (objects with a
 * `.get()` accessor) rather than plain values, so every read unwraps first.
 * Values are coerced here rather than trusted: a hand-edited patch row must not
 * be able to switch the gate off by writing a typo such as `enforce: "false"`.
 */

export const DEFAULTS = Object.freeze({
  pactkitPath: "pactkit",
  enforce: true,
  gateTimeoutMs: 300000,
  toolTimeoutMs: 120000,
  injectContext: true,
  denyWhenGateUnavailable: false,
  extraGatedTools: [],
});

const isPositiveNumber = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;

export function unwrapConfig(config) {
  if (config === null || typeof config !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(config)) {
    out[key] = value !== null && typeof value === "object" && typeof value.get === "function" ? value.get() : value;
  }
  return out;
}

export function resolveOptions(config) {
  const raw = unwrapConfig(config);
  const pactkitPath = typeof raw.pactkitPath === "string" && raw.pactkitPath.trim() ? raw.pactkitPath.trim() : DEFAULTS.pactkitPath;
  return {
    pactkitPath,
    enforce: raw.enforce !== false,
    gateTimeoutMs: isPositiveNumber(raw.gateTimeoutMs) ? raw.gateTimeoutMs : DEFAULTS.gateTimeoutMs,
    toolTimeoutMs: isPositiveNumber(raw.toolTimeoutMs) ? raw.toolTimeoutMs : DEFAULTS.toolTimeoutMs,
    injectContext: raw.injectContext !== false,
    denyWhenGateUnavailable: raw.denyWhenGateUnavailable === true,
    extraGatedTools: Array.isArray(raw.extraGatedTools)
      ? raw.extraGatedTools.filter((name) => typeof name === "string" && name.trim()).map((name) => name.trim())
      : [],
  };
}
