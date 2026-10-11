const { createHmac, timingSafeEqual } = require('node:crypto')

// Verify the unmodified initData string supplied by Telegram before trusting user data.
function validateInitData(initData, botToken, now = Math.floor(Date.now() / 1000)) {
  if (!botToken || typeof initData !== 'string' || !initData) return null
  const params = new URLSearchParams(initData)
  const keys = [...params.keys()]
  if (new Set(keys).size !== keys.length) return null
  const hash = params.get('hash') || ''
  if (!/^[a-fA-F0-9]{64}$/.test(hash)) return null
  params.delete('hash')
  const check = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, value]) => `${key}=${value}`).join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expected = createHmac('sha256', secret).update(check).digest()
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return null
  const date = params.get('auth_date') || ''
  if (!/^\d+$/.test(date)) return null
  const age = now - Number(date)
  // Existing sessions can stay open for a day; allow small clock differences.
  if (!Number.isSafeInteger(Number(date)) || age > 86400 || age < -60) return null
  try {
    const user = JSON.parse(params.get('user'))
    return Number.isSafeInteger(user?.id) && user.id > 0 ? user : null
  } catch { return null }
}

module.exports = { validateInitData }
