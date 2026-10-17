import { describe, expect, it } from 'bun:test';
import { Result } from 'effect';
import { buildRepeatFields, type RepeatFieldOptions } from './repeat-fields';

const build = (options: Partial<RepeatFieldOptions>, isCreate = true) =>
  buildRepeatFields({ on: [], ...options }, isCreate);

const failureMessage = (
  result: ReturnType<typeof buildRepeatFields>,
): string | undefined =>
  Result.isFailure(result) ? result.failure.message : undefined;

const noWeekdays = {
  monday: false,
  tuesday: false,
  wednesday: false,
  thursday: false,
  friday: false,
  saturday: false,
  sunday: false,
};

describe('buildRepeatFields', () => {
  it('sends nothing when no option is given, so the app defaults to daily', () => {
    expect(build({})).toEqual(Result.succeed({}));
  });

  it.each([
    ['daily', 'DAILY'],
    ['weekdays', 'MONDAY_TO_FRIDAY'],
    ['weekly', 'WEEKLY_CURRENT_WEEKDAY'],
    ['monthly', 'MONTHLY_CURRENT_DATE'],
    ['monthly-first-day', 'MONTHLY_FIRST_DAY'],
    ['monthly-last-day', 'MONTHLY_LAST_DAY'],
    ['monthly-nth-weekday', 'MONTHLY_NTH_WEEKDAY'],
    ['yearly', 'YEARLY_CURRENT_DATE'],
  ] as const)('maps the %s preset to %s', (preset, quickSetting) => {
    expect(build({ preset, startDay: '2026-11-02' })).toEqual(
      Result.succeed({ quickSetting, startDate: '2026-11-02' }),
    );
  });

  it('sends all seven weekdays for a weekly custom schedule', () => {
    expect(
      build({ cycle: 'weekly', every: 2, on: ['tue', 'THURSDAY'] }),
    ).toEqual(
      Result.succeed({
        quickSetting: 'CUSTOM',
        repeatCycle: 'WEEKLY',
        repeatEvery: 2,
        ...noWeekdays,
        tuesday: true,
        thursday: true,
      }),
    );
  });

  it('reads comma-separated weekdays and implies the weekly cycle', () => {
    expect(build({ on: ['mon,wed', ' fri '] })).toEqual(
      Result.succeed({
        quickSetting: 'CUSTOM',
        repeatCycle: 'WEEKLY',
        ...noWeekdays,
        monday: true,
        wednesday: true,
        friday: true,
      }),
    );
  });

  it.each([
    ['daily', 'DAILY'],
    ['monthly', 'MONTHLY'],
    ['yearly', 'YEARLY'],
  ] as const)('builds a custom %s schedule', (cycle, repeatCycle) => {
    expect(build({ cycle, every: 3, startDay: '2026-11-01' })).toEqual(
      Result.succeed({
        quickSetting: 'CUSTOM',
        repeatCycle,
        repeatEvery: 3,
        startDate: '2026-11-01',
      }),
    );
  });

  it('keeps the stored cycle when an update changes only the interval', () => {
    expect(build({ every: 4 }, false)).toEqual(
      Result.succeed({ quickSetting: 'CUSTOM', repeatEvery: 4 }),
    );
  });

  it('leaves out quickSetting when only the start day changes', () => {
    expect(build({ startDay: '2026-12-01' }, false)).toEqual(
      Result.succeed({ startDate: '2026-12-01' }),
    );
  });

  it('sends false flags instead of dropping them', () => {
    expect(build({ isPaused: false, skipOverdue: false }, false)).toEqual(
      Result.succeed({ isPaused: false, skipOverdue: false }),
    );
    expect(
      build({ preset: 'daily', isPaused: true, skipOverdue: true }),
    ).toEqual(
      Result.succeed({
        quickSetting: 'DAILY',
        isPaused: true,
        skipOverdue: true,
      }),
    );
  });
});

describe('buildRepeatFields validation', () => {
  it.each([
    [
      'a preset with custom options',
      { preset: 'daily', every: 2 },
      true,
      '--schedule picks a preset',
    ],
    [
      'weekdays on a non-weekly cycle',
      { cycle: 'monthly', on: ['mon'] },
      true,
      '--on only applies to --cycle weekly',
    ],
    [
      'a new custom schedule without a cycle',
      { every: 2 },
      true,
      'needs --cycle',
    ],
    [
      'a weekly cycle without weekdays',
      { cycle: 'weekly' },
      false,
      '--cycle weekly needs --on',
    ],
    ['an interval of 0', { cycle: 'daily', every: 0 }, true, '1 to 1000'],
    [
      'an interval over 1000',
      { cycle: 'daily', every: 1001 },
      true,
      '1 to 1000',
    ],
    ['an unknown weekday', { on: ['mo'] }, true, 'unknown weekday "mo"'],
    ['an empty weekday list', { on: [','] }, true, 'at least one weekday'],
  ] as const)('rejects %s', (_name, options, isCreate, message) => {
    expect(failureMessage(build(options, isCreate))).toContain(message);
  });
});
