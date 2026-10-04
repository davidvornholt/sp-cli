import { describe, expect, it } from 'bun:test';
import { Effect, Layer } from 'effect';
import { Api } from './api';
import { Connection } from './connection';

const httpOk = 200;
const httpNotFound = 404;

type Recorded = {
  readonly method: string;
  readonly url: string;
  readonly headers: Headers;
  readonly body: string;
};

// Answers every request with one canned response and records what was sent.
const fakeConnection = (status: number, payload: string) => {
  const sent: Array<Recorded> = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    sent.push({
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: await request.text(),
    });
    return new Response(payload, {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
  const layer = Api.layer.pipe(
    Layer.provide(
      Layer.succeed(
        Connection,
        Connection.of({ location: 'test', token: 'secret', fetch }),
      ),
    ),
  );
  return { sent, layer };
};

const run = <A, E>(effect: Effect.Effect<A, E, Api>, layer: Layer.Layer<Api>) =>
  Effect.runPromise(Effect.result(Effect.provide(effect, layer)));

describe('Api', () => {
  it('sends authenticated JSON requests and unwraps the data', async () => {
    const { sent, layer } = fakeConnection(
      httpOk,
      JSON.stringify({ ok: true, data: { id: 't1' } }),
    );
    const result = await run(
      Effect.flatMap(Api, (api) =>
        api.request({
          method: 'PATCH',
          path: '/tasks/t1',
          query: { include: 'issueUrl', skipped: undefined, flag: true },
          body: { isDone: true },
        }),
      ),
      layer,
    );
    expect(result).toMatchObject({ _tag: 'Success', success: { id: 't1' } });
    const [request] = sent;
    expect(request?.method).toBe('PATCH');
    expect(request?.url).toBe(
      'http://127.0.0.1:3876/tasks/t1?include=issueUrl&flag=true',
    );
    expect(request?.headers.get('authorization')).toBe('Bearer secret');
    expect(JSON.parse(request?.body ?? '')).toEqual({ isDone: true });
  });

  it('turns error envelopes into ApiError', async () => {
    const { layer } = fakeConnection(
      httpNotFound,
      JSON.stringify({
        ok: false,
        error: { code: 'TASK_NOT_FOUND', message: 'Task not found' },
      }),
    );
    const result = await run(
      Effect.flatMap(Api, (api) =>
        api.request({ method: 'GET', path: '/tasks/nope' }),
      ),
      layer,
    );
    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: {
        _tag: 'ApiError',
        status: httpNotFound,
        code: 'TASK_NOT_FOUND',
      },
    });
  });

  it('reports a non-API answer as unreachable', async () => {
    const { layer } = fakeConnection(httpOk, '<html></html>');
    const result = await run(
      Effect.flatMap(Api, (api) =>
        api.request({ method: 'GET', path: '/status' }),
      ),
      layer,
    );
    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'AppUnreachable' },
    });
  });
});
