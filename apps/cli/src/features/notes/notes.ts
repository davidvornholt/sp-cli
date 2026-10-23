import { Effect } from 'effect';
import { Api } from '../../shared/api';

// The notes the app shows in a project and on Today. They are separate from
// the notes of a task.

const notePath = (id?: string): string =>
  `/notes${id === undefined ? '' : `/${encodeURIComponent(id)}`}`;

export const listNotes = Effect.fn('listNotes')(function* (
  projectId: string | undefined,
) {
  const api = yield* Api;
  return yield* api.request({
    method: 'GET',
    path: notePath(),
    query: { projectId },
  });
});

export const getNote = Effect.fn('getNote')(function* (id: string) {
  const api = yield* Api;
  return yield* api.request({ method: 'GET', path: notePath(id) });
});

// The app requires a project, Today, or both, so the note shows up somewhere.
export type NewNote = {
  readonly content: string;
  readonly projectId?: string | undefined;
  readonly isPinnedToToday: boolean;
};

export const createNote = Effect.fn('createNote')(function* (note: NewNote) {
  const api = yield* Api;
  return yield* api.request({
    method: 'POST',
    path: notePath(),
    body: {
      content: note.content,
      ...(note.projectId === undefined ? {} : { projectId: note.projectId }),
      ...(note.isPinnedToToday ? { isPinnedToToday: true } : {}),
    },
  });
});

export type NoteChanges = {
  readonly content?: string | undefined;
  readonly isPinnedToToday?: boolean | undefined;
};

export const updateNote = Effect.fn('updateNote')(function* (
  id: string,
  changes: NoteChanges,
) {
  const api = yield* Api;
  return yield* api.request({
    method: 'PATCH',
    path: notePath(id),
    body: {
      ...(changes.content === undefined ? {} : { content: changes.content }),
      ...(changes.isPinnedToToday === undefined
        ? {}
        : { isPinnedToToday: changes.isPinnedToToday }),
    },
  });
});

// The app moves a note between projects in its own operation and rejects a
// move that comes with other changes, so a move is a request of its own.
export const moveNote = Effect.fn('moveNote')(function* (
  id: string,
  projectId: string,
) {
  const api = yield* Api;
  return yield* api.request({
    method: 'PATCH',
    path: notePath(id),
    body: { projectId },
  });
});

export const deleteNote = Effect.fn('deleteNote')(function* (id: string) {
  const api = yield* Api;
  return yield* api.request({ method: 'DELETE', path: notePath(id) });
});
