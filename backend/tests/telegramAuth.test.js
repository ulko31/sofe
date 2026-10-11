const test = require('node:test')
const assert = require('node:assert/strict')
const { createHmac } = require('node:crypto')
const { validateInitData } = require('../utils/telegramAuth')
const token = 'test-only-token'
const now = 1800000000
function sign(fields, key = token) {
  const params = new URLSearchParams(fields)
  const check = [...params.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(key).digest()
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'))
  return params.toString()
}
const user = { id: 123456789, first_name: 'Ульяна + 100% 🌸' }
const valid = sign({ user: JSON.stringify(user), auth_date: String(now), query_id: 'query', signature: 'included-in-hmac' })
test('accepts signed data and decodes names exactly once', () => assert.deepEqual(validateInitData(valid, token, now), user))
test('rejects tampering and wrong bot token', () => {
  assert.equal(validateInitData(valid.replace('123456789', '987654321'), token, now), null)
  assert.equal(validateInitData(valid, 'another-token', now), null)
})
test('rejects expired and future sessions', () => {
  assert.equal(validateInitData(valid, token, now + 86401), null)
  assert.equal(validateInitData(valid, token, now - 61), null)
})
test('rejects missing or malformed signature and duplicate fields', () => {
  for (const data of ['', 'user={}', valid.replace(/hash=[^&]+/, 'hash=oops'), valid + '&user={}']) {
    assert.equal(validateInitData(data, token, now), null)
  }
  assert.equal(validateInitData(valid, '', now), null)
})
test('rejects signed malformed user, invalid id and missing date', () => {
  for (const fields of [{user:'{' ,auth_date:String(now)}, {user:'{"id":-1}',auth_date:String(now)}, {user:JSON.stringify(user)}]) {
    assert.equal(validateInitData(sign(fields), token, now), null)
  }
})
