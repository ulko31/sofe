const test=require('node:test')
const assert=require('node:assert/strict')
const {recognizeFoodPhoto,buildVisionBody}=require('../services/foodVision')
const image='data:image/jpeg;base64,AA=='
test('server request contains image and supports dish and label intent',()=>{
 const b=buildVisionBody(image,'label')
 assert.equal(b.model,'qwen/qwen3.8-27b')
 assert.equal(b.reasoning_effort,'none')
 assert.equal(b.messages[0].content[1].image_url.url,image)
 assert.match(b.messages[0].content[0].text,/never guessed/)
})
test('valid provider response returns content',async()=>{
 let request
 const result=await recognizeFoodPhoto({image,key:'test',fetcher:async(url,options)=>{request=JSON.parse(options.body);return{ok:true,json:async()=>({choices:[{message:{content:'{"name":"Банан","calories":89}'}}]})}}})
 assert.equal(result.status,200)
 assert.match(result.content,/Банан/)
 assert.equal(request.temperature,0.7)
})
test('provider failures remain diagnosable without returning keys or provider payloads',async()=>{
 for(const status of [400,401,403,404,429,500]){
 const r=await recognizeFoodPhoto({image,key:'private-test',fetcher:async()=>({ok:false,status,json:async()=>({error:{message:'private-test'}})})})
 assert.equal(r.error,`PHOTO_PROVIDER_${status}`)
 assert.ok(!JSON.stringify(r).includes('private-test'))
 }
})
test('rejects invalid images, missing configuration, empty replies and timeouts',async()=>{
 assert.equal((await recognizeFoodPhoto({image:'https://example.com',key:'x'})).error,'PHOTO_INVALID_IMAGE')
 assert.equal((await recognizeFoodPhoto({image})).error,'PHOTO_NOT_CONFIGURED')
 assert.equal((await recognizeFoodPhoto({image,key:'x',fetcher:async()=>({ok:true,json:async()=>({})})})).error,'PHOTO_EMPTY_RESPONSE')
 assert.equal((await recognizeFoodPhoto({image,key:'x',fetcher:async()=>{const e=new Error();e.name='TimeoutError';throw e}})).error,'PHOTO_TIMEOUT')
})
