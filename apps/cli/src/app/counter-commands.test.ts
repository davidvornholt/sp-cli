import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
// biome-ignore lint/correctness/noNodejsModules: silences and reads the JSON that output.ts writes to stdout
import process from 'node:process';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect } from 'effect';
import { Command } from 'effect/cli';
import { counters } from './counter-commands';
import { root } from './root';

type Sent = {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
};

// Stands in for the app: records each request and answers every one with an
// empty success, so no test reaches a running Super Productivity.
let sent: Array<Sent> = [];
let reply: unknown = {};

const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  const text = await request.text();
  sent.push({
    method: request.method,
    path: `${url.pathname}${url.search}`,
    body: text === '' ? undefined : JSON.parse(text),
  });
  return Response.json({ ok: true, data: reply });
}) as typeof globalThis.fetch;

const sp = root.pipe(Command.withSubcommands([counters]));

// The token comes from config, so the real token file stays unread, and
// without SP_HOST the connection stays local, where the fake fetch answers.
const tokenVariable = 'SP_TOKEN';
const testConfig = ConfigProvider.layer(
  ConfigProvider.fromEnvRecord({ [tokenVariable]: 'test-token' }),
);

const run = (...args: ReadonlyArray<string>) =>
  Effect.runPromise(
    Command.runWith(sp, { version: 'test' })(['counters', ...args]).pipe(
      Effect.provide(BunServices.layer),
      Effect.provide(testConfig),
      Effect.result,
    ),
  );

const runOk = async (...args: ReadonlyArray<string>) => {
  const result = await run(...args);
  if (result._tag === 'Failure') {
    throw new Error(`sp counters ${args.join(' ')} failed: ${result.failure}`);
  }
};

const realFetch = globalThis.fetch;

let stdout: ReturnType<typeof spyOn>;

beforeEach(() => {
  sent = [];
  reply = {};
  globalThis.fetch = fakeFetch;
  stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  globalThis.fetch = realFetch;
  stdout.mockRestore();
});

const lastRequest = () => sent.at(-1);

describe('sp counters list and get', () => {
  it('lists the counters', async () => {
    reply = [{ id: 'c1' }];
    await runOk('list');
    expect(lastRequest()).toEqual({
      method: 'GET',
      path: '/simple-counters',
      body: undefined,
    });
    expect(stdout).toHaveBeenCalledWith('[{"id":"c1"}]\n');
  });

  it('gets one counter by id', async () => {
    await runOk('get', 'c/1');
    expect(lastRequest()).toMatchObject({
      method: 'GET',
      path: '/simple-counters/c%2F1',
    });
  });
});

describe('sp counters increment', () => {
  it('leaves the default step of 1 to the app', async () => {
    await runOk('increment', 'c1');
    expect(lastRequest()).toEqual({
      method: 'POST',
      path: '/simple-counters/c1/increment',
      body: undefined,
    });
  });

  it('counts up by a given amount', async () => {
    await runOk('increment', 'c1', '--by', '3');
    expect(lastRequest()?.body).toEqual({ by: 3 });
  });
});

describe('sp counters set', () => {
  it("leaves the default day to the app's today", async () => {
    await runOk('set', 'c1', '5');
    expect(lastRequest()).toEqual({
      method: 'PUT',
      path: '/simple-counters/c1/value',
      body: { value: 5 },
    });
  });

  it('sets the value of another day', async () => {
    await runOk('set', 'c1', '0', '--day', '2026-10-20');
    expect(lastRequest()?.body).toEqual({ value: 0, date: '2026-10-20' });
  });
});

describe('sp counters errors', () => {
  it.each([
    [['set', 'c1', '-1'], 'value must be 0 or more'],
    [['increment', 'c1', '--by', '0'], '--by must be 1 or more'],
    [['set', 'c1', '5', '--day', '2026-10-20T09:00'], 'is not a day'],
    [['set', 'c1', '5', '--day', '2026-02-30'], 'invalid date'],
  ])('rejects %j before calling the app', async (args, message) => {
    expect(await run(...args)).toMatchObject({
      _tag: 'Failure',
      failure: {
        _tag: 'InvalidInput',
        message: expect.stringContaining(message),
      },
    });
    expect(sent).toEqual([]);
  });

  it.each([[['set', 'c1', '1.5']], [['increment', 'c1', '--by', '2.5']]])(
    'rejects the fraction in %j before calling the app',
    async (args) => {
      // The CLI library prints its help and the parse error to the console.
      const log = spyOn(console, 'log').mockImplementation(() => undefined);
      const error = spyOn(console, 'error').mockImplementation(() => undefined);
      const result = await run(...args);
      log.mockRestore();
      error.mockRestore();
      expect(result).toMatchObject({
        _tag: 'Failure',
        failure: { _tag: 'ShowHelp' },
      });
      expect(sent).toEqual([]);
    },
  );
});
