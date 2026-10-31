const router=require('express').Router()
const auth=require('../middleware/auth')
const {recognizeFoodPhoto}=require('../services/foodVision')
const recent=new Map()
router.post('/',auth,async(req,res)=>{
  const now=Date.now(),id=req.user.id
  if(recent.size>1000)for(const [key,value]of recent)if(now-value.time>60000)recent.delete(key)
  const state=recent.get(id)
  if(state&&now-state.time<60000&&state.count>=10)return res.status(429).json({error:'PHOTO_RATE_LIMIT',message:'Слишком много фото подряд. Подожди минуту.'})
  recent.set(id,state&&now-state.time<60000?{...state,count:state.count+1}:{time:now,count:1})
  // Compatibility with the existing client configuration; server configuration takes precedence.
  const key=process.env.GROQ_API_KEY||process.env.GROQ_TOKEN||req.get('X-Sofe-Vision-Key')
  const result=await recognizeFoodPhoto({image:req.body?.image,intent:req.body?.intent==='label'?'label':'dish',key,model:process.env.GROQ_VISION_MODEL})
  if(result.error)console.warn('food-photo',result.error)
  const {status,...body}=result
  res.status(status).json(body)
})
module.exports=router
