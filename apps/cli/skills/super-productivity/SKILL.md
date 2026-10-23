---
name: super-productivity
description: Read and change the user's tasks, Today list, repeating tasks, notes, and time tracking in Super Productivity with the sp command. Use when the user asks about their tasks, to-dos, notes, plans for a day, or what they are working on, or wants tasks added, changed, completed, scheduled, repeated, or tracked, or notes written.
---

# Super Productivity

Run `sp --help` for commands and `sp <command> --help` for options. Output is JSON on stdout. Errors are JSON on stderr and exit 1, or 2 for invalid arguments.

- sp talks to the running desktop app. If it reports `AppUnreachable` or `TokenUnavailable`, ask the user to start Super Productivity and enable "Misc Settings > Enable local REST API (desktop only)". Don't retry in a loop.
- `--host <ssh host>` (or `SP_HOST`) reaches the app on another machine over SSH. Use it when the user says the app runs elsewhere.
- Use the ids that commands print. `--project` and `--tag` also accept an exact title. Run `sp projects list` and `sp tags list` to see them. Projects and tags can't be created or changed yet.
- `sp tasks list --today --brief` shows the Today list. A task is on Today when its due day is today. Plan a task for today with `--due today`, and remove it with `update <id> --clear-due`.
- Dates are `YYYY-MM-DD`, `today`, or `tomorrow`. Times are local `YYYY-MM-DDTHH:MM`. Estimates look like `1h30m`, `90m`, or `1.5h`.
- Put the project, tags, due date, and estimate in flags, not in the title. The app reads short syntax in titles: `#tag`, `+project`, `@date`, and durations like `1h`. `--literal` turns that off only in app versions newer than 19.1.0. On older versions, avoid those patterns in titles and check the printed task.
- `update --tag` replaces all tags. Use `--add-tag` and `--remove-tag` to change one.
- Subtasks: `add --parent <id>`. They take their project and tags from the parent. `tasks list` returns subtasks as separate tasks with `parentId` set.
- `tasks start <id>` starts time tracking and `sp stop` stops it. `sp current` shows the tracked task. `tasks time <id> --add 25m --day <date>` logs time spent on a day. `--set` replaces that day's time, and `--set 0` removes it.
- When logging work after the fact, count only the time the user spent: writing prompts, reading results, reviewing, and deciding. Don't count time an agent worked on its own.
- New tasks land on Today when the app shows the Today view. For work done on an earlier day, pass `--due` with that day.
- Mark finished work with `update <id> --done`. Archive or delete a task only when the user asks. `delete` also removes its subtasks and can't be undone.
- Notes are Markdown. Pipe long notes on stdin with `--notes -` and a quoted heredoc (`<<'EOF'`). `--notes` replaces the existing notes, so read them first with `tasks get` when adding to them.
- `sp notes` manages the app's notes, which are separate from task notes and belong to a project, to Today, or both. `update --content` replaces the content, so read it first with `notes get` when adding to it. Delete a note only when the user asks.
- Repeating tasks: `sp repeats add <task-id>` makes an active top-level task repeat, daily by default. It copies the task's title, notes, tags, estimate, and time, which can't be changed later through sp. A recurring task shows its repeat config as `repeatCfgId`. `sp repeats list --project <project>` lists them, paused ones included.
- Schedules: `--schedule` takes a preset (`daily`, `weekdays`, `weekly`, `monthly`, `monthly-first-day`, `monthly-last-day`, `monthly-nth-weekday`, `yearly`). `weekly`, `monthly`, `monthly-nth-weekday`, and `yearly` follow the start day, so pass `--start` to pick the weekday or date. For a custom schedule use `--cycle`, `--every <n>`, and `--on mon,thu` for weekly ones. `--skip-overdue` and `--no-skip-overdue` decide whether missed instances pile up.
- `sp repeats update <id>` changes the schedule and moves the next open instance to it. `pause` and `resume` stop and restart new instances. `sp repeats delete <id>` stops the repetition and keeps the existing tasks. Pause or delete only when the user asks.
