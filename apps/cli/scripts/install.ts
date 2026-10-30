// Installs the compiled sp command and its agent skills for the current user.
// Run through `bun run install:user`, which builds dist/sp first.
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  readdir,
  rename,
  rm,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import process from 'node:process';

const windows = process.platform === 'win32';
const executableMode = 0o755;
// `bun build --compile` adds .exe to the output file on Windows.
const executable = windows ? 'sp.exe' : 'sp';
const appDir = join(import.meta.dir, '..');
const binDir = join(homedir(), '.local', 'bin');
const skillsDir = join(homedir(), '.agents', 'skills');
const target = join(binDir, executable);

// Copy beside the target and rename over it, so a running sp is never left
// with a half-written binary.
const temporary = join(binDir, `.${executable}.tmp`);
await mkdir(binDir, { recursive: true });
await copyFile(join(appDir, 'dist', executable), temporary);
await chmod(temporary, executableMode);
await rename(temporary, target);

// Replace each skill folder, so files removed from a skill don't linger.
const skills = (await readdir(join(appDir, 'skills'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);
await Promise.all(
  skills.map(async (skill) => {
    await rm(join(skillsDir, skill), { recursive: true, force: true });
    await cp(join(appDir, 'skills', skill), join(skillsDir, skill), {
      recursive: true,
    });
  }),
);

await Bun.write(
  Bun.stdout,
  `Installed ${target} and the skills ${skills.join(', ')} in ${skillsDir}\n`,
);

const comparable = (path: string) =>
  windows ? resolve(path).toLowerCase() : resolve(path);
const onPath = (Bun.env.PATH ?? '')
  .split(delimiter)
  .some((entry) => entry !== '' && comparable(entry) === comparable(binDir));
if (!onPath) {
  await Bun.write(
    Bun.stdout,
    `${binDir} is not on your PATH. Add it to run sp from any directory.\n`,
  );
}
