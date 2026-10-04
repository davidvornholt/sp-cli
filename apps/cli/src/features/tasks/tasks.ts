import { Effect } from 'effect';
import { Api } from '../../shared/api';
import type { TaskFields } from './task-fields';

// The app's virtual "Today" list: tasks due today, not a stored tag.
export const todayTagId = 'TODAY';

export type TaskSource = 'active' | 'archived' | 'all';

export type TaskFilter = {
  readonly query?: string | undefined;
  readonly projectId?: string | undefined;
  readonly tagId?: string | undefined;
  readonly includeDone: boolean;
  readonly source: TaskSource;
};

const taskPath = (id: string, action?: string): string =>
  `/tasks/${encodeURIComponent(id)}${action === undefined ? '' : `/${action}`}`;

export const listTasks = Effect.fn('listTasks')(function* (filter: TaskFilter) {
  const api = yield* Api;
  return yield* api.request({
    method: 'GET',
    path: '/tasks',
    query: {
      query: filter.query,
      projectId: filter.projectId,
      tagId: filter.tagId,
      includeDone: filter.includeDone,
      source: filter.source,
    },
  });
});

export const getTask = Effect.fn('getTask')(function* (
  id: string,
  withIssueUrl: boolean,
) {
  const api = yield* Api;
  return yield* api.request({
    method: 'GET',
    path: taskPath(id),
    query: { include: withIssueUrl ? 'issueUrl' : undefined },
  });
});

export type NewTask = {
  readonly title: string;
  readonly parentId?: string | undefined;
  readonly isLiteral: boolean;
  readonly fields: TaskFields;
};

export const createTask = Effect.fn('createTask')(function* (task: NewTask) {
  const api = yield* Api;
  return yield* api.request({
    method: 'POST',
    path: '/tasks',
    body: {
      ...task.fields,
      title: task.title,
      ...(task.parentId === undefined ? {} : { parentId: task.parentId }),
      ...(task.isLiteral ? { isIgnoreShortSyntax: true } : {}),
    },
  });
});

export const updateTask = Effect.fn('updateTask')(function* (
  id: string,
  fields: TaskFields,
  isLiteral: boolean,
) {
  const api = yield* Api;
  return yield* api.request({
    method: 'PATCH',
    path: taskPath(id),
    body: { ...fields, ...(isLiteral ? { isIgnoreShortSyntax: true } : {}) },
  });
});

export const deleteTask = Effect.fn('deleteTask')(function* (id: string) {
  const api = yield* Api;
  return yield* api.request({ method: 'DELETE', path: taskPath(id) });
});

export const taskAction = Effect.fn('taskAction')(function* (
  id: string,
  action: 'start' | 'archive' | 'restore',
) {
  const api = yield* Api;
  return yield* api.request({ method: 'POST', path: taskPath(id, action) });
});
