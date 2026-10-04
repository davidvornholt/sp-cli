import { Predicate } from 'effect';

// The fields an agent usually needs to pick a task; full tasks also carry
// attachments, issue-provider data, and per-day time logs.
const summaryFields = [
  'id',
  'title',
  'isDone',
  'projectId',
  'parentId',
  'subTaskIds',
  'tagIds',
  'dueDay',
  'dueWithTime',
  'deadlineDay',
  'deadlineWithTime',
  'timeEstimate',
  'timeSpent',
] as const;

export const summarizeTasks = (data: unknown): unknown =>
  Array.isArray(data)
    ? data.map((task: unknown) =>
        Predicate.isObject(task)
          ? Object.fromEntries(
              summaryFields.flatMap((field) =>
                field in task
                  ? [[field, (task as Record<string, unknown>)[field]]]
                  : [],
              ),
            )
          : task,
      )
    : data;
