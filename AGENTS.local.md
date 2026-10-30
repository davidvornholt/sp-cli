# Project-specific rules

- sp only talks to Super Productivity through the desktop app's local REST API. Never read or write the app's database or sync files directly; changes must go through the app so they sync.
- Keep the API on loopback. Remote access goes through the SSH tunnel in `apps/cli/src/shared/connection.ts`, never by exposing the port.
- Never launch Super Productivity from a command to check something. Even `superproductivity --version` starts the app.
- Keep the skill in `apps/cli/skills/super-productivity/SKILL.md` in step with the commands. It states only what `sp <command> --help` doesn't, such as which command to use when, safety rules, workflows across commands, and pitfalls, so a new command or flag gets a skill line only when its help text can't say it. When the app gains API routes, add commands for them.
