import { Clock, Effect, Result } from 'effect';
import { Argument, Flag } from 'effect/cli';
import { InvalidInput } from '../features/tasks/task-input';

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
