import { Command } from 'effect/cli';
import {
  getCurrentTask,
  getFocus,
  getStatus,
  stopTracking,
} from '../features/tracking/tracking';
import { runApi } from './root';

export const status = Command.make('status', {}, () =>
  runApi(getStatus()),
).pipe(
  Command.withDescription('Show the running task and the number of tasks'),
);

export const focus = Command.make('focus', {}, () => runApi(getFocus())).pipe(
  Command.withDescription('Show the focus mode timer'),
);

export const current = Command.make('current', {}, () =>
  runApi(getCurrentTask()),
).pipe(Command.withDescription('Show the task that is tracking time, or null'));

export const stop = Command.make('stop', {}, () => runApi(stopTracking())).pipe(
  Command.withDescription('Stop tracking time'),
);
