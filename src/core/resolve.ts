import type { RegisterStatus, SiteStatus } from './types'

/**
 * 连续探测失败达到该次数后，才把站点降级为未知。
 *
 * 探测每天跑一次，取 3 意味着单次网络抖动、单日机房异常都不会影响页面展示，
 * 连续三天都连不上才会显示为未知。
 */
export const FAILURE_THRESHOLD = 3

/** 单次探测的结果 */
export interface ProbeOutcome {
  /** 是否拿到了可用响应。网络异常与 5xx 视为不可用 */
  ok: boolean
  /** 拿到可用响应时的判定结果 */
  status?: RegisterStatus
  /** HTTP 状态码，网络异常时为 null */
  httpStatus: number | null
  /** 失败原因 */
  error?: string
}

/**
 * 结合上一次的结果决定本次要落盘的状态。
 *
 * 核心考量：一次网络抖动不应该让一个确认开放的站点在页面上变成「未知」。
 * 因此连续失败次数未达阈值时沿用上一次的状态和确认时间，只在页面上标注
 * 「状态沿用上次结果」；只有连续失败达到 FAILURE_THRESHOLD 次才真正降级。
 *
 * checkedAt 记录的是最近一次成功探测的时间，失败时保持不动，
 * 这样页面上显示的日期本身就是陈旧程度的信号。
 */
export function resolveStatus(
  prev: SiteStatus | undefined,
  outcome: ProbeOutcome,
  now: string,
): SiteStatus {
  if (outcome.ok) {
    return {
      status: outcome.status ?? 'unknown',
      checkedAt: now,
      httpStatus: outcome.httpStatus,
      failures: 0,
    }
  }

  const failures = (prev?.failures ?? 0) + 1
  const carryOverStatus =
    prev !== undefined && prev.status !== 'unknown' && failures < FAILURE_THRESHOLD
      ? prev.status
      : null

  return {
    status: carryOverStatus ?? 'unknown',
    checkedAt: prev?.checkedAt ?? null,
    httpStatus: outcome.httpStatus,
    failures,
    ...(outcome.error ? { error: outcome.error } : {}),
  }
}
