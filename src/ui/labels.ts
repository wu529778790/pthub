import type { RegisterStatus } from '../core/types'

/** 状态标签文案 */
export const STATUS_LABEL: Record<RegisterStatus, string> = {
  open: '开放注册',
  invite: '邀请制',
  closed: '已关闭',
  unknown: '未知',
}

/** 状态说明文案，展示在卡片上 */
export const STATUS_DESC: Record<RegisterStatus, string> = {
  open: '注册入口已开放，可以直接注册账号。',
  invite: '仅接受邀请注册，需要持有邀请码。',
  closed: '当前未开放注册入口。',
  unknown: '本轮探测未能完成，状态待下次确认。',
}
