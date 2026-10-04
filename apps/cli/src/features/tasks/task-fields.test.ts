import { describe, expect, it } from 'bun:test';
import { Result } from 'effect';
import { buildTaskFields } from './task-fields';

// Date-time strings without an offset are local time, like the CLI's input.
const local = (dateTime: string): Date => new Date(dateTime);

const now = local('2026-10-04T15:30');

describe('buildTaskFields', () => {
  it('maps CLI values to API fields', () => {
    expect(
      buildTaskFields(
        {
          title: 'Write report',
          notes: '- outline',
          estimate: '1h30m',
          projectId: 'p1',
          tagIds: ['t1', 't2'],
          due: 'today',
          deadline: '2026-10-09T17:00',
          deadlineReminder: '2026-10-09T09:00',
        },
        now,
        false,
      ),
    ).toEqual(
      Result.succeed({
        title: 'Write report',
        notes: '- outline',
        timeEstimate: 5_400_000,
        projectId: 'p1',
        tagIds: ['t1', 't2'],
        dueDay: '2026-10-04',
        dueWithTime: null,
        deadlineDay: null,
        deadlineWithTime: local('2026-10-09T17:00').getTime(),
        deadlineRemindAt: local('2026-10-09T09:00').getTime(),
      }),
    );
  });

  it('leaves out the clearing nulls when creating', () => {
    expect(buildTaskFields({ due: '2026-10-06T09:00' }, now, true)).toEqual(
      Result.succeed({ dueWithTime: local('2026-10-06T09:00').getTime() }),
    );
  });

  it('clears both schedule fields and the deadline reminder', () => {
    expect(buildTaskFields({ due: null, deadline: null }, now, false)).toEqual(
      Result.succeed({
        dueDay: null,
        dueWithTime: null,
        deadlineDay: null,
        deadlineWithTime: null,
        deadlineRemindAt: null,
      }),
    );
  });

  it('lets an explicit reminder win over a cleared deadline', () => {
    const fields = buildTaskFields(
      { deadline: null, deadlineReminder: '2026-10-09T09:00' },
      now,
      false,
    );
    expect(Result.map(fields, (value) => value.deadlineRemindAt)).toEqual(
      Result.succeed(local('2026-10-09T09:00').getTime()),
    );
  });

  it('sends only the fields that were given', () => {
    expect(buildTaskFields({ isDone: false }, now, false)).toEqual(
      Result.succeed({ isDone: false }),
    );
    expect(buildTaskFields({}, now, false)).toEqual(Result.succeed({}));
  });

  it('rejects an empty title and bad values', () => {
    expect(Result.isFailure(buildTaskFields({ title: '  ' }, now, false))).toBe(
      true,
    );
    expect(
      Result.isFailure(buildTaskFields({ estimate: 'soon' }, now, false)),
    ).toBe(true);
    expect(
      Result.isFailure(
        buildTaskFields({ deadlineReminder: '2026-10-09' }, now, false),
      ),
    ).toBe(true);
  });
});
