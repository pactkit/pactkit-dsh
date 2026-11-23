// Minimal stand-in for @deepseek-ai/dsh-tools defineTool: the host's defineTool
// validates/normalizes a tool definition; for registration tests the identity is
// enough to prove index.js wires the tool into the host context.
export function defineTool(definition) {
  return definition;
}