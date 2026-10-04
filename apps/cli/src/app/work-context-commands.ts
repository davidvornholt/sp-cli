import { Option } from 'effect';
import { Command, Flag } from 'effect/cli';
import {
  listWorkContexts,
  type WorkContextKind,
} from '../features/work-contexts/work-contexts';
import { runApi } from './root';

const listCommand = (kind: WorkContextKind) =>
  Command.make(
    'list',
    {
      query: Flag.String('query').pipe(
        Flag.withDescription(
          'Only titles containing this text (case-insensitive)',
        ),
        Flag.optional,
      ),
    },
    ({ query }) => runApi(listWorkContexts(kind, Option.getOrUndefined(query))),
  ).pipe(Command.withDescription(`List ${kind}s`));

export const projects = Command.make('projects').pipe(
  Command.withDescription('Projects (read-only in this app version)'),
  Command.withSubcommands([listCommand('project')]),
);

export const tags = Command.make('tags').pipe(
  Command.withDescription('Tags (read-only in this app version)'),
  Command.withSubcommands([listCommand('tag')]),
);
