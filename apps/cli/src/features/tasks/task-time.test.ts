import { describe, expect, it } from 'bun:test';
import { Result } from 'effect';
import { buildTimeEntry } from './task-time';

// Date-time strings without an offset are local time, like the CLI's input.
const now = new Date('2026-10-22T08:30');

const twentyFiveMinutes = 1_500_000;

describe('buildTimeEntry', () => {
  it('adds time to a day', () => {
    expect(buildTimeEntry({ add: '25m', day: '2026-10-21' }, now)).toEqual(
      Result.succeed({
        mode: 'add',
        date: '2026-10-21',
        duration: twentyFiveMinutes,
      }),
    );
  });

  it('resolves today in local time', () => {
    expect(buildTimeEntry({ set: '25m', day: 'today' }, now)).toEqual(
      Result.succeed({
        mode: 'set',
        date: '2026-10-22',
        duration: twentyFiveMinutes,
      }),
    );
  });

  it('sets a day to 0 to remove it', () => {
    expect(buildTimeEntry({ set: '0', day: '2026-10-21' }, now)).toEqual(
      Result.succeed({ mode: 'set', date: '2026-10-21', duration: 0 }),
    );
  });

  it.each([
    [{ day: 'today' }],
    [{ add: '25m', set: '1h', day: 'today' }],
    [{ add: '0', day: 'today' }],
    [{ add: 'soon', day: 'today' }],
    [{ add: '25m', day: '2026-10-21T09:00' }],
    [{ add: '25m', day: 'last week' }],
  ])('rejects %p', (options) => {
    expect(Result.isFailure(buildTimeEntry(options, now))).toBe(true);
  });
});
