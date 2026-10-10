// Original 48-second ambient duel loop: pentatonic plucked bells, low pads and
// restrained war drums. Offline synthesis; no recording/license dependency.
import {writeFile} from 'node:fs/promises'
const rate=24000,duration=48,n=rate*duration,beat=.75,notes=[50,57,60,62,65,62,60,57,50,55,57,60,62,60,57,55],events=[]
for(let i=0;i<32;i++)events.push({at:i*beat*2,freq:440*2**((notes[i%16]-69)/12),kind:'bell'})
for(let i=0;i<64;i+=2)events.push({at:i*beat,kind:'drum'})
const wav=Buffer.alloc(44+n*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(n*2,40)
for(let i=0;i<n;i++){
 const t=i/rate,wrap=age=>(age+duration)%duration
 let v=.065*(Math.sin(2*Math.PI*(Math.round(73.42*duration)/duration)*t)+.45*Math.sin(2*Math.PI*110*t))*(.8+.2*Math.sin(2*Math.PI*t/12))
 for(const e of events){const age=wrap(t-e.at);if(e.kind==='bell'&&age<4){const a=(1-Math.exp(-age*80))*Math.exp(-age*1.7);v+=.16*a*(Math.sin(2*Math.PI*e.freq*age)+.2*Math.sin(2*Math.PI*e.freq*2.004*age));const echo=wrap(t-e.at-.28);if(echo<3)v+=.025*Math.exp(-echo*2)*Math.sin(2*Math.PI*e.freq*echo)}else if(e.kind==='drum'&&age<.45)v+=.1*Math.sin(2*Math.PI*(54*age+24*(1-Math.exp(-age*20))/20))*Math.min(1,age*500)*Math.exp(-age*13)}
 wav.writeInt16LE(Math.round(Math.tanh(v)*.65*32767),44+i*2)
}
await writeFile(new URL('./assets/audio/sfx/heavenly-duel.wav',import.meta.url),wav);console.log('Original heavenly duel loop:',duration,'seconds')
