const reference = require('../data/foods.json')
const normalize = value => String(value || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9%]+/g, ' ').trim()
function searchReference(query, rows = []) {
  const words = normalize(query).split(' ').filter(Boolean)
  if (!words.length) return []
  const seen = new Set()
  return [...reference, ...rows.map(f => ({ ...f, unit_weight: 100, source: 'sofe_reference' }))]
    .filter(f => words.every(w => normalize(`${f.name} ${f.brand || ''}`).includes(w)))
    .filter(f => { const key = normalize(`${f.name} ${f.brand || ''}`); if (seen.has(key)) return false; seen.add(key); return true })
    .sort((a,b) => normalize(a.name).indexOf(words[0]) - normalize(b.name).indexOf(words[0]))
    .slice(0, 40)
}
function mapProduct(p) {
  const n = p.nutriments || {}
  const name = (p.product_name_ru || p.product_name || '').trim()
  const read = key => { const v=n[key]; return v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)) && Number(v)>=0 ? Number(v) : null }
  let calories = read('energy-kcal_100g')
  if (calories === null && read('energy-kj_100g') !== null) calories = read('energy-kj_100g') / 4.184
  if (!name || calories === null) return null
  return { id: `off_${p.code}`, name, brand: (p.brands || '').split(',')[0].trim(), calories: Math.round(calories),
    protein: read('proteins_100g'), fat: read('fat_100g'), carbs: read('carbohydrates_100g'),
    unit: '100г', unit_weight: 100, source: 'openfoodfacts', image: p.image_front_small_url || null,
    nutrition_complete: ['proteins_100g','fat_100g','carbohydrates_100g'].every(k => read(k) !== null) }
}
function normalizeBarcode(value) {
  const text = String(value || '').trim()
  if (/^(\d{8}|\d{12,14})$/.test(text)) return text
  // GS1 Digital Link QR codes encode a GTIN in AI 01; ordinary URLs are not product codes.
  try {
    const url = new URL(text)
    const match = url.pathname.match(/(?:^|\/)01\/(\d{14})(?:\/|$)/)
    if (match) return match[1]
  } catch {}
  return null
}
function createRemoteCatalog(fetcher = fetch) {
  const cache = new Map(), pending = new Map(), requests = { search: [], product: [] }
  async function request(key, url, kind) {
    const now = Date.now(), cached = cache.get(key)
    if (cached && cached.until > now) return cached.value
    if (pending.has(key)) return pending.get(key)
    requests[kind] = requests[kind].filter(t => now-t < 60000)
    if (requests[kind].length >= (kind === 'search' ? 8 : 12)) throw new Error('catalog_busy')
    requests[kind].push(now)
    const task = (async () => {
      const response = await fetcher(url, { headers: { 'User-Agent': 'SOFE/1.0 (https://github.com/ulko31/sofe)', Accept: 'application/json' }, signal: AbortSignal.timeout(6000) })
      if (!response.ok) throw new Error('catalog_unavailable')
      const value = await response.json()
      if (cache.size >= 300) cache.delete(cache.keys().next().value)
      cache.set(key, { value, until: now + 300000 })
      return value
    })()
    pending.set(key, task)
    try { return await task } finally { pending.delete(key) }
  }
  return {
    async search(query) {
      const data = await request(`search:${normalize(query)}`, `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=40&fields=code,product_name,product_name_ru,brands,nutriments`, 'search')
      return (data.products || []).map(mapProduct).filter(Boolean)
    },
    async barcode(code) {
      const data = await request(`barcode:${code}`, `https://world.openfoodfacts.org/api/v3/product/${code}.json`, 'product')
      if (!data.product) return { found: false, barcode: code }
      const product = mapProduct({ ...data.product, code })
      return product ? { found:true, barcode:code, ...product } : { found:false, barcode:code, reason:'nutrition_missing' }
    }
  }
}
module.exports = { searchReference, mapProduct, normalizeBarcode, createRemoteCatalog }
