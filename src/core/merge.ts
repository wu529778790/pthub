import type { RegisterStatus, SiteSeed, SiteStatus, SiteView, StatusFile } from './types'

/** 页面展示优先级，越靠前越优先出现 */
const STATUS_ORDER: readonly RegisterStatus[] = ['open', 'invite', 'closed', 'unknown']

/** 从注册页地址解析出站点根地址 */
export function resolveOrigin(registerUrl: string): string {
  return new URL(registerUrl).origin
}

/** 生成站点图标地址，直接取站点自身的 favicon 由浏览器加载 */
export function faviconUrlOf(site: SiteSeed): string {
  return `${resolveOrigin(site.registerUrl)}/favicon.ico`
}

/** 统计各状态的站点数量，用于页头概览 */
export function countByStatus(sites: SiteView[]): Record<RegisterStatus, number> {
  const counts: Record<RegisterStatus, number> = { open: 0, invite: 0, closed: 0, unknown: 0 }
  for (const site of sites) counts[site.status] += 1
  return counts
}

/**
 * 把人工维护的站点清单与每日探测结果合并成视图模型。
 *
 * - 未探测过的站点按 unknown 处理，绝不因为缺数据而丢弃站点
 * - 先按状态优先级排序，同状态内保持清单中的原始顺序（稳定排序）
 */
export function mergeSites(seeds: SiteSeed[], statusFile: StatusFile | null): SiteView[] {
  const rankOf = (status: RegisterStatus) => {
    const index = STATUS_ORDER.indexOf(status)
    return index === -1 ? STATUS_ORDER.length : index
  }

  return seeds
    .map((seed, order) => {
      const hit: SiteStatus | undefined = statusFile?.sites[seed.domain]
      const view: SiteView = {
        ...seed,
        status: hit?.status ?? 'unknown',
        checkedAt: hit?.checkedAt ?? null,
        faviconUrl: faviconUrlOf(seed),
        failures: hit?.failures ?? 0,
        ...(hit?.error ? { error: hit.error } : {}),
      }
      return { view, order }
    })
    .sort((a, b) => rankOf(a.view.status) - rankOf(b.view.status) || a.order - b.order)
    .map(({ view }) => view)
}
