import { Effect } from 'effect';
import { Api } from '../../shared/api';

// Time tracking and focus state: which task is running and the focus timer.

export const getStatus = Effect.fn('getStatus')(function* () {
  const api = yield* Api;
  return yield* api.request({ method: 'GET', path: '/status' });
});

export const getFocus = Effect.fn('getFocus')(function* () {
  const api = yield* Api;
  return yield* api.request({ method: 'GET', path: '/focus' });
});

export const getCurrentTask = Effect.fn('getCurrentTask')(function* () {
  const api = yield* Api;
  return yield* api.request({ method: 'GET', path: '/task-control/current' });
});

export const stopTracking = Effect.fn('stopTracking')(function* () {
  const api = yield* Api;
  return yield* api.request({ method: 'POST', path: '/task-control/stop' });
});
