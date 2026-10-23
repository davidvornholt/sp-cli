import { Clock, Effect, Option, Result } from 'effect';
import { Argument, Flag } from 'effect/cli';
import { resolveWorkContextId } from '../features/work-contexts/work-contexts';
import { InvalidInput } from '../shared/errors/errors';

// Arguments, flags, and input helpers that several commands share.

export const taskId = Argument.String('id').pipe(
  Argument.withDescription('Task id'),
);

export const optionalString = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional);

export const flag = (name: string, description: string) =>
  Flag.Boolean(name).pipe(
    Flag.withDescription(description),
    Flag.withDefault(false),
  );

export const repeatedString = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.atLeast(0));

// `-` reads the Markdown from stdin, which keeps long text out of shell
// quoting.
export const readMarkdown = (value: string) =>
  value === '-'
    ? Effect.promise(() => Bun.stdin.text())
    : Effect.succeed(value);

export const readOptionalMarkdown = (value: Option.Option<string>) =>
  Option.match(value, {
    onNone: () => Effect.succeed(undefined),
    onSome: readMarkdown,
  });

export const nowDate = Effect.map(
  Clock.currentTimeMillis,
  (ms) => new Date(Number(ms)),
);

export const fromResult = <A>(
  result: Result.Result<A, InvalidInput>,
): Effect.Effect<A, InvalidInput> =>
  Result.isSuccess(result)
    ? Effect.succeed(result.success)
    : Effect.fail(result.failure);

export const fail = (message: string) =>
  Effect.fail(new InvalidInput({ message }));

export const resolveOptional = (
  kind: 'project' | 'tag',
  reference: Option.Option<string>,
) =>
  Option.match(reference, {
    onNone: () => Effect.succeed(undefined),
    onSome: (value) => resolveWorkContextId(kind, value),
  });
