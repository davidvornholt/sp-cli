import { Context, Effect, Layer, Schema } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';
import { apiOrigin, Connection } from './connection';
import { ApiError, type ApiFailure, AppUnreachable } from './errors/errors';

// Every response uses this envelope, including errors.
const Envelope = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), data: Schema.Unknown }),
  Schema.Struct({
    ok: Schema.Literal(false),
    error: Schema.Struct({
      code: Schema.String,
      message: Schema.String,
      details: Schema.optional(Schema.Unknown),
    }),
  }),
]);
const decodeEnvelope = Schema.decodeUnknownEffect(Envelope);

export type QueryValue = string | boolean | undefined;

export type ApiRequest = {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly query?: Readonly<Record<string, QueryValue>>;
  readonly body?: unknown;
};

export class Api extends Context.Service<
  Api,
  {
    readonly request: (
      request: ApiRequest,
    ) => Effect.Effect<unknown, ApiFailure>;
  }
>()('sp-cli/shared/Api') {
  static readonly layer = Layer.effect(
    Api,
    Effect.gen(function* () {
      const connection = yield* Connection;
      const client = (yield* HttpClient.HttpClient).pipe(
        HttpClient.mapRequest((outgoing) =>
          outgoing.pipe(
            HttpClientRequest.prependUrl(apiOrigin),
            HttpClientRequest.bearerToken(connection.token),
            HttpClientRequest.acceptJson,
          ),
        ),
      );
      const unreachable = (detail: string) =>
        new AppUnreachable({
          message: `Super Productivity is not reachable on ${connection.location} (${detail}). Start the desktop app and enable "Misc Settings > Enable local REST API (desktop only)".`,
        });

      const request = Effect.fn('Api.request')(function* ({
        method,
        path,
        query,
        body,
      }: ApiRequest) {
        const urlParams = Object.fromEntries(
          Object.entries(query ?? {}).flatMap(([key, value]) =>
            value === undefined ? [] : [[key, String(value)]],
          ),
        );
        const base = HttpClientRequest.make(method)(path, { urlParams });
        const outgoing =
          body === undefined
            ? base
            : HttpClientRequest.bodyJsonUnsafe(base, body);
        const response = yield* client.execute(outgoing).pipe(
          // Tunnelled connections swap in a fetch that dials a Unix socket.
          Effect.provideService(FetchHttpClient.Fetch, connection.fetch),
          Effect.mapError((error) => unreachable(error.message)),
        );
        const json = yield* response.json.pipe(
          Effect.mapError(() =>
            unreachable(`HTTP ${response.status} without a JSON body`),
          ),
        );
        const envelope = yield* decodeEnvelope(json).pipe(
          Effect.mapError(() =>
            unreachable(`HTTP ${response.status} with an unexpected body`),
          ),
        );
        if (envelope.ok) {
          return envelope.data;
        }
        return yield* new ApiError({
          status: response.status,
          ...envelope.error,
        });
      });

      return Api.of({ request });
    }),
  ).pipe(Layer.provide(FetchHttpClient.layer));
}
