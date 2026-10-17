import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
// biome-ignore lint/correctness/noNodejsModules: silences and reads the JSON that output.ts writes to stdout
import process from 'node:process';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect } from 'effect';
import { Command } from 'effect/cli';
import { repeats } from './repeat-commands';
import { root } from './root';

type Sent = {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
};

type Reply = { readonly status: number; readonly payload: unknown };

const httpOk = 200;
const httpNotFound = 404;
const ok = (data: unknown): Reply => ({
  status: httpOk,
  payload: { ok: true, data },
});

const notFound: Reply = {
  status: httpNotFound,
  payload: {
    ok: false,
    error: { code: 'REPEAT_CFG_NOT_FOUND', message: 'Repeat config not found' },
  },
};

const projects = [{ id: 'p1', title: 'Home' }];

// Stands in for the app: answers by method and path and records each request,
// so no test reaches a running Super Productivity.
let sent: Array<Sent> = [];
let replies: Readonly<Record<string, Reply>> = {};

const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  const text = await request.text();
  sent.push({
    method: request.method,
    path: `${url.pathname}${url.search}`,
    body: text === '' ? undefined : JSON.parse(text),
  });
  const reply = replies[`${request.method} ${url.pathname}`] ?? ok({});
  return new Response(JSON.stringify(reply.payload), {
    status: reply.status,
    headers: { 'content-type': 'application/json' },
  });
}) as typeof globalThis.fetch;

const sp = root.pipe(Command.withSubcommands([repeats]));

// The token comes from config, so the real token file stays unread, and
// without SP_HOST the connection stays local, where the fake fetch answers.
const tokenVariable = 'SP_TOKEN';
const testConfig = ConfigProvider.layer(
  ConfigProvider.fromEnvRecord({ [tokenVariable]: 'test-token' }),
);

const run = (...args: ReadonlyArray<string>) =>
  Effect.runPromise(
    Command.runWith(sp, { version: 'test' })(['repeats', ...args]).pipe(
      Effect.provide(BunServices.layer),
      Effect.provide(testConfig),
      Effect.result,
    ),
  );

const runOk = async (...args: ReadonlyArray<string>) => {
  const result = await run(...args);
  if (result._tag === 'Failure') {
    throw new Error(`sp repeats ${args.join(' ')} failed: ${result.failure}`);
  }
};

const realFetch = globalThis.fetch;

let stdout: ReturnType<typeof spyOn>;

beforeEach(() => {
  sent = [];
  replies = { 'GET /projects': ok(projects) };
  globalThis.fetch = fakeFetch;
  stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  globalThis.fetch = realFetch;
  stdout.mockRestore();
});

const lastRequest = () => sent.at(-1);

describe('sp repeats list and get', () => {
  it('lists the repeat configs of a project named by title', async () => {
    replies = { ...replies, 'GET /task-repeat-cfgs': ok([{ id: 'r1' }]) };
    await runOk('list', '--project', 'home');
    expect(lastRequest()).toEqual({
      method: 'GET',
      path: '/task-repeat-cfgs?projectId=p1',
      body: undefined,
    });
    expect(stdout).toHaveBeenCalledWith('[{"id":"r1"}]\n');
  });

  it('lists all repeat configs without a filter', async () => {
    await runOk('list');
    expect(lastRequest()?.path).toBe('/task-repeat-cfgs');
  });

  it('gets one repeat config by id', async () => {
    await runOk('get', 'r/1');
    expect(lastRequest()).toMatchObject({
      method: 'GET',
      path: '/task-repeat-cfgs/r%2F1',
    });
  });
});

describe('sp repeats add', () => {
  it('creates a weekday repeat from a task', async () => {
    await runOk(
      'add',
      't1',
      '--schedule',
      'weekdays',
      '--start',
      '2026-11-02',
      '--paused',
      '--no-skip-overdue',
    );
    expect(lastRequest()).toEqual({
      method: 'POST',
      path: '/task-repeat-cfgs',
      body: {
        taskId: 't1',
        quickSetting: 'MONDAY_TO_FRIDAY',
        startDate: '2026-11-02',
        isPaused: true,
        skipOverdue: false,
      },
    });
  });

  it('creates a custom schedule every second week', async () => {
    await runOk('add', 't1', '--every', '2', '--on', 'tue,thu');
    expect(lastRequest()?.body).toEqual({
      taskId: 't1',
      quickSetting: 'CUSTOM',
      repeatCycle: 'WEEKLY',
      repeatEvery: 2,
      monday: false,
      tuesday: true,
      wednesday: false,
      thursday: true,
      friday: false,
      saturday: false,
      sunday: false,
    });
  });

  it('sends only the task id for the default daily schedule', async () => {
    await runOk('add', 't1');
    expect(lastRequest()?.body).toEqual({ taskId: 't1' });
  });
});

describe('sp repeats update', () => {
  it('changes the schedule with its preset', async () => {
    await runOk('update', 'r1', '--schedule', 'monthly-last-day');
    expect(lastRequest()).toEqual({
      method: 'PATCH',
      path: '/task-repeat-cfgs/r1',
      body: { quickSetting: 'MONTHLY_LAST_DAY' },
    });
  });

  it('keeps the current preset when only the start day changes', async () => {
    replies = {
      ...replies,
      'GET /task-repeat-cfgs/r1': ok({
        id: 'r1',
        quickSetting: 'YEARLY_CURRENT_DATE',
      }),
    };
    await runOk('update', 'r1', '--start', '2027-03-01');
    expect(sent.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'GET /task-repeat-cfgs/r1',
      'PATCH /task-repeat-cfgs/r1',
    ]);
    expect(lastRequest()?.body).toEqual({
      startDate: '2027-03-01',
      quickSetting: 'YEARLY_CURRENT_DATE',
    });
  });

  it('turns skipping overdue instances off without touching the schedule', async () => {
    await runOk('update', 'r1', '--no-skip-overdue');
    expect(lastRequest()?.body).toEqual({ skipOverdue: false });
  });
});

describe('sp repeats pause, resume, and delete', () => {
  it.each([
    ['pause', { isPaused: true }],
    ['resume', { isPaused: false }],
  ])('%ss a repeat config', async (command, body) => {
    await runOk(command, 'r1');
    expect(lastRequest()).toEqual({
      method: 'PATCH',
      path: '/task-repeat-cfgs/r1',
      body,
    });
  });

  it('stops repeating by deleting the repeat config', async () => {
    await runOk('delete', 'r1');
    expect(lastRequest()).toEqual({
      method: 'DELETE',
      path: '/task-repeat-cfgs/r1',
      body: undefined,
    });
  });
});

describe('sp repeats errors', () => {
  it.each([
    [['update', 'r1'], 'nothing to change'],
    [['add', 't1', '--start', '2026-11-02T09:00'], 'not a time'],
    [
      ['add', 't1', '--schedule', 'daily', '--on', 'mon'],
      '--schedule picks a preset',
    ],
    [['add', 't1', '--every', '0', '--cycle', 'daily'], '1 to 1000'],
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

  it('rejects a start day change when the config has no preset', async () => {
    replies = { ...replies, 'GET /task-repeat-cfgs/r1': ok({ id: 'r1' }) };
    const result = await run('update', 'r1', '--start', '2027-03-01');
    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: {
        _tag: 'InvalidInput',
        message: expect.stringContaining('has no quickSetting'),
      },
    });
    expect(sent.map(({ method }) => method)).toEqual(['GET']);
  });

  it('stops when the config to change does not exist', async () => {
    replies = {
      ...replies,
      'GET /task-repeat-cfgs/nope': notFound,
    };
    const result = await run('update', 'nope', '--start', '2027-03-01');
    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'ApiError', code: 'REPEAT_CFG_NOT_FOUND' },
    });
    expect(sent.map(({ method }) => method)).toEqual(['GET']);
  });

  it('passes the app error through', async () => {
    replies = {
      ...replies,
      'PATCH /task-repeat-cfgs/nope': notFound,
    };
    const result = await run('pause', 'nope');
    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: {
        _tag: 'ApiError',
        status: httpNotFound,
        code: 'REPEAT_CFG_NOT_FOUND',
      },
    });
  });
});
