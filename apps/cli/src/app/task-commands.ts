import { Clock, Effect, Option, Result, Schema } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import {
  buildTaskFields,
  type TaskFieldOptions,
} from '../features/tasks/task-fields';
import { InvalidInput } from '../features/tasks/task-input';
import { summarizeTasks } from '../features/tasks/task-summary';
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  taskAction,
  todayTagId,
  updateTask,
} from '../features/tasks/tasks';
import { resolveWorkContextId } from '../features/work-contexts/work-contexts';
import { runApi } from './root';

const taskId = Argument.String('id').pipe(Argument.withDescription('Task id'));

const optionalString = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional);

const flag = (name: string, description: string) =>
  Flag.Boolean(name).pipe(
    Flag.withDescription(description),
    Flag.withDefault(false),
  );

const repeatedString = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.atLeast(0));

const nowDate = Effect.map(
  Clock.currentTimeMillis,
  (ms) => new Date(Number(ms)),
);

const fromResult = <A>(
  result: Result.Result<A, InvalidInput>,
): Effect.Effect<A, InvalidInput> =>
  Result.isSuccess(result)
    ? Effect.succeed(result.success)
    : Effect.fail(result.failure);

const fail = (message: string) => Effect.fail(new InvalidInput({ message }));

// `--notes -` reads the notes from stdin, which keeps long Markdown out of
// shell quoting.
const readNotes = (notes: Option.Option<string>) =>
  Option.match(notes, {
    onNone: () => Effect.succeed(undefined),
    onSome: (value) =>
      value === '-'
        ? Effect.promise(() => Bun.stdin.text())
        : Effect.succeed(value),
  });

const resolveAll = (
  kind: 'project' | 'tag',
  references: ReadonlyArray<string>,
) =>
  Effect.forEach(references, (reference) =>
    resolveWorkContextId(kind, reference),
  );

const resolveOptional = (
  kind: 'project' | 'tag',
  reference: Option.Option<string>,
) =>
  Option.match(reference, {
    onNone: () => Effect.succeed(undefined),
    onSome: (value) => resolveWorkContextId(kind, value),
  });

// Mutually exclusive "set" and "clear" flags for one field: undefined leaves
// it alone, null clears it.
const setOrClear = (
  name: string,
  value: Option.Option<string>,
  clear: boolean,
) =>
  Option.isSome(value) && clear
    ? fail(`--${name} and --clear-${name} cannot be combined`)
    : Effect.succeed(clear ? null : Option.getOrUndefined(value));

const scheduleFlags = {
  due: optionalString(
    'due',
    'Plan for a day (YYYY-MM-DD, today, tomorrow) or a local time (YYYY-MM-DDTHH:MM)',
  ),
  deadline: optionalString(
    'deadline',
    'Deadline day or local time, same formats as --due',
  ),
  deadlineReminder: optionalString(
    'deadline-reminder',
    'Remind about the deadline at a local time (YYYY-MM-DDTHH:MM)',
  ),
};

const list = Command.make(
  'list',
  {
    query: optionalString(
      'query',
      'Only titles containing this text (case-insensitive)',
    ),
    project: optionalString(
      'project',
      'Only tasks in this project (id or title)',
    ),
    tag: optionalString('tag', 'Only tasks with this tag (id or title)'),
    today: flag('today', 'Only tasks on the Today list (due today)'),
    includeDone: flag('include-done', 'Include done tasks'),
    source: Flag.Literals('source', ['active', 'archived', 'all']).pipe(
      Flag.withDescription('Search active tasks, the archive, or both'),
      Flag.withDefault('active'),
    ),
    brief: flag('brief', 'Print only the main fields of each task'),
  },
  ({ query, project, tag, today, includeDone, source, brief }) =>
    runApi(
      Effect.gen(function* () {
        if (today && Option.isSome(tag)) {
          return yield* fail('--today and --tag cannot be combined');
        }
        const tasks = yield* listTasks({
          query: Option.getOrUndefined(query),
          projectId: yield* resolveOptional('project', project),
          tagId: today ? todayTagId : yield* resolveOptional('tag', tag),
          includeDone,
          source,
        });
        return brief ? summarizeTasks(tasks) : tasks;
      }),
    ),
).pipe(
  Command.withDescription('List tasks (subtasks are listed as separate tasks)'),
);

const get = Command.make(
  'get',
  {
    id: taskId,
    issueUrl: flag('issue-url', 'Include a link to the linked issue, if any'),
  },
  ({ id, issueUrl }) => runApi(getTask(id, issueUrl)),
).pipe(Command.withDescription('Show one task, active or archived'));

const literalFlag = flag(
  'literal',
  'Store the title as typed; without it the app parses short syntax like #tag, +project, @date, and 1h estimates',
);

const add = Command.make(
  'add',
  {
    title: Argument.String('title').pipe(
      Argument.withDescription('Task title'),
    ),
    project: optionalString(
      'project',
      'Project id or title (default: the inbox)',
    ),
    tag: repeatedString('tag', 'Tag id or title; repeat for several'),
    parent: optionalString('parent', 'Create as a subtask of this task id'),
    notes: optionalString(
      'notes',
      'Markdown notes, or - to read them from stdin',
    ),
    estimate: optionalString(
      'estimate',
      'Time estimate such as 1h30m, 90m, or 1.5h',
    ),
    ...scheduleFlags,
    literal: literalFlag,
  },
  (options) =>
    runApi(
      Effect.gen(function* () {
        if (
          Option.isSome(options.parent) &&
          (Option.isSome(options.project) || options.tag.length > 0)
        ) {
          return yield* fail(
            'subtasks inherit the project and tags of their parent; drop --project and --tag',
          );
        }
        const fieldOptions: TaskFieldOptions = {
          notes: yield* readNotes(options.notes),
          estimate: Option.getOrUndefined(options.estimate),
          projectId: yield* resolveOptional('project', options.project),
          tagIds:
            options.tag.length > 0
              ? yield* resolveAll('tag', options.tag)
              : undefined,
          due: Option.getOrUndefined(options.due),
          deadline: Option.getOrUndefined(options.deadline),
          deadlineReminder: Option.getOrUndefined(options.deadlineReminder),
        };
        const fields = yield* fromResult(
          buildTaskFields(fieldOptions, yield* nowDate, true),
        );
        return yield* createTask({
          title: options.title,
          parentId: Option.getOrUndefined(options.parent),
          isLiteral: options.literal,
          fields,
        });
      }),
    ),
).pipe(Command.withDescription('Create a task and print it'));

const TagIds = Schema.Struct({ tagIds: Schema.Array(Schema.String) });

const changedTagIds = Effect.fn('changedTagIds')(function* (
  id: string,
  replace: ReadonlyArray<string>,
  toAdd: ReadonlyArray<string>,
  toRemove: ReadonlyArray<string>,
) {
  if (replace.length > 0 && toAdd.length + toRemove.length > 0) {
    return yield* fail(
      '--tag replaces all tags; it cannot be combined with --add-tag or --remove-tag',
    );
  }
  if (replace.length > 0) {
    return yield* resolveAll('tag', replace);
  }
  if (toAdd.length + toRemove.length === 0) {
    return;
  }
  const { tagIds } = yield* getTask(id, false).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(TagIds)),
    Effect.mapError((error) =>
      error._tag === 'SchemaError'
        ? new InvalidInput({ message: `task ${id} has no tag list` })
        : error,
    ),
  );
  const added = yield* resolveAll('tag', toAdd);
  const removed = new Set(yield* resolveAll('tag', toRemove));
  return [...new Set([...tagIds, ...added])].filter(
    (tagId) => !removed.has(tagId),
  );
});

const update = Command.make(
  'update',
  {
    id: taskId,
    title: optionalString('title', 'New title'),
    notes: optionalString(
      'notes',
      'Replace the Markdown notes, or - to read them from stdin',
    ),
    done: flag('done', 'Mark as done'),
    undone: flag('undone', 'Mark as not done'),
    estimate: optionalString(
      'estimate',
      'Time estimate such as 1h30m, 90m, or 1.5h; 0 clears it',
    ),
    project: optionalString(
      'project',
      'Move to this project (id or title); not for subtasks',
    ),
    tag: repeatedString(
      'tag',
      'Replace all tags with these (id or title); repeat for several',
    ),
    addTag: repeatedString('add-tag', 'Add a tag (id or title); repeatable'),
    removeTag: repeatedString(
      'remove-tag',
      'Remove a tag (id or title); repeatable',
    ),
    ...scheduleFlags,
    clearDue: flag('clear-due', 'Unschedule the task'),
    clearDeadline: flag(
      'clear-deadline',
      'Remove the deadline and its reminder',
    ),
    clearDeadlineReminder: flag(
      'clear-deadline-reminder',
      'Remove only the deadline reminder',
    ),
    literal: literalFlag,
  },
  (options) =>
    runApi(
      Effect.gen(function* () {
        if (options.done && options.undone) {
          return yield* fail('--done and --undone cannot be combined');
        }
        const fieldOptions: TaskFieldOptions = {
          title: Option.getOrUndefined(options.title),
          notes: yield* readNotes(options.notes),
          isDone: options.done || (options.undone ? false : undefined),
          estimate: Option.getOrUndefined(options.estimate),
          projectId: yield* resolveOptional('project', options.project),
          tagIds: yield* changedTagIds(
            options.id,
            options.tag,
            options.addTag,
            options.removeTag,
          ),
          due: yield* setOrClear('due', options.due, options.clearDue),
          deadline: yield* setOrClear(
            'deadline',
            options.deadline,
            options.clearDeadline,
          ),
          deadlineReminder: yield* setOrClear(
            'deadline-reminder',
            options.deadlineReminder,
            options.clearDeadlineReminder,
          ),
        };
        const fields = yield* fromResult(
          buildTaskFields(fieldOptions, yield* nowDate, false),
        );
        if (Object.keys(fields).length === 0) {
          return yield* fail(
            'nothing to change; pass at least one field option (sp tasks update --help)',
          );
        }
        return yield* updateTask(options.id, fields, options.literal);
      }),
    ),
).pipe(Command.withDescription('Change a task and print it'));

const remove = Command.make('delete', { id: taskId }, ({ id }) =>
  runApi(deleteTask(id)),
).pipe(Command.withDescription('Delete a task and its subtasks permanently'));

const start = Command.make('start', { id: taskId }, ({ id }) =>
  runApi(taskAction(id, 'start')),
).pipe(Command.withDescription('Start tracking time on a task'));

const archive = Command.make('archive', { id: taskId }, ({ id }) =>
  runApi(taskAction(id, 'archive')),
).pipe(Command.withDescription('Move a task and its subtasks to the archive'));

const restore = Command.make('restore', { id: taskId }, ({ id }) =>
  runApi(taskAction(id, 'restore')),
).pipe(Command.withDescription('Restore an archived task'));

export const tasks = Command.make('tasks').pipe(
  Command.withDescription('List, create, change, and track tasks'),
  Command.withSubcommands([
    list,
    get,
    add,
    update,
    remove,
    start,
    archive,
    restore,
  ]),
);
