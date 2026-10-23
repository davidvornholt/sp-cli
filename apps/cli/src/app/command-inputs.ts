import { Clock, Effect, Option, Result } from 'effect';
import { Argument, Flag } from 'effect/cli';
import { resolveWorkContextId } from '../features/work-contexts/work-contexts';
import { InvalidInput } from '../shared/errors/errors';

// Arguments, flags, and input helpers that several commands share.

export const taskId = Argument.String('id').pipe(
  Argument.withDescription('Task id'),
);

// Like `Flag.optional`, but a repeated flag is an error: the parser would keep
// the first value, so `--every 2 --every 3` or `--x --no-x` would silently
// mean the first one.
export const once = <A>(self: Flag.Flag<A>): Flag.Flag<Option.Option<A>> =>
  self.pipe(
    Flag.atMost(1),
    Flag.map((values) => Option.fromUndefinedOr(values[0])),
  );

export const optionalString = (name: string, description: string) =>
  once(Flag.String(name).pipe(Flag.withDescription(description)));

export const toggle = (name: string, description: string) =>
  once(Flag.Boolean(name).pipe(Flag.withDescription(description)));

export const flag = (name: string, description: string) =>
  toggle(name, description).pipe(Flag.map(Option.getOrElse(() => false)));

export const repeatedString = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.atLeast(0));

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
