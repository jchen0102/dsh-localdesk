# dsh-mydesk

A read-only workbench for your machine: what is running right now, and what just changed.

## What it shows (0.1.0 / P1)

| Section | Source | Per row |
| --- | --- | --- |
| Sessions | live DSH Agents + each Session's own log | directory, model, turn, last activity; click to open |
| Background jobs | `jobs` registry events (all owners) | command, owner Session, progress, output size |
| Scheduled tasks | `schedule.catalog()` | title, timing, next run, target Session |
| Goals | `goals.get(agent)` | objective, phase, rounds |
| Team tasks | `agentTeams.listTasks(agent)` | subject, status, owner, blocked |
| Local apps | allowlisted `pgrep` | app name, matching processes; click to bring it forward |

## Where it lives

- Sidebar entry **My desk** (「我的工作台」) and its main panel.
- One read-only route `GET /dsh-mydesk/state` behind the same connection trust as the app.
- One action route `POST /dsh-mydesk/open`, used only when you click a row whose target is a local app. It accepts an allowlisted app name or an `http(s)` URL, never a shell string.

## Boundaries

- **Read-only**: no Session event is appended, no task state changes, nothing leaves the machine.
- **This process, this machine**: DSH items come from the current process; app rows come from the machine. Durable Sessions from other processes are not listed yet (P2).
- **No content reads**: only metadata — titles, states, timestamps, counts.
- Plugin subprocesses are not sandboxed by DSH, so every command this plugin runs is fixed-argv and allowlisted (see `docs/DECISIONS.md` D8).

## Install

```bash
# Plugins > Add plugin, pick this directory — or install the local package.
```

## License

MIT
