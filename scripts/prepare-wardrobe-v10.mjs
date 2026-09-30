// New silhouettes have their own registration; never regenerate older clothes.
import {createRequire} from 'node:module'
import {readFile,mkdir} from 'node:fs/promises'
import {existsSync} from 'node:fs'
const sharp=createRequire(import.meta.url)(process.env.SHARP_PATH||'sharp')
const manifest=JSON.parse(await readFile('scripts/wardrobe-v10-art.json','utf8'))
const root='.vuepress/public/img/games/dressup/layers/v10',fixtures='scripts/fixtures/wardrobe-v10-sources',W=512,H=1024
await mkdir(root+'/catalog',{recursive:true});await mkdir(fixtures,{recursive:true})
function inside(x,y,poly){let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const [a,b]=poly[i],[c,d]=poly[j];if((b>y)!==(d>y)&&x<(c-a)*(y-b)/(d-b)+a)yes=!yes}return yes}
const mirror=p=>p.concat(p.slice().reverse().map(([x,y])=>[W-x,y]))
const lowerBody=mirror([[196,365],[174,430],[160,475],[168,550],[176,600],[185,700],[188,885]])
function cut(data,test){const out=Buffer.from(data);for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(!test(x,y))out[(y*W+x)*4+3]=0;return out}
function clean(data){
 for(let p=0;p<data.length;p+=4){const [r,g,b]=data.subarray(p,p+3),i=p/4,x=i%W;const edge=[x?i-1:i,x<W-1?i+1:i,Math.max(0,i-W),Math.min(W*H-1,i+W)].some(n=>data[n*4+3]<80);if(edge&&((r>150&&g<65&&b<85)||(r>160&&g>130&&b<55)))data[p+3]=0}
 const seen=new Uint8Array(W*H),queue=new Int32Array(W*H)
 for(let i=0;i<W*H;i++)if(!seen[i]&&data[i*4+3]>60){let n=1,q=0;queue[0]=i;seen[i]=1;while(q<n){const a=queue[q++],x=a%W;for(const b of [x?a-1:-1,x<W-1?a+1:-1,a-W,a+W])if(b>=0&&b<W*H&&!seen[b]&&data[b*4+3]>60){seen[b]=1;queue[n++]=b}}if(n<45)for(let q=0;q<n;q++)data[queue[q]*4+3]=0}
 return data
}
async function source(a){const file=existsSync(`${fixtures}/${a.id}.webp`)?`${fixtures}/${a.id}.webp`:a.source;if(!existsSync(file))throw Error('Missing source '+a.id);if(file!==`${fixtures}/${a.id}.webp`)await sharp(file).webp({quality:96,alphaQuality:100}).toFile(`${fixtures}/${a.id}.webp`);return file}
async function raster(file){const m=await sharp(file).metadata();if(Math.abs(m.width/m.height-.5)>.005)throw Error('Not a registered source '+file);return clean(await sharp(file).resize(W,H,{fit:'fill'}).ensureAlpha().raw().toBuffer())}
async function save(id,data){await sharp(data,{raw:{width:W,height:H,channels:4}}).webp({quality:93,alphaQuality:100}).toFile(`${root}/${id}.webp`)}
function waist(data,seam){const out=Buffer.alloc(data.length),anchors=[[0,0],[180,180],[365,seam],[600,600],[H-1,H-1]];for(let y=0;y<H;y++){const i=anchors.findIndex((a,j)=>j&&y<=a[0]),lo=anchors[i-1],hi=anchors[i],sy=lo[1]+(hi[1]-lo[1])*(y-lo[0])/(hi[0]-lo[0]);for(let x=0;x<W;x++){const weight=Math.max(0,Math.min(1,(x-175)/20,(337-x)/20)),row=y+(sy-y)*weight,a=Math.floor(row),f=row-a;for(let c=0;c<4;c++)out[(y*W+x)*4+c]=data[(a*W+x)*4+c]*(1-f)+data[(Math.min(H-1,a+1)*W+x)*4+c]*f}}return out}
const master=await raster('scripts/fixtures/wardrobe-v5-sources/master.webp')
// Neutral skin is shared by the new skirts. Its leotard is fully beneath every
// skirt, while stockings and shoes drawn afterwards cannot be overwritten.
await save('underbody',cut(master,(x,y)=>y>=365&&y<875&&inside(x,y,lowerBody)))
function exposedLegs(worn,index){const exposed=new Uint8Array(W*H),queue=new Int32Array(W*H);let n=0,q=0;function add(i){if(i<(index===12?840:index===17?850:470)*W||i>=875*W||exposed[i])return;const p=i*4;if(worn[p+3]<60||master[p+3]<60)return;const [r,g,b]=worn.subarray(p,p+3);if(r-g<18||g-b<9)return;const diff=Math.abs(r-master[p])+Math.abs(g-master[p+1])+Math.abs(b-master[p+2]);if(diff>80)return;exposed[i]=1;queue[n++]=i}for(const x of [221,226,282,287])for(let y=858;y<875;y++)add(y*W+x);while(q<n){const i=queue[q++],x=i%W;for(const j of [x?i-1:-1,x<W-1?i+1:-1,i-W,i+W])add(j)}return exposed}
function bbox(data,w,h,left=0,right=w){let l=w,t=h,r=-1,b=-1;for(let y=0;y<h;y++)for(let x=left;x<right;x++)if(data[(y*w+x)*4+3]>80){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y)}if(r<l)throw Error('Empty design');return {left:l,top:t,width:r-l+1,height:b-t+1}}
function productBox(data,w,h,left,right){
 // A design board may put a tiny edge of its neighbour over the centre line.
 // Find this product's main connected component, not all alpha in that half.
 const seen=new Uint8Array(w*h),queue=new Int32Array(w*h),component=new Uint8Array(w*h);let best=0,box
 for(let y=0;y<h;y++)for(let x=left;x<right;x++){const i=y*w+x;if(seen[i]||data[i*4+3]<80)continue;let n=1,q=0,l=x,r=x,t=y,b=y;seen[i]=1;queue[0]=i;while(q<n){const a=queue[q++],ax=a%w,ay=Math.floor(a/w);l=Math.min(l,ax);r=Math.max(r,ax);t=Math.min(t,ay);b=Math.max(b,ay);for(const j of [ax>left?a-1:-1,ax<right-1?a+1:-1,a-w,a+w])if(j>=0&&j<w*h&&!seen[j]&&data[j*4+3]>80){seen[j]=1;queue[n++]=j}}if(n>best){best=n;box={left:l,top:t,width:r-l+1,height:b-t+1};component.fill(0);for(let j=0;j<n;j++)component[queue[j]]=1}}
 if(!box)throw Error('Empty product')
 const isolated=Buffer.from(data);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!isolated[i*4+3]||component[i])continue;let edge=false;for(let dy=-2;dy<=2&&!edge;dy++)for(let dx=-2;dx<=2;dx++)if(x+dx>=0&&x+dx<w&&y+dy>=0&&y+dy<h&&component[(y+dy)*w+x+dx]){edge=true;break}if(!edge)isolated[i*4+3]=0}
 return {box,isolated}
}
async function card(file,left,right,id){const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true}),product=id.startsWith('brows')?{box:bbox(data,info.width,info.height,left,right),isolated:data}:productBox(data,info.width,info.height,left,right);const img=await sharp(product.isolated,{raw:{width:info.width,height:info.height,channels:4}}).extract(product.box).resize({width:300,height:300,fit:'inside'}).png().toBuffer(),m=await sharp(img).metadata();await sharp({create:{width:360,height:360,channels:4,background:'#f4ede5'}}).composite([{input:img,left:Math.floor((360-m.width)/2),top:Math.floor((360-m.height)/2)}]).webp({lossless:true}).toFile(`${root}/catalog/${id}.webp`)}
for(const a of manifest.assets){
 const file=await source(a)
 if(a.kind==='wear'){
  const data=await raster(file),top=waist(data,a.topWaist),bottom=waist(data,a.bottomWaist),legs=exposedLegs(bottom,a.index),skirt=mirror(a.skirt)
  await save('top-'+a.index,cut(top,(x,y)=>y>=160&&y<365))
  await save('bottom-'+a.index,cut(bottom,(x,y)=>y>=365&&y<a.end&&inside(x,y,skirt)&&!legs[y*W+x]))
 }else if(a.kind==='catalog'){
  const m=await sharp(file).metadata();await card(file,0,Math.floor(m.width/2),'top-'+a.index);await card(file,Math.floor(m.width/2),m.width,'bottom-'+a.index)
 }else if(a.kind==='brow'){
  const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true}),b=bbox(data,info.width,info.height,0,Math.floor(info.width/2)),pigment=await sharp(file).extract(b).resize(a.width,a.height).ensureAlpha().raw().toBuffer()
  for(let p=3;p<pigment.length;p+=4)pigment[p]*=.78
  const left=await sharp(pigment,{raw:{width:a.width,height:a.height,channels:4}}).png().toBuffer(),right=await sharp(left).flop().png().toBuffer()
  await sharp({create:{width:W,height:H,channels:4,background:'#00000000'}}).composite([{input:left,left:a.x,top:a.y},{input:right,left:W-a.x-a.width,top:a.y}]).webp({lossless:true}).toFile(`${root}/brows-${a.index}.webp`)
  await card(file,0,info.width,'brows-'+a.index)
 }
}
console.log('Six new cuts and two natural pigment-only brows prepared without modifying existing clothing')
