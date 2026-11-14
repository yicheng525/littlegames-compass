(()=>{
  'use strict';
  const endpoint='https://little-games-compass-rooms.ciclol.chatgpt.site/v1/room';
  const $=id=>document.getElementById(id),key='little-games-compass-web-v1:'+location.pathname,letters='ABCDEF';
  let session=null,v=null,busy=false,paused=false,timer=null,failures=0;
  try{const s=JSON.parse(localStorage.getItem(key));if(s&&typeof s.code==='string'&&typeof s.token==='string')session=s;}catch{}
  const say=s=>$('status').textContent=s;
  const pair=i=>letters[i]+'・'+letters[(i+1)%6];
  const mark=x=>x?'有子彈':'空膛';
  const items=(id,rows)=>$(id).replaceChildren(...rows.map(row=>{
    const li=document.createElement('li');li.textContent=typeof row==='string'?row:row.text;if(row.className)li.className=row.className;return li;
  }));
  function save(s){session=s;try{if(s)localStorage.setItem(key,JSON.stringify(s));else localStorage.removeItem(key);}catch{}}
  const actionNames={open:'公開調查',private:'私下調查',rotate1:'順轉一格',rotate2:'順轉兩格',swap:'秘密交換',hidden:'隱藏行動'};
  const eventRound=e=>Math.floor((e.seq-1)/6)+1;
  const marksText=e=>e.marks.map((value,i)=>letters[(e.slot+i)%6]+' '+mark(value)).join('、');
  const eventText=e=>e.kind==='open'?'公開調查 '+marksText(e):(actionNames[e.kind]||'行動');
  let moveFeedback='',moveState='',pendingMove=null;
  function selection(){
    const kind=$('kind').value;
    $('amount-wrap').hidden=kind!=='swap';
    $('pair-wrap').hidden=!['open','private','swap'].includes(kind)||(kind==='swap'&&(v?.pool||0)+Number($('amount').value)<6);
    const slot=Number($('pair').value), myTurn=v?.phase==='play'&&v.turn===v.me;
    const choosing=myTurn&&!$('pair-wrap').hidden;
    const cost={open:1,private:2,rotate1:3,rotate2:4,swap:Number($('amount').value)}[kind];
    const expired=localDeadline&&Date.now()>=localDeadline;
    $('move').disabled=busy||!myTurn||cost>v.points||expired;
    $('move').textContent=moveState==='sending'?'送出中…':(kind==='swap'&&!choosing?'投入交換點數':actionNames[kind])+(choosing?' '+pair(slot):'')+' · '+cost+' 點';
    $('pair-hint').hidden=!choosing;
    pins.forEach((pin,i)=>{
      pin.disabled=!choosing||busy||expired;
      const selected=choosing&&(i===slot||i===(slot+1)%6);
      pin.classList.toggle('selected',selected);
      pin.setAttribute('aria-label',choosing?'選擇 '+pair(i):pin.textContent);
      pin.setAttribute('aria-pressed',String(!!selected));
    });
  }
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const pins=Array.from(letters,(letter,i)=>{
    const pin=document.createElement('button'),angle=i*Math.PI/3;
    pin.type='button';pin.onclick=()=>{if(!pin.disabled){$('pair').value=String(i);selection();}};
    pin.className='dial-pin';pin.textContent=letter;
    pin.style.left=(50+38*Math.sin(angle))+'%';pin.style.top=(50-38*Math.cos(angle))+'%';
    $('dial-seats').append(pin);return pin;
  });
  const phrases={
    '心理戰':['你真的信他？','你確定那格安全？','我查到了，但先不說','敢不敢再轉一格？','你們是不是串通好了？'],
    '合作':['準備好了！','輪到你囉','要公開調查嗎？','我建議先別轉','要一起交換嗎？']
  };
  const log=$('chat-log');
  let chatKey='',chatDraft=null,chamberTimer,localDeadline=0;
  function showChat(){
    const messages=v.chat||[],latest=messages.at(-1)?.id||'';
    if(latest!==chatKey){
      chatKey=latest;const atBottom=(log.scrollHeight-log.scrollTop-log.clientHeight)<36;
      items('chat-log',messages.map(m=>m.name+'：'+m.message));if(atBottom)log.scrollTop=log.scrollHeight;
    }
    $('chat-send').disabled=false;
  }
  function sendChat(message){
    const clean=message.trim();if(!clean)return;
    if(busy){chatDraft={message:clean};return;}
    request('chat',{message:clean});
  }
  for(const [category,choices] of Object.entries(phrases)){
    const group=document.createElement('details'),title=document.createElement('summary'),buttons=document.createElement('div');
    title.textContent=category;group.open=category==='心理戰';buttons.className='phrase-buttons';
    for(const phrase of choices){
      const button=document.createElement('button');button.type='button';button.textContent=phrase;
      button.onclick=()=>sendChat(phrase);buttons.append(button);
    }
    group.append(title,buttons);$('quick-chat').append(group);
  }
  $('chat-form').onsubmit=e=>{e.preventDefault();sendChat($('chat-input').value);};
  function chamberPreview(event){
    if(!event)return;
    clearTimeout(chamberTimer);
    $('chamber').hidden=false;
    $('chamber-title').textContent=event.kind==='private'?'私下調查 · 只有你看得到':'公開調查 · '+v.seats[event.i];
    $('chamber-info').textContent=pair(event.slot)+'：'+event.marks.map(mark).join('、');
    const drum=$('chamber-drum');
    drum.replaceChildren(...Array.from(letters,(label,i)=>{
      const port=document.createElement('span'),a=i*Math.PI/3,k=(i-event.slot+6)%6;
      port.style.left=(50+33*Math.sin(a))+'%';port.style.top=(50-33*Math.cos(a))+'%';
      port.textContent=label;port.className='port'+(k<2?(event.marks[k]?' live':' clear'):'');
      if(k<2)port.style.animationDelay=(k*150)+'ms';return port;
    }));
    chamberTimer=setTimeout(()=>{$('chamber').hidden=true;},6500);
  }
  let angle=0,reveal=-1,revealTimer,rotating=false;
  function finishReveal(){
    clearTimeout(revealTimer);reveal=-1;render();
  }
  function revealNext(){
    if(reduced.matches||document.hidden||reveal===5){finishReveal();return;}
    reveal++;render();
    revealTimer=setTimeout(revealNext,reveal===5?1020:760);
  }
  $('skip-reveal').onclick=finishReveal;
  reduced.addEventListener?.('change',()=>{if(reduced.matches&&reveal>=0)finishReveal();});
  function acceptView(next){
    const prev=v,same=prev?.code===next.code&&prev.phase==='play'&&next.phase!=='lobby'&&next.seq>=prev.seq;
    if(next.phase!=='done'&&(prev?.phase!=='play'||!same)){
      clearTimeout(revealTimer);reveal=-1;angle=0;rotating=false;
    }
    if(same){
      const moves=next.events.filter(e=>e.seq>prev.seq);
      const turn=moves.reduce((sum,e)=>sum+(e.kind==='rotate1'?60:e.kind==='rotate2'?120:0),0);
      rotating=turn>0;angle+=turn;
    }
    if(!same&&next.phase!=='done'){moveFeedback='';moveState='';pendingMove=null;}
    if(same){
      const auto=next.events.filter(e=>e.seq>prev.seq&&e.auto).at(-1);
      if(auto){moveFeedback=next.seats[auto.i]+' 逾時，系統'+eventText(auto);moveState='auto';}
    }
    v=next;
    localDeadline=next.deadline?Date.now()+Math.max(0,next.deadline-next.serverNow):0;
    if(!same){clearTimeout(chamberTimer);$('chamber').hidden=true;}
    if(same&&next.phase==='play'){
      const checks=[...next.events.filter(e=>e.kind==='open'),...next.notes.filter(e=>e.kind==='private')].filter(e=>e.seq>prev.seq);
      chamberPreview(checks.sort((a,b)=>b.seq-a.seq)[0]);
    }
    if(same&&next.phase==='done'&&!reduced.matches&&!document.hidden){
      clearTimeout(chamberTimer);$('chamber').hidden=true;
      reveal=0;
      revealTimer=setTimeout(revealNext,1120);
    }
  }
  function drawDial(playing,done){
    const unveiling=done&&reveal>=0;
    $('arena').hidden=!playing&&!done;
    $('skip-reveal').hidden=!unveiling;
    $('rotor').style.transform='rotate('+angle+'deg)';
    $('sweep').hidden=!unveiling;
    if(unveiling)$('sweep').style.transform='rotate('+(reveal*60)+'deg)';
    let hit=unveiling&&v.result[reveal].marked;
    $('sweep').classList.toggle('fired',!!hit);
    if(unveiling&&$('dial').dataset.step!==String(reveal)){
      $('dial').dataset.step=String(reveal);
      $('dial').classList.remove('impact');
      if(hit){void $('dial').offsetWidth;$('dial').classList.add('impact');}
    }else if(!unveiling){
      delete $('dial').dataset.step;$('dial').classList.remove('impact');
    }
    for(let i=0;i<6;i++){
      const shown=done&&(!unveiling||i<=reveal);
      pins[i].className='dial-pin'+(unveiling&&i===reveal?' scan':'')+(shown?(v.result[i].marked?' hit':' safe'):playing&&v.turn===i?' scan':'');
      pins[i].textContent=letters[i]+(shown?(v.result[i].marked?' ×':' ✓'):'');
    }
    $('dial-caption').textContent=unveiling?(letters[reveal]+' 座 · '+(hit?'砰！擊發':'喀！空膛')):done?'掃描完成 · 兩席淘汰':rotating?'輪盤已順時針轉動':'六席羅盤';
  }
  function tickClock(){
    const clock=$('clock');$('countdown').hidden=clock.hidden=v?.phase!=='play'||!localDeadline;
    if(!clock.hidden){
      const remaining=Math.max(0,Math.ceil((localDeadline-Date.now())/1000));
      clock.textContent=remaining?'剩餘 '+remaining+' 秒':'時間到 · 等候自動調查';
      clock.className=remaining<=5?'urgent':'';
      $('clock-fill').style.transform='scaleX('+Math.min(1,Math.max(0,(localDeadline-Date.now())/30000))+')';
      if(!remaining){$('move').disabled=true;pins.forEach(pin=>{pin.disabled=true;});}
    }
  }
  setInterval(tickClock,250);
  function render(){
    $('entry').hidden=!!session;$('room').hidden=!v;
    for(const id of ['create','join'])$(id).disabled=busy;
    if(!v){chatDraft=null;chatKey='';items('chat-log',[]);$('chamber').hidden=true;return;}
    showChat();
    const playing=v.phase==='play',done=v.phase==='done';
    const unveiling=done&&reveal>=0;
    drawDial(playing,done);
    $('room-code').textContent=v.code;
    $('move-feedback').hidden=!moveFeedback;
    $('move-feedback').textContent=moveFeedback;
    $('move-feedback').className=moveState;
    $('recap').hidden=!done||unveiling;
    const final=v.events.at(-1);
    $('finish-action').textContent=done&&final?'第 '+eventRound(final)+' 輪，'+v.seats[final.i]+(final.auto?'的逾時自動行動（':'完成「')+(final.auto?eventText(final)+'）':eventText(final)+'」')+'後，第三位玩家用完點數，觸發結算。':'';
    $('phase').textContent=done?(unveiling?'最後掃描':'對局結算'):playing?'第 '+v.round+' 輪':'等候玩家 '+v.seats.length+' / 6';
    $('points').textContent=playing?'你的點數 '+v.points:'';
    $('turn').textContent=done?(unveiling?'按座位順序揭曉結果…':v.result[v.me].marked?'你的座位被擊發，本局淘汰。':'你成功留下，獲得 1 枚籌碼！'):playing?(v.turn===v.me?'輪到你選擇行動':'等候 '+v.seats[v.turn]+' 行動'):'六人到齊後，由房主開始。';
    items('seats',Array.from({length:6},(_,i)=>({text:(v.phase==='lobby'?i+1:letters[i])+' · '+(v.seats[i]||'空位')+(i===v.me?'（你）':'')+(done&&(!unveiling||i<=reveal)?(v.result[i].marked?' · 淘汰':' · +1 籌碼'):''),className:done&&(!unveiling||i<=reveal)&&v.result[i].marked?'marked':playing&&i===v.turn?'current':''})));
    $('start').hidden=!v.host||v.seats.length!==6||playing||unveiling;
    $('start').textContent=done?'再開一局':'六人開局';
    $('start').disabled=$('leave').disabled=busy;
    $('leave').hidden=playing||unveiling;
    $('actions').hidden=!playing||v.turn!==v.me;
    $('history').hidden=v.phase==='lobby';
    $('pool').textContent='交換累積 '+v.pool+' / 6';
    const clue=e=>{
      if(e.kind==='private'||e.kind==='open'){
        const later=v.events.filter(x=>x.seq>e.seq);
        const steps=later.reduce((n,x)=>n+(x.kind==='rotate1'?1:x.kind==='rotate2'?2:0),0);
        const shifts=steps?' · 之後公開順轉共 '+steps+' 格':'';
        return marksText(e)+shifts+(later.some(x=>x.kind==='hidden')?' · 有隱藏行動，位置可能已變':'');
      }
      return e.kind==='swap'?'已秘密交換 '+pair(e.slot):'已投入 '+e.amount+' 點';
    };
    items('notes',v.notes.length?v.notes.slice().reverse().map(n=>'第 '+eventRound(n)+' 輪 · #'+n.seq+' '+clue(n)):['還沒有私下紀錄。']);
    items('events',v.events.length?v.events.slice(-12).reverse().map(e=>'第 '+eventRound(e)+' 輪 · #'+e.seq+' '+v.seats[e.i]+(e.auto?' · 逾時自動 · ':' · ')+(e.kind==='open'?'公開調查 '+clue(e):eventText(e))):['等待第一個行動。']);
    selection();tickClock();
  }
  async function request(op,extra={}){
    if(busy||paused)return;
    busy=true;clearTimeout(timer);
    if(op==='move'){moveState='sending';moveFeedback='出招送出中…';pendingMove=extra;}
    else if(op!=='state')say('連線中…');
    render();
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,...session,...extra}),cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});
      const result=await response.json();
      if(!response.ok){
        if(op==='state'&&[403,404].includes(response.status)){save(null);v=null;}
        throw new Error(result.error||'房間暫時無法使用。');
      }
      if(result.left){save(null);v=null;}
      else{if(result.token)save({code:result.view.code,token:result.token});acceptView(result.view);}
      if(op==='move'){moveState='sent';moveFeedback='行動已完成：'+actionNames[extra.kind];pendingMove=null;}
      if(op==='state'&&pendingMove&&v&&v.seq>pendingMove.seq){
        const actual=v.events.find(e=>e.seq===pendingMove.seq+1);
        if(actual&&!actual.auto&&actual.i===v.me){moveState='sent';moveFeedback='已從房間確認你的行動完成。';}
        pendingMove=null;
      }
      if(op==='chat'&&$('chat-input').value.trim()===extra.message)$('chat-input').value='';
      if(op!=='state'||failures)say('');failures=0;
    }catch(e){
      if(op==='move'){
        const uncertain=e.name==='AbortError'||e instanceof TypeError||e instanceof SyntaxError;
        moveState='error';moveFeedback=uncertain?'尚未確認出招結果，等候房間同步。':e.message;
        if(!uncertain)pendingMove=null;
      }
      failures=Math.min(4,failures+1);say(e.name==='AbortError'||e instanceof TypeError?'連不上房間，請確認網路；有座位時會自動重連。':e.message);}
    finally{clearTimeout(timeout);busy=false;render();if(chatDraft&&session&&!paused){const {message}=chatDraft;chatDraft=null;sendChat(message);}else schedule();}
  }
  function schedule(){clearTimeout(timer);if(session&&!paused&&!document.hidden)timer=setTimeout(()=>request('state'),failures?Math.min(12000,1800*failures):v?.phase==='play'?1900:3000);}
  function enter(op){const name=$('nickname').value.trim(),code=$('code').value.trim().toUpperCase();if(!name){say('請先輸入暱稱。');return;}if(op==='join'&&!/^[A-HJ-NP-Z2-9]{8}$/.test(code)){say('請輸入 8 碼房間代碼。');return;}request(op,{name,code});}
  for(let i=0;i<6;i++){const opt=document.createElement('option');opt.value=i;opt.textContent=pair(i);$('pair').append(opt);}
  $('create').onclick=()=>enter('create');$('join').onclick=()=>enter('join');$('start').onclick=()=>request('start');$('leave').onclick=()=>request('leave');
  $('kind').onchange=$('amount').onchange=$('pair').onchange=selection;
  $('move').onclick=()=>{if(v&&v.turn===v.me&&!$('move').disabled)request('move',{seq:v.seq,kind:$('kind').value,amount:Number($('amount').value),slot:Number($('pair').value)});};
  $('copy').onclick=async()=>{try{await navigator.clipboard.writeText(v.code);say('已複製房間代碼。');}catch{say('房間代碼：'+v.code);}};
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&reveal>=0)finishReveal();schedule();});
  window.LittleGamesApp={pauseForBackground(){paused=true;clearTimeout(timer);},resumeFromBackground(){paused=false;schedule();},back(){location.href='index.html';return true;}};
  const invitation=(new URLSearchParams(location.search).get('room')||'').toUpperCase();
  if(/^[A-HJ-NP-Z2-9]{8}$/.test(invitation))$('code').value=invitation;
  $('invite').onclick=async()=>{
    if(!v)return;
    const url=new URL('./',location.href);url.searchParams.set('room',v.code);
    try{await navigator.clipboard.writeText(url.href);say('已複製邀請連結。');}
    catch{say('邀請連結：'+url.href);}
  };
  render();if(session)request('state');
})();
