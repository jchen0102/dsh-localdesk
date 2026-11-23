/**
 * dsh-mydesk — Host half.
 *
 * A local change observatory: every source reports the same `Item` shape, one
 * read-only route aggregates them, and the browser only renders what it gets.
 *
 * P1 sources:
 *  - dsh     — live Sessions (turn state from each Session's own log), background
 *              jobs (registry events folded here), scheduled tasks, goals, Team
 *              tasks. Scope: this DSH process (+ durable sessions once P2 lands).
 *  - process — allowlisted local apps observed through `pgrep`. Scope: machine.
 *
 * Design constraints that matter (see docs/DECISIONS.md):
 *  - D1/D5: read-only. The only side effect is `/open`, an explicit user click
 *    restricted to an allowlist.
 *  - D8: plugin subprocesses are NOT sandboxed by the harness, so every command
 *    this plugin runs is fixed-argv and allowlisted; no shell strings.
 *  - Each source is scanned independently with its own timeout and health so one
 *    failing source cannot blank the desk.
 */
export const name = 'dsh-mydesk'

export const inject = ['webServer', 'connection', 'agents']

const ROUTE = '/dsh-mydesk'
const STATE_PATH = `${ROUTE}/state`
const OPEN_PATH = `${ROUTE}/open`

const TOTAL_BUDGET_MS = 900
const SOURCE_BUDGET_MS = 500
const MAX_ITEMS_PER_KIND = 40
const SCHEDULE_CACHE_MS = 3000
const PROCESS_CACHE_MS = 2000

/** Fixed order the desk renders in. */
const SECTION_ORDER = [
  ['dsh', 'session'],
  ['dsh', 'job'],
  ['dsh', 'schedule'],
  ['dsh', 'goal'],
  ['dsh', 'team-task'],
  ['process', 'process'],
]

/** Local apps the process source may look at, and the `/open` allowlist. */
const PROCESS_TARGETS = [
  { name: 'DeepSeek Harness', pattern: 'DeepSeek Harness.app', bundle: 'DeepSeek Harness' },
  { name: 'Kim', pattern: 'Kim.app', bundle: 'Kim' },
  { name: 'WeChat', pattern: 'WeChat.app', bundle: 'WeChat' },
]

/** jobId → JobView, folded from the registry's own cross-owner events. */
const jobCache = new Map()

/** sessionId → { seq, at }; the log tail is read once per committed event. */
const activityCache = new Map()

let scheduleCache = { at: 0, items: [] }
let processCache = { at: 0, items: [] }

function baseName(path) {
  if (typeof path !== 'string' || path.length === 0) return undefined
  const parts = path.split(/[\\/]/).filter((part) => part.length > 0)
  return parts.length > 0 ? parts[parts.length - 1] : undefined
}

function shortId(id) {
  return String(id).slice(0, 8)
}

function clip(text, limit) {
  const value = String(text ?? '')
  return value.length > limit ? value.slice(0, limit - 1) + '…' : value
}

function cleanMeta(values) {
  return values.filter((value) => typeof value === 'string' && value.length > 0).slice(0, 4)
}

/** Normalize one source report into the wire `Item`. */
function makeItem(source, kind, raw) {
  const item = {
    id: `${source}:${kind}:${String(raw.key ?? '')}`,
    source,
    kind,
    title: clip(raw.title ?? '', 180),
    status: raw.status ?? 'unknown',
    depth: raw.depth ?? 'L1',
  }
  if (raw.subtitle) item.subtitle = clip(raw.subtitle, 180)
  const meta = cleanMeta(raw.meta ?? [])
  if (meta.length > 0) item.meta = meta
  if (raw.statusText) item.statusText = clip(raw.statusText, 60)
  const tags = (raw.tags ?? []).filter((tag) => typeof tag === 'string').slice(0, 3)
  if (tags.length > 0) item.tags = tags
  if (typeof raw.changedAt === 'number') item.changedAt = raw.changedAt
  if (typeof raw.startedAt === 'number') item.startedAt = raw.startedAt
  if (raw.jump) item.jump = raw.jump
  return item
}

/* ------------------------------------------------------------------ dsh source */

function readSession(ctx, agent) {
  const session = agent.session
  let boundary = null
  try {
    boundary = ctx.agents.turnBoundaryOf(session)
  } catch {}

  let model
  try {
    const context = session.requestContext()
    if (context) model = context.model
  } catch {}

  const key = String(session.id)
  const seq = Number(session.seq) || 0
  let lastEventAt
  const cached = activityCache.get(key)
  if (cached !== undefined && cached.seq === seq) {
    lastEventAt = cached.at
  } else if (seq > 0) {
    try {
      const tail = session.snapshotEvents(seq - 1)
      const last = tail.length > 0 ? tail[tail.length - 1] : undefined
      if (last && typeof last.time === 'number') lastEventAt = last.time
      activityCache.set(key, { seq, at: lastEventAt })
    } catch {}
  }

  const header = session.header ?? {}
  const working = Boolean(boundary && boundary.openTurnStartSeq !== null)
  return {
    sessionId: key,
    label: baseName(header.cwd) ?? shortId(key),
    cwd: typeof header.cwd === 'string' ? header.cwd : undefined,
    origin: header.origin === 'subagent' ? 'subagent' : 'session',
    parentSessionId: header.parentSession ? String(header.parentSession) : undefined,
    preset: typeof header.agentPreset === 'string' ? header.agentPreset : undefined,
    status: working ? 'running' : 'idle',
    turn: boundary && typeof boundary.lastTurn === 'number' ? boundary.lastTurn : 0,
    model,
    lastEventAt,
  }
}

function jobsByOwnerLabels(sessions) {
  const labels = new Map()
  for (const session of sessions) labels.set(session.sessionId, session.label)
  for (const session of sessions) {
    if (session.parentSessionId && !labels.has(session.parentSessionId)) {
      labels.set(session.parentSessionId, shortId(session.parentSessionId))
    }
  }
  return labels
}

function collectJobs(ctx, agents, labels) {
  const service = ctx.get('jobs')
  if (!service) return []
  for (const agent of agents) {
    try {
      for (const view of service.list(agent.session.id)) jobCache.set(String(view.id), view)
    } catch {}
  }
  try {
    for (const view of service.list()) jobCache.set(String(view.id), view)
  } catch {}

  const entries = []
  for (const view of jobCache.values()) {
    const owner = view.owner === undefined ? undefined : String(view.owner)
    entries.push({
      key: String(view.id),
      title: view.label,
      subtitle: owner === undefined ? undefined : labels.get(owner),
      status:
        view.status === 'running' || view.status === 'stopping'
          ? 'running'
          : view.status === 'failed'
            ? 'failed'
            : 'done',
      statusText: view.status === 'running' ? undefined : view.status,
      meta: cleanMeta([
        view.progress ? clip(view.progress, 80) : '',
        typeof view.output?.total === 'number' && view.output.total > 0 ? `${view.output.total} B` : '',
        view.detail ? clip(view.detail, 100) : '',
      ]),
      changedAt: view.finishedAt ?? view.startedAt,
      startedAt: view.startedAt,
      tags: view.kind === 'bash' ? [] : [String(view.kind)],
      jump: owner === undefined ? undefined : { kind: 'dsh-session', sessionId: owner },
    })
  }
  return entries
}

function timingOf(entry) {
  const timing = { kind: String(entry.kind ?? 'unknown') }
  if (typeof entry.everySeconds === 'number') timing.everySeconds = entry.everySeconds
  if (typeof entry.afterSeconds === 'number') timing.afterSeconds = entry.afterSeconds
  if (typeof entry.time === 'string') timing.time = entry.time
  if (typeof entry.timeZone === 'string') timing.timeZone = entry.timeZone
  if (Array.isArray(entry.weekdays)) timing.weekdays = entry.weekdays.map(Number)
  if (typeof entry.expression === 'string') timing.expression = entry.expression
  if (typeof entry.rrule === 'string') timing.rrule = entry.rrule
  return timing
}

async function collectSchedules(ctx, labels) {
  const service = ctx.get('schedule')
  if (!service) return []
  const now = Date.now()
  if (now - scheduleCache.at < SCHEDULE_CACHE_MS) return scheduleCache.items
  try {
    const catalog = await service.catalog()
    const items = (Array.isArray(catalog) ? catalog : []).map((entry) => {
      const target = entry.target ?? { kind: 'unknown' }
      const targetSessionId = target.sessionId === undefined ? undefined : String(target.sessionId)
      return {
        key: String(entry.id),
        title: entry.title,
        subtitle: targetSessionId === undefined ? undefined : labels.get(targetSessionId),
        status: entry.status === 'active' ? 'scheduled' : entry.status === 'paused' ? 'waiting' : 'done',
        statusText: entry.status,
        meta: cleanMeta([timingSummary(entry), entry.scheduledAt ? `next ${entry.scheduledAt}` : '']),
        changedAt:
          typeof entry.lastDelivery?.deliveredAt === 'string'
            ? Date.parse(entry.lastDelivery.deliveredAt)
            : undefined,
        tags: entry.executionActive === true ? ['executing'] : [],
        jump: targetSessionId === undefined ? undefined : { kind: 'dsh-session', sessionId: targetSessionId },
      }
    })
    items.sort((a, b) => String(a.meta?.[1] ?? '').localeCompare(String(b.meta?.[1] ?? '')))
    scheduleCache = { at: now, items }
    return items
  } catch {
    return scheduleCache.items
  }
}

function timingSummary(entry) {
  if (typeof entry.everySeconds === 'number') return `every ${entry.everySeconds}s`
  if (typeof entry.afterSeconds === 'number') return `+${entry.afterSeconds}s`
  if (entry.kind === 'daily') return `daily ${String(entry.time ?? '')}`
  if (entry.kind === 'cron') return `cron ${String(entry.expression ?? '')}`
  if (entry.kind === 'weekly') return `weekly ${(entry.weekdays ?? []).join(',')} ${String(entry.time ?? '')}`
  if (entry.kind === 'rrule') return 'rrule'
  return String(entry.kind ?? '')
}

async function scanDsh(ctx, now) {
  const agents = ctx.agents.list()
  const sessions = []
  // The same Team board is visible to every member of a lead's tree, so fold by
  // task id instead of listing it once per live agent.
  const goals = new Map()
  const team = new Map()

  for (const agent of agents) {
    let session
    try {
      session = readSession(ctx, agent)
    } catch {
      continue
    }
    sessions.push(session)

    const goalService = ctx.get('goals')
    if (goalService) {
      try {
        const view = goalService.get(agent)
        if (view && !goals.has(String(view.id))) {
          goals.set(String(view.id), {
            key: String(view.id),
            title: view.objective,
            subtitle: session.label,
            status:
              view.phase === 'active'
                ? 'running'
                : view.phase === 'blocked'
                  ? 'failed'
                  : view.phase === 'complete'
                    ? 'done'
                    : 'waiting',
            statusText: view.phase,
            meta: cleanMeta([`${view.roundsStarted ?? 0}/${view.maxGoalRounds ?? 0} rounds`]),
            changedAt: typeof view.updatedAt === 'number' ? view.updatedAt : undefined,
            jump: { kind: 'dsh-session', sessionId: session.sessionId },
          })
        }
      } catch {}
    }

    const teamService = ctx.get('agentTeams')
    if (teamService) {
      try {
        if (teamService.isEnabled(agent)) {
          for (const task of teamService.listTasks(agent)) {
            if (team.has(String(task.id))) continue
            team.set(String(task.id), {
              key: String(task.id),
              title: task.subject,
              subtitle: session.label,
              status:
                task.status === 'in_progress'
                  ? 'running'
                  : task.status === 'completed'
                    ? 'done'
                    : 'waiting',
              statusText: task.status,
              meta: cleanMeta([
                task.ownerName ? `owner ${task.ownerName}` : '',
                task.ready === false ? 'blocked' : '',
              ]),
              tags: task.ready === false ? ['blocked'] : [],
              jump: task.ownerId
                ? { kind: 'dsh-session', sessionId: String(task.ownerId) }
                : { kind: 'dsh-session', sessionId: session.sessionId },
            })
          }
        }
      } catch {}
    }
  }

  const labels = jobsByOwnerLabels(sessions)
  const jobs = collectJobs(ctx, agents, labels)
  const schedules = await collectSchedules(ctx, labels)

  const sessionItems = sessions
    .sort((a, b) =>
      a.status === b.status ? (b.lastEventAt ?? 0) - (a.lastEventAt ?? 0) : a.status === 'running' ? -1 : 1,
    )
    .map((session) => ({
      kind: 'session',
      key: session.sessionId,
      title: session.label,
      subtitle: session.cwd,
      status: session.status,
      statusText: session.origin === 'subagent' ? 'subagent' : undefined,
      meta: cleanMeta([
        session.model ? String(session.model) : '',
        session.status === 'running' ? `turn ${session.turn}` : '',
        session.preset ? String(session.preset) : '',
      ]),
      changedAt: session.lastEventAt,
      tags: session.origin === 'subagent' ? ['subagent'] : [],
      jump: { kind: 'dsh-session', sessionId: session.sessionId },
    }))

  return [
    ...sessionItems,
    ...jobs.map((job) => ({ kind: 'job', ...job })),
    ...schedules.map((schedule) => ({ kind: 'schedule', ...schedule })),
    ...[...goals.values()].map((goal) => ({ kind: 'goal', ...goal })),
    ...[...team.values()].map((task) => ({ kind: 'team-task', ...task })),
  ]
}

/* -------------------------------------------------------------- process source */

async function runAllowlisted(ctx, argv, signal) {
  const subprocess = ctx.get('subprocess')
  if (!subprocess) throw new Error('subprocess service unavailable')
  const resolved = await subprocess.resolveExecutable(argv[0], undefined, signal)
  const handle = subprocess.spawn({
    argv: [resolved, ...argv.slice(1)],
    cwd: process.cwd(),
    stdio: {
      stdin: 'ignore',
      stdout: { maxBytes: 65536 },
      stderr: { maxBytes: 4096 },
    },
    graceMs: 1000,
    signal,
  })
  const outcome = await handle.done
  const read = handle.collected?.stdout?.readFrom(0)
  return { exitCode: outcome.exitCode, text: read?.text ?? '' }
}

async function scanProcess(ctx, now, signal) {
  const cached = processCache
  if (now - cached.at < PROCESS_CACHE_MS) return cached.items

  const items = []
  for (const target of PROCESS_TARGETS) {
    let result
    try {
      result = await runAllowlisted(ctx, ['pgrep', '-f', '-l', target.pattern], signal)
    } catch {
      continue
    }
    // pgrep exits 1 when nothing matches; that is an empty answer, not a failure.
    if (result.exitCode !== 0) continue
    const lines = result.text.split('\n').filter((line) => line.trim().length > 0)
    if (lines.length === 0) continue
    const first = lines[0].trim()
    const pid = first.split(/\s+/)[0]
    items.push({
      key: target.name,
      title: target.name,
      subtitle: clip(first.slice(pid.length).trim(), 120),
      status: 'running',
      statusText: `${lines.length} proc${lines.length > 1 ? 's' : ''}`,
      meta: cleanMeta([`pid ${pid}`]),
      jump: { kind: 'app', app: target.bundle },
    })
  }
  processCache = { at: now, items }
  return items
}

/* ------------------------------------------------------------------- registry */

function sourceList(ctx) {
  return [
    {
      id: 'dsh',
      kind: 'dsh',
      scope: 'process',
      titleKey: 'sourceDsh',
      depth: 'L1',
      probe: () => {
        const missing = []
        if (!ctx.agents) missing.push('agents')
        if (!ctx.webServer) missing.push('webServer')
        if (!ctx.get('connection')) missing.push('connection')
        const services = ['jobs', 'schedule', 'goals', 'agentTeams'].filter((key) => ctx.get(key))
        return missing.length === 0
          ? { available: true, confidence: 'high', evidence: `services: agents, ${services.join(', ') || 'no extra'}` }
          : { available: false, confidence: 'low', evidence: `missing: ${missing.join(', ')}` }
      },
      scan: (now) => scanDsh(ctx, now),
    },
    {
      id: 'process',
      kind: 'process',
      scope: 'machine',
      titleKey: 'sourceProcess',
      depth: 'L0',
      probe: async () => {
        const subprocess = ctx.get('subprocess')
        if (!subprocess) return { available: false, confidence: 'low', evidence: 'subprocess unavailable' }
        try {
          await subprocess.resolveExecutable('pgrep')
          return { available: true, confidence: 'high', evidence: 'pgrep resolved' }
        } catch (error) {
          return { available: false, confidence: 'low', evidence: String(error?.message ?? error) }
        }
      },
      scan: (now, signal) => scanProcess(ctx, now, signal),
    },
  ]
}

function withTimeout(promise, ms, label) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function readState(ctx) {
  const started = Date.now()
  const now = started
  const deadline = started + TOTAL_BUDGET_MS
  const sources = sourceList(ctx)
  const reports = []

  for (const source of sources) {
    const sourceStarted = Date.now()
    const controller = new AbortController()
    let probe = { available: true, confidence: 'unknown' }
    let items = []
    let error
    try {
      probe = await withTimeout(Promise.resolve(source.probe()), 120, `${source.id}.probe`)
      if (probe.available === false) {
        error = `unavailable: ${probe.evidence ?? 'probe failed'}`
      } else {
        const remaining = Math.max(50, Math.min(SOURCE_BUDGET_MS, deadline - Date.now()))
        const timer = setTimeout(() => controller.abort(), remaining)
        try {
          items = await withTimeout(
            Promise.resolve(source.scan(now, controller.signal)),
            remaining,
            `${source.id}.scan`,
          )
        } finally {
          clearTimeout(timer)
        }
      }
    } catch (caught) {
      error = String(caught?.message ?? caught)
      items = []
    }
    const normalized = (Array.isArray(items) ? items : []).map((item) => {
      const kind = item.kind ?? source.id
      return makeItem(source.id, kind, item)
    })
    reports.push({
      meta: {
        id: source.id,
        kind: source.kind,
        scope: source.scope,
        titleKey: source.titleKey,
        depth: source.depth,
        probe,
        health: {
          status: error ? 'error' : 'ok',
          error,
          lastScanAt: now,
          durationMs: Date.now() - sourceStarted,
          itemCount: normalized.length,
        },
      },
      items: normalized,
    })
  }

  const sections = []
  const itemsById = new Map()
  for (const report of reports) {
    for (const item of report.items) {
      const bucket = itemsById.get(`${item.source}|${item.kind}`) ?? []
      bucket.push(item)
      itemsById.set(`${item.source}|${item.kind}`, bucket)
    }
  }
  for (const [sourceId, kind] of SECTION_ORDER) {
    const items = itemsById.get(`${sourceId}|${kind}`) ?? []
    if (items.length === 0) continue
    items.sort((a, b) => {
      const rank = (status) =>
        status === 'running' ? 0 : status === 'waiting' ? 1 : status === 'scheduled' ? 2 : 3
      if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status)
      return (b.changedAt ?? 0) - (a.changedAt ?? 0)
    })
    sections.push({
      id: `${sourceId}:${kind}`,
      source: sourceId,
      kind,
      count: items.length,
      items: items.slice(0, MAX_ITEMS_PER_KIND),
      hidden: Math.max(0, items.length - MAX_ITEMS_PER_KIND),
    })
  }

  const allItems = sections.flatMap((section) => section.items)
  const recentlyChanged = allItems.filter(
    (item) => typeof item.changedAt === 'number' && now - item.changedAt < 5 * 60 * 1000,
  ).length
  const okSources = reports.filter((report) => report.meta.health.status === 'ok').length

  return {
    generatedAt: Date.now(),
    now,
    budgetMs: Date.now() - started,
    stats: {
      items: sections.reduce((total, section) => total + section.count, 0),
      running: allItems.filter((item) => item.status === 'running').length,
      waiting: allItems.filter((item) => item.status === 'waiting').length,
      changed: recentlyChanged,
      sourcesOk: okSources,
      sourcesTotal: reports.length,
    },
    sources: reports.map((report) => report.meta),
    sections,
  }
}

/* --------------------------------------------------------------------- routes */

function rejectionFor(ctx, req) {
  const connection = ctx.get('connection')
  if (typeof connection?.requestRejection !== 'function') return 403
  return connection.requestRejection({ headers: req.headers })
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

async function readBody(req, limit) {
  let size = 0
  const chunks = []
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('body too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Allowlisted, fixed-argv open. Never a shell string. */
async function runOpen(ctx, body) {
  const subprocess = ctx.get('subprocess')
  if (!subprocess) throw new Error('subprocess unavailable')
  if (body.kind === 'app') {
    const target = PROCESS_TARGETS.find((item) => item.bundle === body.app)
    if (!target) throw new Error('app not allowlisted')
    await runAllowlisted(ctx, ['open', '-a', target.bundle])
    return
  }
  if (body.kind === 'url') {
    const url = String(body.url ?? '')
    if (!/^https?:\/\/[^\s]+$/i.test(url) || url.length > 2048) throw new Error('url rejected')
    await runAllowlisted(ctx, ['open', url])
    return
  }
  throw new Error('unsupported jump kind')
}

export function apply(ctx) {
  const jobsService = ctx.get('jobs')
  if (jobsService && typeof jobsService.events?.subscribe === 'function') {
    ctx.effect(
      () =>
        jobsService.events.subscribe({ owners: 'all' }, (event) => {
          try {
            if (event.type === 'removed') {
              jobCache.delete(String(event.job.id))
              return
            }
            if (event.type === 'output') {
              const current = jobCache.get(String(event.id))
              if (current) {
                jobCache.set(String(event.id), {
                  ...current,
                  output: { ...current.output, total: event.total },
                })
              }
              return
            }
            jobCache.set(String(event.job.id), event.job)
          } catch {}
        }),
      'dsh-mydesk: job event fold',
    )
  }

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: ROUTE,
        handler: async (req, res) => {
          try {
            const rejection = rejectionFor(ctx, req)
            if (rejection) {
              res.statusCode = rejection
              res.end()
              return
            }
            const path = String(req.url ?? '').split('?')[0]
            if (path === STATE_PATH) {
              if ((req.method ?? 'GET') !== 'GET') return sendJson(res, 405, { error: 'method not allowed' })
              return sendJson(res, 200, await readState(ctx))
            }
            if (path === OPEN_PATH) {
              if ((req.method ?? 'GET') !== 'POST') return sendJson(res, 405, { error: 'method not allowed' })
              let body
              try {
                body = JSON.parse(await readBody(req, 4096))
              } catch {
                return sendJson(res, 400, { error: 'invalid body' })
              }
              try {
                await runOpen(ctx, body ?? {})
                return sendJson(res, 200, { ok: true })
              } catch (error) {
                return sendJson(res, 400, { error: String(error?.message ?? error) })
              }
            }
            res.statusCode = 404
            res.end()
          } catch (error) {
            sendJson(res, 500, { error: String(error?.message ?? error) })
          }
        },
      }),
    'dsh-mydesk: read-only state + allowlisted open',
  )
}
