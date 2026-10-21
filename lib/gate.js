/**
 * The gate decision.
 *
 * PactKit's `commit-gate --hook` is the contract: exit 2 blocks (reason on
 * stderr), exit 0 allows. Everything else — the CLI missing, a timeout, an
 * unexpected exit — is "the gate could not answer", which is a different fact
 * from "the gate said no" and is reported as such.
 *
 * Unavailable defaults to allowing, matching PactKit's own self-lock protection:
 * a gate that cannot run must not make the host unusable. `denyWhenGateUnavailable`
 * flips that for deployments that prefer a closed door.
 */

import { toCanonicalPayload } from "./payload.js";
import { resolveWorkdir } from "./workdir.js";

const GATE_ARGS = Object.freeze(["commit-gate", "--hook"]);
const GATE_OUTPUT_BYTES = 32 * 1024;

export function buildGateRequest({ toolName, toolArgs, sessionCwd, extraGatedTools = [] }) {
  const payload = toCanonicalPayload(toolName, toolArgs, extraGatedTools);
  if (!payload) return null;
  return { payload, workdir: resolveWorkdir(toolName, toolArgs, sessionCwd) };
}

function unavailable(status, denyWhenUnavailable, reason) {
  return { decision: denyWhenUnavailable ? { kind: "deny", reason } : null, status };
}

export function denyReason(result) {
  const text = `${result.stderr || ""}\n${result.stdout || ""}`.trim();
  return text || "PactKit blocked this call.";
}

/**
 * `request` is a buildGateRequest result. `deps` supplies the boundaries
 * (findRoot, runPactkit) so the decision is testable without the Host.
 */
export async function decideGate(request, deps) {
  if (!request) return { decision: null, status: "no-opinion" };
  if (!request.workdir) return { decision: null, status: "no-workdir" };

  const { findRoot, runPactkit, pactkitPath, timeoutMs, signal, denyWhenUnavailable = false } = deps;

  let root = null;
  try {
    root = findRoot(request.workdir);
  } catch {
    root = null;
  }
  if (!root) return { decision: null, status: "no-project" };

  const result = await runPactkit(pactkitPath, GATE_ARGS, {
    cwd: root,
    input: JSON.stringify({ ...request.payload, cwd: root }),
    timeoutMs,
    signal,
    maxBytes: GATE_OUTPUT_BYTES,
  });

  if (result.missing) {
    return unavailable("missing", denyWhenUnavailable, `PactKit gate unavailable: "${pactkitPath}" was not found.`);
  }
  if (result.aborted) {
    // The dispatch is already cancelled; the registry rechecks after listeners
    // settle, so abstaining here is correct rather than denying.
    return { decision: null, status: "aborted" };
  }
  if (result.timedOut) {
    return unavailable("timeout", denyWhenUnavailable, `PactKit gate timed out after ${timeoutMs}ms.`);
  }
  if (result.code === 2) {
    return { decision: { kind: "deny", reason: denyReason(result) }, status: "denied" };
  }
  if (result.code === 0) {
    return { decision: null, status: "allowed" };
  }
  return unavailable("failed", denyWhenUnavailable, `PactKit gate failed (exit ${result.code ?? "null"}).`);
}
