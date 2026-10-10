// Original 64-second heavenly duel loop, second pass: D-pentatonic folk
// orchestration — guzheng-style plucks, a breathy dizi lead, low pads,
// sparse hall drums and bell accents. Offline synthesis; deterministic,
// loop-seamless (event tails wrap around the loop boundary).
import {writeFile} from 'node:fs/promises'

const rate=24000,duration=64,n=rate*duration
// Deterministic jitter so every build renders the same take.
const rand=(()=>{let s=20261010;return()=>(s=s*1664525+1013904223>>>0)/2**32})()
const midi=m=>440*2**((m-69)/12)
const bar=2 // 2-second bars, 32 bars per loop
const events=[]

// Chord bed: Dm F Dm G | Dm F C G — all pentatonic-safe voicings.
const chords=[[50,57,62],[53,60,65],[50,57,62],[55,62,67],[50,57,62],[53,60,65],[48,55,60],[55,59,62]]
for(let b=0;b<32;b++){
  const chord=chords[b%8],section=Math.floor(b/8)%2 // A,B,A',B'
  for(const [i,m] of chord.entries())events.push({at:b*bar,kind:'pad',freq:midi(m-12),dur:bar,vel:.05-i*.008})
  // Guzheng plucks: root-fifth arpeggio, denser in B sections.
  const steps=section?[0,1,2,1,0,2,1,2]:[0,2,1,2]
  steps.forEach((deg,k)=>events.push({at:b*bar+k*bar/steps.length+(rand()-.5)*.016,kind:'pluck',freq:midi(chord[deg%chord.length]+12),vel:(section?.5:.4)*(0.85+rand()*.3)}))
  // Hall drums only drive the B sections.
  if(section){events.push({at:b*bar,kind:'drum',vel:.11});if(b%2)events.push({at:b*bar+1.5,kind:'drum',vel:.07})}
  // Bell accent at each section start.
  if(b%8===0)events.push({at:b*bar,kind:'bell',freq:midi(chord[0]+24),vel:.12})
}
// Dizi lead over both B sections: two four-bar phrases answered a register up.
const phrases=[
  [16,[62,.9],[64,.3],[67,.8],[69,1.6],[67,.4],[64,.8],[62,2.0]],
  [24,[72,1.0],[69,.5],[67,.9],[69,1.6],[64,.5],[62,.9],[60,.6],[62,2.2]],
  [48,[62,.9],[64,.3],[67,.8],[69,1.6],[72,.4],[69,.8],[67,2.0]],
  [56,[69,1.0],[67,.5],[64,.9],[62,1.6],[60,.5],[57,.9],[60,.6],[62,2.2]],
]
for(const p of phrases){let at=p[0];for(const [m,d]of p.slice(1)){events.push({at,kind:'dizi',freq:midi(m),dur:d,vel:.15*(0.9+rand()*.2)});at+=d}}

const tail={pad:2,pluck:1.8,dizi:2.4,drum:.5,bell:4}
const sample=(kind,e,age)=>{
  if(kind==='pad'){if(age>e.dur)return 0;const a=Math.min(1,age*3)*Math.min(1,(e.dur-age)*2);return e.vel*a*(Math.sin(2*Math.PI*e.freq*age)+.5*Math.sin(2*Math.PI*e.freq*2.003*age))*(.75+.25*Math.sin(2*Math.PI*age/7))}
  if(kind==='pluck'){if(age>1.8)return 0;const a=(1-Math.exp(-age*300))*Math.exp(-age*3.2);return e.vel*a*(Math.sin(2*Math.PI*e.freq*age)+.45*Math.exp(-age*4)*Math.sin(2*Math.PI*e.freq*2*age)+.18*Math.exp(-age*7)*Math.sin(2*Math.PI*e.freq*3.01*age))}
  if(kind==='dizi'){if(age>e.dur)return 0;const a=Math.min(1,age*6)*Math.min(1,(e.dur-age)*5),vib=1+.004*Math.sin(2*Math.PI*5*age)*Math.min(1,age*2);return e.vel*a*(Math.sin(2*Math.PI*e.freq*vib*age)+.12*Math.sin(2*Math.PI*e.freq*2*vib*age))}
  if(kind==='drum'){if(age>.5)return 0;return e.vel*Math.sin(2*Math.PI*(50*age+26*(1-Math.exp(-age*18))/18))*Math.min(1,age*400)*Math.exp(-age*11)}
  if(kind==='bell'){if(age>4)return 0;const a=(1-Math.exp(-age*120))*Math.exp(-age*1.4);return e.vel*a*(Math.sin(2*Math.PI*e.freq*age)+.3*Math.exp(-age*2)*Math.sin(2*Math.PI*e.freq*2.41*age))}
  return 0
}

// Render each event into its bed (pads vs. the rest) with loop-wrapped tails,
// then mix: gentle lowpass on pads, two echo taps on the melodic bed.
const pads=new Float64Array(n),rest=new Float64Array(n)
for(const e of events){
  const start=Math.round(e.at*rate),count=Math.min(n,Math.ceil(tail[e.kind]*rate))
  const bed=e.kind==='pad'?pads:rest
  for(let k=0;k<count;k++)bed[(start+k)%n]+=sample(e.kind,e,k/rate)
}
const lp=(cut)=>{const a=1-Math.exp(-2*Math.PI*cut/rate);let y=0;return x=>(y+=a*(x-y))}
const padFilter=lp(900),masterFilter=lp(9000),d1=Math.round(.27*rate),d2=Math.round(.41*rate)
const wav=Buffer.alloc(44+n*2);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(n*2,40)
for(let i=0;i<n;i++){
  const v=padFilter(pads[i])+rest[i]+.22*rest[(i-d1+n)%n]+.14*rest[(i-d2+n)%n]
  wav.writeInt16LE(Math.round(Math.tanh(masterFilter(v)*1.1)*.62*32767),44+i*2)
}
await writeFile(new URL('./assets/audio/sfx/heavenly-duel.wav',import.meta.url),wav)
console.log('Heavenly duel loop v2:',duration,'seconds,',events.length,'events')
