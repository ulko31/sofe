import { MultiFormatReader, RGBLuminanceSource, BinaryBitmap, HybridBinarizer, GlobalHistogramBinarizer, DecodeHintType, BarcodeFormat } from '@zxing/library'

// Try upright crops and quarter turns: a camera frame can contain a sideways EAN.
export function decodeBarcodeCanvas(input, makeCanvas = () => document.createElement('canvas')) {
  const hints = new Map([
    [DecodeHintType.TRY_HARDER, true],
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.QR_CODE]]
  ])
  const crops = [[0,0,1,1],[0,.15,1,.7],[.15,.15,.7,.7],[0,0,1,.6],[0,.3,1,.5]]
  for (const [x,y,w,h] of crops) {
    for (const angle of [0,90,270,180]) {
      const sw = Math.round(input.width*w), sh = Math.round(input.height*h)
      if (sw < 32 || sh < 32) continue
      const canvas = makeCanvas()
      const ratio = Math.min(2, 1400 / Math.max(sw,sh))
      const rw = Math.round(sw*ratio), rh = Math.round(sh*ratio)
      canvas.width = angle%180 ? rh : rw; canvas.height = angle%180 ? rw : rh
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height)
      ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(angle*Math.PI/180)
      ctx.drawImage(input,Math.round(input.width*x),Math.round(input.height*y),sw,sh,-rw/2,-rh/2,rw,rh)
      const rgba = ctx.getImageData(0,0,canvas.width,canvas.height).data
      const gray = new Uint8ClampedArray(canvas.width*canvas.height)
      for(let i=0,j=0;i<rgba.length;i+=4,j++) gray[j]=(306*rgba[i]+601*rgba[i+1]+117*rgba[i+2]+512)>>10
      const source = new RGBLuminanceSource(gray,canvas.width,canvas.height)
      for (const Binarizer of [HybridBinarizer,GlobalHistogramBinarizer]) {
        const reader = new MultiFormatReader()
        try { return reader.decode(new BinaryBitmap(new Binarizer(source)),hints).getText() }
        catch {} finally { reader.reset() }
      }
    }
  }
  throw new Error('barcode_unreadable')
}
