---
name: super-productivity
description: Use to read or change the user's tasks, to-dos, Today list, repeating tasks, notes, time tracking, or habit counters in Super Productivity through the sp command.
---

# Super Productivity

Run `sp --help` for commands and `sp <command> --help` for options.

- If sp reports `AppUnreachable` or `TokenUnavailable`, ask the user to start Super Productivity with its REST API enabled, as the error says. Don't retry in a loop.
- `sp tasks list --today --brief` shows the Today list. A task is on Today when its due day is today, so plan one with `--due today` and take it off with `--clear-due`.
- `--notes` and `notes update --content` replace what's there. Read the task or note first when adding to it.
- `--literal` works only in app versions newer than 19.1.0. On older versions, avoid `#tag`, `+project`, `@date`, and durations like `1h` in titles, and check the printed task.
- When logging work after the fact, count only the time the user spent: writing prompts, reading results, reviewing, and deciding. Don't count time an agent worked on its own. New tasks land on Today when the app shows the Today view, so for work done on an earlier day, pass `--due` with that day.
- Mark finished work done. Archive or delete anything, pause a repeat, or change a counter only when the user asks.
- Set a task up completely before `sp repeats add`: the repeat config copies it, and sp can't change that copy later.
- In Super Productivity 19.2.0, a paused repeat set to "Only create next task after completion" still creates its next instance when the open one is completed.
- Habits are the app's simple counters (`sp counters`).
