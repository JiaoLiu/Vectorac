// Original, offline synthesized impact. No vendor sample, speech or API needed.
import {writeFile,mkdir} from 'node:fs/promises'
const rate=24000,n=Math.floor(rate*.28),wav=Buffer.alloc(44+n*2)
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(n*2,40)
let seed=17,phase=0,low=0
for(let i=0;i<n;i++){
  const t=i/rate;seed=(Math.imul(seed,1664525)+1013904223)>>>0
  low=.7*low+.3*(seed/4294967296*2-1);phase+=2*Math.PI*(65+110*Math.exp(-t*30))/rate
  const envelope=Math.min(1,t*800)*Math.exp(-t*20)*Math.min(1,(n-i)/240)
  const sample=envelope*(.62*Math.sin(phase)+.38*low)
  wav.writeInt16LE(Math.round(Math.max(-1,Math.min(1,sample))*.8*32767),44+i*2)
}
const dir=new URL('./assets/audio/sfx/',import.meta.url);await mkdir(dir,{recursive:true});await writeFile(new URL('damage.wav',dir),wav)
console.log('Original damage impact:',wav.length,'bytes')
