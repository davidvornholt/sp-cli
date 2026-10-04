import process from 'node:process';
import { BunServices } from '@effect/platform-bun';
import { Effect } from 'effect';
import { Command } from 'effect/cli';
import packageJson from '../../package.json' with { type: 'json' };
import { report } from './output';
import { root } from './root';
import { tasks } from './task-commands';
import { current, focus, status, stop } from './tracking-commands';
import { projects, tags } from './work-context-commands';

const sp = root.pipe(
  Command.withSubcommands([
    status,
    current,
    stop,
    focus,
    tasks,
    projects,
    tags,
  ]),
);

// The CLI library prints help to stdout itself; parse errors become one JSON
// error on stderr like every other failure, so agents parse a single shape.
const program = Command.runWith(sp, {
  version: packageJson.version,
  renderErrors: false,
})(process.argv.slice(2)).pipe(
  Effect.catchTag('ShowHelp', (help) =>
    help.errors.length === 0
      ? Effect.void
      : report({
          _tag: 'UsageError',
          message: help.errors.map((error) => error.message).join('\n'),
        }),
  ),
  Effect.catch((error) =>
    report(
      error._tag === 'UserError'
        ? { _tag: 'UsageError', message: error.message }
        : error,
    ),
  ),
  Effect.catchDefect((defect) =>
    report({ _tag: 'UnexpectedError', message: String(defect) }),
  ),
  Effect.provide(BunServices.layer),
);

await Effect.runPromise(program);
