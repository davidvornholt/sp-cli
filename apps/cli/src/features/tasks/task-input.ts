import { Result, Schema } from 'effect';

// Turns the human-friendly values the CLI accepts into the fields the Super
// Productivity API stores: durations in milliseconds, calendar days as
// YYYY-MM-DD, and points in time as epoch milliseconds.

export class InvalidInput extends Schema.TaggedError<InvalidInput>()(
  'InvalidInput',
  {
    message: Schema.String,
  },
) {}

const unitMs = { h: 3_600_000, m: 60_000, s: 1000 } as const;
const durationPattern =
  /^(?:(?<hours>\d+(?:\.\d+)?)h)?(?:(?<minutes>\d+(?:\.\d+)?)m)?(?:(?<seconds>\d+(?:\.\d+)?)s)?$/u;

// Accepts "1h30m", "90m", "1.5h", "45s", or "0".
export const parseDuration = (
  input: string,
): Result.Result<number, InvalidInput> => {
  const text = input.trim().toLowerCase();
  if (text === '0') {
    return Result.succeed(0);
  }
  const match = durationPattern.exec(text);
  if (text === '' || match === null) {
    return Result.fail(
      new InvalidInput({
        message: `invalid duration "${input}"; use forms like 1h30m, 90m, 1.5h, or 45s`,
      }),
    );
  }
  const { hours, minutes, seconds } = match.groups ?? {};
  const total =
    Number(hours ?? 0) * unitMs.h +
    Number(minutes ?? 0) * unitMs.m +
    Number(seconds ?? 0) * unitMs.s;
  return Result.succeed(Math.round(total));
};

const pad = (value: number): string => String(value).padStart(2, '0');

export const formatDay = (date: Date): string =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const dayPattern = /^(?<year>\d{4})-(?<month>\d{2})-(?<date>\d{2})$/u;
const dateTimePattern =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<date>\d{2})[T ](?<hours>\d{2}):(?<minutes>\d{2})$/u;

// Reads the named numeric groups of a date pattern match; absent groups are 0.
const numericGroups = (match: RegExpExecArray) => {
  const groups = match.groups ?? {};
  const read = (name: string): number => Number(groups[name] ?? 0);
  return {
    year: read('year'),
    month: read('month'),
    date: read('date'),
    hours: read('hours'),
    minutes: read('minutes'),
  };
};

export type PointInDay =
  | { readonly _tag: 'Day'; readonly day: string }
  | { readonly _tag: 'DateTime'; readonly epochMs: number };

const relativeDays: Readonly<Record<string, number>> = {
  today: 0,
  tomorrow: 1,
};

const isRealDate = (
  date: Date,
  year: number,
  month: number,
  day: number,
): boolean =>
  date.getFullYear() === year &&
  date.getMonth() === month - 1 &&
  date.getDate() === day;

// Accepts YYYY-MM-DD, "today", "tomorrow", or a local YYYY-MM-DDTHH:MM time.
// Times without an offset use this machine's time zone, like the app does.
export const parsePointInDay = (
  input: string,
  now: Date,
): Result.Result<PointInDay, InvalidInput> => {
  const text = input.trim();
  const invalid = Result.fail(
    new InvalidInput({
      message: `invalid date "${input}"; use YYYY-MM-DD, today, tomorrow, or YYYY-MM-DDTHH:MM`,
    }),
  );
  const offset = relativeDays[text.toLowerCase()];
  if (offset !== undefined) {
    const date = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + offset,
    );
    return Result.succeed({ _tag: 'Day', day: formatDay(date) });
  }
  const day = dayPattern.exec(text);
  if (day !== null) {
    const { year, month, date } = numericGroups(day);
    return isRealDate(new Date(year, month - 1, date), year, month, date)
      ? Result.succeed({ _tag: 'Day', day: text })
      : invalid;
  }
  const dateTime = dateTimePattern.exec(text);
  if (dateTime !== null) {
    const { year, month, date, hours, minutes } = numericGroups(dateTime);
    const value = new Date(year, month - 1, date, hours, minutes);
    return isRealDate(value, year, month, date) && hours < 24 && minutes < 60
      ? Result.succeed({ _tag: 'DateTime', epochMs: value.getTime() })
      : invalid;
  }
  return invalid;
};

// Reminders need an exact time, so a bare day is rejected.
export const parseDateTime = (
  input: string,
  now: Date,
): Result.Result<number, InvalidInput> =>
  Result.flatMap(parsePointInDay(input, now), (point) =>
    point._tag === 'DateTime'
      ? Result.succeed(point.epochMs)
      : Result.fail(
          new InvalidInput({
            message: `"${input}" needs a time; use YYYY-MM-DDTHH:MM`,
          }),
        ),
  );
