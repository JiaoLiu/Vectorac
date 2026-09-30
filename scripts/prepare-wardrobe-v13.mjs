// Anatomical extraction/registration only. Worn footwear/watch artwork comes
// from imagegen; independent product illustrations remain byte-for-byte intact.
import {createRequire} from 'node:module'
import {readFile,mkdir} from 'node:fs/promises'
const sharp=createRequire(import.meta.url)(process.env.SHARP_PATH||'sharp')
const root='.vuepress/public/img/games/dressup/layers/v13',W=512,H=1024
await mkdir(root,{recursive:true})
const raw=async f=>sharp(f).resize(W,H,{fit:'fill'}).ensureAlpha().raw().toBuffer()
const master=await raw('scripts/fixtures/wardrobe-v5-sources/master.webp')
const bounds=(d,y,left=0,right=W)=>{let l=right,r=left-1;for(let x=left;x<right;x++)if(d[(y*W+x)*4+3]>190){l=Math.min(l,x);r=Math.max(r,x)}return [l,r]}
async function save(id,d){await sharp(d,{raw:{width:W,height:H,channels:4}}).webp({quality:95,alphaQuality:100}).toFile(`${root}/${id}.webp`)}
function sample(d,x,y,out,p){const ix=Math.max(0,Math.min(W-2,Math.floor(x))),iy=Math.max(0,Math.min(H-2,Math.floor(y))),fx=x-ix,fy=y-iy;let alpha=0,rgb=[0,0,0];for(const [dx,dy,k] of [[0,0,(1-fx)*(1-fy)],[1,0,fx*(1-fy)],[0,1,(1-fx)*fy],[1,1,fx*fy]]){const q=((iy+dy)*W+ix+dx)*4,a=d[q+3]*k;alpha+=a;for(let c=0;c<3;c++)rgb[c]+=d[q+c]*a}out[p+3]=alpha;if(alpha)for(let c=0;c<3;c++)out[p+c]=rgb[c]/alpha}
// Cut at the FRONT fabric band, not the first topmost alpha pixel: that pixel
// often belongs to exposed abdomen or the previous outfit's blouse hem.
const skirts=[{index:2,version:'v5',front:382},{index:12,version:'v10',front:377},{index:13,version:'v10',front:373},{index:14,version:'v10',front:365},{index:15,version:'v10',front:377},{index:16,version:'v10',front:374},{index:17,version:'v10',front:382}]
for(const a of skirts){
 const d=await raw(`.vuepress/public/img/games/dressup/layers/${a.version}/bottom-${a.index}.webp`),out=Buffer.alloc(d.length)
 const scales=[]
 for(let y=365;y<H;y++){
  const sy=y+(a.front-365)*Math.max(0,(600-y)/235),[l,r]=bounds(d,Math.round(sy))
  const [bl,br]=bounds(master,y,Math.ceil(190-(y-365)*.28),Math.min(512,Math.ceil(322+(y-365)*.28)))
  const half=Math.min(256-l,r-256),body=Math.max(256-bl,br-256)+3
  scales[y]=y<490&&half>0&&br>=bl?Math.max(1,body/half):1
 }
 // Blend the hip correction continuously back into the original drape.
 // The previous hard stop at row 470 visibly chopped the skirt's side panels.
 for(let y=490;y<600;y++)scales[y]=1+(scales[489]-1)*((600-y)/110)**2
 for(let y=365;y<H;y++)for(let x=0;x<W;x++)sample(d,256+(x-256)/(scales[y]||1),y+(a.front-365)*Math.max(0,(600-y)/235),out,(y*W+x)*4)
 await save('bottom-'+a.index,out)
}
const legs=Buffer.from(master);for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(y<490||y>=875||x<165||x>=347)legs[(y*W+x)*4+3]=0
await save('underbody',legs)
// Remove only the deliberately marked skin from the already-worn render.
// Never substitute the independent empty product's shoe opening/watch loop.
const manifest=JSON.parse(await readFile('scripts/wardrobe-v13-art.json','utf8'))
await mkdir('scripts/fixtures/wardrobe-v13-sources',{recursive:true})
const {existsSync}=await import('node:fs')
function box(d,w,h,left=0,right=w){let l=w,r=-1,t=h,b=-1;for(let y=0;y<h;y++)for(let x=left;x<right;x++)if(d[(y*w+x)*4+3]>90){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y)}if(r<l)throw Error('Empty wearable');return {left:l,top:t,width:r-l+1,height:b-t+1}}
function segment(d,w,h){
 for(let i=0;i<d.length;i+=4){const [r,g,b]=d.subarray(i,i+3);if(r-g>24&&b-g>24&&b>90||r>170&&g<75&&b<100||r>210&&g>170&&b<60)d[i+3]=0}
 // Segmentation reference pixels outside the actual object are not sprites.
 const seen=new Uint8Array(w*h),q=new Int32Array(w*h)
 for(let i=0;i<w*h;i++)if(!seen[i]&&d[i*4+3]>60){let n=1,j=0;q[0]=i;seen[i]=1;while(j<n){const p=q[j++],x=p%w;for(const k of [x?p-1:-1,x<w-1?p+1:-1,p-w,p+w])if(k>=0&&k<w*h&&!seen[k]&&d[k*4+3]>60){seen[k]=1;q[n++]=k}}if(n<200)for(let j=0;j<n;j++)d[q[j]*4+3]=0}
 return d
}
const toe=await raw('.vuepress/public/img/games/dressup/layers/v5/shoes-3.webp')
for(const a of manifest.assets){
 if(!existsSync(a.file))await sharp(a.source).webp({lossless:true}).toFile(a.file)
 const {data,info}=await sharp(a.file).ensureAlpha().raw().toBuffer({resolveWithObject:true});segment(data,info.width,info.height)
 const out=Buffer.alloc(W*H*4)
 if(a.kind==='shoe'){
  for(let side=0;side<2;side++){
   const b=box(data,info.width,info.height,side?Math.floor(info.width/2):0,side?info.width:Math.floor(info.width/2)),height=991-a.start
   const strip=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).extract(b).resize(128,height,{fit:'fill'}).ensureAlpha().raw().toBuffer()
   for(let j=0;j<height;j++){
    const y=a.start+j;let l=128,r=-1;for(let x=0;x<128;x++)if(strip[(j*128+x)*4+3]>190){l=Math.min(l,x);r=Math.max(r,x)}if(r<l)continue
    // Loose bow ends are not foot-width landmarks. Below the collar use the
    // main contiguous opaque shoe upper rather than distant lace tips.
    if(y>=a.sockEnd){let best=0,left=0;for(let x=0;x<=128;x++){if(x<128&&strip[(j*128+x)*4+3]>150)continue;const len=x-left;if(len>best&&left<80&&x>48){best=len;l=left;r=x-1}left=x+1}}
    const body=bounds(master,y,side?256:185,side?327:256),foot=bounds(toe,y,side?256:185,side?327:256),t=Math.max(0,Math.min(1,(y-935)/20))
    let [lo,hi]=body.map((v,i)=>v*(1-t)+foot[i]*t);if(hi<lo)continue;lo-=a.id==='shoes-7'?4:3;hi+=a.id==='shoes-7'?4:3
    // Do not alpha-fit each row to its outermost pixel: a scalloped opening
    // must retain its original hole and side rails around the ankle.
    const cuff=Math.min(1,j/6),sl=l*cuff,sr=127+(r-127)*cuff
    for(let x=Math.floor(lo)-5;x<=Math.ceil(hi)+5;x++){
     const sx=sl+(x-lo)/(hi-lo)*(sr-sl),ix=Math.max(0,Math.min(126,Math.floor(sx))),f=Math.max(0,Math.min(1,sx-ix)),p=(y*W+x)*4,al=strip[(j*128+ix)*4+3]*(1-f),ar=strip[(j*128+ix+1)*4+3]*f
     if(sx<0||sx>127)continue;out[p+3]=al+ar;if(al+ar)for(let c=0;c<3;c++)out[p+c]=(strip[(j*128+ix)*4+c]*al+strip[(j*128+ix+1)*4+c]*ar)/(al+ar)
    }
   }
  }
 }else{
  const input=await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).extract(box(data,info.width,info.height)).resize(a.dest[2],a.dest[3],{fit:'fill'}).png().toBuffer()
  const placed=await sharp({create:{width:W,height:H,channels:4,background:'#00000000'}}).composite([{input,left:a.dest[0],top:a.dest[1]}]).raw().toBuffer();placed.copy(out)
  const back=Buffer.from(out)
  // Only the strap portions around the wrist's sides belong behind skin.
  // Keep the central round dial in front, including its projecting bezel.
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const p=(y*W+x)*4,rear=master[p+3]<100&&Math.hypot(x-112,y-471)>9;if(rear)out[p+3]=0;else back[p+3]=0}
  await save(a.id+'-back',back)
 }
 await save(a.id,out)
}
console.log('v13: seven front-fabric skirt cuts, six worn shoes, wrapped wristwatch; catalogues unchanged')
