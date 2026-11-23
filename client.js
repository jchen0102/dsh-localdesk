/**
 * dsh-mydesk — Client half.
 *
 * One page fed by `/dsh-mydesk/state`. The Host owns grouping, ordering and
 * statuses; this file only localizes and renders, and routes clicks to either
 * `uiWorkspace.openSession` (DSH) or the allowlisted `/dsh-mydesk/open`.
 */
window.__ModuleLoader__.load({
  id: 'dsh-mydesk',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'dsh-mydesk'
    const POLL_MS = 2500

    const EN = {
      title: 'My desk',
      subtitle: 'Everything running or recently changed on this machine',
      refresh: 'Refresh',
      updated: 'updated',
      loading: 'Reading local sources…',
      failed: 'Could not read the desk',
      stale: 'Showing the last successful read',
      emptyTitle: 'Nothing is running locally',
      emptyHint: 'Sessions, jobs, schedules, goals, Team tasks and local apps appear here once they exist.',
      statItems: 'Items',
      statRunning: 'Running',
      statWaiting: 'Waiting',
      statChanged: 'Changed 5m',
      statSources: 'Sources',
      kindSession: 'Sessions',
      kindJob: 'Background jobs',
      kindSchedule: 'Scheduled tasks',
      kindGoal: 'Goals',
      kindTeamTask: 'Team tasks',
      kindProcess: 'Local apps',
      sourceDsh: 'DSH',
      sourceProcess: 'Processes',
      scopeProcess: 'this process',
      scopeMachine: 'this machine',
      statusRunning: 'running',
      statusScheduled: 'scheduled',
      statusWaiting: 'waiting',
      statusIdle: 'idle',
      statusDone: 'done',
      statusFailed: 'failed',
      statusUnknown: 'unknown',
      statusNow: 'just now',
      statusTextBlocked: 'blocked',
      statusTextComplete: 'complete',
      statusTextSubagent: 'subagent',
      statusTextCompleted: 'completed',
      statusTextKilled: 'killed',
      statusTextStopping: 'stopping',
      statusTextPaused: 'paused',
      statusTextEnded: 'ended',
      statusTextActive: 'active',
      statusTextInProgress: 'in progress',
      statusTextPending: 'pending',
      sourceError: 'source failed',
      openFailed: 'Could not open the target',
      hidden: 'more not shown',
      footer: 'Read-only · refreshes every 2.5s',
    }

    const ZH = {
      title: '我的工作台',
      subtitle: '这台机器上正在跑、以及刚发生过变动的一切',
      refresh: '刷新',
      updated: '更新于',
      loading: '正在读取本机源…',
      failed: '读不到工作台',
      stale: '正在显示上一次成功读取的数据',
      emptyTitle: '本机现在没有在跑的东西',
      emptyHint: '会话、作业、定时任务、目标、团队任务和本机应用一出现，就会列在这里。',
      statItems: '条目',
      statRunning: '运行中',
      statWaiting: '等待',
      statChanged: '5 分钟变动',
      statSources: '源',
      kindSession: '会话',
      kindJob: '后台作业',
      kindSchedule: '定时任务',
      kindGoal: '目标',
      kindTeamTask: '团队任务',
      kindProcess: '本机应用',
      sourceDsh: 'DSH',
      sourceProcess: '进程',
      scopeProcess: '本进程',
      scopeMachine: '本机',
      statusRunning: '运行中',
      statusScheduled: '已排期',
      statusWaiting: '等待',
      statusIdle: '空闲',
      statusDone: '完成',
      statusFailed: '失败',
      statusUnknown: '未知',
      statusNow: '刚刚',
      statusTextBlocked: '被阻塞',
      statusTextComplete: '已完成',
      statusTextSubagent: '子代理',
      statusTextCompleted: '已完成',
      statusTextKilled: '已终止',
      statusTextStopping: '停止中',
      statusTextPaused: '已暂停',
      statusTextEnded: '已结束',
      statusTextActive: '启用',
      statusTextInProgress: '进行中',
      statusTextPending: '待领取',
      sourceError: '源读取失败',
      openFailed: '打不开目标',
      hidden: '条未显示',
      footer: '只读 · 每 2.5 秒刷新一次',
    }

    const CSS = `
      .md-root{height:100%;overflow-y:auto;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}
      .md-inner{max-width:1060px;margin:0 auto;padding:22px 26px 30px;display:flex;flex-direction:column;gap:16px}
      .md-head{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap}
      .md-headtext{flex:1 1 260px;min-width:0;display:flex;flex-direction:column;gap:3px}
      .md-h1{margin:0;font-size:20px;font-weight:650;letter-spacing:-0.012em}
      .md-sub{font-size:12.5px;color:var(--dsw-alias-label-secondary)}
      .md-actions{flex:0 0 auto;margin-left:auto;display:flex;align-items:center;gap:8px;padding-top:2px}
      .md-btn{appearance:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1;padding:7px 11px;border-radius:8px;cursor:pointer}
      .md-btn:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
      .md-updated{font-size:11.5px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
      .md-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:10px}
      .md-stat{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:2px}
      .md-statvalue{font-size:21px;font-weight:650;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;line-height:1.15}
      .md-statlabel{font-size:11.5px;color:var(--dsw-alias-label-secondary)}
      .md-card{border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);border-radius:12px;overflow:hidden}
      .md-cardhead{display:flex;align-items:baseline;gap:8px;padding:11px 14px;flex-wrap:wrap}
      .md-cardtitle{font-size:13.5px;font-weight:600}
      .md-count{font-size:11px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:1px 7px}
      .md-scope{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-secondary);display:inline-flex;align-items:center;gap:5px}
      .md-row{display:flex;align-items:center;gap:10px;padding:9px 14px;border-top:1px solid var(--dsw-alias-border-l1)}
      .md-row--click{cursor:pointer}
      .md-row--click:hover{background:var(--dsw-alias-bg-layer-2)}
      .md-row--click:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}
      .md-dot{flex:none;width:7px;height:7px;border-radius:999px}
      .md-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px}
      .md-titlerow{display:flex;align-items:center;gap:6px;min-width:0}
      .md-title{flex:0 1 auto;min-width:0;font-size:13px;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .md-chips{display:inline-flex;gap:4px;flex:none}
      .md-chip{font-size:10.5px;line-height:1;padding:2px 6px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-secondary);white-space:nowrap}
      .md-meta{font-size:11.5px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .md-side{flex:none;max-width:42%;display:flex;flex-direction:column;align-items:flex-end;gap:2px;text-align:right}
      .md-status{max-width:100%;overflow:hidden;text-overflow:ellipsis;font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
      .md-age{font-size:11px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums;white-space:nowrap}
      .md-empty{padding:14px;border-top:1px solid var(--dsw-alias-border-l1);font-size:12.5px;color:var(--dsw-alias-label-secondary)}
      .md-blank{border:1px dashed var(--dsw-alias-border-l2);border-radius:12px;padding:34px 18px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
      .md-blanktitle{font-size:14px;font-weight:600}
      .md-blankhint{font-size:12.5px;color:var(--dsw-alias-label-secondary);max-width:520px;line-height:1.5}
      .md-error{border:1px solid var(--dsw-alias-state-error-primary);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:3px}
      .md-errortitle{font-size:13px;color:var(--dsw-alias-state-error-primary)}
      .md-errordetail{font-size:11.5px;color:var(--dsw-alias-label-secondary);word-break:break-word}
      .md-more{font-size:11.5px;color:var(--dsw-alias-label-secondary);padding:9px 14px;border-top:1px solid var(--dsw-alias-border-l1)}
      .md-foot{font-size:11.5px;color:var(--dsw-alias-label-secondary);padding-top:2px}
      .md-notice{font-size:11.5px;color:var(--dsw-alias-state-error-primary)}
    `

    const SUCCESS = 'var(--dsw-alias-state-success-primary)'
    const WARN = 'var(--dsw-alias-state-warn-primary)'
    const ERROR = 'var(--dsw-alias-state-error-primary)'
    const IDLE = 'var(--dsw-alias-state-idle-primary)'
    const BRAND = 'var(--dsw-alias-brand-primary)'

    function toneOf(status) {
      if (status === 'running') return SUCCESS
      if (status === 'waiting') return WARN
      if (status === 'scheduled') return BRAND
      if (status === 'failed') return ERROR
      return IDLE
    }

    function statusLabel(t, status) {
      const key =
        status === 'running'
          ? 'statusRunning'
          : status === 'scheduled'
            ? 'statusScheduled'
            : status === 'waiting'
              ? 'statusWaiting'
              : status === 'idle'
                ? 'statusIdle'
                : status === 'done'
                  ? 'statusDone'
                  : status === 'failed'
                    ? 'statusFailed'
                    : 'statusUnknown'
      return t(key)
    }

    function statusTextLabel(t, value) {
      if (typeof value !== 'string' || value.length === 0) return ''
      const key = 'statusText' + value.replace(/(^|[-_])(\w)/g, (_, __, char) => char.toUpperCase())
      const label = t(key)
      return label === key ? value : label
    }

    function ago(t, at, now) {
      if (typeof at !== 'number') return ''
      const seconds = Math.max(0, Math.round((now - at) / 1000))
      if (seconds < 5) return t('statusNow')
      if (seconds < 60) return `${seconds}s`
      const minutes = Math.round(seconds / 60)
      if (minutes < 60) return `${minutes}m`
      return `${Math.round(minutes / 60)}h`
    }

    function useDesk() {
      const [state, setState] = React.useState({ status: 'loading', data: null, error: null, at: 0 })
      const [tick, setTick] = React.useState(0)
      React.useEffect(() => {
        let alive = true
        let timer = 0
        const load = async () => {
          try {
            const response = await fetch('/dsh-mydesk/state', {
              headers: { accept: 'application/json' },
              cache: 'no-store',
            })
            if (!response.ok) throw new Error('HTTP ' + response.status)
            const data = await response.json()
            if (!alive) return
            setState({ status: 'ready', data, error: null, at: Date.now() })
          } catch (error) {
            if (!alive) return
            setState((previous) => ({
              status: previous.data ? 'stale' : 'failed',
              data: previous.data,
              error: String(error?.message ?? error),
              at: previous.data ? Date.now() : 0,
            }))
          }
          if (alive) timer = window.setTimeout(load, POLL_MS)
        }
        load()
        return () => {
          alive = false
          window.clearTimeout(timer)
        }
      }, [tick])
      return [state, React.useCallback(() => setTick((value) => value + 1), [])]
    }

    function panelFor(locale) {
      return function DeskPanel(props) {
        const ctx = props && props.ctx
        const [, bump] = React.useState(0)
        React.useEffect(() => locale.subscribe(() => bump((value) => value + 1)), [])
        const t = locale.bind(NS)
        const [state, refresh] = useDesk()
        const [notice, setNotice] = React.useState('')

        const data = state.data
        const stats = data?.stats ?? {}
        const sources = Array.isArray(data?.sources) ? data.sources : []
        const sections = Array.isArray(data?.sections) ? data.sections : []
        const now = Date.now()

        const sourceError = (sourceId) => sources.find((source) => source.id === sourceId)?.health?.error

        const activate = (item) => {
          const jump = item.jump
          if (!jump) return
          try {
            if (jump.kind === 'dsh-session') {
              const ui = ctx && typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : undefined
              if (ui && typeof ui.openSession === 'function') ui.openSession(jump.sessionId)
              return
            }
            if (jump.kind === 'app' || jump.kind === 'url') {
              fetch('/dsh-mydesk/open', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(jump),
              }).then((response) => {
                if (!response.ok) setNotice(t('openFailed'))
                else setNotice('')
              })
            }
          } catch {
            setNotice(t('openFailed'))
          }
        }

        const rowFor = (item) => {
          const clickable = Boolean(item.jump)
          const meta = [item.subtitle, ...(Array.isArray(item.meta) ? item.meta : [])]
            .filter((value) => typeof value === 'string' && value.length > 0)
            .join(' · ')
          const side = statusTextLabel(t, item.statusText) || statusLabel(t, item.status)
          return h(
            'div',
            {
              key: item.id,
              className: 'md-row' + (clickable ? ' md-row--click' : ''),
              role: clickable ? 'button' : undefined,
              tabIndex: clickable ? 0 : undefined,
              title: meta,
              onClick: clickable ? () => activate(item) : undefined,
              onKeyDown: clickable
                ? (event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      activate(item)
                    }
                  }
                : undefined,
            },
            h('span', { className: 'md-dot', style: { background: toneOf(item.status) } }),
            h(
              'span',
              { className: 'md-main' },
              h(
                'span',
                { className: 'md-titlerow' },
                h('span', { className: 'md-title' }, String(item.title ?? '')),
                Array.isArray(item.tags) && item.tags.length > 0
                  ? h(
                      'span',
                      { className: 'md-chips' },
                      item.tags.map((tag, index) =>
                        h('span', { className: 'md-chip', key: 'tag:' + index }, statusTextLabel(t, tag) || tag),
                      ),
                    )
                  : null,
              ),
              meta ? h('span', { className: 'md-meta' }, meta) : null,
            ),
            h(
              'span',
              { className: 'md-side' },
              h('span', { className: 'md-status' }, side),
              typeof item.changedAt === 'number'
                ? h('span', { className: 'md-age' }, ago(t, item.changedAt, now))
                : null,
            ),
          )
        }

        const sectionTitle = (kind) => {
          const key =
            kind === 'session'
              ? 'kindSession'
              : kind === 'job'
                ? 'kindJob'
                : kind === 'schedule'
                  ? 'kindSchedule'
                  : kind === 'goal'
                    ? 'kindGoal'
                    : kind === 'team-task'
                      ? 'kindTeamTask'
                      : 'kindProcess'
          return t(key)
        }

        const scopeLabel = (sourceId) => {
          const source = sources.find((entry) => entry.id === sourceId)
          if (!source) return ''
          return source.scope === 'machine' ? t('scopeMachine') : t('scopeProcess')
        }

        const stat = (label, value, tone) =>
          h(
            'div',
            { className: 'md-stat', key: 'stat:' + label },
            h('span', { className: 'md-statvalue', style: tone ? { color: tone } : undefined }, String(value ?? 0)),
            h('span', { className: 'md-statlabel' }, label),
          )

        const body = []
        if (state.status === 'loading' && !data) {
          body.push(h('div', { className: 'md-empty', key: 'loading' }, t('loading')))
        } else if (state.status === 'failed' && !data) {
          body.push(
            h(
              'div',
              { className: 'md-error', key: 'failed' },
              h('span', { className: 'md-errortitle' }, t('failed')),
              h('span', { className: 'md-errordetail' }, String(state.error ?? '')),
            ),
          )
        } else if ((stats.items ?? 0) === 0) {
          body.push(
            h(
              'div',
              { className: 'md-blank', key: 'blank' },
              h('span', { className: 'md-blanktitle' }, t('emptyTitle')),
              h('span', { className: 'md-blankhint' }, t('emptyHint')),
            ),
          )
        } else {
          if (state.status === 'stale') {
            body.push(
              h(
                'div',
                { className: 'md-error', key: 'stale' },
                h('span', { className: 'md-errortitle' }, t('stale')),
                h('span', { className: 'md-errordetail' }, String(state.error ?? '')),
              ),
            )
          }
          body.push(
            h(
              'div',
              { className: 'md-stats', key: 'stats' },
              stat(t('statItems'), stats.items),
              stat(t('statRunning'), stats.running, (stats.running ?? 0) > 0 ? SUCCESS : undefined),
              stat(t('statWaiting'), stats.waiting, (stats.waiting ?? 0) > 0 ? WARN : undefined),
              stat(t('statChanged'), stats.changed),
              stat(t('statSources'), `${stats.sourcesOk ?? 0}/${stats.sourcesTotal ?? 0}`),
            ),
          )

          for (const section of sections) {
            const error = sourceError(section.source)
            body.push(
              h(
                'section',
                { className: 'md-card', key: section.id },
                h(
                  'div',
                  { className: 'md-cardhead' },
                  h('span', { className: 'md-cardtitle' }, sectionTitle(section.kind)),
                  h('span', { className: 'md-count' }, String(section.count ?? 0)),
                  h(
                    'span',
                    { className: 'md-scope' },
                    error
                      ? h('span', { className: 'md-dot', style: { background: ERROR } })
                      : h('span', { className: 'md-dot', style: { background: SUCCESS } }),
                    scopeLabel(section.source),
                  ),
                ),
                (section.items ?? []).map(rowFor),
                section.hidden > 0
                  ? h('div', { className: 'md-more', key: 'more' }, `+${section.hidden} ${t('hidden')}`)
                  : null,
              ),
            )
          }

          for (const source of sources) {
            if (!source.health?.error) continue
            body.push(
              h(
                'div',
                { className: 'md-error', key: 'error:' + source.id },
                h('span', { className: 'md-errortitle' }, `${t(source.titleKey)} · ${t('sourceError')}`),
                h('span', { className: 'md-errordetail' }, String(source.health.error)),
              ),
            )
          }
        }

        if (notice) body.push(h('div', { className: 'md-notice', key: 'notice' }, notice))
        body.push(h('div', { className: 'md-foot', key: 'foot' }, t('footer')))

        return h(
          'div',
          { className: 'md-root' },
          h('style', null, CSS),
          h(
            'div',
            { className: 'md-inner' },
            h(
              'div',
              { className: 'md-head' },
              h(
                'div',
                { className: 'md-headtext' },
                h('h1', { className: 'md-h1' }, t('title')),
                h('span', { className: 'md-sub' }, t('subtitle')),
              ),
              h(
                'div',
                { className: 'md-actions' },
                h('span', { className: 'md-updated' }, state.at ? `${t('updated')} ${ago(t, state.at, now)}` : ''),
                h('button', { className: 'md-btn', type: 'button', onClick: refresh }, t('refresh')),
              ),
            ),
            body,
          ),
        )
      }
    }

    function iconFor() {
      return function DeskIcon(props) {
        const size = typeof props?.size === 'number' ? props.size : 20
        return h(
          'svg',
          {
            viewBox: '0 0 24 24',
            width: size,
            height: size,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.7,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            'aria-hidden': true,
            style: { display: 'block', opacity: props?.active ? 1 : 0.75 },
          },
          h('path', { d: 'M3.5 8.5h17' }),
          h('path', { d: 'M3.5 15.5h17' }),
          h('path', { d: 'M7 5v7' }),
          h('path', { d: 'M12 12v7' }),
          h('path', { d: 'M17 5v7' }),
        )
      }
    }

    function dictionaryFor(id) {
      return String(id).toLowerCase().startsWith('zh') ? ZH : EN
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const locales = ctx.locale.getLocale().locales ?? []
        for (const definition of locales) {
          ctx.effect(
            () => ctx.locale.register(NS, definition.id, dictionaryFor(definition.id)),
            'dsh-mydesk: locale ' + definition.id,
          )
        }
        const t = ctx.locale.bind(NS)
        const wrap = (Component) => (props) => h(Component, { ...props, ctx })
        const Panel = wrap(panelFor(ctx.locale))
        const Icon = iconFor()

        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register({ name: 'sidebar.panellist', id: 'mydesk', order: 7, label: () => t('title') }, Icon),
        )
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'mydesk' }, Panel))
      },
    }
  },
})
