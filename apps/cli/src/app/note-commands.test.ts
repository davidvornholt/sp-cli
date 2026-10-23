import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
// biome-ignore lint/correctness/noNodejsModules: silences and reads the JSON that output.ts writes to stdout
import process from 'node:process';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect } from 'effect';
import { Command } from 'effect/cli';
import { notes } from './note-commands';
import { root } from './root';

type Sent = {
  readonly method: string;
  readonly path: string;
  readonly body: unknown;
};

type Reply = { readonly status: number; readonly payload: unknown };

const httpOk = 200;
const httpBadRequest = 400;
const ok = (data: unknown): Reply => ({
  status: httpOk,
  payload: { ok: true, data },
});

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

const sp = root.pipe(Command.withSubcommands([notes]));

// The token comes from config, so the real token file stays unread, and
// without SP_HOST the connection stays local, where the fake fetch answers.
const tokenVariable = 'SP_TOKEN';
const testConfig = ConfigProvider.layer(
  ConfigProvider.fromEnvRecord({ [tokenVariable]: 'test-token' }),
);

const run = (...args: ReadonlyArray<string>) =>
  Effect.runPromise(
    Command.runWith(sp, { version: 'test' })(['notes', ...args]).pipe(
      Effect.provide(BunServices.layer),
      Effect.provide(testConfig),
      Effect.result,
    ),
  );

const runOk = async (...args: ReadonlyArray<string>) => {
  const result = await run(...args);
  if (result._tag === 'Failure') {
    throw new Error(`sp notes ${args.join(' ')} failed: ${result.failure}`);
  }
};

const realFetch = globalThis.fetch;

let stdout: ReturnType<typeof spyOn>;
// Stubbed in every test, so `-` never waits on the real stdin.
let stdin: ReturnType<typeof spyOn>;

beforeEach(() => {
  sent = [];
  replies = { 'GET /projects': ok(projects) };
  globalThis.fetch = fakeFetch;
  stdout = spyOn(process.stdout, 'write').mockImplementation(() => true);
  stdin = spyOn(Bun.stdin, 'text').mockResolvedValue('');
});

afterEach(() => {
  globalThis.fetch = realFetch;
  stdout.mockRestore();
  stdin.mockRestore();
});

const lastRequest = () => sent.at(-1);

const markdown = '# Plan\n\n- [ ] Call the bank\n';

describe('sp notes list and get', () => {
  it('lists the notes of a project named by title', async () => {
    replies = { ...replies, 'GET /notes': ok([{ id: 'n1' }]) };
    await runOk('list', '--project', 'home');
    expect(lastRequest()).toEqual({
      method: 'GET',
      path: '/notes?projectId=p1',
      body: undefined,
    });
    expect(stdout).toHaveBeenCalledWith('[{"id":"n1"}]\n');
  });

  it('lists all notes without a filter', async () => {
    await runOk('list');
    expect(lastRequest()?.path).toBe('/notes');
  });

  it('gets one note by id', async () => {
    await runOk('get', 'n/1');
    expect(lastRequest()).toMatchObject({
      method: 'GET',
      path: '/notes/n%2F1',
    });
  });
});

describe('sp notes add', () => {
  it('creates a note in a project named by title, pinned to Today', async () => {
    await runOk('add', 'Buy milk', '--project', 'Home', '--today');
    expect(lastRequest()).toEqual({
      method: 'POST',
      path: '/notes',
      body: { content: 'Buy milk', projectId: 'p1', isPinnedToToday: true },
    });
  });

  it('creates a note on Today without a project', async () => {
    await runOk('add', 'Buy milk', '--today');
    expect(lastRequest()?.body).toEqual({
      content: 'Buy milk',
      isPinnedToToday: true,
    });
  });

  it('reads the content from stdin', async () => {
    stdin.mockResolvedValue(markdown);
    await runOk('add', '-', '--project', 'p1');
    expect(lastRequest()?.body).toEqual({
      content: markdown,
      projectId: 'p1',
    });
  });
});

describe('sp notes update', () => {
  it('replaces the content from stdin and pins the note', async () => {
    stdin.mockResolvedValue(markdown);
    await runOk('update', 'n1', '--content', '-', '--today');
    expect(lastRequest()).toEqual({
      method: 'PATCH',
      path: '/notes/n1',
      body: { content: markdown, isPinnedToToday: true },
    });
  });

  it('unpins a note from Today', async () => {
    await runOk('update', 'n1', '--no-today');
    expect(lastRequest()?.body).toEqual({ isPinnedToToday: false });
  });

  it('moves a note to a project named by title', async () => {
    await runOk('update', 'n1', '--project', 'home');
    expect(lastRequest()).toEqual({
      method: 'PATCH',
      path: '/notes/n1',
      body: { projectId: 'p1' },
    });
  });

  it('leaves unpinning a note without a project to the app', async () => {
    replies = {
      ...replies,
      'PATCH /notes/n1': {
        status: httpBadRequest,
        payload: {
          ok: false,
          error: {
            code: 'INVALID_INPUT',
            message: 'A note without a project must stay pinned to Today',
          },
        },
      },
    };
    const result = await run('update', 'n1', '--no-today');
    expect(result).toMatchObject({
      _tag: 'Failure',
      failure: { _tag: 'ApiError', code: 'INVALID_INPUT' },
    });
    expect(sent.map(({ method }) => method)).toEqual(['PATCH']);
  });
});

describe('sp notes delete', () => {
  it('deletes a note', async () => {
    await runOk('delete', 'n1');
    expect(lastRequest()).toEqual({
      method: 'DELETE',
      path: '/notes/n1',
      body: undefined,
    });
  });
});

describe('sp notes errors', () => {
  it.each([
    [['add', 'Buy milk'], 'needs a project or Today'],
    [['add', '  ', '--today'], 'content is empty'],
    [['add', '-', '--project', 'Home'], 'content is empty'],
    [['update', 'n1'], 'nothing to change'],
    [['update', 'n1', '--project', 'Home', '--content', 'x'], '--project'],
    [['update', 'n1', '--project', 'Home', '--today'], '--project'],
    [['update', 'n1', '--project', 'Home', '--no-today'], '--project'],
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
});
