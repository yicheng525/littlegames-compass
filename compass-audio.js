/* Original synthesized score and cues; no external audio or network requests. */
(()=>{
  let ctx,mix,music,fx,timer,beat=0,next=0,playing=false;
  const enabled={music:true,fx:true},key='compass-audio-v1';
  try{const saved=JSON.parse(localStorage.getItem(key));for(const k in enabled)if(typeof saved?.[k]==='boolean')enabled[k]=saved[k];}catch{}
  function unlock(){
    try{
      if(!ctx){
        const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;
        ctx=new Audio();mix=ctx.createDynamicsCompressor();mix.connect(ctx.destination);
        music=ctx.createGain();fx=ctx.createGain();music.connect(mix);fx.connect(mix);
        music.gain.value=enabled.music?.30:0;fx.gain.value=enabled.fx?.52:0;
      }
      if(!document.hidden)ctx.resume().catch(()=>{});
    }catch{}
  }
  function tone(bus,t,f,end,len,vol,type='sine'){
    const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;
    o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(end,t+len);
    g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+Math.min(.035,len/3));
    g.gain.exponentialRampToValueAtTime(.0001,t+len);o.connect(g);g.connect(bus);o.start(t);o.stop(t+len+.01);
  }
  function texture(t,len,f,vol,type){
    const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*len),ctx.sampleRate),d=buffer.getChannelData(0);
    for(let i=0;i<d.length;i++)d[i]=(Math.random()*2-1)*Math.exp(-6*i/d.length);
    const src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),g=ctx.createGain();
    src.buffer=buffer;filter.type=type;filter.frequency.value=f;g.gain.value=vol;
    src.connect(filter);filter.connect(g);g.connect(fx);src.start(t);
  }
  function tick(){
    if(!ctx||ctx.state!=='running'||!playing||!enabled.music)return;
    if(next<ctx.currentTime)next=ctx.currentTime+.04;
    const roots=[55,55,58.27,51.91],lead=[164.81,0,130.81,0,155.56,0,110,0];
    while(next<ctx.currentTime+.25){
      const root=roots[Math.floor(beat/8)%roots.length],n=lead[beat%8];
      if(beat%4===0){tone(music,next,root,root,.96,.14);tone(music,next,root*1.5,root*1.5,.94,.045,'triangle');}
      if(n)tone(music,next+.07,n,n,.46,.047,'triangle');
      beat++;next+=.49;
    }
  }
  function update(){
    clearInterval(timer);
    if(ctx){
      const t=ctx.currentTime;music.gain.setTargetAtTime(enabled.music&&playing?.30:0,t,.07);
      fx.gain.setTargetAtTime(enabled.fx?.52:0,t,.025);
    }
    if(playing&&enabled.music){timer=setInterval(tick,110);tick();}
  }
  window.CompassSound={
    unlock,scene(active){if(playing===active)return;playing=active;update();},
    cue(name){
      if(!ctx||ctx.state!=='running'||document.hidden||!enabled.fx)return;
      const t=ctx.currentTime+.012;
      if(name==='check'){texture(t,.11,2400,.17,'bandpass');tone(fx,t+.085,510,420,.14,.12,'triangle');}
      if(name==='rotate')for(let i=0;i<4;i++)texture(t+i*.075,.09,1800+i*240,.16,'bandpass');
      if(name==='turn'){tone(fx,t,294,294,.13,.10,'triangle');tone(fx,t+.095,440,440,.19,.09,'triangle');}
      if(name==='lock')tone(fx,t,230,92,.13,.11,'triangle');
      if(name==='empty'){texture(t,.075,2550,.24,'bandpass');tone(fx,t,810,405,.07,.045,'triangle');}
      if(name==='fire'){texture(t,.22,1050,.57,'lowpass');tone(fx,t,118,38,.24,.25,'triangle');}
      if(name==='end'){tone(fx,t,147,98,.68,.11,'triangle');tone(fx,t+.12,196,147,.58,.06);}
    },
    enabled(k){return enabled[k];},
    toggle(k){unlock();enabled[k]=!enabled[k];try{localStorage.setItem(key,JSON.stringify(enabled));}catch{}update();return enabled[k];}
  };
  document.addEventListener('pointerup',unlock,{capture:true});
  document.addEventListener('keydown',unlock,{capture:true});
  document.addEventListener('visibilitychange',()=>{if(!ctx)return;if(document.hidden)ctx.suspend().catch(()=>{});else unlock();});
})();
