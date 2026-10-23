import { describe, expect, it } from 'bun:test';
import { Effect, Layer } from 'effect';
import { Api, type ApiRequest } from '../../shared/api';
import { logTaskTime } from './tasks';

// Answers every request with the request itself.
const echoApi = Layer.succeed(
  Api,
  Api.of({ request: (request: ApiRequest) => Effect.succeed(request) }),
);

const send = (effect: Effect.Effect<unknown, unknown, Api>) =>
  Effect.runPromise(Effect.provide(effect, echoApi));

describe('logTaskTime', () => {
  it('posts added time to the task', async () => {
    expect(
      await send(
        logTaskTime('a/b', { mode: 'add', date: '2026-10-21', duration: 60 }),
      ),
    ).toEqual({
      method: 'POST',
      path: '/tasks/a%2Fb/time',
      body: { date: '2026-10-21', duration: 60 },
    });
  });

  it('puts a replaced day', async () => {
    expect(
      await send(
        logTaskTime('t1', { mode: 'set', date: '2026-10-21', duration: 0 }),
      ),
    ).toMatchObject({ method: 'PUT', path: '/tasks/t1/time' });
  });
});
