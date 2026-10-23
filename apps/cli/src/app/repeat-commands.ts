import { Effect, Option } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import {
  buildRepeatFields,
  type Cycle,
  cycleNames,
  maxInterval,
  type Preset,
  presetNames,
  type RepeatFieldOptions,
} from '../features/repeats/repeat-fields';
import {
  createRepeat,
  deleteRepeat,
  getRepeat,
  guardMonthlyLastDay,
  listRepeats,
  updateRepeat,
  withQuickSetting,
} from '../features/repeats/repeats';
import { parsePointInDay } from '../features/tasks/task-input';
import {
  fail,
  flag,
  fromResult,
  nowDate,
  optionalString,
  repeatedString,
  resolveOptional,
  toggle,
} from './command-inputs';
import { runApi } from './root';

const repeatId = Argument.String('id').pipe(
  Argument.withDescription(
    'Repeat config id (a recurring task shows it as repeatCfgId)',
  ),
);

const scheduleFlags = {
  schedule: Flag.Literals('schedule', presetNames).pipe(
    Flag.withDescription(
      'Preset schedule; weekly, monthly, monthly-nth-weekday, and yearly follow the start date (weekly on its weekday)',
    ),
    Flag.optional,
  ),
  cycle: Flag.Literals('cycle', cycleNames).pipe(
    Flag.withDescription(
      'Custom schedule: repeat by day, week, month, or year',
    ),
    Flag.optional,
  ),
  every: Flag.Int('every').pipe(
    Flag.withDescription(
      `Custom schedule: every N days, weeks, months, or years (1 to ${maxInterval})`,
    ),
    Flag.optional,
  ),
  on: repeatedString(
    'on',
    'Custom weekly schedule: weekdays such as mon,thu; repeatable; implies --cycle weekly',
  ),
  start: optionalString(
    'start',
    'First day of the schedule (YYYY-MM-DD, today, tomorrow)',
  ),
  skipOverdue: toggle(
    'skip-overdue',
    'Skip missed instances instead of letting them pile up; --no-skip-overdue keeps them (default on create: on for daily schedules only)',
  ),
};

type ScheduleFlagValues = {
  readonly schedule: Option.Option<Preset>;
  readonly cycle: Option.Option<Cycle>;
  readonly every: Option.Option<number>;
  readonly on: ReadonlyArray<string>;
  readonly start: Option.Option<string>;
  readonly skipOverdue: Option.Option<boolean>;
};

const parseStartDay = Effect.fn('parseStartDay')(function* (
  start: Option.Option<string>,
) {
  if (Option.isNone(start)) {
    return;
  }
  const point = yield* fromResult(parsePointInDay(start.value, yield* nowDate));
  if (point._tag !== 'Day') {
    return yield* fail(
      '--start takes a day (YYYY-MM-DD, today, tomorrow), not a time',
    );
  }
  return point.day;
});

const repeatFields = Effect.fn('repeatFields')(function* (
  values: ScheduleFlagValues,
  isPaused: boolean | undefined,
  isCreate: boolean,
) {
  const options: RepeatFieldOptions = {
    preset: Option.getOrUndefined(values.schedule),
    cycle: Option.getOrUndefined(values.cycle),
    every: Option.getOrUndefined(values.every),
    on: values.on,
    startDay: yield* parseStartDay(values.start),
    isPaused,
    skipOverdue: Option.getOrUndefined(values.skipOverdue),
  };
  return yield* fromResult(buildRepeatFields(options, isCreate));
});

const list = Command.make(
  'list',
  {
    project: optionalString(
      'project',
      'Only repeat configs of this project (id or title)',
    ),
  },
  ({ project }) =>
    runApi(
      Effect.flatMap(resolveOptional('project', project), (projectId) =>
        listRepeats(projectId),
      ),
    ),
).pipe(Command.withDescription('List repeat configs, paused ones included'));

const get = Command.make('get', { id: repeatId }, ({ id }) =>
  runApi(getRepeat(id)),
).pipe(Command.withDescription('Show one repeat config'));

const add = Command.make(
  'add',
  {
    taskId: Argument.String('task-id').pipe(
      Argument.withDescription(
        'An active top-level task that is not linked to an issue',
      ),
    ),
    ...scheduleFlags,
    paused: flag('paused', 'Create it paused'),
  },
  ({ taskId, paused, ...values }) =>
    runApi(
      Effect.gen(function* () {
        const fields = yield* repeatFields(
          values,
          paused ? true : undefined,
          true,
        );
        return yield* createRepeat(taskId, fields);
      }),
    ),
).pipe(
  Command.withDescription(
    "Make a task repeat (daily unless a schedule is given) and print the repeat config; it copies the task's title, notes, tags, estimate, and time",
  ),
);

const update = Command.make(
  'update',
  { id: repeatId, ...scheduleFlags },
  ({ id, ...values }) =>
    runApi(
      Effect.gen(function* () {
        const fields = yield* repeatFields(values, undefined, false);
        if (Object.keys(fields).length === 0) {
          return yield* fail(
            'nothing to change; pass a schedule option or --skip-overdue (sp repeats update --help)',
          );
        }
        yield* guardMonthlyLastDay(id, fields);
        return yield* updateRepeat(id, yield* withQuickSetting(id, fields));
      }),
    ),
).pipe(
  Command.withDescription(
    'Change the schedule and print the repeat config; the next open instance moves to the new schedule',
  ),
);

const pause = Command.make('pause', { id: repeatId }, ({ id }) =>
  runApi(updateRepeat(id, { isPaused: true })),
).pipe(Command.withDescription('Stop creating new instances for now'));

const resume = Command.make('resume', { id: repeatId }, ({ id }) =>
  runApi(updateRepeat(id, { isPaused: false })),
).pipe(Command.withDescription('Create new instances again'));

const remove = Command.make('delete', { id: repeatId }, ({ id }) =>
  runApi(deleteRepeat(id)),
).pipe(
  Command.withDescription(
    'Stop repeating: delete the repeat config and keep its tasks',
  ),
);

export const repeats = Command.make('repeats').pipe(
  Command.withDescription('Make tasks repeat, change the schedule, or pause'),
  Command.withSubcommands([list, get, add, update, pause, resume, remove]),
);
