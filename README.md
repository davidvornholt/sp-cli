# sp-cli

> Built on [davidvornholt/standards](https://github.com/davidvornholt/standards).

`sp` is a command-line tool for AI agents to read and change [Super Productivity](https://super-productivity.com) data: tasks, the Today list, scheduling, deadlines, and time tracking. It drives the desktop app's local REST API, so every change goes through the app and syncs like one made by hand.

## Install

Install [Bun](https://bun.sh), clone this repository, and run these commands in it on Linux, macOS, or Windows:

```bash
bun install
bun run --filter @sp-cli/cli install:user
```

Where [just](https://just.systems) is installed, `just install` runs the second command. The installer builds a standalone binary to `~/.local/bin/sp` (`sp.exe` on Windows) and installs the agent skills to `~/.agents/skills`, where Codex and Claude Code find them. It says so when `~/.local/bin` isn't on your `PATH`. On Windows, add `%USERPROFILE%\.local\bin` to your user `Path` environment variable. Run the commands again after pulling changes.

## Configure

In Super Productivity, enable "Misc Settings > Enable local REST API (desktop only)". The app then listens on `127.0.0.1:3876` and writes a bearer token to `superProductivity/local-rest-api-token` in its config directory: `~/.config` on Linux (or `$XDG_CONFIG_HOME`), `~/Library/Application Support` on macOS, and `%APPDATA%` on Windows. sp reads the token from that default location, or from `SP_TOKEN` if set. Set `SP_TOKEN` when the app runs with `--user-data-dir`, or as a Snap or Flatpak, because the file is somewhere else then. Check the connection:

```bash
sp status
```

### Another machine

The API only listens on loopback, and the app rejects requests that don't look local. To reach the app on another machine, sp uses SSH instead of exposing the port:

```bash
sp --host david-x1-nixos tasks list --today --brief
```

Set `SP_HOST` to make that the default. For each command, sp reads the token on the remote machine over SSH, from the Linux location or, if that file is missing, the macOS one. It then forwards a Unix socket in a private temporary directory to the remote `127.0.0.1:3876` and closes the tunnel when the command ends. This needs non-interactive SSH login (keys or Tailscale SSH) and nothing else on either machine. It doesn't work from Windows, because the OpenSSH client that ships with Windows can't forward a Unix socket.

## Use

Run `sp --help` for the commands and `sp <command> --help` for their options. The skill in [`apps/cli/skills/super-productivity`](apps/cli/skills/super-productivity/SKILL.md) tells agents how to use them.

The REST API covers tasks, time tracking, repeating tasks, notes, and simple counters. Projects and tags are read-only. `sp repeats` needs Super Productivity 19.2.0 or newer. It changes only the schedule, pause state, and overdue handling. `sp notes` and `sp counters` need a release newer than 19.2.0.

## Develop

`bun run check` runs the standards drift check, lint, type checks, tests, and the build. It must pass before a change is done. Run the command from source with `bun apps/cli/src/app/cli.ts`.

## License

[MIT](LICENSE) © David Vornholt
