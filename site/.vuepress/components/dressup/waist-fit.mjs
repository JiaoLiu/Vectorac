import {fitIndex} from './parts.mjs'
// A fitted waistband is not a requirement to expose it over every garment.
// Chinese jackets, peplum bodices and capes keep their complete outer hem.
// Only these actual blouse/knit cuts are worn tucked into a long skirt.
export function tucksIntoWaist(top,bottom){return !!(top&&bottom&&bottom.frontBand&&[0,1,12,14,15].includes(fitIndex(top)))}
export function clipTuckedTop(ctx){
 ctx.beginPath()
 // Preserve sleeves and skin on both arms. Shape only the torso fabric at
 // the last 30px above the waistband; do not trim the whole image at a row.
 ctx.rect(0,0,512,335);ctx.rect(0,335,190,689);ctx.rect(322,335,190,689)
 ctx.moveTo(190,335);ctx.bezierCurveTo(199,341,207,350,209,360)
 ctx.lineTo(209,375);ctx.lineTo(303,375)
 ctx.lineTo(303,360);ctx.bezierCurveTo(305,350,313,341,322,335)
 ctx.closePath();ctx.clip()
}
