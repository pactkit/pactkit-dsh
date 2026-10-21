/**
 * The session directory a gate should judge a call against.
 *
 * Both services are read through `ctx.get` because neither is guaranteed by the
 * plugin's own inject list; a profile without them keeps the plugin loaded but
 * leaves it unable to locate a project, which is a fact the caller can report.
 */

function safeGet(ctx, name) {
  if (!ctx || typeof ctx.get !== "function") return undefined;
  try {
    return ctx.get(name);
  } catch {
    return undefined;
  }
}

export function resolveSessionCwd(ctx, agent) {
  if (!agent || typeof agent.id !== "string") return undefined;

  const sessions = safeGet(ctx, "sessions");
  const workingDirectory = safeGet(ctx, "workingDirectory");
  if (!sessions || !workingDirectory) return undefined;

  try {
    const session = sessions.get(agent.id);
    if (!session) return undefined;
    const directory = workingDirectory.get(session);
    return typeof directory === "string" && directory.trim() ? directory : undefined;
  } catch {
    return undefined;
  }
}
