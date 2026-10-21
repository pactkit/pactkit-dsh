/**
 * Subprocess runner.
 *
 * Every field is always present so a caller never has to distinguish an absent
 * key from a false one. The output cap marks truncation instead of silently
 * shortening a gate's reason.
 */

import { spawn } from "node:child_process";

const DEFAULT_MAX_BYTES = 64 * 1024;
const KILL_GRACE_MS = 2000;

const emptyResult = () => ({
  code: null,
  signal: null,
  stdout: "",
  stderr: "",
  truncated: false,
  timedOut: false,
  aborted: false,
  missing: false,
});

const isMissingBinary = (error) => error?.code === "ENOENT";

export function runCommand(command, argv, options = {}) {
  return new Promise((resolve) => {
    const {
      cwd,
      input,
      timeoutMs = 0,
      signal,
      maxBytes = DEFAULT_MAX_BYTES,
      env = process.env,
      killGraceMs = KILL_GRACE_MS,
    } = options;

    let child;
    try {
      child = spawn(command, argv, { cwd, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    } catch (error) {
      resolve({ ...emptyResult(), missing: isMissingBinary(error), error });
      return;
    }

    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let timer;
    let killTimer;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      // The SIGKILL escalation is deliberately left armed: an abort resolves
      // immediately, before the child is known to be gone, so cancelling the
      // fallback here would let a child that ignores SIGTERM survive.
      if (signal) signal.removeEventListener("abort", onAbort);
      resolve(result);
    };

    const terminate = () => {
      try {
        child.kill("SIGTERM");
      } catch {
        /* already gone */
      }
      killTimer = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* already gone */
        }
      }, killGraceMs);
      // Never hold the Host process open for a grace timer.
      killTimer.unref?.();
    };

    const onAbort = () => {
      aborted = true;
      terminate();
      // The dispatch this gate belongs to is already cancelled; make it stop
      // waiting instead of holding the turn until the child exits.
      finish({ ...emptyResult(), aborted: true, stdout, stderr, truncated });
    };

    const collect = (chunk, kind) => {
      const field = kind === "out" ? "stdout" : "stderr";
      const current = kind === "out" ? stdout : stderr;
      if (Buffer.byteLength(current, "utf8") >= maxBytes) {
        truncated = true;
        return;
      }
      const next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next, "utf8") > maxBytes) {
        const sliced = next.slice(0, maxBytes);
        if (field === "stdout") stdout = sliced;
        else stderr = sliced;
        truncated = true;
        return;
      }
      if (field === "stdout") stdout = next;
      else stderr = next;
    };

    child.stdout?.on("data", (chunk) => collect(chunk, "out"));
    child.stderr?.on("data", (chunk) => collect(chunk, "err"));
    // A child that exits without reading stdin produces EPIPE; that is not a
    // failure of the command, so it must not surface as an unhandled error.
    child.stdin?.on("error", () => {});

    if (input !== undefined) child.stdin?.end(input);
    else child.stdin?.end();

    child.on("error", (error) => {
      finish({ ...emptyResult(), missing: isMissingBinary(error), error });
    });

    child.on("close", (code, closeSignal) => {
      finish({
        ...emptyResult(),
        code,
        signal: closeSignal,
        stdout,
        stderr,
        truncated,
        timedOut,
        aborted,
      });
    });

    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        terminate();
      }, timeoutMs);
      timer.unref?.();
    }

    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}
