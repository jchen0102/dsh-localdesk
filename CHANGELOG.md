# Changelog

All notable changes to this package. Format follows [Keep a Changelog](https://keepachangelog.com/), versions follow SemVer.

## Unreleased

### Fixed

- The freshness label no longer claims "updated just now" after a failed refresh; it keeps the last successful read time, matching the stale banner.
- The island pill labels its total when every item is idle, instead of showing a bare number.

## 0.4.0 - 2026-11-23

### Added

- Desk search box (title, path, owner, meta, tags) and status chips (All / Running / Waiting / Changed). Filtering is client-side; the summary stays global and section counts follow the filter.
- i18n coverage guard in `test/probe.mjs`: every `t('key')` must exist in both dictionaries, and EN/ZH key sets must match (68 keys each).

### Changed

- Kim verdict recorded: its local databases are SQLCipher-encrypted and only the external `mycli` can read them, so Kim stays covered by the generic app-data watcher (decision D11).
- Locale metadata and README describe the full source list and the island.

## 0.3.0 - 2026-11-23

### Added

- Frame-wide island in `shell.overlay`: collapsed run/wait/changed counts (10s), expandable card with the top five items and an **Open desk** button (2.5s while open), Esc/outside-click to collapse, hidden when there is nothing to show.
- Shared `activateItem` routing for desk rows and island rows.

## 0.2.0 - 2026-11-23

### Added

- `codex` source: parses `~/.codex/sessions/**/rollout-*.jsonl` (head 256KB, tail 64KB, per-file cache) for project, event count, CLI version, provider, and running/idle/done from `task_started` / `task_complete` / `turn_aborted`.
- `wechat` source: reads DSH's own `~/.dsh/channel-wechat/peer-sessions.json` and channel-log mtime; never touches WeChat's store.
- `files` source: newest change under `.claude`, `.cursor`, and Kim's known data subdirectories.
- `DSH_MYDESK_HOME` test seam so the probe runs against a fixture tree.

### Fixed

- Codex `session_meta` lines can exceed 16KB; the old head read truncated them and lost `cwd` and `session_id`.
- Kim's data subdirectories are directories, not files; the app-data watcher now considers directory mtimes too.

## 0.1.0 - 2026-11-23

### Added

- Unified `Item` / `Source` kernel with per-source probe, budget, timeout, and health so one failing source cannot blank the desk.
- `dsh` source: Sessions (turn state from each Session log), background jobs (registry events, all owners), scheduled tasks, goals, Team tasks (deduplicated by task id).
- `process` source: allowlisted `pgrep` for DeepSeek Harness, Kim, and WeChat.
- Sidebar entry and main panel; read-only `GET /dsh-mydesk/state` behind the app's connection trust; allowlisted `POST /dsh-mydesk/open` (app bundle or `http(s)` URL, fixed argv).
- `test/probe.mjs` contract harness running both halves against a fake Cordis context.
