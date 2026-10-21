/**
 * The system-prompt notice.
 *
 * It states the one thing a model cannot learn from a tool result: that some
 * calls are adjudicated before they run, and that a blocked call must be fixed
 * rather than retried. It is emitted only inside a PactKit project, and the
 * degraded line is emitted only after the CLI was actually observed missing —
 * an unverified "gates are active" claim would be worse than silence.
 */

import { resolveSessionCwd } from "./session.js";

export const SECTION_NAME = "pactkit:gates";
export const SECTION_ORDER = 520;

export function gateContextText({ ctx, scope, options, cliStatus, findRoot }) {
  const directory = resolveSessionCwd(ctx, scope);
  if (!directory) return "";

  let root = null;
  try {
    root = findRoot(directory);
  } catch {
    root = null;
  }
  if (!root) return "";

  const lines = [
    `PactKit gates are active in ${root}: before dispatch the host runs PactKit's pre-tool gate on Bash, Write and Edit. A blocked call returns the gate's reason and never executes — fix the cause instead of retrying the same call.`,
  ];
  if (cliStatus === "missing") {
    lines.push(`The PactKit CLI "${options.pactkitPath}" was not found, so the gate is not enforcing.`);
  }
  return lines.join("\n");
}

/**
 * Does the configured CLI run at all? Any exit status means the binary exists;
 * only ENOENT means it does not. A timeout leaves the answer unknown rather than
 * guessing in either direction.
 */
export async function probeCli(pactkitPath, run) {
  const result = await run(pactkitPath, ["--help"], { timeoutMs: 20000, maxBytes: 4096 });
  if (result.missing) return "missing";
  if (result.timedOut || result.aborted) return "unknown";
  return "available";
}
