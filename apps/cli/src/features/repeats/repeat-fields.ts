import { Result } from 'effect';
import { InvalidInput } from '../../shared/errors/errors';

// The repeat dialog's presets. Each one derives its cycle and weekdays from
// the start date, e.g. `weekly` repeats on the start date's weekday.
const presets = {
  daily: 'DAILY',
  weekdays: 'MONDAY_TO_FRIDAY',
  weekly: 'WEEKLY_CURRENT_WEEKDAY',
  monthly: 'MONTHLY_CURRENT_DATE',
  'monthly-first-day': 'MONTHLY_FIRST_DAY',
  'monthly-last-day': 'MONTHLY_LAST_DAY',
  'monthly-nth-weekday': 'MONTHLY_NTH_WEEKDAY',
  yearly: 'YEARLY_CURRENT_DATE',
} as const;

export type Preset = keyof typeof presets;

export const presetNames = [
  'daily',
  'weekdays',
  'weekly',
  'monthly',
  'monthly-first-day',
  'monthly-last-day',
  'monthly-nth-weekday',
  'yearly',
] as const satisfies ReadonlyArray<Preset>;

const cycles = {
  daily: 'DAILY',
  weekly: 'WEEKLY',
  monthly: 'MONTHLY',
  yearly: 'YEARLY',
} as const;

export type Cycle = keyof typeof cycles;

export const cycleNames = [
  'daily',
  'weekly',
  'monthly',
  'yearly',
] as const satisfies ReadonlyArray<Cycle>;

const weekdays = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

type Weekday = (typeof weekdays)[number];

export const maxInterval = 1000;

// Writable repeat config fields as the CLI collects them. `startDay` is
// already a YYYY-MM-DD day.
export type RepeatFieldOptions = {
  readonly preset?: Preset | undefined;
  readonly cycle?: Cycle | undefined;
  readonly every?: number | undefined;
  readonly on: ReadonlyArray<string>;
  readonly startDay?: string | undefined;
  readonly isPaused?: boolean | undefined;
  readonly skipOverdue?: boolean | undefined;
};

export type RepeatFields = Readonly<Record<string, unknown>>;

const invalid = (message: string) => Result.fail(new InvalidInput({ message }));

const shortNameLength = 3;

const matchWeekday = (token: string): Weekday | undefined =>
  weekdays.find(
    (day) => day === token || day.slice(0, shortNameLength) === token,
  );

// Accepts mon or monday, comma-separated or repeated, in any case.
const parseWeekdays = (
  values: ReadonlyArray<string>,
): Result.Result<ReadonlySet<Weekday>, InvalidInput> => {
  const tokens = values
    .flatMap((value) => value.split(','))
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token !== '');
  const unknown = tokens.find((token) => matchWeekday(token) === undefined);
  if (unknown !== undefined) {
    return invalid(
      `unknown weekday "${unknown}"; use mon, tue, wed, thu, fri, sat, sun, or full names`,
    );
  }
  if (tokens.length === 0) {
    return invalid('--on needs at least one weekday, e.g. --on mon,thu');
  }
  return Result.succeed(
    new Set(tokens.flatMap((token) => matchWeekday(token) ?? [])),
  );
};

const customSchedule = (
  options: RepeatFieldOptions,
  isCreate: boolean,
): Result.Result<RepeatFields, InvalidInput> => {
  const cycle = options.cycle ?? (options.on.length > 0 ? 'weekly' : undefined);
  if (options.on.length > 0 && cycle !== 'weekly') {
    return invalid('--on only applies to --cycle weekly');
  }
  if (cycle === undefined && isCreate) {
    return invalid(
      'a custom schedule needs --cycle (daily, weekly, monthly, or yearly)',
    );
  }
  // The app would keep whatever weekdays the config stored before.
  if (options.cycle === 'weekly' && options.on.length === 0) {
    return invalid(
      '--cycle weekly needs --on with the weekdays, e.g. --on mon',
    );
  }
  if (
    options.every !== undefined &&
    (options.every < 1 || options.every > maxInterval)
  ) {
    return invalid(`--every must be from 1 to ${maxInterval}`);
  }
  const days =
    options.on.length > 0 ? parseWeekdays(options.on) : Result.succeed(null);
  return Result.map(days, (selected) => ({
    quickSetting: 'CUSTOM',
    ...(cycle === undefined ? {} : { repeatCycle: cycles[cycle] }),
    ...(options.every === undefined ? {} : { repeatEvery: options.every }),
    // Every weekday is sent, unlisted ones as false: the app keeps the stored
    // value of a weekday left out, and a new config has Monday to Friday on.
    ...(selected === null
      ? {}
      : Object.fromEntries(weekdays.map((day) => [day, selected.has(day)]))),
  }));
};

const scheduleFields = (
  options: RepeatFieldOptions,
  isCreate: boolean,
): Result.Result<RepeatFields, InvalidInput> => {
  const isCustom =
    options.cycle !== undefined ||
    options.every !== undefined ||
    options.on.length > 0;
  if (options.preset !== undefined && isCustom) {
    return invalid(
      '--schedule picks a preset; --cycle, --every, and --on build a custom schedule. Use one or the other',
    );
  }
  const start =
    options.startDay === undefined ? {} : { startDate: options.startDay };
  if (isCustom) {
    return Result.map(customSchedule(options, isCreate), (custom) => ({
      ...custom,
      ...start,
    }));
  }
  return Result.succeed({
    ...(options.preset === undefined
      ? {}
      : { quickSetting: presets[options.preset] }),
    ...start,
  });
};

const present = (key: string, value: unknown): RepeatFields =>
  value === undefined ? {} : { [key]: value };

// Maps the options to the API's body fields, sending only what was given.
// A start day alone leaves out `quickSetting`; see `withQuickSetting`.
export const buildRepeatFields = (
  options: RepeatFieldOptions,
  isCreate: boolean,
): Result.Result<RepeatFields, InvalidInput> =>
  Result.map(scheduleFields(options, isCreate), (schedule) => ({
    ...schedule,
    ...present('isPaused', options.isPaused),
    ...present('skipOverdue', options.skipOverdue),
  }));
