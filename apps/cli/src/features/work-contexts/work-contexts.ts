import { Effect, Schema } from 'effect';
import { Api } from '../../shared/api';

// Projects and tags, which the app calls work contexts.

export type WorkContextKind = 'project' | 'tag';

const listPath = { project: '/projects', tag: '/tags' } as const;

export const listWorkContexts = Effect.fn('listWorkContexts')(function* (
  kind: WorkContextKind,
  query: string | undefined,
) {
  const api = yield* Api;
  return yield* api.request({
    method: 'GET',
    path: listPath[kind],
    query: { query },
  });
});

export class UnknownWorkContext extends Schema.TaggedError<UnknownWorkContext>()(
  'UnknownWorkContext',
  { message: Schema.String },
) {}

const Summary = Schema.Struct({ id: Schema.String, title: Schema.String });
const decodeSummaries = Schema.decodeUnknownEffect(Schema.Array(Summary));

// Accepts an id or a title (case-insensitive, exact) so agents and people can
// name a project or tag the way the app shows it.
export const resolveWorkContextId = Effect.fn('resolveWorkContextId')(
  function* (kind: WorkContextKind, reference: string) {
    const all = yield* listWorkContexts(kind, undefined).pipe(
      Effect.flatMap((data) =>
        decodeSummaries(data).pipe(
          Effect.mapError(
            () =>
              new UnknownWorkContext({
                message: `the app returned an unexpected ${kind} list`,
              }),
          ),
        ),
      ),
    );
    const byId = all.find((context) => context.id === reference);
    if (byId !== undefined) {
      return byId.id;
    }
    const wanted = reference.trim().toLowerCase();
    const byTitle = all.filter(
      (context) => context.title.trim().toLowerCase() === wanted,
    );
    const [only, ...rest] = byTitle;
    if (only !== undefined && rest.length === 0) {
      return only.id;
    }
    return yield* new UnknownWorkContext({
      message:
        byTitle.length > 1
          ? `${byTitle.length} ${kind}s are titled "${reference}"; pass the id instead (sp ${kind}s list)`
          : `no ${kind} with id or title "${reference}" (sp ${kind}s list)`,
    });
  },
);
