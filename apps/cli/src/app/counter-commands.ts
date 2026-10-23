import { Effect, Option } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import {
  getCounter,
  incrementCounter,
  listCounters,
  setCounterValue,
} from '../features/counters/counters';
import { parseDay } from '../shared/input';
import { fromResult, nowDate, optionalString } from './command-inputs';
import { runApi } from './root';

const counterId = Argument.String('id').pipe(
  Argument.withDescription('Simple counter id'),
);

const list = Command.make('list', {}, () => runApi(listCounters())).pipe(
  Command.withDescription(
    'List simple counters with their values per day, disabled ones included',
  ),
);

const get = Command.make('get', { id: counterId }, ({ id }) =>
  runApi(getCounter(id)),
).pipe(Command.withDescription('Show one simple counter'));

const increment = Command.make(
  'increment',
  {
    id: counterId,
    by: Flag.Int('by').pipe(
      Flag.withDescription('Add this much (default: 1)'),
      Flag.optional,
    ),
  },
  ({ id, by }) => runApi(incrementCounter(id, Option.getOrUndefined(by))),
).pipe(
  Command.withDescription(
    "Add to today's value and print the counter; a stopwatch can only be set",
  ),
);

const set = Command.make(
  'set',
  {
    id: counterId,
    value: Argument.Int('value').pipe(
      Argument.withDescription(
        "The day's new value, 0 or more; milliseconds for a stopwatch",
      ),
    ),
    day: optionalString(
      'day',
      'Day to set, YYYY-MM-DD or today (default: today)',
    ),
  },
  ({ id, value, day }) =>
    runApi(
      Effect.gen(function* () {
        // The app's today follows its own clock and day start, so today is
        // left to the app rather than resolved here.
        const date =
          Option.isSome(day) && day.value.trim().toLowerCase() !== 'today'
            ? yield* fromResult(parseDay(day.value, yield* nowDate))
            : undefined;
        return yield* setCounterValue(id, value, date);
      }),
    ),
).pipe(
  Command.withDescription("Replace one day's value and print the counter"),
);

export const counters = Command.make('counters').pipe(
  Command.withDescription('Read simple counters and change their daily values'),
  Command.withSubcommands([list, get, increment, set]),
);
