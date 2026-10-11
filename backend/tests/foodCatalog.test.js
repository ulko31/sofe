const test = require('node:test')
const assert = require('node:assert/strict')
const { searchReference, mapProduct, normalizeBarcode, createRemoteCatalog } = require('../services/foodCatalog')
test('Russian search ignores case, ё and word order', () => {
  assert.ok(searchReference('ГРЕЧ').length)
  assert.ok(searchReference('варен греч').some(f => /греч/i.test(f.name)))
  assert.equal(searchReference('   ').length, 0)
})
test('reference nutrition has a consistent 100g/ml basis', () => {
  assert.equal(searchReference('яйцо куриное')[0].unit_weight, 100)
})
test('zero calorie and Russian-only product names are retained; missing energy is not zero', () => {
  const p = { code:'123', product_name_ru:'Вода', nutriments:{'energy-kcal_100g':0,proteins_100g:0,fat_100g:0,carbohydrates_100g:0} }
  assert.equal(mapProduct(p).calories, 0)
  assert.equal(mapProduct({...p,nutriments:{}}), null)
  assert.equal(mapProduct({...p,nutriments:{'energy-kj_100g':418.4}}).calories, 100)
})
test('codes remain exact and GS1 QR is accepted; unrelated QR is rejected', () => {
  assert.equal(normalizeBarcode('012345678905'), '012345678905')
  assert.equal(normalizeBarcode('https://id.gs1.org/01/04601234567890'), '04601234567890')
  assert.equal(normalizeBarcode('https://example.com/receipt/1234567890123'), null)
  assert.equal(normalizeBarcode('hello 4601234567890'), null)
})
test('external requests are cached and failures are retriable', async () => {
  let calls=0
  const catalog=createRemoteCatalog(async () => { calls++; return {ok:true,json:async()=>({products:[]})} })
  await catalog.search('творог'); await catalog.search('ТВОРОГ')
  assert.equal(calls,1)
  let fail=true
  const retry=createRemoteCatalog(async () => { if(fail) throw Error('offline'); return {ok:true,json:async()=>({products:[]})} })
  await assert.rejects(retry.search('сыр'))
  fail=false
  assert.deepEqual(await retry.search('сыр'),[])
})
test('barcode lookup never invents codes and exposes incomplete nutrition', async () => {
  const urls=[]
  const c=createRemoteCatalog(async url => { urls.push(url); return {ok:true,json:async()=>({product:{product_name_ru:'Тест',nutriments:{}}})} })
  assert.equal((await c.barcode('012345678905')).reason,'nutrition_missing')
  assert.equal(urls.length,1)
  assert.ok(urls[0].endsWith('/012345678905.json'))
})

test('imported brands are searchable offline by name and brand', () => {
  assert.ok(searchReference('молоко простоквашино').length >= 2)
  assert.ok(searchReference('белевская пастила').length >= 2)
  assert.ok(searchReference('простоквашино').some(f => f.source === 'openfoodfacts'))
})
