import { Effect } from 'effect';
import { Api } from '../../shared/api';
import { InvalidInput } from '../../shared/errors/errors';

const counterPath = (id: string, action?: 'value' | 'increment'): string =>
  `/simple-counters/${encodeURIComponent(id)}${action === undefined ? '' : `/${action}`}`;

export const listCounters = Effect.fn('listCounters')(function* () {
  const api = yield* Api;
  return yield* api.request({ method: 'GET', path: '/simple-counters' });
});

export const getCounter = Effect.fn('getCounter')(function* (id: string) {
  const api = yield* Api;
  return yield* api.request({ method: 'GET', path: counterPath(id) });
});

// Without a date, the app sets the value of its own today, the day that
// increments count on. That can differ from this machine's date when the app's
// day starts after midnight or the app runs on another machine.
export const setCounterValue = Effect.fn('setCounterValue')(function* (
  id: string,
  value: number,
  date: string | undefined,
) {
  if (value < 0) {
    return yield* new InvalidInput({ message: 'value must be 0 or more' });
  }
  const api = yield* Api;
  return yield* api.request({
    method: 'PUT',
    path: counterPath(id, 'value'),
    body: { value, ...(date === undefined ? {} : { date }) },
  });
});

// Without an amount the app counts up by 1, like the counter's button.
export const incrementCounter = Effect.fn('incrementCounter')(function* (
  id: string,
  by: number | undefined,
) {
  if (by !== undefined && by < 1) {
    return yield* new InvalidInput({ message: '--by must be 1 or more' });
  }
  const api = yield* Api;
  return yield* api.request({
    method: 'POST',
    path: counterPath(id, 'increment'),
    body: by === undefined ? undefined : { by },
  });
});
