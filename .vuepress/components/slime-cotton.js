import * as THREE from 'three';

// Surface-attached fiber tufts, not free particles: they follow cuts and folds.
export default class SlimeCotton {
  constructor(mesh) {
    this.mesh = mesh;
    this.count = 4200;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    let seed = 177;
    const random = () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;};
    const halo = ctx.createRadialGradient(32,32,2,32,32,29);
    halo.addColorStop(0,'#ffffff80'); halo.addColorStop(.55,'#ffffff35'); halo.addColorStop(1,'#ffffff00');
    ctx.fillStyle = halo; ctx.fillRect(0,0,64,64);
    for (let i=0;i<100;i++) {
      const a=random()*Math.PI*2, r=Math.sqrt(random())*25;
      const x=32+Math.cos(a)*r, y=32+Math.sin(a)*r;
      ctx.strokeStyle='rgba(255,255,255,'+(.12+random()*.28)+')';
      ctx.lineWidth=.45+random()*.65;
      ctx.beginPath(); ctx.moveTo(x,y);
      ctx.quadraticCurveTo(x+random()*9-4,y-4,x+random()*9-4,y+random()*12-6); ctx.stroke();
    }
    this.texture = new THREE.CanvasTexture(canvas);
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.count*3);
    this.colors = new Float32Array(this.count*3);
    this.sizes = new Float32Array(this.count);
    this.geometry.setAttribute('position',new THREE.BufferAttribute(this.positions,3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('color',new THREE.BufferAttribute(this.colors,3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('tuftSize',new THREE.BufferAttribute(this.sizes,1));
    this.material = new THREE.ShaderMaterial({
      transparent:true, depthWrite:false,
      uniforms:{map:{value:this.texture},pixelHeight:{value:600}},
      vertexShader:`attribute vec3 color; attribute float tuftSize;
        uniform float pixelHeight; varying vec3 tint;
        void main(){tint=color;vec4 p=modelViewMatrix*vec4(position,1.);
          gl_Position=projectionMatrix*p;
          gl_PointSize=clamp(tuftSize*pixelHeight/(-p.z),1.,48.);}`,
      fragmentShader:`uniform sampler2D map; varying vec3 tint;
        void main(){float a=texture2D(map,gl_PointCoord).a;
          if(a<.025)discard;gl_FragColor=vec4(tint,a*.8);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`
    });
    this.points = new THREE.Points(this.geometry,this.material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.raycast = () => {};
    mesh.add(this.points);
  }
  update(model, geometry, height) {
    this.points.visible = model.material === 'cotton';
    if (!this.points.visible) return;
    const p=model.positions, indices=model.indices, n=geometry.attributes.normal.array;
    const colors=geometry.attributes.color.array;
    if(!this.lifts || this.lifts.length!==p.length/3) this.lifts=new Float32Array(p.length/3);
    for(let i=0;i<this.lifts.length;i++) {
      const k=i*3;
      const loft=Math.sin(p[k]*7+Math.sin(p[k+1]*5))*Math.sin(p[k+1]*9+p[k+2]*7)*.5+.5;
      this.lifts[i]=.55*(.035+loft*.12);
    }
    if(this.indices!==indices) {
      this.indices=indices;
      const areas=new Float64Array(indices.length/3);
      let total=0;
      const a=new THREE.Vector3(),b=new THREE.Vector3();
      for(let t=0;t<areas.length;t++) {
        const i=indices[t*3]*3,j=indices[t*3+1]*3,k=indices[t*3+2]*3;
        a.set(p[j]-p[i],p[j+1]-p[i+1],p[j+2]-p[i+2]);
        b.set(p[k]-p[i],p[k+1]-p[i+1],p[k+2]-p[i+2]);
        total+=a.cross(b).length();areas[t]=total;
      }
      this.anchors=[];
      let seed=5921;
      const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      for(let i=0;i<this.count;i++) {
        const target=total*random();
        let lo=0,hi=areas.length-1;
        while(lo<hi){const mid=(lo+hi)>>1;if(areas[mid]<target)lo=mid+1;else hi=mid;}
        const u=Math.sqrt(random()),v=random();
        this.anchors.push([lo*3,1-u,u*(1-v),u*v]);
        this.sizes[i]=.07+random()*.055;
      }
      this.geometry.attributes.tuftSize.needsUpdate=true;
    }
    for(let i=0;i<this.count;i++) {
      const anchor=this.anchors[i],t=anchor[0];
      for(let axis=0;axis<3;axis++) {
        let pos=0,normal=0,color=0;
        for(let j=0;j<3;j++) {
          const k=indices[t+j]*3+axis,w=anchor[j+1];
          pos+=(p[k]+n[k]*this.lifts[indices[t+j]])*w;normal+=n[k]*w;color+=colors[k]*w;
        }
        this.positions[i*3+axis]=pos+normal*(.018+(i%5)*.004);
        const shade=.95+(i%11)*.005;
        this.colors[i*3+axis]=(color*.42+.58)*shade;
      }
    }
    this.material.uniforms.pixelHeight.value=height;
    this.geometry.attributes.position.needsUpdate=true;
    this.geometry.attributes.color.needsUpdate=true;
  }
  dispose(){this.mesh.remove(this.points);this.texture.dispose();this.geometry.dispose();this.material.dispose();}
}
