import { Effect, Option } from 'effect';
import { Command, Flag } from 'effect/cli';
import { buildTimeEntry } from '../features/tasks/task-time';
import { logTaskTime } from '../features/tasks/tasks';
import { fromResult, nowDate, optionalString, taskId } from './command-inputs';
import { runApi } from './root';

export const time = Command.make(
  'time',
  {
    id: taskId,
    add: optionalString('add', 'Add this much time, such as 25m or 1h30m'),
    set: optionalString(
      'set',
      "Replace the day's time with this; 0 removes it",
    ),
    day: Flag.String('day').pipe(
      Flag.withDescription(
        'Day the time was spent, YYYY-MM-DD or today (default: today)',
      ),
      Flag.withDefault('today'),
    ),
  },
  (options) =>
    runApi(
      Effect.gen(function* () {
        const entry = yield* fromResult(
          buildTimeEntry(
            {
              add: Option.getOrUndefined(options.add),
              set: Option.getOrUndefined(options.set),
              day: options.day,
            },
            yield* nowDate,
          ),
        );
        return yield* logTaskTime(options.id, entry);
      }),
    ),
).pipe(
  Command.withDescription(
    'Add to or replace the time spent on a task on one day and print the task',
  ),
);
