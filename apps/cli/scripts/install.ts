// Installs the compiled sp command and its agent skill for the current user.
// Run through `bun run install:user`, which builds dist/sp first.

const home = Bun.env.HOME;
if (home === undefined || home === '') {
  throw new Error('HOME is not set');
}
const binDir = `${home}/.local/bin`;
const skillsDir = `${home}/.agents/skills`;
const skill = 'super-productivity';
const appDir = `${import.meta.dir}/..`;

// Install beside the target and rename over it, so a running sp is never left
// with a half-written binary.
await Bun.$`mkdir -p ${binDir}`;
await Bun.$`install -m 755 ${appDir}/dist/sp ${binDir}/.sp.tmp`;
await Bun.$`mv -f ${binDir}/.sp.tmp ${binDir}/sp`;
await Bun.$`install -D -m 644 ${appDir}/skills/${skill}/SKILL.md ${skillsDir}/${skill}/SKILL.md`;

// ~/.agents/skills may be its own git repository; keep the installed skill out
// of its status.
const gitDir = await Bun.$`git -C ${skillsDir} rev-parse --absolute-git-dir`
  .quiet()
  .nothrow();
if (gitDir.exitCode === 0) {
  const exclude = Bun.file(`${gitDir.text().trim()}/info/exclude`);
  const current = (await exclude.exists()) ? await exclude.text() : '';
  if (!current.split('\n').includes(`/${skill}/`)) {
    await Bun.write(exclude, `${current.trimEnd()}\n/${skill}/\n`.trimStart());
  }
}

await Bun.write(
  Bun.stdout,
  `Installed ${binDir}/sp and ${skillsDir}/${skill}/SKILL.md\n`,
);
