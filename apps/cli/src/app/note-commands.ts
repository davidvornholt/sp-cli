import { Effect, Option } from 'effect';
import { Argument, Command } from 'effect/cli';
import {
  createNote,
  deleteNote,
  getNote,
  listNotes,
  moveNote,
  updateNote,
} from '../features/notes/notes';
import { resolveWorkContextId } from '../features/work-contexts/work-contexts';
import {
  fail,
  flag,
  optionalString,
  readMarkdown,
  readOptionalMarkdown,
  resolveOptional,
  toggle,
} from './command-inputs';
import { runApi } from './root';

const noteId = Argument.String('id').pipe(Argument.withDescription('Note id'));

const list = Command.make(
  'list',
  {
    project: optionalString(
      'project',
      'Only notes of this project (id or title)',
    ),
  },
  ({ project }) =>
    runApi(
      Effect.flatMap(resolveOptional('project', project), (projectId) =>
        listNotes(projectId),
      ),
    ),
).pipe(Command.withDescription('List notes'));

const get = Command.make('get', { id: noteId }, ({ id }) =>
  runApi(getNote(id)),
).pipe(Command.withDescription('Show one note'));

const add = Command.make(
  'add',
  {
    content: Argument.String('content').pipe(
      Argument.withDescription('Markdown content, or - to read it from stdin'),
    ),
    project: optionalString(
      'project',
      'Put the note in this project (id or title)',
    ),
    today: flag('today', 'Pin the note to Today'),
  },
  ({ content, project, today }) =>
    runApi(
      Effect.gen(function* () {
        if (Option.isNone(project) && !today) {
          return yield* fail(
            'a note needs a project or Today; pass --project, --today, or both',
          );
        }
        const text = yield* readMarkdown(content);
        if (text.trim() === '') {
          return yield* fail(
            'the note content is empty; pass Markdown text, or - to read it from stdin',
          );
        }
        return yield* createNote({
          content: text,
          projectId: yield* resolveOptional('project', project),
          isPinnedToToday: today,
        });
      }),
    ),
).pipe(
  Command.withDescription(
    'Create a note in a project, on Today, or both, and print it',
  ),
);

const update = Command.make(
  'update',
  {
    id: noteId,
    content: optionalString(
      'content',
      'Replace the Markdown content, or - to read it from stdin',
    ),
    project: optionalString(
      'project',
      'Move to this project (id or title); pass it without other options',
    ),
    today: toggle(
      'today',
      'Pin to Today; --no-today unpins a note that is in a project',
    ),
  },
  ({ id, content, project, today }) =>
    runApi(
      Effect.gen(function* () {
        const isEdit = Option.isSome(content) || Option.isSome(today);
        if (Option.isSome(project)) {
          if (isEdit) {
            return yield* fail(
              'the app moves a note on its own, so pass --project without --content, --today, or --no-today, and make those changes in a second update',
            );
          }
          return yield* moveNote(
            id,
            yield* resolveWorkContextId('project', project.value),
          );
        }
        if (!isEdit) {
          return yield* fail(
            'nothing to change; pass --content, --project, --today, or --no-today (sp notes update --help)',
          );
        }
        return yield* updateNote(id, {
          content: yield* readOptionalMarkdown(content),
          isPinnedToToday: Option.getOrUndefined(today),
        });
      }),
    ),
).pipe(Command.withDescription('Change or move a note and print it'));

const remove = Command.make('delete', { id: noteId }, ({ id }) =>
  runApi(deleteNote(id)),
).pipe(Command.withDescription('Delete a note permanently'));

export const notes = Command.make('notes').pipe(
  Command.withDescription(
    'List, create, change, and delete the notes of projects and Today (not task notes)',
  ),
  Command.withSubcommands([list, get, add, update, remove]),
);
