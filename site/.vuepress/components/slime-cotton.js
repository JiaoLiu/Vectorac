import * as THREE from 'three';

// Cotton inclusions contained INSIDE a continuous gel surface. No fur, sprites,
// loose hairs or extra surface shells; the existing mesh UVs stretch this texture.
export default class SlimeCotton {
  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, 512, 512);
    let seed = 61237;
    const random = () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;};
    // Short, flattened cotton ribbons soaked in glue, not freestanding tufts.
    for (let i = 0; i < 280; i++) {
      const x = random()*512, y = random()*512, angle = random()*Math.PI;
      const length = 12+random()*18, width = 7+random()*10;
      for (const ox of [-512,0,512]) for (const oy of [-512,0,512]) {
        ctx.save(); ctx.translate(x+ox,y+oy); ctx.rotate(angle);
        ctx.scale(length,width);
        const gradient = ctx.createRadialGradient(0,0,0,0,0,1);
        gradient.addColorStop(0,'rgba(220,220,220,.6)');
        gradient.addColorStop(.5,'rgba(200,200,200,.28)');
        gradient.addColorStop(1,'rgba(128,128,128,0)');
        ctx.fillStyle = gradient; ctx.fillRect(-1,-1,2,2); ctx.restore();
      }
      // Fine strands stay within each ribbon and under the shiny gel skin.
      for (let j=0;j<7;j++) {
        const offset=(random()-.5)*width;
        for(const ox of [-512,0,512]) for(const oy of [-512,0,512]) {
          ctx.save();ctx.translate(x+ox,y+oy);ctx.rotate(angle);
          ctx.strokeStyle='rgba(235,235,235,.22)';ctx.lineWidth=.55;
          ctx.beginPath();ctx.moveTo(-length*.55,offset);
          ctx.quadraticCurveTo(0,offset+width*.25,length*.55,offset-width*.2);
          ctx.stroke();ctx.restore();
        }
      }
    }
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.wrapS = this.texture.wrapT = THREE.RepeatWrapping;
    this.texture.repeat.set(2,2);
  }
  dispose() { this.texture.dispose(); }
}
