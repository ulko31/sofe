export function nutrientNumber(value, max = 1000) {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const number = Number(String(value).replace(',', '.'))
  return Number.isFinite(number) && number >= 0 && number <= max ? number : null
}
export function parsePhotoNutrition(content) {
  const text = String(content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('no_json')
  const data = JSON.parse(match[0])
  if (data.recognized === false) throw new Error('not_food')
  const calories = nutrientNumber(data.calories)
  const protein = nutrientNumber(data.protein, 100)
  const fat = nutrientNumber(data.fat, 100)
  const carbs = nutrientNumber(data.carbs, 100)
  if (!data.name || [calories, protein, fat, carbs].every(v => v === null)) throw new Error('no_json')
  if (protein !== null && fat !== null && carbs !== null && protein + fat + carbs > 105) throw new Error('no_json')
  return { name: String(data.name).slice(0, 200), calories, protein, fat, carbs,
    unit: data.unit === '100ml' ? '100мл' : '100г', unit_weight: 100,
    nutrition_complete: [calories, protein, fat, carbs].every(v => v !== null) }
}
