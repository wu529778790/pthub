import { SITE_CONFIG } from '../config'
import { countByStatus } from '../core/merge'
import type { RegisterStatus, SiteView } from '../core/types'
import { STATUS_DESC, STATUS_LABEL } from './labels'

/** 筛选条件，all 表示不限制状态 */
type Filter = RegisterStatus | 'all'

/** 全部状态的固定顺序，与卡片排序保持一致 */
const STATUS_LIST: readonly RegisterStatus[] = ['open', 'invite', 'closed', 'unknown']

/** 转义 HTML，避免站点字段中的特殊字符破坏页面结构 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * 把 ISO 时间格式化为本地时间。
 * 传入空串或非法时间时返回「尚未探测」，便于页头与卡片直接展示。
 */
export function formatTime(iso: string, withYear = true): string {
  if (!iso) return '尚未探测'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '尚未探测'

  const pad = (value: number) => String(value).padStart(2, '0')
  const year = withYear ? `${date.getFullYear()}-` : ''
  return `${year}${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 生成单张站点卡片的 HTML */
export function renderCardHtml(site: SiteView): string {
  const name = escapeHtml(site.name)
  const note = site.note ? `<p class="card__note">${escapeHtml(site.note)}</p>` : ''
  // 探测失败但未降级，说明当前状态是沿用上一次的确认结果
  const stale =
    site.failures > 0 && site.status !== 'unknown'
      ? `<p class="card__stale" title="${escapeHtml(site.error ?? '')}">本次探测失败，状态为上次确认结果</p>`
      : ''

  return `
    <article class="card card--${site.status}">
      <div class="card__top">
        <div class="logo">
          <img class="logo__img" src="${escapeHtml(site.faviconUrl)}" alt="${name}"
               width="44" height="44" loading="lazy" decoding="async" />
        </div>
        <div class="card__id">
          <h2 class="card__name">${name}</h2>
          <span class="card__domain">${escapeHtml(site.domain)}</span>
        </div>
      </div>

      <div class="card__tags">
        <span class="tag tag--engine">${escapeHtml(site.engine)}</span>
        <span class="tag tag--${site.status}">${STATUS_LABEL[site.status]}</span>
      </div>

      <p class="card__desc">${STATUS_DESC[site.status]}</p>
      ${note}
      ${stale}

      <div class="card__foot">
        <a class="btn" href="${escapeHtml(site.registerUrl)}" target="_blank" rel="noopener noreferrer">
          前往注册<span aria-hidden="true">→</span>
        </a>
        <span class="card__time">检测于 ${formatTime(site.checkedAt ?? '', false)}</span>
      </div>
    </article>`
}

/** 生成页脚 HTML */
function footerHtml(updatedAt: string): string {
  const credits: string[] = []
  if (SITE_CONFIG.repoUrl) {
    credits.push(
      `<a href="${escapeHtml(SITE_CONFIG.repoUrl)}" target="_blank" rel="noopener noreferrer">项目仓库</a>`,
    )
  }
  if (SITE_CONFIG.author) credits.push(escapeHtml(SITE_CONFIG.author))

  return `
    <footer class="footer">
      <span>数据每日自动探测更新 · 最近一次 ${escapeHtml(formatTime(updatedAt))}</span>
      ${credits.length ? `<span class="footer__credits">${credits.join(' · ')}</span>` : ''}
    </footer>`
}

/**
 * 把站点列表渲染到挂载节点，并接管状态筛选交互。
 *
 * 页面只在初始化时整体渲染一次，之后切换筛选只重绘卡片区域，
 * 避免重复绑定页头页脚上的事件。
 */
export function mountApp(root: HTMLElement, sites: SiteView[], updatedAt: string): void {
  const counts = countByStatus(sites)
  let filter: Filter = 'all'

  const filterOptions: Filter[] = [
    'all',
    ...STATUS_LIST.filter((status) => counts[status] > 0),
  ]
  const filterHtml = filterOptions
    .map((option) => {
      const label = option === 'all' ? '全部' : STATUS_LABEL[option]
      const count = option === 'all' ? sites.length : counts[option]
      return `
        <button type="button" class="filter" role="tab" data-filter="${option}"
                aria-selected="${option === 'all'}">
          ${label}<span class="filter__count">${count}</span>
        </button>`
    })
    .join('')

  root.innerHTML = `
    <div class="page">
      <header class="hero">
        <div class="hero__main">
          <h1 class="hero__title">${escapeHtml(SITE_CONFIG.title)}</h1>
          <p class="hero__subtitle">${escapeHtml(SITE_CONFIG.subtitle)}</p>
        </div>
        <div class="hero__stat">
          <span class="hero__stat-value">${counts.open}</span>
          <span class="hero__stat-label">当前开放注册</span>
        </div>
      </header>

      <div class="filters" role="tablist" aria-label="按注册状态筛选">${filterHtml}</div>

      <div class="grid"></div>

      ${footerHtml(updatedAt)}
    </div>`

  const grid = root.querySelector<HTMLElement>('.grid')
  const filters = root.querySelector<HTMLElement>('.filters')
  if (!grid || !filters) return

  /** 图标加载失败时退化为首字母方块 */
  const bindLogoFallback = () => {
    grid.querySelectorAll<HTMLImageElement>('.logo__img').forEach((img) => {
      const applyFallback = () => {
        if (!img.isConnected) return
        const fallback = document.createElement('span')
        fallback.className = 'logo__fallback'
        fallback.textContent = img.alt.trim().charAt(0).toUpperCase() || '?'
        img.replaceWith(fallback)
      }

      img.addEventListener('error', applyFallback, { once: true })
      // 图片可能在监听器挂载前就已加载失败
      if (img.complete && img.naturalWidth === 0) applyFallback()
    })
  }

  const paint = () => {
    const list = filter === 'all' ? sites : sites.filter((site) => site.status === filter)

    grid.innerHTML = list.length
      ? list.map(renderCardHtml).join('')
      : '<p class="empty">当前没有符合该状态的站点。</p>'
    bindLogoFallback()

    filters.querySelectorAll<HTMLButtonElement>('button[data-filter]').forEach((button) => {
      const active = button.dataset.filter === filter
      button.classList.toggle('is-active', active)
      button.setAttribute('aria-selected', String(active))
    })
  }

  filters.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-filter]')
    const next = button?.dataset.filter
    if (!next) return
    filter = next as Filter
    paint()
  })

  paint()
}
