// Original procedural Foley: no external downloads, samples, or decode waits.
export const JUDGMENT_SOUND_SECONDS=1.08
export function judgmentSamples(kind,sampleRate=48000){
 if(!['prison','ration','thunder'].includes(kind))return null
 const out=new Float32Array(Math.ceil(sampleRate*JUDGMENT_SOUND_SECONDS));let seed=kind==='prison'?37:kind==='ration'?73:101,low=0
 const burst=(t,start,length)=>t<start||t>start+length?0:Math.exp(-(t-start)*7/length)
 for(let i=0;i<out.length;i++){
  const t=i/sampleRate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const noise=seed/2147483648-1;low=low*.95+noise*.05
  let v=0
  if(kind==='prison'){
   const slide=t>.08&&t<.48?Math.sin((t-.08)/.4*Math.PI):0
   v=low*slide*.32+noise*slide*.025
   v+=burst(t,.49,.34)*(Math.sin(t*2*Math.PI*87)*.46+low*.6+noise*.085)
   v+=burst(t,.59,.24)*(Math.sin(t*2*Math.PI*1470)*.105+Math.sin(t*2*Math.PI*2260)*.065)
  }else if(kind==='ration'){
   const paper=t>.16&&t<.55?Math.sin((t-.16)/.39*Math.PI):0
   v=noise*paper*.075+low*paper*.15
   v+=burst(t,.57,.25)*(Math.sin(t*2*Math.PI*164)*.3+low*.25)
   v+=burst(t,.65,.16)*Math.sin(t*2*Math.PI*1050)*.065
  }else{
   v=burst(t,.2,.17)*(noise*.42+Math.sin(t*2*Math.PI*2300)*.065)
   const rumble=t>.23?Math.exp(-(t-.23)*3.3):0
   v+=rumble*(low*.8+Math.sin(t*2*Math.PI*(48+9*t))*.17)
  }
  const edge=Math.min(1,t/.005,(JUDGMENT_SOUND_SECONDS-t)/.025)
  out[i]=Math.max(-.75,Math.min(.75,v))*Math.max(0,edge)
 }
 return out
}
