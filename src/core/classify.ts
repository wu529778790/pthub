import type { RegisterStatus } from './types'

/** 注册页的探测原始信息 */
export interface SignupProbe {
  /** HTTP 状态码，网络异常时为 null */
  httpStatus: number | null
  /** 响应正文 */
  body: string
}

/** 明确表示注册入口已关闭的文案 */
const CLOSED_HINTS = [
  '注册已关闭',
  '关闭注册',
  '暫停註冊',
  '暂停注册',
  '停止注册',
  '不允许注册',
  'registration is closed',
  'registration closed',
  'signups are closed',
  'signup closed',
  'sign-up closed',
]

/** 表示必须凭邀请才能注册的文案 */
const INVITE_HINTS = [
  '邀请注册',
  '邀请码',
  '需要邀请',
  '仅限邀请',
  'invite only',
  'invitation only',
  'invitation code',
  'invite code',
  'by invitation',
]

/**
 * 判断页面是否包含真正的注册表单。
 *
 * 这里刻意不采用「用户名 + 密码」这种宽泛条件：站点关闭注册时注册页常会
 * 跳转到登录页，而登录页同样有用户名密码输入框，宽泛条件会把登录页误判为
 * 开放注册。改为要求出现 NexusPHP 的注册专用字段（wantusername），或者同时
 * 出现用户名与邮箱字段——这两类信号在登录页上基本不会同时成立。
 */
function hasSignupForm(body: string): boolean {
  if (/name=["']wantusername["']/.test(body)) return true

  const hasUsername = /name=["']username["']/.test(body)
  const hasEmail = /name=["']email["']/.test(body)
  return hasUsername && hasEmail
}

/**
 * 根据注册页探测结果判定站点开放状态。
 *
 * 判定顺序（先命中先返回）：
 * 1. 网络异常或 5xx —— unknown
 * 2. 命中「已关闭」文案 —— closed
 * 3. 页面存在注册表单 —— open
 * 4. 命中「邀请制」文案 —— invite
 * 5. HTTP 404 —— closed
 * 6. 其余无法判定 —— unknown
 *
 * 「已关闭」优先于「有注册表单」，是因为部分站点会把关闭提示渲染在注册页
 * 上方，同时保留表单骨架。
 */
export function classifySignupPage(probe: SignupProbe): RegisterStatus {
  const { httpStatus, body } = probe

  if (httpStatus === null || httpStatus >= 500) return 'unknown'

  const text = body.toLowerCase()
  const hit = (hints: string[]) => hints.some((hint) => text.includes(hint))

  if (hit(CLOSED_HINTS)) return 'closed'
  if (hasSignupForm(text)) return 'open'
  if (hit(INVITE_HINTS)) return 'invite'
  if (httpStatus === 404) return 'closed'

  return 'unknown'
}
