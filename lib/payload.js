/**
 * DSH tool call -> PactKit's canonical pre-dispatch payload.
 *
 * PactKit's `commit-gate --hook` consumes `{ tool_name, tool_input }` and
 * returns exit 2 with a reason on stderr to block. The mapping below is the
 * whole integration surface: a tool this module does not map is a tool the gate
 * never adjudicates, so it must stay explicit rather than heuristic.
 *
 * `extraGatedTools` is the escape hatch for a write-capable tool this plugin
 * does not know: its arguments are forwarded verbatim under its own name, and
 * PactKit decides — an unknown name that advertises a write surface is denied as
 * uncovered, a read-only one is allowed.
 */

export const CORE_GATED_TOOLS = Object.freeze(["bash", "write", "edit"]);

const asString = (value) => (typeof value === "string" ? value : "");

export function toCanonicalPayload(toolName, toolArgs, extraGatedTools = []) {
  const args = toolArgs && typeof toolArgs === "object" ? toolArgs : {};

  switch (toolName) {
    case "bash": {
      const command = asString(args.command);
      // No command means nothing to judge; `hook_entry` would read an empty
      // string and allow, so claiming a decision here would be a false one.
      if (!command.trim()) return null;
      return { tool_name: "Bash", tool_input: { command } };
    }
    case "write": {
      const filePath = asString(args.file_path).trim();
      if (!filePath) return null;
      return {
        tool_name: "Write",
        tool_input: { file_path: filePath, content: asString(args.content) },
      };
    }
    case "edit": {
      const filePath = asString(args.file_path).trim();
      if (!filePath) return null;
      const toolInput = {
        file_path: filePath,
        // `replace_all` is honored by the tamper guard; a missing flag and an
        // explicit false are the same thing there, so only send it when true.
        old_string: asString(args.old_string),
        new_string: asString(args.new_string),
      };
      if (args.replace_all === true) toolInput.replace_all = true;
      return { tool_name: "Edit", tool_input: toolInput };
    }
    default: {
      if (!Array.isArray(extraGatedTools) || !extraGatedTools.includes(toolName)) return null;
      return { tool_name: toolName, tool_input: args };
    }
  }
}
