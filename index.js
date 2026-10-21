/**
 * PactKit for DeepSeek Harness.
 *
 * Two registrations, both owned by the plugin context:
 *
 *  - a `tools/pre-execute` listener that sends Bash, Write and Edit calls
 *    through PactKit's own `commit-gate --hook` before dispatch, so the gate is
 *    a host check rather than an instruction the model may skip;
 *  - a `pactkit` tool for the governance commands the host does not run itself.
 *
 * The listener abstains (`next()`) whenever it has no opinion: a tool it does
 * not map, a call outside a PactKit project, or a gate that could not answer.
 */

import { defineTool } from "@deepseek-ai/dsh-tools";

import { SECTION_NAME, SECTION_ORDER, gateContextText, probeCli } from "./lib/context.js";
import { buildGateRequest, decideGate } from "./lib/gate.js";
import { resolveOptions } from "./lib/options.js";
import { findPactkitRoot } from "./lib/project.js";
import { runCommand } from "./lib/run.js";
import { resolveSessionCwd } from "./lib/session.js";

const applied = new WeakSet();
const TOOL_OUTPUT_BYTES = 64 * 1024;

const TOOL_DESCRIPTION =
  "Run a PactKit CLI command in the project. Use it for governance checks the host does not perform on its own: doctor (project health), regression (which tests a change needs), spec-lint and spec-preflight (spec structure), audit (AI-readiness), report, board, context, gate. Returns the exit code and output; `--help` lists every subcommand.";

export function apply(ctx, config) {
  if (!ctx || typeof ctx !== "object") return;
  if (applied.has(ctx)) {
    ctx.logger?.warn?.("pactkit-dsh: apply() already ran on this context — skipping re-entry");
    return;
  }
  applied.add(ctx);

  const options = resolveOptions(config);
  const logger = ctx.logger;
  // "unknown" until the CLI is observed; the prompt notice only claims
  // degradation after a real ENOENT, never from assumption.
  const state = { cli: "unknown" };

  probeCli(options.pactkitPath, runCommand)
    .then((status) => {
      state.cli = status;
      if (status === "missing") {
        logger?.warn?.(
          `pactkit-dsh: "${options.pactkitPath}" was not found, so the gate is not enforcing. Set pactkitPath in the plugin config.`,
        );
      }
    })
    .catch(() => {
      /* an unprobeable CLI stays "unknown" — silence beats a false claim */
    });

  ctx.on("tools/pre-execute", async (exec, next) => {
    if (!options.enforce) return next();

    const request = buildGateRequest({
      toolName: exec?.name,
      toolArgs: exec?.arguments,
      sessionCwd: resolveSessionCwd(ctx, exec?.agent),
      extraGatedTools: options.extraGatedTools,
    });
    if (!request) return next();

    const outcome = await decideGate(request, {
      findRoot: findPactkitRoot,
      runPactkit: runCommand,
      pactkitPath: options.pactkitPath,
      timeoutMs: options.gateTimeoutMs,
      signal: exec?.signal,
      denyWhenUnavailable: options.denyWhenGateUnavailable,
    });

    if (outcome.decision) {
      logger?.debug?.(`pactkit-dsh: blocked ${exec.name} (${outcome.status})`);
      return outcome.decision;
    }
    if (outcome.status !== "allowed" && outcome.status !== "no-project" && outcome.status !== "no-workdir") {
      // A gate that could not answer is a fact worth seeing; it is not a reason
      // to brick the turn (PactKit's own self-lock protection).
      logger?.warn?.(`pactkit-dsh: ${exec?.name} passed ungated (${outcome.status})`);
    }
    return next();
  });

  ctx.inject(["tools"], (sctx) => {
    sctx.effect(() => {
      const dispose = sctx.tools.register(
        defineTool({
          name: "pactkit",
          description: TOOL_DESCRIPTION,
          parameters: {
            argv: {
              type: "array",
              items: { type: "string" },
              required: true,
              description: 'Subcommand and flags, e.g. ["doctor"] or ["spec-lint","docs/specs/SPEC-1.md"].',
            },
            cwd: {
              type: "string",
              description: "Working directory for the command; defaults to the session workspace.",
            },
          },
          output: {
            // A value schema rejects a root `required` list (the author key is
            // only legal inside a parameter map), and no consumer needs it:
            // `execute` always returns all four fields.
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                exitCode: { type: "number" },
                stdout: { type: "string" },
                stderr: { type: "string" },
                truncated: { type: "boolean" },
              },
            },
            render(args, value) {
              const argv = Array.isArray(args?.argv) ? args.argv.join(" ") : "";
              const parts = [`$${argv ? ` pactkit ${argv}` : " pactkit"}`, `exit ${value.exitCode}`];
              if (value.stdout) parts.push(value.stdout.trimEnd());
              if (value.stderr) parts.push(`stderr:\n${value.stderr.trimEnd()}`);
              if (value.truncated) parts.push("[output truncated]");
              return [{ type: "text", text: parts.join("\n") }];
            },
          },
          async execute(args, exec) {
            const argv = Array.isArray(args?.argv) ? args.argv.filter((item) => typeof item === "string") : [];
            if (argv.length === 0) throw new Error("argv must contain at least one PactKit argument");

            const cwd =
              typeof args?.cwd === "string" && args.cwd.trim() ? args.cwd : resolveSessionCwd(ctx, exec?.agent);
            if (!cwd) throw new Error("No working directory: pass cwd explicitly.");

            const result = await runCommand(options.pactkitPath, argv, {
              cwd,
              timeoutMs: options.toolTimeoutMs,
              signal: exec?.signal,
              maxBytes: TOOL_OUTPUT_BYTES,
            });

            if (result.missing) {
              throw new Error(
                `PactKit CLI not found: "${options.pactkitPath}". Install pactkit or set pactkitPath in the plugin config.`,
              );
            }
            if (result.timedOut) throw new Error(`PactKit timed out after ${options.toolTimeoutMs}ms.`);

            return {
              exitCode: result.code ?? -1,
              stdout: result.stdout,
              stderr: result.stderr,
              truncated: result.truncated === true,
            };
          },
        }),
      );
      return () => {
        dispose();
      };
    }, "pactkit-dsh: pactkit tool");
  });

  if (options.injectContext) {
    ctx.inject(["systemPrompt"], (sctx) => {
      sctx.effect(() => {
        const dispose = sctx.systemPrompt.section({
          name: SECTION_NAME,
          order: SECTION_ORDER,
          text: (assembly) =>
            gateContextText({
              ctx,
              scope: assembly?.scope,
              options,
              cliStatus: state.cli,
              findRoot: findPactkitRoot,
            }),
        });
        return () => {
          dispose();
        };
      }, "pactkit-dsh: gate notice");
    });
  }
}
