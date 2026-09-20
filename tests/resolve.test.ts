import { describe, expect, it } from 'vitest'

import { FAILURE_THRESHOLD, resolveStatus, type ProbeOutcome } from '../src/core/resolve'
import type { RegisterStatus, SiteStatus } from '../src/core/types'

const NOW = '2026-09-20T00:00:00.000Z'
const EARLIER = '2026-09-18T00:00:00.000Z'

const success = (status: RegisterStatus): ProbeOutcome => ({ ok: true, status, httpStatus: 200 })
const failure = (error = '请求超时（20000ms）'): ProbeOutcome => ({
  ok: false,
  httpStatus: null,
  error,
})

const previousOpen = (failures = 0): SiteStatus => ({
  status: 'open',
  checkedAt: EARLIER,
  httpStatus: 200,
  failures,
})

describe('resolveStatus', () => {
  it('探测成功时写入新状态并刷新确认时间', () => {
    const result = resolveStatus(previousOpen(), success('closed'), NOW)

    expect(result.status).toBe('closed')
    expect(result.checkedAt).toBe(NOW)
    expect(result.httpStatus).toBe(200)
    expect(result.failures).toBe(0)
    expect(result.error).toBeUndefined()
  })

  it('首次失败即降级为未知', () => {
    const result = resolveStatus(undefined, failure(), NOW)

    expect(result.status).toBe('unknown')
    expect(result.checkedAt).toBeNull()
    expect(result.failures).toBe(1)
    expect(result.error).toBe('请求超时（20000ms）')
  })

  it('单次失败不会让已确认开放的站点变成未知', () => {
    const result = resolveStatus(previousOpen(), failure(), NOW)

    expect(result.status).toBe('open')
    expect(result.failures).toBe(1)
    expect(result.error).toBeDefined()
  })

  it('失败时保留最近一次成功探测的时间', () => {
    expect(resolveStatus(previousOpen(), failure(), NOW).checkedAt).toBe(EARLIER)
  })

  it('连续失败达到阈值后降级为未知', () => {
    const result = resolveStatus(previousOpen(FAILURE_THRESHOLD - 1), failure(), NOW)

    expect(result.status).toBe('unknown')
    expect(result.failures).toBe(FAILURE_THRESHOLD)
  })

  it('未知状态不会被沿用，失败次数继续累加', () => {
    const unknownPrevious: SiteStatus = {
      status: 'unknown',
      checkedAt: null,
      httpStatus: null,
      failures: 5,
    }

    const result = resolveStatus(unknownPrevious, failure(), NOW)

    expect(result.status).toBe('unknown')
    expect(result.failures).toBe(6)
  })

  it('失败后重新成功会把失败计数清零', () => {
    const afterFailure = resolveStatus(previousOpen(), failure(), NOW)
    const recovered = resolveStatus(afterFailure, success('open'), NOW)

    expect(recovered.failures).toBe(0)
    expect(recovered.error).toBeUndefined()
    expect(recovered.checkedAt).toBe(NOW)
  })

  it('上一次记录缺少失败计数时按 0 处理', () => {
    const legacy = { ...previousOpen(), failures: undefined as unknown as number }

    expect(resolveStatus(legacy, failure(), NOW).failures).toBe(1)
  })
})
