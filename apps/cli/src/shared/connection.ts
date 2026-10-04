import {
  Config,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Schedule,
  Stream,
} from 'effect';
import { ChildProcess, ChildProcessSpawner } from 'effect/process';
import {
  type ConnectionError,
  SshTunnelFailed,
  TokenUnavailable,
} from './errors/errors';

// Super Productivity's Local REST API only listens on the loopback interface
// of the machine running the desktop app, and rejects any Host header other
// than its own address.
export const apiOrigin = 'http://127.0.0.1:3876';
const apiAuthority = '127.0.0.1:3876';
// Relative to $XDG_CONFIG_HOME (or ~/.config): Electron's userData directory
// for Super Productivity, where the app keeps the API token in a 0600 file.
const tokenPath = 'superProductivity/local-rest-api-token';
const tunnelReadyTimeout = '15 seconds';

// Where requests go: straight to the local app, or through an SSH tunnel to
// the app on another machine. `location` names it in error messages.
export class Connection extends Context.Service<
  Connection,
  {
    readonly location: string;
    readonly token: string;
    readonly fetch: typeof globalThis.fetch;
  }
>()('sp-cli/shared/Connection') {}

export type ConnectionTarget =
  | { readonly _tag: 'Local' }
  | { readonly _tag: 'Ssh'; readonly host: string };

const missingTokenMessage = (location: string, detail: string): string =>
  `Could not read the Super Productivity API token on ${location} (${detail}). Enable "Misc Settings > Enable local REST API (desktop only)" in the app, or set SP_TOKEN.`;

const envToken = Config.option(Config.NonEmptyString('SP_TOKEN'));

const localTokenFile = Effect.gen(function* () {
  const configHome = yield* Config.option(
    Config.NonEmptyString('XDG_CONFIG_HOME'),
  );
  const home = yield* Config.NonEmptyString('HOME');
  return `${Option.getOrElse(configHome, () => `${home}/.config`)}/${tokenPath}`;
});

const readLocalToken = Effect.gen(function* () {
  const fromEnv = yield* envToken;
  if (Option.isSome(fromEnv)) {
    return fromEnv.value;
  }
  const fs = yield* FileSystem.FileSystem;
  const path = yield* localTokenFile;
  const token = yield* fs.readFileString(path).pipe(
    Effect.mapError(
      (error) =>
        new TokenUnavailable({
          message: missingTokenMessage(
            'this machine',
            `${path}: ${error.message}`,
          ),
        }),
    ),
  );
  return token.trim();
}).pipe(
  Effect.catchTag('ConfigError', (error) =>
    Effect.fail(
      new TokenUnavailable({
        message: missingTokenMessage('this machine', error.message),
      }),
    ),
  ),
);

const collectText = (stream: Stream.Stream<Uint8Array, unknown>) =>
  stream.pipe(
    Stream.decodeText(),
    Stream.mkString,
    Effect.orElseSucceed(() => ''),
  );

const sshOptions = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10'];

// Runs one command on the remote host and returns its stdout, failing with
// the remote stderr when it exits non-zero.
const runRemote = Effect.fn('runRemote')(function* (
  host: string,
  command: string,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const handle = yield* spawner.spawn(
    ChildProcess.make('ssh', [...sshOptions, host, command]),
  );
  const [stdout, stderr, exitCode] = yield* Effect.all(
    [collectText(handle.stdout), collectText(handle.stderr), handle.exitCode],
    { concurrency: 'unbounded' },
  );
  return { stdout, stderr: stderr.trim(), exitCode: Number(exitCode) };
}, Effect.scoped);

const readRemoteToken = Effect.fn('readRemoteToken')(function* (host: string) {
  const fromEnv = yield* envToken;
  if (Option.isSome(fromEnv)) {
    return fromEnv.value;
  }
  const result = yield* runRemote(
    host,
    `cat "\${XDG_CONFIG_HOME:-$HOME/.config}/${tokenPath}"`,
  ).pipe(
    Effect.mapError(
      (error) =>
        new SshTunnelFailed({
          message: `Could not run ssh ${host}: ${error.message}`,
        }),
    ),
  );
  if (result.exitCode !== 0) {
    return yield* new TokenUnavailable({
      message: missingTokenMessage(
        host,
        result.stderr || `ssh exited with ${result.exitCode}`,
      ),
    });
  }
  return result.stdout.trim();
});

// Forwards a private local Unix socket to the API port on the remote host for
// the lifetime of the surrounding scope. A socket instead of a local TCP port
// avoids port collisions and keeps other local users out (it lives in a 0700
// temporary directory).
const openTunnel = Effect.fn('openTunnel')(function* (host: string) {
  const fs = yield* FileSystem.FileSystem;
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'sp-cli-' });
  const socket = `${directory}/api.sock`;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const handle = yield* spawner.spawn(
    ChildProcess.make('ssh', [
      ...sshOptions,
      '-o',
      'ExitOnForwardFailure=yes',
      '-N',
      '-T',
      '-L',
      `${socket}:${apiAuthority}`,
      host,
    ]),
  );
  const ready = fs.exists(socket).pipe(
    Effect.filterOrFail(
      (exists) => exists,
      () => new SshTunnelFailed({ message: 'tunnel not ready' }),
    ),
    Effect.retry(Schedule.spaced('25 millis')),
  );
  const exited = Effect.gen(function* () {
    const [stderr, exitCode] = yield* Effect.all(
      [collectText(handle.stderr), handle.exitCode],
      {
        concurrency: 'unbounded',
      },
    );
    return yield* new SshTunnelFailed({
      message: `ssh ${host} exited with ${exitCode} before the tunnel was ready: ${stderr.trim()}`,
    });
  });
  yield* Effect.raceFirst(ready, exited).pipe(
    Effect.timeoutOrElse({
      duration: tunnelReadyTimeout,
      orElse: () =>
        Effect.fail(
          new SshTunnelFailed({
            message: `Timed out after ${tunnelReadyTimeout} waiting for the SSH tunnel to ${host}`,
          }),
        ),
    }),
    Effect.mapError((error) =>
      error._tag === 'SshTunnelFailed'
        ? error
        : new SshTunnelFailed({ message: `ssh ${host}: ${error.message}` }),
    ),
  );
  return socket;
});

const local = Effect.gen(function* () {
  const token = yield* readLocalToken;
  return Connection.of({
    location: 'this machine',
    token,
    fetch: globalThis.fetch,
  });
});

const overSsh = Effect.fn('overSsh')(function* (host: string) {
  const [socket, token] = yield* Effect.all(
    [openTunnel(host), readRemoteToken(host)],
    {
      concurrency: 'unbounded',
    },
  ).pipe(
    Effect.mapError((error) =>
      error._tag === 'SshTunnelFailed' || error._tag === 'TokenUnavailable'
        ? error
        : new SshTunnelFailed({ message: `ssh ${host}: ${error.message}` }),
    ),
  );
  const viaSocket = ((input: RequestInfo | URL, init?: RequestInit) =>
    globalThis.fetch(input, {
      ...init,
      unix: socket,
    })) as typeof globalThis.fetch;
  return Connection.of({ location: host, token, fetch: viaSocket });
});

export const connectionLayer = (
  target: ConnectionTarget,
): Layer.Layer<
  Connection,
  ConnectionError,
  FileSystem.FileSystem | ChildProcessSpawner.ChildProcessSpawner
> =>
  Layer.effect(
    Connection,
    target._tag === 'Local' ? local : overSsh(target.host),
  );
