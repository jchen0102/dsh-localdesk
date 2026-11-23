# dsh-mydesk

A read-only observatory for your machine: what is running right now, and what just changed.

## What it shows (0.2.0 / P2)

| Section | Source | Per row |
| --- | --- | --- |
| Sessions | live DSH Agents + each Session's own log | directory, model, turn, last activity; click to open |
| Background jobs | `jobs` registry events (all owners) | command, owner Session, progress, output size |
| Scheduled tasks | `schedule.catalog()` | title, timing, next run, target Session |
| Goals | `goals.get(agent)` | objective, phase, rounds |
| Team tasks | `agentTeams.listTasks(agent)` | subject, status, owner, blocked |
| Codex sessions | `~/.codex/sessions/**/rollout-*.jsonl` (head + tail only) | project, event count, CLI version, provider, running/idle/done |
| WeChat channel | DSH's own `~/.dsh/channel-wechat/peer-sessions.json` | peer, linked Session; click to open |
| App data | mtimes under `.claude`, `.cursor`, Kim's data dirs | which app data changed, when, which child moved |
| Local apps | allowlisted `pgrep` | app name, matching processes; click to bring it forward |

## Where it lives

- Sidebar entry **My desk** (「我的工作台」) and its main panel.
- One read-only route `GET /dsh-mydesk/state` behind the same connection trust as the app.
- One action route `POST /dsh-mydesk/open`, used only when you click a row whose target is a local app. It accepts an allowlisted app name or an `http(s)` URL, never a shell string.

## Boundaries

- **Read-only**: no Session event is appended, no task state changes, nothing leaves the machine.
- **This process, this machine**: DSH items come from the current process; Codex, app-data and app rows come from the machine. Durable Sessions from other DSH processes are not listed yet (P2 scope kept this out).
- **No content reads**: only metadata — titles, states, timestamps, counts.
- Plugin subprocesses are not sandboxed by DSH, so every command this plugin runs is fixed-argv and allowlisted (see `docs/DECISIONS.md` D8).

## Layout

- Sources live in `index.js` behind one `Item` contract (see `docs/CONTRACTS.md`); the client renders that contract and nothing else.
- `test/probe.mjs` runs both halves against fixtures and a fake Cordis context: `node test/probe.mjs`.

## Install

```bash
# Plugins > Add plugin, pick this directory — or install the local package.
```

## License

MIT
