import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
// biome-ignore lint/correctness/noNodejsModules: sets TZ so the daylight saving tests run in Berlin time on any machine
import process from 'node:process';
import { Result } from 'effect';
import {
  formatDay,
  parseDateTime,
  parseDay,
  parseDuration,
  parsePointInDay,
} from './input';

// Date-time strings without an offset are local time, like the CLI's input.
const local = (dateTime: string): Date => new Date(dateTime);

// A fixed local "now" keeps relative days deterministic.
const now = local('2026-10-04T15:30');

describe('parseDuration', () => {
  const ninetyMinutes = 5_400_000;
  const fortyFiveSeconds = 45_000;
  const twoHours = 7_200_000;
  it.each([
    ['1h30m', ninetyMinutes],
    ['90m', ninetyMinutes],
    ['1.5h', ninetyMinutes],
    ['45s', fortyFiveSeconds],
    ['2H', twoHours],
    ['0', 0],
  ])('parses %s', (input, expected) => {
    expect(parseDuration(input)).toEqual(Result.succeed(expected));
  });

  it.each(['', 'soon', '1d', '30', 'm', '-1h'])('rejects %p', (input) => {
    expect(Result.isFailure(parseDuration(input))).toBe(true);
  });
});

describe('parsePointInDay', () => {
  it('resolves today and tomorrow in local time', () => {
    expect(parsePointInDay('today', now)).toEqual(
      Result.succeed({ _tag: 'Day', day: '2026-10-04' }),
    );
    expect(parsePointInDay('Tomorrow', now)).toEqual(
      Result.succeed({ _tag: 'Day', day: '2026-10-05' }),
    );
  });

  it('crosses month and year ends', () => {
    expect(parsePointInDay('tomorrow', local('2026-12-31T00:00'))).toEqual(
      Result.succeed({ _tag: 'Day', day: '2027-01-01' }),
    );
  });

  it('keeps calendar days as typed', () => {
    expect(parsePointInDay('2026-02-28', now)).toEqual(
      Result.succeed({ _tag: 'Day', day: '2026-02-28' }),
    );
  });

  it('reads times as local time', () => {
    const expected = local('2026-10-06T09:15').getTime();
    expect(parsePointInDay('2026-10-06T09:15', now)).toEqual(
      Result.succeed({ _tag: 'DateTime', epochMs: expected }),
    );
    expect(parsePointInDay('2026-10-06 09:15', now)).toEqual(
      Result.succeed({ _tag: 'DateTime', epochMs: expected }),
    );
  });

  it.each([
    '2026-02-30',
    '2026-13-01',
    '2026-10-06T24:00',
    '2026-10-06T10:60',
    '06.10.2026',
    'next week',
  ])('rejects %p', (input) => {
    expect(Result.isFailure(parsePointInDay(input, now))).toBe(true);
  });

  describe('across daylight saving changes in Berlin', () => {
    const originalTimeZone = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = 'Europe/Berlin';
    });
    afterAll(() => {
      if (originalTimeZone === undefined) {
        delete process.env.TZ;
      } else {
        process.env.TZ = originalTimeZone;
      }
    });

    // Clocks jump from 02:00 to 03:00 on 28 March 2027, so 02:30 never happens.
    it('rejects a time the clocks skip', () => {
      expect(Result.isFailure(parsePointInDay('2027-03-28T02:30', now))).toBe(
        true,
      );
    });

    it('accepts the times around the skipped hour', () => {
      expect(parsePointInDay('2027-03-28T01:59', now)).toEqual(
        Result.succeed({
          _tag: 'DateTime',
          epochMs: Date.parse('2027-03-28T00:59:00Z'),
        }),
      );
      expect(parsePointInDay('2027-03-28T03:00', now)).toEqual(
        Result.succeed({
          _tag: 'DateTime',
          epochMs: Date.parse('2027-03-28T01:00:00Z'),
        }),
      );
    });
  });
});

describe('parseDateTime', () => {
  it('requires a time', () => {
    expect(Result.isFailure(parseDateTime('2026-10-06', now))).toBe(true);
    expect(parseDateTime('2026-10-06T08:00', now)).toEqual(
      Result.succeed(local('2026-10-06T08:00').getTime()),
    );
  });
});

describe('parseDay', () => {
  it('keeps days and rejects times', () => {
    expect(parseDay('today', now)).toEqual(Result.succeed('2026-10-04'));
    expect(Result.isFailure(parseDay('2026-10-06T08:00', now))).toBe(true);
  });
});

describe('formatDay', () => {
  it('pads months and days', () => {
    expect(formatDay(local('2026-01-05T00:00'))).toBe('2026-01-05');
  });
});
