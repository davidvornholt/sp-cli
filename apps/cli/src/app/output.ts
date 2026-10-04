import process from 'node:process';
import { Effect } from 'effect';

// stdout carries the API's data as JSON; stderr carries errors as JSON.
// Pretty-print for people at a terminal; keep piped output compact for agents.
export const writeJson = (stream: NodeJS.WriteStream, value: unknown): void => {
  stream.write(
    `${JSON.stringify(value, null, stream.isTTY === true ? 2 : undefined)}\n`,
  );
};

export const emit = (value: unknown): Effect.Effect<void> =>
  Effect.sync(() => writeJson(process.stdout, value));

export const failureExitCode = 1;
export const usageExitCode = 2;

export type ReportedError = {
  readonly _tag: string;
  readonly message: string;
  readonly status?: number;
  readonly code?: string;
  readonly details?: unknown;
};

// Errors about the arguments themselves, as opposed to app or connection state.
const invalidInputTags = new Set([
  'InvalidInput',
  'UnknownWorkContext',
  'UsageError',
]);

export const report = (error: ReportedError): Effect.Effect<void> =>
  Effect.sync(() => {
    const { _tag, message, status, code, details } = error;
    writeJson(process.stderr, {
      error: { tag: _tag, message, status, code, details },
    });
    process.exitCode = invalidInputTags.has(_tag)
      ? usageExitCode
      : failureExitCode;
  });
