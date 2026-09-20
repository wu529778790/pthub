import { describe, expect, it } from 'vitest'

import type { SiteView } from '../src/core/types'
import { escapeHtml, formatTime, renderCardHtml } from '../src/ui/render'

const base: SiteView = {
  name: '甲站',
  domain: 'a.com',
  engine: 'nexusphp',
  registerUrl: 'https://a.com/signup.php',
  status: 'open',
  checkedAt: '2026-09-20T00:00:00.000Z',
  faviconUrl: 'https://a.com/favicon.ico',
  failures: 0,
}

describe('escapeHtml', () => {
  it('转义会破坏结构的字符', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
    )
  })

  it('转义单引号与和号', () => {
    expect(escapeHtml("Tom & Jerry's")).toBe('Tom &amp; Jerry&#39;s')
  })
})

describe('formatTime', () => {
  it('空值与非法值回退为尚未探测', () => {
    expect(formatTime('')).toBe('尚未探测')
    expect(formatTime('not-a-date')).toBe('尚未探测')
  })

  it('可以省略年份，用于卡片上的简短展示', () => {
    const withYear = formatTime('2026-09-20T00:00:00.000Z')
    const without = formatTime('2026-09-20T00:00:00.000Z', false)

    expect(withYear.startsWith('2026-')).toBe(true)
    expect(without.startsWith('2026-')).toBe(false)
  })
})

describe('renderCardHtml', () => {
  it('渲染出状态标签与注册链接', () => {
    const html = renderCardHtml(base)

    expect(html).toContain('tag--open')
    expect(html).toContain('开放注册')
    expect(html).toContain('href="https://a.com/signup.php"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it('正常探测时不出现沿用提示', () => {
    expect(renderCardHtml(base)).not.toContain('card__stale')
  })

  it('探测失败但沿用旧状态时给出提示与失败原因', () => {
    const html = renderCardHtml({ ...base, failures: 1, error: '请求超时（20000ms）' })

    expect(html).toContain('card__stale')
    expect(html).toContain('本次探测失败，状态为上次确认结果')
    expect(html).toContain('title="请求超时（20000ms）"')
  })

  it('降级为未知后不再提示状态沿用', () => {
    const html = renderCardHtml({ ...base, status: 'unknown', failures: 3, error: '请求超时' })

    expect(html).not.toContain('card__stale')
    expect(html).toContain('tag--unknown')
  })

  it('站点名称中的特殊字符会被转义', () => {
    const html = renderCardHtml({ ...base, name: '<script>alert(1)</script>' })

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
