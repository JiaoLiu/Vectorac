export class BackgroundMusic{
 constructor({enabled=true,createAudio=()=>new Audio('assets/audio/sfx/heavenly-duel.mp3')}={}){this.enabled=enabled;this.createAudio=createAudio;this.audio=null;this.generation=0;this.played=false}
 async unlock(){if(!this.enabled)return false;const g=this.generation;try{this.audio ||= this.createAudio();this.audio.loop=true;this.audio.volume=.15;await this.audio.play();if(g!==this.generation)return false;if(!this.enabled){this.audio.pause();return false}this.played=true;return true}catch{return false}}
 setEnabled(v){this.enabled=!!v;if(v)this.unlock();else this.pause()}
 pause(){this.generation++;this.audio?.pause()}
 destroy(){this.pause();if(this.audio){this.audio.removeAttribute('src');this.audio.load()}}
}
