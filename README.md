# sp-cli

> Built on [davidvornholt/standards](https://github.com/davidvornholt/standards).

`sp` is a command-line tool for AI agents to read and change [Super Productivity](https://super-productivity.com) data: tasks, the Today list, scheduling, deadlines, and time tracking. It drives the desktop app's local REST API, so every change goes through the app and syncs like one made by hand.

## Install

```bash
bun install
just install
```

This builds a standalone binary to `~/.local/bin/sp` and installs the agent skill to `~/.agents/skills/super-productivity`, where Codex and Claude Code find it. Run it again after pulling changes.

## Configure

In Super Productivity, enable "Misc Settings > Enable local REST API (desktop only)". The app then listens on `127.0.0.1:3876` and writes a bearer token to `~/.config/superProductivity/local-rest-api-token`. sp reads that token, or `SP_TOKEN` if set. Check the connection:

```bash
sp status
```

### Another machine

The API only listens on loopback, and the app rejects requests that don't look local. To reach the app on another machine, sp uses SSH instead of exposing the port:

```bash
sp --host david-x1-nixos tasks list --today --brief
```

Set `SP_HOST` to make that the default. For each command, sp reads the token on the remote machine over SSH. It then forwards a Unix socket in a private temporary directory to the remote `127.0.0.1:3876` and closes the tunnel when the command ends. This needs non-interactive SSH login (keys or Tailscale SSH) and nothing else on either machine.

## Use

Run `sp --help` for the commands and `sp <command> --help` for their options. The skill in [`apps/cli/skills/super-productivity`](apps/cli/skills/super-productivity/SKILL.md) tells agents how to use them.

The REST API covers tasks and time tracking. Projects and tags are read-only. The app's separate notes, repeating tasks, and per-day time logs aren't exposed yet.

## Develop

`bun run check` runs the standards drift check, lint, type checks, tests, and the build. It must pass before a change is done. Run the command from source with `bun apps/cli/src/app/cli.ts`.
