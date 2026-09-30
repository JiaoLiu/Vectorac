// Registered extraction: every garment, sock and shoe starts already WORN on
// the same full-body master. Destination canvases never lose their registration.
import {createRequire} from 'node:module'
import {readFile,mkdir} from 'node:fs/promises'
import {existsSync} from 'node:fs'
const require=createRequire(import.meta.url),sharp=require(process.env.SHARP_PATH||'sharp')
const manifest=JSON.parse(await readFile(new URL('./wardrobe-v5-art.json',import.meta.url),'utf8'))
const root='.vuepress/public/img/games/dressup/layers/v5',sources='scripts/fixtures/wardrobe-v5-sources'
await mkdir(root,{recursive:true});await mkdir(sources,{recursive:true})
const W=512,H=1024
const sourceOf=a=>existsSync(a.source)?a.source:`${sources}/${a.id||'master'}.webp`
function inside(x,y,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [a,b]=poly[i],[c,d]=poly[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)yes=!yes}return yes}
const mirror=p=>p.concat(p.slice().reverse().map(([x,y])=>[W-x,y]))
const skirts=[[[199,365],[189,400],[151,460],[120,520],[97,580],[95,612]],[[198,365],[179,430],[145,560],[144,579]],[[194,365],[170,460],[130,650],[86,816],[82,851]],[[185,365],[181,450],[184,560],[184,885]]].map(mirror)
const faceHole=[[233,62],[279,62],[301,84],[305,109],[296,139],[275,160],[236,160],[214,139],[207,109],[211,84]]
const bodyUnderClothes=mirror([[190,210],[190,350],[178,380],[170,430],[159,475],[165,550],[175,600],[185,700],[188,1024]])
const lowerBody=mirror([[196,365],[174,430],[160,475],[168,550],[176,600],[185,700],[188,885]])
const insteps=[[[213,917],[244,917],[246,949],[240,955],[218,954],[212,949]],[[212,875],[247,875],[248,925],[215,925]],[[211,875],[247,875],[248,944],[243,953],[218,951],[212,943]]]
function clean(data){
 // Remove chromatic matte contamination, never replace it with opaque pixels.
 for(let p=0;p<data.length;p+=4){const [r,g,b]=data.subarray(p,p+3),i=p/4,x=i%W;const edge=[x?i-1:i,x<W-1?i+1:i,Math.max(0,i-W),Math.min(W*H-1,i+W)].some(n=>data[n*4+3]<80);if(edge&&((r>150&&g<65&&b<85)||(r>160&&g>130&&b<55)||(r>220&&g<130&&b<130)||(r>170&&g>150&&b<100)))data[p+3]=0}
 // Disconnected alpha specks are not part of the character or garment.
 const seen=new Uint8Array(W*H),queue=new Int32Array(W*H)
 for(let i=0;i<W*H;i++)if(!seen[i]&&data[i*4+3]>80){let n=1,q=0;queue[0]=i;seen[i]=1;while(q<n){const a=queue[q++],x=a%W;for(const b of [x?a-1:-1,x<W-1?a+1:-1,a-W,a+W])if(b>=0&&b<W*H&&!seen[b]&&data[b*4+3]>80){seen[b]=1;queue[n++]=b}}if(n<60)for(let q=0;q<n;q++)data[queue[q]*4+3]=0}
 return data
}
async function raster(file){const meta=await sharp(file).metadata();if(Math.abs(meta.width/meta.height-.5)>.005)throw new Error('Unregistered full-body source '+file);return clean(await sharp(file).resize(W,H,{fit:'fill'}).ensureAlpha().raw().toBuffer())}
async function save(id,data){await sharp(data,{raw:{width:W,height:H,channels:4}}).webp({quality:95,alphaQuality:100}).toFile(`${root}/${id}.webp`)}
function cut(data,predicate){const out=Buffer.from(data);for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(!predicate(x,y,out,(y*W+x)*4))out[(y*W+x)*4+3]=0;return out}
function waistRegistered(data,seam){
 // Only align the shared natural-waist landmark. Head and feet remain fixed.
 const out=Buffer.alloc(data.length),anchors=[[0,0],[180,180],[365,seam],[600,600],[H-1,H-1]]
 for(let y=0;y<H;y++){const i=anchors.findIndex((a,j)=>j&&y<=a[0]),lo=anchors[i-1],hi=anchors[i],sy=lo[1]+(hi[1]-lo[1])*(y-lo[0])/(hi[0]-lo[0])
  for(let x=0;x<W;x++){const weight=Math.max(0,Math.min(1,(x-175)/20,(337-x)/20)),row=y+(sy-y)*weight,a=Math.floor(row),f=row-a;for(let c=0;c<4;c++)out[(y*W+x)*4+c]=data[(a*W+x)*4+c]*(1-f)+data[(Math.min(H-1,a+1)*W+x)*4+c]*f}
 }return out
}
const master=await raster(sourceOf(manifest.master));await save('master',cut(master,(x,y)=>!inside(x,y,bodyUnderClothes)))
await save('feet',cut(master,(x,y)=>y>=875&&x>=185&&x<327))
function exposedLegs(worn,index){
 const exposed=new Uint8Array(W*H),queue=new Int32Array(W*H);if(index===3)return exposed
 let n=0,q=0
 function add(i){if(i<550*W||i>=875*W||exposed[i])return;const p=i*4;if(worn[p+3]<100||master[p+3]<100)return
  const diff=Math.abs(worn[p]-master[p])+Math.abs(worn[p+1]-master[p+1])+Math.abs(worn[p+2]-master[p+2]);if(diff>65)return;exposed[i]=1;queue[n++]=i}
 for(const x of [222,226,282,286])for(let y=858;y<875;y++)add(y*W+x)
 while(q<n){const i=queue[q++],x=i%W;for(const next of [x?i-1:-1,x<W-1?i+1:-1,i-W,i+W])add(next)}
 return exposed
}
const blankZones=[[200,87,112,39],[239,135,35,20]]
function feather(x,y,[left,top,w,h],pad=4){return Math.max(0,Math.min(1,(x-left)/pad,(left+w-x)/pad,(y-top)/pad,(top+h-y)/pad))}
for(const a of manifest.assets){
 const source=sourceOf(a),data=await raster(source)
 if(source!==`${sources}/${a.id}.webp`)await sharp(source).webp({quality:95,alphaQuality:100}).toFile(`${sources}/${a.id}.webp`)
 if(a.id.startsWith('wear-')){
  const i=Number(a.id.slice(5)),top=waistRegistered(data,[351,349,390,381][i]),bottom=waistRegistered(data,[351,349,381,381][i])
  await save('top-'+i,cut(top,(x,y)=>y>=160&&y<365))
  const exposed=exposedLegs(bottom,i),inLower=(x,y)=>y>=365&&y<885&&(inside(x,y,lowerBody)||inside(x,y,skirts[i]))
  await save('underbody-'+i,cut(bottom,(x,y)=>y<875&&inLower(x,y)))
  await save('bottom-'+i,cut(bottom,(x,y,d,p)=>inLower(x,y)&&!exposed[y*W+x]&&(y<875||i===3&&d[p]>150&&d[p+1]>130)))
  await save('shoes-'+i,cut(data,(x,y,d,p)=>{
   if(y<(i===3?880:875)||x<185||x>=327)return false
   if(i===3)return y>=893||d[p]<120
   if(i===0&&y<903)return false
   return !inside(x,y,insteps[i])&&!inside(W-x,y,insteps[i])
  }))
 }else if(a.id.startsWith('socks-')){
  await save(a.id,cut(data,(x,y)=>y>=550&&x>=175&&x<337))
 }else if(a.id.startsWith('hair-')){
  // Hair is extracted from its real on-head render. The shared face window
  // removes skin, while brown strands outside it remain at original positions.
  await save(a.id,cut(data,(x,y,d,p)=>y<430&&!(y>105&&inside(x,y,faceHole))&&d[p]<205&&d[p+1]<151&&d[p+2]<122&&d[p]>d[p+1]*1.05))
 }else if(a.id.startsWith('face-')){
  const i=Number(a.id.slice(5)),blank=Buffer.from(data)
  for(let y=0;y<180;y++)for(let x=0;x<W;x++){const p=(y*W+x)*4,t=Math.max(...blankZones.map(r=>feather(x,y,r)));for(let c=0;c<3;c++)blank[p+c]=blank[p+c]*(1-t)+master[p+c]*t}
  await save(a.id,cut(blank,(x,y)=>y<163))
  for(const [category,zone] of [['eyes',[203,100,106,28]],['brows',[205,86,102,15]],['lip',[240,135,34,20]]]){
   await save(category+'-'+i,cut(data,(x,y,d,p)=>{const t=feather(x,y,zone);d[p+3]*=t;return t>0}))
  }
  if(i===0)await save('lip-4',cut(data,(x,y,d,p)=>{const t=feather(x,y,[240,135,34,20]);d[p+3]*=t;if(t){d[p]=Math.min(255,d[p]+9);d[p+1]=Math.min(255,d[p+1]+8)}return t>0}))
 }
}
const masterSource=sourceOf(manifest.master)
if(masterSource!==`${sources}/master.webp`)await sharp(masterSource).webp({quality:95,alphaQuality:100}).toFile(`${sources}/master.webp`)
// Thumbnail cropping is UI-only; these bounds never position a model layer.
const {PARTS,REGISTERED_CATEGORIES}=await import('../.vuepress/components/dressup/parts.mjs')
for(const p of PARTS.filter(p=>p.index>=0&&REGISTERED_CATEGORIES.includes(p.category))){
 const {data}=await sharp(`${root}/${p.id}.webp`).ensureAlpha().raw().toBuffer({resolveWithObject:true})
 let l=W,t=H,r=0,b=0
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(data[(y*W+x)*4+3]>100){l=Math.min(l,x);t=Math.min(t,y);r=Math.max(r,x);b=Math.max(b,y)}
 const face=['face','eyes','brows','lip'].includes(p.category)
 if(face){
  // Show the feature on a real face, not a floating rectangular skin patch.
  const src=sourceOf(manifest.assets.find(a=>a.id===`face-${p.index===4?0:p.index}`)),meta=await sharp(src).metadata(),sx=meta.width/W,sy=meta.height/H
  await sharp(src).extract({left:Math.round(198*sx),top:Math.round(30*sy),width:Math.round(116*sx),height:Math.round(135*sy)}).resize({width:300,height:300,fit:'inside'}).webp({quality:92,alphaQuality:100}).toFile(`${root}/thumb-${p.id}.webp`)
 }else await sharp(`${root}/${p.id}.webp`).extract({left:l,top:t,width:r-l+1,height:b-t+1}).resize({width:300,height:300,fit:'inside'}).webp({quality:90,alphaQuality:100}).toFile(`${root}/thumb-${p.id}.webp`)
}
console.log('Registered v5 layers packed on identical 512 × 1024 canvases')
