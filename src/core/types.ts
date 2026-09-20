/** PT 站点使用的建站程序 */
export type Engine = 'nexusphp' | 'unit3d' | 'torrenttrader' | 'other'

/**
 * 站点注册开放状态。
 *
 * 注意 unknown 的语义是「探测失败或无法判定」，不等于「已关闭」，
 * 页面上应当单独提示，避免误导访客。
 */
export type RegisterStatus = 'open' | 'invite' | 'closed' | 'unknown'

/** 站点主数据，人工维护于 data/sites.json */
export interface SiteSeed {
  /** 站点名称 */
  name: string
  /** 主域名，同时作为状态文件的键 */
  domain: string
  /** 建站程序 */
  engine: Engine
  /** 注册页完整地址 */
  registerUrl: string
  /** 一句话备注 */
  note?: string
}

/** 单个站点的探测结果，由每日脚本写入 data/status.json */
export interface SiteStatus {
  /** 判定出的注册状态 */
  status: RegisterStatus
  /**
   * 最近一次「成功」探测的时间（ISO 8601）。
   * 探测失败时不覆盖，因此这个时间可能早于当天，用于判断状态是否陈旧。
   * 从未成功探测过为 null。
   */
  checkedAt: string | null
  /** 注册页 HTTP 状态码，网络异常时为 null */
  httpStatus: number | null
  /** 连续探测失败次数，成功时清零 */
  failures: number
  /** 最近一次探测失败原因，成功时不写入 */
  error?: string
}

/** data/status.json 的完整结构 */
export interface StatusFile {
  /** 本轮探测完成时间（ISO 8601） */
  updatedAt: string
  /** 键为站点 domain */
  sites: Record<string, SiteStatus>
}

/** 渲染层使用的视图模型，由站点清单与探测结果合并得到 */
export interface SiteView extends SiteSeed {
  /** 注册状态，未探测过时为 unknown */
  status: RegisterStatus
  /** 最近一次成功探测时间，从未探测为 null */
  checkedAt: string | null
  /** 站点图标地址 */
  faviconUrl: string
  /** 连续探测失败次数，大于 0 表示当前状态是沿用的历史结果 */
  failures: number
  /** 最近一次探测失败原因，用于悬浮提示 */
  error?: string
}
