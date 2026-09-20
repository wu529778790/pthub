import { describe, expect, it } from 'vitest'

import { classifySignupPage } from '../src/core/classify'

/** 构造 NexusPHP 风格的可注册页面 */
const OPEN_NEXUSPHP = `
  <html><body>
    <form action="signup.php" method="post">
      <input type="text" name="wantusername" />
      <input type="email" name="email" />
      <input type="password" name="wantpassword" />
      <input type="submit" value="注册" />
    </form>
  </body></html>`

/** 构造通用注册页：用户名 + 邮箱 */
const OPEN_GENERIC = `
  <form action="/register" method="post">
    <input name="username" /><input name="email" /><input name="password" type="password" />
  </form>`

/** 构造登录页：只有用户名和密码 */
const LOGIN_PAGE = `
  <form action="takelogin.php" method="post">
    <input name="username" /><input name="password" type="password" />
  </form>`

describe('classifySignupPage', () => {
  it('网络异常时判定为未知', () => {
    expect(classifySignupPage({ httpStatus: null, body: '' })).toBe('unknown')
  })

  it('服务端错误判定为未知', () => {
    expect(classifySignupPage({ httpStatus: 502, body: 'Bad Gateway' })).toBe('unknown')
    expect(classifySignupPage({ httpStatus: 503, body: 'Service Unavailable' })).toBe('unknown')
  })

  it('识别 NexusPHP 注册表单为开放', () => {
    expect(classifySignupPage({ httpStatus: 200, body: OPEN_NEXUSPHP })).toBe('open')
  })

  it('识别通用的用户名加邮箱表单为开放', () => {
    expect(classifySignupPage({ httpStatus: 200, body: OPEN_GENERIC })).toBe('open')
  })

  it('只有用户名密码的登录页不会被误判为开放', () => {
    expect(classifySignupPage({ httpStatus: 200, body: LOGIN_PAGE })).toBe('unknown')
  })

  it('命中关闭文案时判定为已关闭', () => {
    expect(classifySignupPage({ httpStatus: 200, body: '本站目前关闭注册，敬请期待' })).toBe(
      'closed',
    )
    expect(
      classifySignupPage({ httpStatus: 200, body: 'Registration is closed at the moment.' }),
    ).toBe('closed')
  })

  it('关闭文案优先于页面上的注册表单骨架', () => {
    const body = `${OPEN_NEXUSPHP}<div class="notice">注册已关闭</div>`
    expect(classifySignupPage({ httpStatus: 200, body })).toBe('closed')
  })

  it('命中邀请制文案时判定为邀请制', () => {
    expect(classifySignupPage({ httpStatus: 200, body: '本站为邀请注册，请提供邀请码' })).toBe(
      'invite',
    )
    expect(classifySignupPage({ httpStatus: 200, body: 'This tracker is invite only.' })).toBe(
      'invite',
    )
  })

  it('注册表单存在时优先判定为开放而不是邀请制', () => {
    const body = `${OPEN_GENERIC}<p>我们以邀请注册为主</p>`
    expect(classifySignupPage({ httpStatus: 200, body })).toBe('open')
  })

  it('识别 NexusPHP 繁体版的邀请制提示语', () => {
    // 台港站点常见文案，只收简体关键词会漏判成未知
    const body = `
      <div>對不起 自由註冊當前關閉，只允許邀請註冊。
      如果你想加入，請找到能夠邀請你進入本站的朋友</div>`

    expect(classifySignupPage({ httpStatus: 200, body })).toBe('invite')
  })

  it('繁体「邀請碼」也能识别为邀请制', () => {
    expect(classifySignupPage({ httpStatus: 200, body: '本站需要邀請碼才能註冊' })).toBe('invite')
  })

  it('识别繁体版的关闭注册文案', () => {
    expect(classifySignupPage({ httpStatus: 200, body: '本站已關閉註冊，請勿再嘗試' })).toBe(
      'closed',
    )
  })

  it('识别英文的未开放自由注册提示语', () => {
    expect(
      classifySignupPage({ httpStatus: 200, body: 'SIGNUP Free registration not engaged.' }),
    ).toBe('invite')
  })

  it('404 判定为已关闭', () => {
    expect(classifySignupPage({ httpStatus: 404, body: 'Not Found' })).toBe('closed')
  })

  it('无法识别的页面判定为未知', () => {
    expect(classifySignupPage({ httpStatus: 200, body: '<html>欢迎光临</html>' })).toBe('unknown')
  })
})
