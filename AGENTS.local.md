# Project-specific rules

- sp only talks to Super Productivity through the desktop app's local REST API. Never read or write the app's database or sync files directly; changes must go through the app so they sync.
- Keep the API on loopback. Remote access goes through the SSH tunnel in `apps/cli/src/shared/connection.ts`, never by exposing the port.
- Never launch Super Productivity from a command to check something. Even `superproductivity --version` starts the app.
- Keep the skill in `apps/cli/skills/super-productivity/SKILL.md` in step with the commands. When the app gains API routes, add commands and document them there.
