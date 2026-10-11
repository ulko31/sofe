// Import a bounded set of complete branded OFF records into both deployment roots.
// Usage: node backend/scripts/importFoodBrand.js 'Белёвская'  (max 100 records/request)
const fs = require('node:fs')
const path = require('node:path')
const { mapProduct } = require('../services/foodCatalog')
async function main() {
  const term = process.argv[2]
  if (!term) throw Error('Specify a brand search term')
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(term)}&search_simple=1&action=process&json=1&page_size=100&fields=code,product_name,product_name_ru,brands,nutriments`
  const response = await fetch(url, {headers:{'User-Agent':'SOFE/1.0 (https://github.com/ulko31/sofe)'},signal:AbortSignal.timeout(20000)})
  if (!response.ok) throw Error(`Catalog returned ${response.status}; no files changed`)
  const data = await response.json()
  const imported = (data.products || []).map(mapProduct).filter(p => p && p.nutrition_complete)
    .map(p => ({...p,source_url:`https://world.openfoodfacts.org/product/${p.id.slice(4)}`,checked_at:new Date().toISOString().slice(0,10)}))
  const target = path.join(__dirname,'../data/foods.json')
  const rows = new Map(JSON.parse(fs.readFileSync(target,'utf8')).map(p => [p.id,p]))
  for (const p of imported) rows.set(p.id,p)
  const text = JSON.stringify([...rows.values()],null,2)+'\n'
  fs.writeFileSync(target,text)
  fs.writeFileSync(path.join(__dirname,'../../frontend/src/data/foods.json'),text)
  console.log(JSON.stringify({term,matches:data.count,imported:imported.length,total:rows.size}))
}
main().catch(e => {console.error(e.message);process.exitCode=1})
