/**
 * The working directory a tool call actually operates in.
 *
 * An unknown directory returns undefined instead of a substitute: the caller
 * then declines to adjudicate. Falling back to the Host process's own cwd would
 * route an unidentified call into whatever repository the app happened to be
 * launched from, which is the silent-pass shape this plugin exists to avoid.
 */

import path from "node:path";

const asNonEmpty = (value) => (typeof value === "string" && value.trim() ? value : undefined);

function resolveAgainst(base, candidate) {
  if (!candidate) return undefined;
  try {
    if (path.isAbsolute(candidate)) return path.normalize(candidate);
    if (!base) return undefined;
    return path.resolve(base, candidate);
  } catch {
    return undefined;
  }
}

export function resolveWorkdir(toolName, toolArgs, sessionCwd) {
  const args = toolArgs && typeof toolArgs === "object" ? toolArgs : {};
  const base = asNonEmpty(sessionCwd);

  if (toolName === "bash") {
    const explicit = asNonEmpty(args.workdir);
    // bash resolves `workdir` against the session workspace, as the tool does.
    if (explicit) return resolveAgainst(base, explicit);
    return base;
  }

  const filePath = asNonEmpty(args.file_path);
  if (!filePath) return base;
  const resolved = resolveAgainst(base, filePath);
  if (!resolved) return undefined;
  return path.dirname(resolved);
}
