import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
// biome-ignore lint/correctness/noNodejsModules: reads the OS to skip the POSIX shell tests on Windows
import process from 'node:process';
import { BunServices } from '@effect/platform-bun';
import { ConfigProvider, Effect, Layer } from 'effect';
import {
  connectionLayer,
  localTokenFile,
  remoteTokenCommand,
} from './connection';

const resolve = (platform: NodeJS.Platform, home: string, env = '') =>
  Effect.runPromise(
    localTokenFile(platform, home).pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromDotEnvContents(env),
      ),
    ),
  );

describe('localTokenFile', () => {
  it('uses ~/.config on Linux', async () => {
    expect(await resolve('linux', '/home/me')).toBe(
      '/home/me/.config/superProductivity/local-rest-api-token',
    );
  });

  it('honours XDG_CONFIG_HOME on Linux', async () => {
    expect(await resolve('linux', '/home/me', 'XDG_CONFIG_HOME=/xdg')).toBe(
      '/xdg/superProductivity/local-rest-api-token',
    );
  });

  it('uses ~/Library/Application Support on macOS', async () => {
    expect(await resolve('darwin', '/Users/me', 'XDG_CONFIG_HOME=/xdg')).toBe(
      '/Users/me/Library/Application Support/superProductivity/local-rest-api-token',
    );
  });

  it('uses APPDATA on Windows', async () => {
    expect(
      await resolve(
        'win32',
        'C:/Users/me',
        'APPDATA=C:/Users/me/AppData/Roaming',
      ),
    ).toBe(
      'C:/Users/me/AppData/Roaming/superProductivity/local-rest-api-token',
    );
  });
});

describe('connectionLayer', () => {
  it('refuses --host on Windows before starting ssh', async () => {
    const error = await Effect.runPromise(
      Layer.build(
        connectionLayer({ _tag: 'Ssh', platform: 'win32', host: 'remote' }),
      ).pipe(Effect.flip, Effect.scoped, Effect.provide(BunServices.layer)),
    );
    expect(error._tag).toBe('SshTunnelFailed');
  });
});

// The command runs in a POSIX shell on the remote host, which Windows can't
// stand in for, and sp refuses --host on Windows anyway.
describe.skipIf(process.platform === 'win32')('remoteTokenCommand', () => {
  let home = '';
  const linuxFile = () =>
    `${home}/.config/superProductivity/local-rest-api-token`;
  const macFile = () =>
    `${home}/Library/Application Support/superProductivity/local-rest-api-token`;
  const runRemote = () =>
    Bun.$`env -i HOME=${home} PATH=${Bun.env.PATH ?? ''} sh -c ${remoteTokenCommand}`
      .quiet()
      .nothrow();

  beforeEach(async () => {
    home = (await Bun.$`mktemp -d`.text()).trim();
  });

  afterEach(async () => {
    await Bun.$`rm -rf ${home}`;
  });

  it('prefers the Linux token', async () => {
    await Bun.write(linuxFile(), 'linux');
    await Bun.write(macFile(), 'mac');
    expect((await runRemote()).text()).toBe('linux');
  });

  it('falls back to the macOS token', async () => {
    await Bun.write(macFile(), 'mac');
    expect((await runRemote()).text()).toBe('mac');
  });

  it('reports the Linux path when neither token exists', async () => {
    const result = await runRemote();
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString()).toContain(linuxFile());
  });
});
