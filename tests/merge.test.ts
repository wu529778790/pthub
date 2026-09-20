import { describe, expect, it } from 'vitest'

import { countByStatus, faviconUrlOf, mergeSites, resolveOrigin } from '../src/core/merge'
import type { RegisterStatus, SiteSeed, SiteStatus, StatusFile } from '../src/core/types'

const CHECKED_AT = '2026-09-20T00:00:00.000Z'

/** 构造一条探测记录，默认是成功探测 */
const entry = (status: RegisterStatus, overrides: Partial<SiteStatus> = {}): SiteStatus => ({
  status,
  checkedAt: CHECKED_AT,
  httpStatus: 200,
  failures: 0,
  ...overrides,
})

const seeds: SiteSeed[] = [
  { name: '甲站', domain: 'a.com', engine: 'nexusphp', registerUrl: 'https://a.com/signup.php' },
  { name: '乙站', domain: 'b.com', engine: 'nexusphp', registerUrl: 'https://b.com/signup.php' },
  { name: '丙站', domain: 'c.com', engine: 'unit3d', registerUrl: 'https://c.com/register' },
]

const statusFile: StatusFile = {
  updatedAt: CHECKED_AT,
  sites: {
    'a.com': entry('closed'),
    'b.com': entry('open'),
  },
}

describe('resolveOrigin', () => {
  it('从注册页地址解析出站点根地址', () => {
    expect(resolveOrigin('https://pt.example.com/signup.php?a=1')).toBe('https://pt.example.com')
  })

  it('保留非默认端口', () => {
    expect(resolveOrigin('http://example.com:8080/register')).toBe('http://example.com:8080')
  })
})

describe('faviconUrlOf', () => {
  it('取站点自身的 favicon', () => {
    expect(faviconUrlOf(seeds[1] as SiteSeed)).toBe('https://b.com/favicon.ico')
  })
})

describe('mergeSites', () => {
  it('按状态优先级排序，开放注册排在前面', () => {
    const views = mergeSites(seeds, statusFile)
    expect(views.map((v) => v.domain)).toEqual(['b.com', 'a.com', 'c.com'])
    expect(views.map((v) => v.status)).toEqual(['open', 'closed', 'unknown'])
  })

  it('同一状态内保持清单原始顺序', () => {
    const allOpen: StatusFile = {
      updatedAt: CHECKED_AT,
      sites: {
        'a.com': entry('open'),
        'b.com': entry('open'),
        'c.com': entry('open'),
      },
    }
    expect(mergeSites(seeds, allOpen).map((v) => v.domain)).toEqual(['a.com', 'b.com', 'c.com'])
  })

  it('缺少探测结果时降级为未知且不丢站点', () => {
    const views = mergeSites(seeds, null)
    expect(views).toHaveLength(3)
    expect(views.every((v) => v.status === 'unknown' && v.checkedAt === null)).toBe(true)
    expect(views.every((v) => v.failures === 0)).toBe(true)
  })

  it('补全图标地址并保留清单字段', () => {
    const [first] = mergeSites(seeds, statusFile)
    expect(first?.faviconUrl).toBe('https://b.com/favicon.ico')
    expect(first?.name).toBe('乙站')
    expect(first?.checkedAt).toBe(CHECKED_AT)
  })

  it('透传失败信息，供页面标注状态来源', () => {
    const withFailure: StatusFile = {
      updatedAt: CHECKED_AT,
      sites: { 'a.com': entry('open', { failures: 1, error: '请求超时' }) },
    }

    const [only] = mergeSites([seeds[0] as SiteSeed], withFailure)
    expect(only?.status).toBe('open')
    expect(only?.failures).toBe(1)
    expect(only?.error).toBe('请求超时')
  })

  it('不会修改传入的清单对象', () => {
    const snapshot = JSON.stringify(seeds)
    mergeSites(seeds, statusFile)
    expect(JSON.stringify(seeds)).toBe(snapshot)
  })
})

describe('countByStatus', () => {
  it('按状态统计数量', () => {
    expect(countByStatus(mergeSites(seeds, statusFile))).toEqual({
      open: 1,
      invite: 0,
      closed: 1,
      unknown: 1,
    })
  })
})
