export function normalizeProductCode(value) {
  const text = String(value || '').trim()
  if (/^(\d{8}|\d{12,14})$/.test(text)) return text
  try {
    const url = new URL(text)
    const match = url.pathname.match(/(?:^|\/)01\/(\d{14})(?:\/|$)/)
    if (match) return match[1]
  } catch {}
  return null
}
