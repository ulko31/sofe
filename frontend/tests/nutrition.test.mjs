import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { nutrientNumber, parsePhotoNutrition } from '../src/utils/nutrition.js'
const source = await readFile(new URL('../src/utils/commonFoods.js', import.meta.url), 'utf8')
const foods = await readFile(new URL('../src/data/foods.json', import.meta.url), 'utf8')
// Load the actual search module with its JSON import inlined for Node (Vite loads it in production).
const module = await import('data:text/javascript;base64,' + Buffer.from(source.replace(/^import baseFoods[^\n]*\n/, `const baseFoods = ${foods};\n`)).toString('base64'))
test('first letter does not crash on sparse legacy rows', () => {
  for (const query of ['б', 'м', 'я', 'банан', 'молоко простоквашино', '']) {
    const results = module.searchLocalFoods(query)
    assert.ok(Array.isArray(results))
    assert.ok(results.every(f => f && typeof f.name === 'string'))
  }
  assert.ok(module.searchLocalFoods('банан').length)
})
test('unknown nutrient is distinct from valid zero', () => {
  assert.equal(nutrientNumber(null), null)
  assert.equal(nutrientNumber(''), null)
  assert.equal(nutrientNumber('0'), 0)
  assert.equal(nutrientNumber('2,5'), 2.5)
  assert.equal(nutrientNumber(-2), null)
  assert.equal(nutrientNumber('Infinity'), null)
})
test('photo response supports JSON and marks incomplete labels', () => {
  const label = parsePhotoNutrition('```json\n{"name":"Сок","calories":45,"protein":0,"fat":0,"carbs":null,"unit":"100ml"}\n```')
  assert.equal(label.protein, 0)
  assert.equal(label.carbs, null)
  assert.equal(label.unit, '100мл')
  assert.equal(label.nutrition_complete, false)
})
test('non-food and invalid nutrients are rejected instead of using invented calories', () => {
  assert.throws(() => parsePhotoNutrition('{"recognized":false}'), /not_food/)
  assert.throws(() => parsePhotoNutrition('no JSON'), /no_json/)
  assert.throws(() => parsePhotoNutrition('{"name":"bad","calories":100,"protein":100,"fat":100,"carbs":100}'), /no_json/)
})
