const DEFAULT_MODEL = 'qwen/qwen3.8-27b'
function buildVisionBody(image, intent, model = DEFAULT_MODEL) {
  const prompt = intent === 'label'
    ? 'Read the food nutrition label. Return JSON only with name in Russian, recognized (boolean), calories, protein, fat, carbs, unit (100g or 100ml). Copy values per 100g or 100ml exactly. Unreadable values must be null, never guessed. If no label is visible return {"recognized":false}.'
    : 'Identify the food. Return JSON only with name in Russian, recognized (boolean), calories, protein, fat, carbs, unit (100g). Estimate nutrients per 100g, not the entire plate. If not food return {"recognized":false}.'
  return { model, ...(model.startsWith('qwen/') ? {reasoning_effort:'none'} : {}),
    messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:image}}]}],
    response_format:{type:'json_object'},temperature:0.7,max_completion_tokens:1024 }
}
async function recognizeFoodPhoto({ image, intent = 'dish', key, model = DEFAULT_MODEL, fetcher = fetch }) {
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image || '') || image.length > 2800000) {
    return {status:400,error:'PHOTO_INVALID_IMAGE',message:'Не удалось прочитать файл. Выбери фото JPEG или PNG.'}
  }
  if (!key) return {status:503,error:'PHOTO_NOT_CONFIGURED',message:'Распознавание фото ещё не настроено.'}
  try {
    const response=await fetcher('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify(buildVisionBody(image,intent,model)),signal:AbortSignal.timeout(25000)
    })
    const data=await response.json().catch(()=>null)
    if(!response.ok){
      const messages={400:'Сервис отклонил запрос на распознавание.',401:'Ключ сервиса распознавания недействителен.',403:'Для сервиса распознавания нет доступа.',404:'Модель распознавания недоступна.',429:'Достигнут лимит распознавания. Попробуй позже.'}
      return {status:response.status===429?429:502,error:`PHOTO_PROVIDER_${response.status}`,message:messages[response.status]||'Сервис распознавания временно недоступен.'}
    }
    const content=data?.choices?.[0]?.message?.content
    if(typeof content!=='string'||!content.trim())return{status:502,error:'PHOTO_EMPTY_RESPONSE',message:'Сервис вернул пустой ответ. Попробуй другое фото.'}
    return {status:200,content}
  }catch(e){
    const timeout=e?.name==='TimeoutError'||e?.name==='AbortError'
    return {status:timeout?504:502,error:timeout?'PHOTO_TIMEOUT':'PHOTO_CONNECTION',message:timeout?'Распознавание заняло слишком много времени. Попробуй ещё раз.':'Сервер не смог связаться с сервисом распознавания.'}
  }
}
module.exports={buildVisionBody,recognizeFoodPhoto,DEFAULT_MODEL}
