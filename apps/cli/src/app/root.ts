import { Config, Effect, Layer, Option } from 'effect';
import { Command, Flag } from 'effect/cli';
import { Api } from '../shared/api';
import { connectionLayer } from '../shared/connection';
import { emit } from './output';

const host = Flag.String('host').pipe(
  Flag.withDescription(
    'Reach the app on another machine over SSH, e.g. a Tailscale host name. Defaults to $SP_HOST, else this machine.',
  ),
  Flag.withFallbackConfig(Config.NonEmptyString('SP_HOST')),
  Flag.optional,
);

export const root = Command.make('sp').pipe(
  Command.withSharedFlags({ host }),
  Command.withDescription(
    "Read and change Super Productivity data through the desktop app's local REST API. Prints JSON.",
  ),
);

const apiLayer = (target: Parameters<typeof connectionLayer>[0]) =>
  Api.layer.pipe(Layer.provide(connectionLayer(target)));

// Runs a command against the API on the selected machine and prints its
// result. The connection opens lazily here, so `--help` never touches it.
export const runApi = <E, R>(effect: Effect.Effect<unknown, E, R>) =>
  Effect.gen(function* () {
    const { host: selectedHost } = yield* root;
    const target = Option.match(selectedHost, {
      onNone: () => ({ _tag: 'Local' as const }),
      onSome: (name) => ({ _tag: 'Ssh' as const, host: name }),
    });
    const data = yield* effect.pipe(Effect.provide(apiLayer(target)));
    yield* emit(data);
  });
