import { Result } from 'effect';
import { InvalidInput } from '../../shared/errors/errors';
import { parseDay, parseDuration } from '../../shared/input';

// One change to the time a task has on a calendar day: add to it, or replace
// it. Replacing it with 0 removes the day.
export type TimeEntry = {
  readonly mode: 'add' | 'set';
  readonly date: string;
  readonly duration: number;
};

export type TimeEntryOptions = {
  readonly add?: string | undefined;
  readonly set?: string | undefined;
  readonly day: string;
};

const invalid = (message: string) => Result.fail(new InvalidInput({ message }));

const chooseMode = (options: TimeEntryOptions) => {
  if (options.add !== undefined && options.set === undefined) {
    return Result.succeed({ mode: 'add' as const, value: options.add });
  }
  if (options.set !== undefined && options.add === undefined) {
    return Result.succeed({ mode: 'set' as const, value: options.set });
  }
  return invalid('pass either --add or --set');
};

export const buildTimeEntry = (
  options: TimeEntryOptions,
  now: Date,
): Result.Result<TimeEntry, InvalidInput> =>
  Result.gen(function* () {
    const { mode, value } = yield* chooseMode(options);
    const date = yield* parseDay(options.day, now);
    const duration = yield* parseDuration(value);
    if (mode === 'add' && duration === 0) {
      return yield* invalid(
        '--add needs a duration above 0; use --set 0 to remove the day',
      );
    }
    return { mode, date, duration };
  });
