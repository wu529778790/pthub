import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { classifySignupPage, type SignupProbe } from '../src/core/classify'
import { FAILURE_THRESHOLD, resolveStatus, type ProbeOutcome } from '../src/core/resolve'
import type { SiteSeed, SiteStatus, StatusFile } from '../src/core/types'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SITES_FILE = path.join(ROOT, 'data', 'sites.json')
const STATUS_FILE = path.join(ROOT, 'data', 'status.json')

/** 单次探测的超时时间（毫秒） */
const TIMEOUT_MS = 20_000
/** 每个站点的最大尝试次数（含首次） */
const MAX_ATTEMPTS = 3
/** 重试基础间隔（毫秒），按尝试次数线性递增 */
const RETRY_DELAY_MS = 1_500
/** 并发探测数量，避免一次性打满出口带宽或触发站点风控 */
const CONCURRENCY = 4
/** 每个响应体最多读取的字符数，注册表单一定出现在页面靠前位置 */
const MAX_BODY_CHARS = 200_000

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** 只读取响应体开头部分，避免被超大页面拖慢 */
async function readHead(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''

  const decoder = new TextDecoder('utf-8', { fatal: false })
  let text = ''
  try {
    while (text.length < MAX_BODY_CHARS) {
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return text
}

/** 把 fetch 抛出的异常整理成可读原因，真实错误通常藏在 cause 里 */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  if (error.name === 'TimeoutError') return `请求超时（${TIMEOUT_MS}ms）`

  const cause = (error as Error & { cause?: unknown }).cause
  if (cause instanceof Error && cause.message) return cause.message
  return error.message
}

/** 探测一次，网络异常与 5xx 都算探测失败 */
async function probeOnce(site: SiteSeed): Promise<ProbeOutcome> {
  try {
    const response = await fetch(site.registerUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    })

    const httpStatus = response.status
    // 5xx 多半是瞬时故障，交给重试逻辑，不参与状态判定
    if (httpStatus >= 500) {
      return { ok: false, httpStatus, error: `服务端返回 HTTP ${httpStatus}` }
    }

    const body = await readHead(response)
    const probe: SignupProbe = { httpStatus, body }
    return { ok: true, status: classifySignupPage(probe), httpStatus }
  } catch (error) {
    return { ok: false, httpStatus: null, error: describeError(error) }
  }
}

/** 带重试的探测，只对失败结果重试 */
async function probeWithRetry(site: SiteSeed): Promise<ProbeOutcome> {
  let outcome: ProbeOutcome = { ok: false, httpStatus: null, error: '未执行探测' }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    outcome = await probeOnce(site)
    if (outcome.ok) return outcome
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS * attempt)
  }
  return outcome
}

/** 以固定并发跑完所有探测，返回顺序与入参一致 */
async function probeAll(sites: SiteSeed[]): Promise<ProbeOutcome[]> {
  const results = new Array<ProbeOutcome>(sites.length)
  let cursor = 0

  const workers = Array.from({ length: Math.min(CONCURRENCY, sites.length) }, async () => {
    while (cursor < sites.length) {
      // 自增发生在任何 await 之前，多个 worker 不会拿到同一个下标
      const index = cursor++
      const site = sites[index]
      if (!site) continue
      results[index] = await probeWithRetry(site)
    }
  })

  await Promise.all(workers)
  return results
}

/** 读取上一轮结果；文件不存在或损坏时当作空结果处理 */
async function readPrevious(): Promise<StatusFile> {
  try {
    const parsed = JSON.parse(await readFile(STATUS_FILE, 'utf8')) as Partial<StatusFile>
    return { updatedAt: parsed.updatedAt ?? '', sites: parsed.sites ?? {} }
  } catch {
    return { updatedAt: '', sites: {} }
  }
}

function summaryMark(outcome: ProbeOutcome, status: SiteStatus['status']): string {
  if (outcome.ok) return status === 'open' ? '✔' : '·'
  // 沿用上次结果，说明本次是失败的但没降级
  return status === 'unknown' ? '✘' : '↩'
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry')

  const seeds = JSON.parse(await readFile(SITES_FILE, 'utf8')) as SiteSeed[]
  if (!Array.isArray(seeds) || seeds.length === 0) {
    console.error('data/sites.json 为空或格式不正确，终止')
    process.exit(1)
  }

  const previous = await readPrevious()
  console.log(`开始探测 ${seeds.length} 个站点（每个最多尝试 ${MAX_ATTEMPTS} 次）…\n`)

  const outcomes = await probeAll(seeds)
  // 同一轮内所有站点共用一个时间戳，日级数据的精度足够
  const now = new Date().toISOString()

  const sites: Record<string, SiteStatus> = {}
  const lines: string[] = []

  seeds.forEach((seed, index) => {
    const outcome = outcomes[index]
    if (!outcome) return

    const status = resolveStatus(previous.sites[seed.domain], outcome, now)
    sites[seed.domain] = status

    const detail = outcome.ok
      ? `HTTP ${outcome.httpStatus}`
      : `${outcome.error ?? '未知错误'}${status.status !== 'unknown' ? `（沿用上次结果，连续失败 ${status.failures} 次）` : ''}`
    lines.push(`${summaryMark(outcome, status.status)} ${seed.name.padEnd(20, ' ')} ${status.status.padEnd(8, ' ')} ${detail}`)
  })

  console.log(lines.join('\n'))

  const failed = outcomes.filter((outcome) => !outcome.ok).length
  // 全部失败说明探测环境本身有问题（断网、出口被封），此时写入会污染线上数据
  if (failed === seeds.length) {
    console.error('\n全部站点探测失败，判定为探测环境异常，放弃写入 status.json')
    process.exit(1)
  }

  const payload: StatusFile = { updatedAt: now, sites }
  const json = `${JSON.stringify(payload, null, 2)}\n`

  if (dryRun) {
    console.log('\n已开启 --dry，跳过写入。将要写入的内容：')
    console.log(json)
    return
  }

  await writeFile(STATUS_FILE, json, 'utf8')

  const tally = (status: string) => Object.values(sites).filter((s) => s.status === status).length
  const carried = Object.values(sites).filter((s) => s.failures > 0 && s.status !== 'unknown').length
  console.log(
    `\n已写入 data/status.json：开放 ${tally('open')} 个，邀请 ${tally('invite')} 个，` +
      `关闭 ${tally('closed')} 个，未知 ${tally('unknown')} 个` +
      (carried ? `，其中 ${carried} 个沿用上次结果（失败未达 ${FAILURE_THRESHOLD} 次）` : ''),
  )
}

await main()
