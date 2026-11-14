/* Licensed recordings; see audio/CREDITS.txt. */
(()=>{
  const key='compass-audio-v1',enabled={music:true,fx:true};
  try{const saved=JSON.parse(localStorage.getItem(key));for(const k in enabled)if(typeof saved?.[k]==='boolean')enabled[k]=saved[k];}catch{}
  const effects={
    check:['singlebullet1.wav',.35],rotate:['rattle1.wav',.32],turn:['lightclunk1.wav',.33],
    lock:['clipload1.wav',.40],empty:['clipload2.wav',.44],fire:['explosion_dull.flac',.45],end:['clank1.wav',.27]
  };
  let ctx,track,musicGain,fxGain,playing=false;
  const samples=new Map(),active=new Set();
  function preload(){
    if(!ctx||!enabled.fx)return;
    for(const [file] of Object.values(effects))if(!samples.has(file)){
      samples.set(file,fetch('audio/'+file).then(r=>{if(!r.ok)throw Error('Audio unavailable');return r.arrayBuffer();})
        .then(b=>ctx.decodeAudioData(b)).catch(()=>{samples.delete(file);return null;}));
    }
  }
  function update(){
    if(!ctx)return;
    if(enabled.music&&playing&&!document.hidden){
      if(!track.src)track.src='audio/unease.mp3';
      track.play().catch(()=>{});
    }else track.pause();
    if(!enabled.fx||document.hidden)for(const node of active){try{node.stop();}catch{}}
  }
  function unlock(){
    try{
      if(!ctx){
        const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
        ctx=new Audio();track=new window.Audio();track.loop=true;track.preload='none';
        musicGain=ctx.createGain();musicGain.gain.value=.22;
        fxGain=ctx.createGain();fxGain.gain.value=.75;
        ctx.createMediaElementSource(track).connect(musicGain);musicGain.connect(ctx.destination);fxGain.connect(ctx.destination);
      }
      if(!document.hidden){ctx.resume().catch(()=>{});preload();update();}
    }catch{}
  }
  window.CompassSound={
    unlock,scene(active){if(playing===active)return;playing=active;update();if(!active&&track?.readyState)track.currentTime=0;},
    async cue(name){
      if(!ctx||ctx.state!=='running'||document.hidden||!enabled.fx||!effects[name])return;
      const [file,volume]=effects[name],requested=ctx.currentTime;
      preload();const buffer=await samples.get(file);
      if(!buffer||ctx.currentTime-requested>.3||document.hidden||!enabled.fx)return;
      const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=buffer;gain.gain.value=volume;
      source.connect(gain);gain.connect(fxGain);active.add(source);
      source.onended=()=>{active.delete(source);source.disconnect();gain.disconnect();};source.start();
    },
    enabled(k){return enabled[k];},
    toggle(k){enabled[k]=!enabled[k];try{localStorage.setItem(key,JSON.stringify(enabled));}catch{}unlock();return enabled[k];}
  };
  document.addEventListener('click',unlock,{capture:true});
  document.addEventListener('keydown',unlock,{capture:true});
  document.addEventListener('visibilitychange',()=>{if(!ctx)return;if(document.hidden){update();ctx.suspend().catch(()=>{});}else unlock();});
})();
