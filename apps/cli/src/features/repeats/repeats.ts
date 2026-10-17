import { Effect, Schema } from 'effect';
import { Api } from '../../shared/api';
import { InvalidInput } from '../../shared/errors/errors';
import type { RepeatFields } from './repeat-fields';

// Repeat configs, which make a task recur. The API calls them task repeat cfgs.

const repeatPath = (id?: string): string =>
  `/task-repeat-cfgs${id === undefined ? '' : `/${encodeURIComponent(id)}`}`;

export const listRepeats = Effect.fn('listRepeats')(function* (
  projectId: string | undefined,
) {
  const api = yield* Api;
  return yield* api.request({
    method: 'GET',
    path: repeatPath(),
    query: { projectId },
  });
});

export const getRepeat = Effect.fn('getRepeat')(function* (id: string) {
  const api = yield* Api;
  return yield* api.request({ method: 'GET', path: repeatPath(id) });
});

export const createRepeat = Effect.fn('createRepeat')(function* (
  taskId: string,
  fields: RepeatFields,
) {
  const api = yield* Api;
  return yield* api.request({
    method: 'POST',
    path: repeatPath(),
    body: { ...fields, taskId },
  });
});

export const updateRepeat = Effect.fn('updateRepeat')(function* (
  id: string,
  fields: RepeatFields,
) {
  const api = yield* Api;
  return yield* api.request({
    method: 'PATCH',
    path: repeatPath(id),
    body: fields,
  });
});

export const deleteRepeat = Effect.fn('deleteRepeat')(function* (id: string) {
  const api = yield* Api;
  return yield* api.request({ method: 'DELETE', path: repeatPath(id) });
});

const QuickSetting = Schema.Struct({ quickSetting: Schema.String });

// The app rejects a schedule change that does not name its preset, because a
// preset is re-applied to the new start date. A start date alone keeps the
// config's current preset.
export const withQuickSetting = Effect.fn('withQuickSetting')(function* (
  id: string,
  fields: RepeatFields,
) {
  if (!('startDate' in fields) || 'quickSetting' in fields) {
    return fields;
  }
  const { quickSetting } = yield* getRepeat(id).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(QuickSetting)),
    Effect.mapError((error) =>
      error._tag === 'SchemaError'
        ? new InvalidInput({
            message: `repeat config ${id} has no quickSetting; pass --schedule or a custom schedule`,
          })
        : error,
    ),
  );
  return { ...fields, quickSetting };
});
