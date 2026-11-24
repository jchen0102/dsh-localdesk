/**
 * Contract probe for dsh-localdesk (dev-only; not shipped in the npm package).
 *
 * Runs the real Host half against a fake Cordis context and the real Client half
 * against fake React/locale/slot services, then clicks through the rendered rows.
 * It is a regression harness, not a visual verification.
 *
 *   node test/probe.mjs
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = new URL('..', import.meta.url).pathname

/* A fake home so the filesystem sources are deterministic and touch no real data. */
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-localdesk-probe-'))
process.env.DSH_LOCALDESK_HOME = HOME
const codexDir = path.join(HOME, '.codex', 'sessions', '2026', '11', '23')
fs.mkdirSync(codexDir, { recursive: true })
fs.writeFileSync(
  path.join(codexDir, 'rollout-x.jsonl'),
  [
    JSON.stringify({
      type: 'session_meta',
      ordinal: 1,
      timestamp: new Date(Date.now() - 4000).toISOString(),
      payload: { session_id: 'codex-1', cwd: '/tmp/project-x', cli_version: '0.9.0', model_provider: 'openai', source: 'cli' },
    }),
    JSON.stringify({ type: 'event_msg', ordinal: 2, timestamp: new Date(Date.now() - 3000).toISOString(), payload: { type: 'task_started' } }),
  ].join('\n') + '\n',
)
const writeCodex = (name, sessionId, cwd, marker, stamp) => {
  const file = path.join(codexDir, name)
  fs.writeFileSync(
    file,
    [
      JSON.stringify({
        type: 'session_meta',
        ordinal: 1,
        timestamp: new Date(stamp).toISOString(),
        payload: { session_id: sessionId, cwd, cli_version: '0.9.0', model_provider: 'openai', source: 'cli' },
      }),
      JSON.stringify({ type: 'event_msg', ordinal: 2, timestamp: new Date(stamp).toISOString(), payload: { type: marker } }),
    ].join('\n') + '\n',
  )
  return file
}
const staleFile = writeCodex('rollout-stale.jsonl', 'codex-stale', '/tmp/stale-proj', 'task_started', Date.now() - 2 * 60 * 60 * 1000)
const staleAt = (Date.now() - 2 * 60 * 60 * 1000) / 1000
fs.utimesSync(staleFile, staleAt, staleAt)
const doneFile = writeCodex('rollout-done.jsonl', 'codex-done', '/tmp/done-proj', 'task_complete', Date.now() - 2 * 24 * 60 * 60 * 1000)
const doneAt = (Date.now() - 2 * 24 * 60 * 60 * 1000) / 1000
fs.utimesSync(doneFile, doneAt, doneAt)

fs.mkdirSync(path.join(HOME, '.dsh', 'channel-wechat', 'log'), { recursive: true })
fs.writeFileSync(
  path.join(HOME, '.dsh', 'channel-wechat', 'peer-sessions.json'),
  JSON.stringify({ peers: { 'peer1@im.wechat': 'sess-alpha-0001' }, cwds: {} }),
)
fs.writeFileSync(path.join(HOME, '.dsh', 'channel-wechat', 'log', 'channel.log'), '[channel-wechat] polling\n')
fs.mkdirSync(path.join(HOME, '.claude', 'sessions'), { recursive: true })
fs.writeFileSync(path.join(HOME, '.claude', 'sessions', 'a.jsonl'), '{}\n')
fs.mkdirSync(path.join(HOME, '.cursor', 'projects', 'p1'), { recursive: true })
fs.writeFileSync(path.join(HOME, '.cursor', 'projects', 'p1', 'state.json'), '{}\n')
const failures = []
function check(name, condition, detail) {
  if (condition) {
    console.log('  ok   ' + name)
  } else {
    failures.push(name)
    console.log('  FAIL ' + name + (detail === undefined ? '' : ' → ' + detail))
  }
}

const now = Date.now()

/* ------------------------------------------------------------------ fixtures */

const sessionA = {
  id: 'sess-alpha-0001',
  seq: 42,
  header: {
    version: 1,
    id: 'sess-alpha-0001',
    createdAt: now - 600000,
    cwd: '/Users/jiaochen/Downloads/vibecoding',
    isSeeded: false,
    agentPreset: 'standard',
  },
  requestContext: () => ({ provider: 'deepseek', model: 'deepseek-v4' }),
  snapshotEvents: (from) => [{ type: 'tool/call', seq: 42, time: now - 8000, data: {} }].filter((e) => e.seq - 1 >= from),
}

const sessionB = {
  id: 'sess-child-0002',
  seq: 9,
  header: {
    version: 1,
    id: 'sess-child-0002',
    createdAt: now - 120000,
    cwd: '/Users/jiaochen/Downloads/vibecoding',
    isSeeded: false,
    origin: 'subagent',
    parentSession: 'sess-alpha-0001',
    delegationDepth: 1,
  },
  requestContext: () => undefined,
  snapshotEvents: () => [],
}

const agents = [{ session: sessionA }, { session: sessionB }]
const boundaries = new Map([
  ['sess-alpha-0001', { openTurnStartSeq: 41, lastStepStartSeq: 41, lastStepBoundary: { kind: 'start', seq: 41 }, lastTurn: 3 }],
  ['sess-child-0002', { openTurnStartSeq: null, lastStepStartSeq: 9, lastStepBoundary: { kind: 'end', seq: 9 }, lastTurn: 1 }],
])

const goals = new Map([
  [
    'sess-alpha-0001',
    { id: 'goal-1', revision: 2, objective: '把工作台做到可发布', phase: 'active', maxGoalRounds: 12, roundsStarted: 3, activation: 'armed', createdAt: now, updatedAt: now - 60000 },
  ],
])

const jobEvents = []
const jobsService = {
  events: { subscribe(filter, listener) { jobEvents.push({ filter, listener }); return () => {} } },
  list(caller) {
    if (String(caller) !== 'sess-alpha-0001') return []
    return [
      {
        id: 'bash-job-1',
        kind: 'bash',
        label: 'pnpm -r test',
        owner: 'sess-alpha-0001',
        status: 'running',
        progress: 'building packages',
        startedAt: now - 45000,
        output: { total: 8192, earliest: 0 },
      },
    ]
  },
}

const schedule = {
  async catalog() {
    return [
      {
        id: 'sched-1',
        kind: 'rrule',
        title: '每日巡检',
        prompt: 'check',
        rrule: 'FREQ=DAILY',
        scheduledAt: new Date(now + 3600000).toISOString(),
        target: { kind: 'session', sessionId: 'sess-alpha-0001' },
        status: 'active',
        executionActive: true,
        lastDelivery: { deliveredAt: new Date(now - 3600000).toISOString() },
      },
    ]
  },
}

const agentTeams = {
  isEnabled: () => true,
  listTasks: () => [
    { id: 't1', revision: 1, subject: '写 Host 汇总路由', status: 'in_progress', blockedBy: [], writeScopes: [], ready: true, ownerName: 'helper' },
    { id: 't2', revision: 1, subject: '补空状态', status: 'pending', blockedBy: [], writeScopes: [], ready: false },
  ],
}

const PGREP = new Map([
  ['DeepSeek Harness.app', { code: 0, text: '4242 /Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness\n' }],
  ['Kim.app', { code: 1, text: '' }],
  ['WeChat.app', { code: 0, text: '5151 /Applications/WeChat.app/Contents/MacOS/WeChat\n5252 /Applications/WeChat.app/Contents/MacOS/WeChatAppEx\n' }],
])

function makeSubprocess(options = {}) {
  const spawned = []
  return {
    spawned,
    async resolveExecutable(name) {
      if (options.fail) throw new Error('resolve denied')
      return `/usr/bin/${name}`
    },
    spawn(spec) {
      spawned.push(spec.argv)
      const pattern = spec.argv[spec.argv.length - 1]
      const entry = PGREP.get(pattern) ?? { code: 1, text: '' }
      return {
        stdin: undefined,
        stdout: undefined,
        stderr: undefined,
        control: undefined,
        collected: { stdout: { readFrom: () => ({ text: entry.text, nextOffset: entry.text.length, lossy: false }) } },
        done: Promise.resolve({ exitCode: entry.code, signal: null }),
        terminate() {},
        waitForExit: async () => true,
      }
    },
  }
}

function makeHostContext(options = {}) {
  const routes = []
  const subprocess = makeSubprocess(options.subprocess)
  const services = {
    connection: { requestRejection: () => options.reject ?? undefined },
    jobs: jobsService,
    schedule,
    goals: { get: (agent) => goals.get(String(agent.session.id)) },
    agentTeams,
    subprocess,
  }
  return {
    routes,
    subprocess,
    ctx: {
      effect(fn) {
        fn()
        return () => {}
      },
      get(name) {
        return services[name]
      },
      agents: {
        list: () => agents,
        turnBoundaryOf: (session) => boundaries.get(String(session.id)),
      },
      webServer: {
        register(route) {
          routes.push(route)
          return () => {}
        },
      },
    },
  }
}

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value
    },
    end(chunk) {
      this.body += chunk ?? ''
    },
  }
}

function makeReq(url, method = 'GET', body) {
  const text = body === undefined ? '' : body
  return {
    url,
    method,
    headers: {},
    async *[Symbol.asyncIterator]() {
      if (text.length > 0) yield Buffer.from(text)
    },
  }
}

async function call(route, request) {
  const res = makeRes()
  await route.handler(request, res)
  return res
}

/* --------------------------------------------------------------- host checks */

const { apply: applyHost } = await import(pathToFileURL(ROOT + 'index.js').href)
const host = makeHostContext()
applyHost(host.ctx)
const route = host.routes.find((item) => item.path === '/dsh-localdesk')

console.log('\nHost half')
check('route registered', Boolean(route))
check(
  'job fold subscribes to all owners',
  jobEvents.length === 1 && jobEvents[0].filter?.owners === 'all',
  JSON.stringify(jobEvents.map((entry) => entry.filter)),
)

const stateRes = await call(route, makeReq('/dsh-localdesk/state'))
check('state 200', stateRes.statusCode === 200, String(stateRes.statusCode))
check('state is json', stateRes.headers['content-type']?.includes('application/json') === true)
const state = JSON.parse(stateRes.body)
const packageVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version
check('state carries the Host version', state.version === packageVersion, `${state.version} vs ${packageVersion}`)
const sectionIds = state.sections.map((section) => section.id)
check(
  'all nine sections present',
  ['dsh:session', 'dsh:job', 'dsh:schedule', 'dsh:goal', 'dsh:team-task', 'codex:codex', 'wechat:channel', 'files:file', 'process:process'].every((id) => sectionIds.includes(id)),
  sectionIds.join(','),
)
check('stats items counted', state.stats.items === 15, JSON.stringify(state.stats))
check('stats running counted', state.stats.running === 7, JSON.stringify(state.stats))
check('stats waiting counted', state.stats.waiting === 1, JSON.stringify(state.stats))
check('changed-in-5m counted', state.stats.changed === 7, JSON.stringify(state.stats))
check('all five sources healthy', state.stats.sourcesOk === 5, JSON.stringify(state.stats))
const sessionItems = state.sections.find((section) => section.id === 'dsh:session')?.items ?? []
check(
  'session item carries jump',
  sessionItems[0]?.jump?.kind === 'dsh-session' && sessionItems[0].jump.sessionId === 'sess-alpha-0001',
  JSON.stringify(sessionItems[0]?.jump),
)
check(
  'subagent tagged',
  (sessionItems.find((item) => item.id.includes('sess-child-0002'))?.tags ?? []).includes('subagent'),
)
const jobItem = state.sections.find((section) => section.id === 'dsh:job')?.items?.[0]
check('running job omits statusText', jobItem?.statusText === undefined, JSON.stringify(jobItem))
const processItems = state.sections.find((section) => section.id === 'process:process')?.items ?? []
check('process item for allowlisted app', processItems.some((item) => item.title === 'DeepSeek Harness'), JSON.stringify(processItems.map((i) => i.title)))
check('process item carries app jump', processItems[0]?.jump?.kind === 'app', JSON.stringify(processItems[0]?.jump))
check('process item has no changedAt', processItems.every((item) => item.changedAt === undefined))
check('pgrep argv is fixed', host.subprocess.spawned.length >= 1 && host.subprocess.spawned[0].includes('-f'), JSON.stringify(host.subprocess.spawned[0]))

const codexItems = state.sections.find((section) => section.id === 'codex:codex')?.items ?? []
check('codex session listed', codexItems[0]?.title === 'project-x', JSON.stringify(codexItems[0]))
check('codex running from task_started', codexItems[0]?.status === 'running', JSON.stringify(codexItems[0]?.status))
check('codex meta counts events', (codexItems[0]?.meta ?? []).some((line) => line.includes('2 events')), JSON.stringify(codexItems[0]?.meta))
check(
  'stale task_started is not reported as running',
  codexItems.find((item) => item.title === 'stale-proj')?.status === 'idle',
  JSON.stringify(codexItems.find((item) => item.title === 'stale-proj')),
)
check(
  'old completed task is reported as done',
  codexItems.find((item) => item.title === 'done-proj')?.status === 'done',
  JSON.stringify(codexItems.find((item) => item.title === 'done-proj')),
)
const channelItems = state.sections.find((section) => section.id === 'wechat:channel')?.items ?? []
check('wechat peer listed', channelItems[0]?.title === 'peer1', JSON.stringify(channelItems[0]))
check('wechat peer links session', channelItems[0]?.jump?.kind === 'dsh-session' && channelItems[0].jump.sessionId === 'sess-alpha-0001', JSON.stringify(channelItems[0]?.jump))
const fileItems = state.sections.find((section) => section.id === 'files:file')?.items ?? []
check('file targets found', fileItems.length === 2, JSON.stringify(fileItems.map((item) => item.title)))
check('file targets report changed', fileItems.every((item) => item.status === 'changed'), JSON.stringify(fileItems.map((item) => item.status)))
check('file targets are not clickable', fileItems.every((item) => item.jump === undefined))

const isolated = makeHostContext({ subprocess: { fail: true } })
applyHost(isolated.ctx)
const isolatedState = JSON.parse((await call(isolated.routes[0], makeReq('/dsh-localdesk/state'))).body)
const processSource = isolatedState.sources.find((source) => source.id === 'process')
check('failing source reported', processSource?.health?.status === 'error', JSON.stringify(processSource?.health))
check(
  'other sources survive a failing source',
  isolatedState.sections.some((section) => section.id === 'dsh:session'),
  JSON.stringify(isolatedState.sections.map((s) => s.id)),
)

console.log('\nOpen route')
const openRoute = route
const appOk = await call(openRoute, makeReq('/dsh-localdesk/open', 'POST', JSON.stringify({ kind: 'app', app: 'Kim' })))
check('allowlisted app opens', appOk.statusCode === 200, appOk.body)
check('open argv uses app name', host.subprocess.spawned.some((argv) => argv.includes('-a') && argv.includes('Kim')), JSON.stringify(host.subprocess.spawned.at(-1)))
const appBad = await call(openRoute, makeReq('/dsh-localdesk/open', 'POST', JSON.stringify({ kind: 'app', app: 'Terminal' })))
check('unlisted app rejected', appBad.statusCode === 400, appBad.body)
const urlOk = await call(openRoute, makeReq('/dsh-localdesk/open', 'POST', JSON.stringify({ kind: 'url', url: 'https://example.com/x' })))
check('https url opens', urlOk.statusCode === 200, urlOk.body)
const urlBad = await call(openRoute, makeReq('/dsh-localdesk/open', 'POST', JSON.stringify({ kind: 'url', url: 'javascript:alert(1)' })))
check('non-http url rejected', urlBad.statusCode === 400, urlBad.body)
const openGet = await call(openRoute, makeReq('/dsh-localdesk/open', 'GET'))
check('open rejects GET', openGet.statusCode === 405, String(openGet.statusCode))
const openBadBody = await call(openRoute, makeReq('/dsh-localdesk/open', 'POST', 'not json'))
check('open rejects bad body', openBadBody.statusCode === 400, openBadBody.body)
const statePost = await call(openRoute, makeReq('/dsh-localdesk/state', 'POST', '{}'))
check('state rejects POST', statePost.statusCode === 405, String(statePost.statusCode))
const unknown = await call(openRoute, makeReq('/dsh-localdesk/nope'))
check('unknown path 404', unknown.statusCode === 404, String(unknown.statusCode))

const rejecting = makeHostContext({ reject: 403 })
applyHost(rejecting.ctx)
const denied = await call(rejecting.routes[0], makeReq('/dsh-localdesk/state'))
check('untrusted request rejected', denied.statusCode === 403, String(denied.statusCode))

/* -------------------------------------------------------------- client checks */

console.log('\nClient half')

const dictionaries = new Map()
const registrations = []
const opened = []
const panels = []
const fetches = []
globalThis.fetch = async (url, init) => {
  fetches.push({ url, body: init?.body })
  return { ok: true, async json() { return {} } }
}

const ReactState = { queue: [] }
const ReactStub = {
  createElement(type, props, ...children) {
    const merged = props ? { ...props } : {}
    const kids = children.length === 0 ? undefined : children.length === 1 ? children[0] : children
    if (merged.children === undefined && kids !== undefined) merged.children = kids
    return { type, props: merged }
  },
  useState(initial) {
    const override = ReactState.queue.shift()
    return [override === undefined ? initial : override, () => {}]
  },
  useEffect() {},
  useCallback(fn) {
    return fn
  },
  useRef(initial) {
    return { current: initial ?? null }
  },
}

const slotCtx = {
  effect(fn) {
    fn()
    return () => {}
  },
  get(name) {
    if (name === 'uiWorkspace') {
      return {
        openSession(target) {
          opened.push(target)
        },
      }
    }
    if (name === 'layout') {
      return {
        selectPanel(panel) {
          panels.push(panel)
        },
      }
    }
    return undefined
  },
  locale: {
    getLocale: () => ({ id: 'zh', locales: [{ id: 'zh' }, { id: 'en' }] }),
    subscribe: () => () => {},
    register(ns, id, dict) {
      dictionaries.set(`${ns}:${id}`, dict)
      return () => {}
    },
    bind: (ns) => (key) => dictionaries.get(`${ns}:zh`)?.[key] ?? key,
  },
  slots: {
    inject(key, callback) {
      callback()
      return () => {}
    },
    register(options, component) {
      registrations.push({ options, component })
      return () => {}
    },
  },
}

let clientSpec
globalThis.window = { __ModuleLoader__: { load(spec) { clientSpec = spec } } }
await import(pathToFileURL(ROOT + 'client.js').href)
check('client module registers itself', Boolean(clientSpec))
check('client id matches package', clientSpec?.id === 'dsh-localdesk', clientSpec?.id)

const clientModule = clientSpec.factory((name) => {
  if (name === 'react') return ReactStub
  throw new Error('unexpected require: ' + name)
})
clientModule.apply(slotCtx)

const clientSource = fs.readFileSync(ROOT + 'client.js', 'utf8')
const keySet = (block) => new Set([...block.matchAll(/^\s{6}(\w+):/gm)].map((match) => match[1]))
const enKeys = keySet(clientSource.match(/const EN = \{([\s\S]*?)\n    \}/)[1])
const zhKeys = keySet(clientSource.match(/const ZH = \{([\s\S]*?)\n    \}/)[1])
const usedKeys = new Set([...clientSource.matchAll(/(?<![A-Za-z_])t\('([^']+)'\)/g)].map((match) => match[1]))
check(
  'every used i18n key exists in both dictionaries',
  [...usedKeys].every((key) => enKeys.has(key) && zhKeys.has(key)),
  [...usedKeys].filter((key) => !enKeys.has(key) || !zhKeys.has(key)).join(','),
)
check('EN and ZH key sets match', enKeys.size === zhKeys.size && [...enKeys].every((key) => zhKeys.has(key)), `${enKeys.size}/${zhKeys.size}`)

const panellist = registrations.find((entry) => entry.options.name === 'sidebar.panellist')
const main = registrations.find((entry) => entry.options.name === 'main')
const overlay = registrations.find((entry) => entry.options.name === 'shell.overlay')
check('panellist registration', panellist?.options.id === 'localdesk' && panellist.options.order === 7, JSON.stringify(panellist?.options))
check('panellist label localizes', panellist?.options.label?.() === '我的工作台', panellist?.options.label?.())
check('main registration', main?.options.key === 'localdesk', JSON.stringify(main?.options))
check('island registration', overlay?.options.id === 'localdesk-island' && overlay.options.order === 5, JSON.stringify(overlay?.options))

function text(node, out = []) {
  if (node === null || node === undefined || node === false) return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) text(child, out)
    return out
  }
  if (node.props) text(node.props.children, out)
  return out
}

function collect(node, predicate, out = []) {
  if (node === null || node === undefined || node === false) return out
  if (Array.isArray(node)) {
    for (const child of node) collect(child, predicate, out)
    return out
  }
  if (typeof node !== 'object') return out
  if (predicate(node)) out.push(node)
  if (node.props) collect(node.props.children, predicate, out)
  return out
}

function render(data, options = {}) {
  ReactState.queue = [
    undefined,
    { status: 'ready', data, error: null, at: now },
    undefined,
    undefined,
    options.query,
    options.filter,
  ]
  const element = main.component({ ctx: slotCtx })
  return element.type(element.props)
}

const rendered = text(render(state))
check('panel renders title', rendered.includes('我的工作台'), rendered.slice(0, 3).join('|'))
check('no stale-host banner when versions match', !rendered.includes('Host 端版本比页面旧'))
const staleHostText = text(render({ ...state, version: '0.0.9' }))
check('stale-host banner when versions differ', staleHostText.some((line) => line.includes('Host 端版本比页面旧') && line.includes('0.0.9')))
check(
  'section titles localized',
  ['会话', '后台作业', '定时任务', '目标', '团队任务', 'Codex 会话', '微信渠道', '应用数据变动', '本机应用'].every((label) => rendered.includes(label)),
)
check('stats localized', rendered.includes('5 分钟变动') && rendered.includes('源'))
check('row content rendered', rendered.some((line) => line.includes('pnpm -r test')))
check('source scope label rendered', rendered.includes('本进程') && rendered.includes('本机'))
check('open failure notice absent initially', !rendered.includes('打不开目标'))

const clickable = collect(render(state), (node) => node.props?.role === 'button')
check('clickable rows found', clickable.length >= 6, String(clickable.length))
opened.length = 0
fetches.length = 0
for (const node of clickable) node.props.onClick()
check('dsh rows open sessions', opened.includes('sess-alpha-0001'), JSON.stringify(opened))
check('app rows call open route', fetches.some((entry) => entry.url === '/dsh-localdesk/open' && String(entry.body).includes('DeepSeek Harness')), JSON.stringify(fetches))

const processRows = collect(render(state), (node) => node.props?.role === 'button' && String(node.props.title ?? '').includes('pid'))
check('process rows carry pid meta', processRows.length >= 1)

const queryText = text(render(state, { query: 'project-x' }))
check('search narrows to matching items', queryText.includes('project-x') && !queryText.includes('pnpm -r test'))
check('search keeps the matched section title', queryText.includes('Codex 会话'))
const runningText = text(render(state, { filter: 'running' }))
check('running filter hides waiting items', runningText.includes('写 Host 汇总路由') && !runningText.includes('补空状态'))
const hiddenState = {
  ...state,
  sections: state.sections.map((section) => (section.id === 'dsh:session' ? { ...section, hidden: 1 } : section)),
}
check('hidden counter shows without a filter', text(render(hiddenState)).includes('+1 条未显示'))
check('hidden counter is suppressed while filtering', !text(render(hiddenState, { filter: 'running' })).includes('+1'))

const noMatchText = text(render(state, { query: 'zzz-no-such-thing' }))
check('no-match state renders', noMatchText.includes('没有匹配的条目'))

const emptyState = {
  generatedAt: now,
  now,
  stats: { items: 0, running: 0, waiting: 0, changed: 0, sourcesOk: 2, sourcesTotal: 2 },
  sources: [],
  sections: [],
}
check('empty state renders', text(render(emptyState)).includes('本机现在没有在跑的东西'))

const failedState = render({ ...emptyState, stats: { ...emptyState.stats }, sources: [] })
check('empty state does not throw', Boolean(failedState))

ReactState.queue = [undefined, { status: 'failed', data: null, error: 'HTTP 401', at: 0 }, undefined, undefined]
const failedElement = main.component({ ctx: slotCtx })
const failedText = text(failedElement.type(failedElement.props))
check('failure state renders', failedText.some((line) => line.includes('HTTP 401')))

/* ---------------------------------------------------------------- island */

function renderIsland(data, expanded) {
  ReactState.queue = [undefined, expanded, { status: 'ready', data, error: null, at: now }, undefined]
  const element = overlay.component({ ctx: slotCtx })
  return element.type(element.props)
}

const islandCollapsed = renderIsland(state, false)
const collapsedText = text(islandCollapsed)
check('island renders when there is work', Boolean(islandCollapsed))
check('island shows run/wait/chg counts', ['7', '1'].every((value) => collapsedText.includes(value)) && collapsedText.includes('跑'), collapsedText.join('|'))
check('island pill is a button', collect(islandCollapsed, (node) => node.type === 'button').length === 1)

const islandExpanded = renderIsland(state, true)
const expandedText = text(islandExpanded)
check('island expands into a card', expandedText.includes('打开工作台') && expandedText.includes('Esc 收起'))
const islandRows = collect(islandExpanded, (node) => node.props?.className === 'mi-row')
check('island lists at most five rows', islandRows.length > 0 && islandRows.length <= 5, String(islandRows.length))
opened.length = 0
for (const row of islandRows) row.props.onClick()
check('island rows route like the desk', opened.includes('sess-alpha-0001'), JSON.stringify(opened))

const islandButtons = collect(islandExpanded, (node) => node.type === 'button' && node.props?.className === 'mi-open')
panels.length = 0
islandButtons[0]?.props.onClick()
check('island opens the desk panel', panels.includes('localdesk'), JSON.stringify(panels))

const islandEmpty = renderIsland({ ...emptyState, stats: { ...emptyState.stats } }, false)
check('island hides itself when empty', islandEmpty === null)

const staleIsland = text(renderIsland({ ...state, version: '0.0.9' }, false))
check('island names a stale Host instead of a bare dot', staleIsland.some((line) => line.includes('Host 旧')), staleIsland.join('|'))
const staleDots = collect(renderIsland({ ...state, version: '0.0.9' }, false), (node) => String(node.props?.className ?? '').includes('mi-dot--warn'))
check('stale Host uses the warning dot', staleDots.length === 1, String(staleDots.length))

/* ---------------------------------------------------------------- cleanup */

fs.rmSync(HOME, { recursive: true, force: true })

/* ---------------------------------------------------------------- report */

console.log('')
if (failures.length > 0) {
  console.log('FAILED: ' + failures.length + ' check(s)')
  process.exitCode = 1
} else {
  console.log('All probe checks passed.')
}
