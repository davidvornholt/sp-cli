import { Result } from 'effect';
import {
  InvalidInput,
  parseDateTime,
  parseDuration,
  parsePointInDay,
} from './task-input';

// Writable task fields as the CLI collects them. Project and tag values are
// already resolved to ids. `null` clears a field on update.
export type TaskFieldOptions = {
  readonly title?: string | undefined;
  readonly notes?: string | undefined;
  readonly isDone?: boolean | undefined;
  readonly estimate?: string | undefined;
  readonly projectId?: string | undefined;
  readonly tagIds?: ReadonlyArray<string> | undefined;
  readonly due?: string | null | undefined;
  readonly deadline?: string | null | undefined;
  readonly deadlineReminder?: string | null | undefined;
};

export type TaskFields = Readonly<Record<string, unknown>>;

const scheduleFields = (
  key: 'due' | 'deadline',
  value: string | null,
  now: Date,
): Result.Result<TaskFields, InvalidInput> => {
  const [dayField, timeField] =
    key === 'due'
      ? ['dueDay', 'dueWithTime']
      : ['deadlineDay', 'deadlineWithTime'];
  if (value === null) {
    // A reminder without a deadline is meaningless, so it goes too.
    const reminder = key === 'deadline' ? { deadlineRemindAt: null } : {};
    return Result.succeed({ [dayField]: null, [timeField]: null, ...reminder });
  }
  // A day and a time are mutually exclusive in the app, so setting one clears
  // the other.
  return Result.map(parsePointInDay(value, now), (point) =>
    point._tag === 'Day'
      ? { [dayField]: point.day, [timeField]: null }
      : { [dayField]: null, [timeField]: point.epochMs },
  );
};

const reminderFields = (
  value: string | null,
  now: Date,
): Result.Result<TaskFields, InvalidInput> =>
  value === null
    ? Result.succeed({ deadlineRemindAt: null })
    : Result.map(parseDateTime(value, now), (epochMs) => ({
        deadlineRemindAt: epochMs,
      }));

const present = (key: string, value: unknown): TaskFields =>
  value === undefined ? {} : { [key]: value };

const parsed = <A>(
  value: A | undefined,
  parse: (defined: A) => Result.Result<TaskFields, InvalidInput>,
): Result.Result<TaskFields, InvalidInput> =>
  value === undefined ? Result.succeed({}) : parse(value);

// Builds the request body fields. `isCreate` leaves out the clearing nulls
// that only make sense when changing an existing task.
export const buildTaskFields = (
  options: TaskFieldOptions,
  now: Date,
  isCreate: boolean,
): Result.Result<TaskFields, InvalidInput> =>
  Result.gen(function* () {
    if (options.title?.trim() === '') {
      return yield* Result.fail(
        new InvalidInput({ message: 'the title must not be empty' }),
      );
    }
    const fields: TaskFields = {
      ...present('title', options.title),
      ...present('notes', options.notes),
      ...present('isDone', options.isDone),
      ...present('projectId', options.projectId),
      ...present('tagIds', options.tagIds && [...options.tagIds]),
      ...(yield* parsed(options.estimate, (estimate) =>
        Result.map(parseDuration(estimate), (ms) => ({ timeEstimate: ms })),
      )),
      ...(yield* parsed(options.due, (due) => scheduleFields('due', due, now))),
      ...(yield* parsed(options.deadline, (deadline) =>
        scheduleFields('deadline', deadline, now),
      )),
      // After the deadline, so an explicit reminder wins over the clearing.
      ...(yield* parsed(options.deadlineReminder, (reminder) =>
        reminderFields(reminder, now),
      )),
    };
    return isCreate
      ? Object.fromEntries(
          Object.entries(fields).filter(([, value]) => value !== null),
        )
      : fields;
  });
