(()=>{
  'use strict';
  const endpoint='https://little-games-compass-rooms.ciclol.chatgpt.site/v1/room';
  const $=id=>document.getElementById(id),key='little-games-compass-web-v1:'+location.pathname,letters='ABCDEF';
  let inFlight=null,queuedMove=null,inspection=null;
  let session=null,v=null,busy=false,paused=false,timer=null,failures=0;
  try{const s=JSON.parse(localStorage.getItem(key));if(s&&typeof s.code==='string'&&typeof s.token==='string')session=s;}catch{}
  const say=s=>$('status').textContent=s;
  const pair=i=>letters[i]+'・'+letters[(i+1)%6];
  const mark=x=>x?'有子彈':'空膛';
  const items=(id,rows)=>$(id).replaceChildren(...rows.map(row=>{
    const li=document.createElement('li');li.textContent=typeof row==='string'?row:row.text;if(row.className)li.className=row.className;return li;
  }));
  function save(s){session=s;try{if(s)localStorage.setItem(key,JSON.stringify(s));else localStorage.removeItem(key);}catch{}}
  const actionNames={open:'公開調查',private:'私下調查',rotate1:'順轉一格',rotate2:'順轉兩格',swap:'秘密交換',hidden:'行動結束'};
  const eventRound=e=>Math.floor((e.seq-1)/6)+1;
  const marksText=e=>!e.marks?'（結果已隱藏）':e.marks.map((value,i)=>letters[(e.slot+i)%6]+' '+mark(value)).join('、');
  const guessLabels=['未知','猜測有子彈','猜測安全'];
  let guessScope='',guesses=Array(6).fill(0),connection='',recovering=!!session;
  const guessButtons=Array.from(letters,(letter,i)=>{
    const button=document.createElement('button');button.type='button';
    button.onclick=()=>{guesses[i]=(guesses[i]+1)%3;writeGuesses();drawGuesses();drawClues();};
    $('guess-grid').append(button);return button;
  });
  function writeGuesses(){try{if(guessScope)localStorage.setItem(key+':guess:'+guessScope,JSON.stringify(guesses));}catch{}}
  function drawGuesses(){guessButtons.forEach((b,i)=>{b.textContent=letters[i]+' · '+guessLabels[guesses[i]];b.dataset.guess=guesses[i];});}
  $('clear-guesses').onclick=()=>{guesses=Array(6).fill(0);writeGuesses();drawGuesses();drawClues();};
  function loadGuesses(next,prev){
    const scope=JSON.stringify([next.code,next.matchId,next.me,next.seats]);
    const restart=next.phase==='play'&&prev?.code===next.code&&(prev.phase==='done'||(prev.phase==='play'&&next.seq<prev.seq));
    if(scope===guessScope&&!restart)return;
    guessScope=scope;guesses=Array(6).fill(0);
    if(restart)writeGuesses();
    else try{const saved=JSON.parse(localStorage.getItem(key+':guess:'+scope));if(saved?.length===6&&saved.every(n=>Number.isInteger(n)&&n>=0&&n<=2))guesses=saved;}catch{}
    drawGuesses();
  }
  const actorTag=e=>e.ai?' · AI · ':e.bot?' · 電腦託管 · ':e.auto?' · 逾時自動 · ':' · ';
  const eventText=e=>e.kind==='open'?'公開調查 '+marksText(e):(actionNames[e.kind]||'行動');
  let moveFeedback='',moveState='',pendingMove=null;
  function selection(){
    const kind=$('kind').value;
    const exchange=!!v?.exchange;
    $('exchange-hint').hidden=!exchange;
    $('kind-wrap').hidden=exchange;
    $('amount-wrap').hidden=exchange||kind!=='swap';
    $('pair-wrap').hidden=!exchange&&!['open','private'].includes(kind);
    const slot=Number($('pair').value), myTurn=v?.phase==='play'&&v.turn===v.me&&!v.managed?.[v.me];
    const choosing=myTurn&&!$('pair-wrap').hidden;
    const cost=exchange?0:{open:1,private:2,rotate1:3,rotate2:4,swap:Number($('amount').value)}[kind];
    for(const option of Array.from($('kind').options||[])){
      const price={open:1,private:2,rotate1:3,rotate2:4,swap:1}[option.value];
      option.disabled=!!v&&price>v.points;
    }
    for(const option of Array.from($('amount').options||[]))option.disabled=!!v&&Number(option.value)>v.points;
    $('pool').textContent=!exchange&&myTurn&&cost===v.points?'這步會用完點數':!exchange&&myTurn&&v.points<=2?'點數不足的行動已停用':'';
    const expired=localDeadline&&Date.now()>=localDeadline;
    const actionLocked=(busy&&inFlight!=='state')||!!queuedMove;
    $('move').disabled=actionLocked||!myTurn||cost>v.points||expired;
    $('move').textContent=queuedMove?'等候送出…':moveState==='sending'?'送出中…':exchange?'確認交換 '+pair(slot):(kind==='swap'&&!choosing?'投入交換點數':actionNames[kind])+(choosing?' '+pair(slot):'')+' · '+cost+' 點';
    $('pair-hint').hidden=!choosing;
    pins.forEach((pin,i)=>{
      pin.disabled=!choosing||actionLocked||expired;
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
      items('chat-log',messages.map(m=>(m.at?new Date(m.at).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})+' · ':'')+'玩家聲稱 · '+m.name+(m.ai?'（AI）':'')+'：'+m.message));if(atBottom)log.scrollTop=log.scrollHeight;
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
  let liveClueKey='';
  function chamberPreview(event){
    if(!event?.marks)return;
    clearTimeout(chamberTimer);
    $('chamber').hidden=false;
    $('chamber-title').textContent=event.kind==='private'?'私下調查 · 只有你看得到':'公開調查 · '+v.seats[event.i];
    $('chamber-info').textContent=pair(event.slot)+'：'+event.marks.map(mark).join('、');
    inspection=event;
    chamberTimer=setTimeout(()=>{inspection=null;$('chamber').hidden=true;if(v)drawDial(v.phase==='play',v.phase==='done');},event.expires?Math.max(0,event.expires-v.serverNow):6500);
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
    const prev=v,same=prev?.code===next.code&&prev.phase==='play'&&next.phase!=='lobby'&&next.seq>=prev.seq&&next.matchId===prev.matchId;
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
      if(auto){moveFeedback=next.seats[auto.i]+(auto.bot?'（電腦託管）':' 逾時，系統')+eventText(auto);moveState='auto';}
    }
    if(next.exchange&&next.exchange!==prev?.exchange){
      $('pair').value=String(next.me);moveFeedback='可以交換：請選擇相鄰兩格。';moveState='';
    }else if(prev?.exchange&&!next.exchange&&prev.matchId===next.matchId){
      const last=next.notes.at(-1);
      if(last?.kind==='swap'&&last.automatic){moveFeedback='時間到，已隨機完成交換 '+pair(last.slot)+'。';moveState='auto';}
    }
    v=next;loadGuesses(next,prev);
    localDeadline=next.deadline?Date.now()+Math.max(0,next.deadline-next.serverNow):0;
    if(!same){clearTimeout(chamberTimer);inspection=null;$('chamber').hidden=true;}
    if(next.memoryOnly){
      const clue=next.liveClue,stamp=clue?next.matchId+':'+clue.seq:'';
      if(clue&&stamp!==liveClueKey){liveClueKey=stamp;chamberPreview(clue);}
      if(!clue){clearTimeout(chamberTimer);inspection=null;$('chamber').hidden=true;liveClueKey='';}
    }else if(same&&next.phase==='play'){
      const checks=[...next.events.filter(e=>e.kind==='open'),...next.notes.filter(e=>e.kind==='private')].filter(e=>e.seq>prev.seq);
      chamberPreview(checks.sort((a,b)=>b.seq-a.seq)[0]);
    }
    if(same&&next.phase==='done'&&!reduced.matches&&!document.hidden){
      if(!next.memoryOnly){clearTimeout(chamberTimer);inspection=null;$('chamber').hidden=true;}
      reveal=0;
      revealTimer=setTimeout(revealNext,1120);
    }
  }
  function drawClues(){
    const show=!!v?.hints&&v.phase==='play';
    $('clue-legend').hidden=!show;
    const holder=$('dial-clues');
    if(!show){holder.replaceChildren();return;}
    const known=Array(6).fill(null);
    const notes=new Map(v.notes.map(n=>[n.seq,n]));
    for(const e of v.events){
      const own=notes.get(e.seq);
      if(e.kind==='open'||own?.kind==='private'){
        const check=e.kind==='open'?e:own;
        check.marks.forEach((value,j)=>{known[(check.slot+j)%6]={value,old:false};});
      }else if(e.kind==='rotate1'||e.kind==='rotate2'){
        const n=e.kind==='rotate1'?1:2;known.unshift(...known.splice(-n));
      }else if(own?.kind==='swap'){
        const j=(own.slot+1)%6;[known[j],known[own.slot]]=[known[own.slot],known[j]];
      }else if(e.kind==='hidden'&&e.i!==v.me){
        for(const clue of known)if(clue)clue.old=true;
      }
    }
    holder.replaceChildren(...Array.from(letters,(letter,i)=>{
      const tag=document.createElement('span'),a=i*Math.PI/3,clue=known[i];
      tag.style.left=(50+23*Math.sin(a))+'%';tag.style.top=(50-23*Math.cos(a))+'%';
      tag.textContent=[clue?(clue.old?'舊 ':'')+(clue.value?'有彈':'空膛'):'',guesses[i]?'猜 '+(guesses[i]===1?'有彈':'安全'):''].filter(Boolean).join(' / ');
      tag.className='dial-clue';tag.hidden=!tag.textContent;return tag;
    }));
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
      const offset=(i-(inspection?.slot??i)+6)%6;
      const inspected=!!inspection&&offset<2;
      pins[i].classList.toggle('checked-live',inspected&&inspection.marks[offset]);
      pins[i].classList.toggle('checked-clear',inspected&&!inspection.marks[offset]);
      const name=v.seats[i]||'';
      const status=shown?(v.result[i].marked?' ×':' ✓'):inspected?(inspection.marks[offset]?' · 有彈':' · 空膛'):'';
      pins[i].textContent=letters[i]+status;
      pins[i].dataset.name=name+(v.ai?.[i]?' · AI':i===v.me?' · 你':v.managed?.[i]?' · 託管':'');
    }
    $('dial-caption').textContent=unveiling?(letters[reveal]+' 座 · '+(hit?'砰！擊發':'喀！空膛')):done?'掃描完成 · 兩席淘汰':rotating?'輪盤已順時針轉動':'六席羅盤';
  }
  function tickClock(){
    const clock=$('clock');$('countdown').hidden=clock.hidden=v?.phase!=='play'||!localDeadline;
    if(!clock.hidden){
      const remaining=Math.max(0,Math.ceil((localDeadline-Date.now())/1000));
      clock.textContent=remaining?'剩餘 '+remaining+' 秒':v.exchange?'時間到 · 等候自動交換':'時間到 · 等候自動調查';
      clock.className=remaining<=5?'urgent':'';
      $('dock-clock').textContent=remaining?remaining+' 秒':'時間到';
      $('dock-clock').className=clock.className;
      $('clock-fill').style.transform='scaleX('+Math.min(1,Math.max(0,(localDeadline-Date.now())/(v.turnDuration||60000)))+')';
      if(!remaining){$('move').disabled=true;pins.forEach(pin=>{pin.disabled=true;});}
    }
  }
  setInterval(tickClock,250);
  function render(){
    $('connection').hidden=!connection;$('connection').textContent=connection;
    $('entry').hidden=!!session;$('room').hidden=!v;
    for(const id of ['create','join'])$(id).disabled=busy;
    $('practice').disabled=busy;
    if(!v){chatDraft=null;chatKey='';items('chat-log',[]);$('chamber').hidden=true;return;}
    showChat();
    const playing=v.phase==='play',done=v.phase==='done';
    const unveiling=done&&reveal>=0;
    drawDial(playing,done);drawClues();
    $('room').classList.toggle('in-play',playing);
    $('seats').hidden=playing;
    const news=v.events.at(-1);
    $('board-event').textContent=playing&&news?v.seats[news.i]+actorTag(news)+eventText(news):'';
    $('room-code').textContent=v.code;
    $('move-feedback').hidden=!moveFeedback;
    $('move-feedback').textContent=moveFeedback;
    $('move-feedback').className=moveState;
    $('recap').hidden=!done||unveiling;
    $('deduction').hidden=!playing||v.memoryOnly;
    $('private-history').hidden=!!v.memoryOnly;
    if(done&&!unveiling)items('recap-events',v.events.slice(-6).map(e=>'第 '+eventRound(e)+' 輪 · '+v.seats[e.i]+actorTag(e)+eventText(e)));
    const final=v.events.at(-1);
    $('finish-action').textContent=done&&final?'第 '+eventRound(final)+' 輪，'+v.seats[final.i]+(final.auto?'的逾時自動行動（':final.kind==='hidden'?'':'完成「')+(final.auto?eventText(final)+'）':final.kind==='hidden'?'行動結束':eventText(final)+'」')+'後，第三位玩家用完點數，觸發結算。':'';
    $('phase').textContent=done?(unveiling?'最後掃描':'對局結算'):playing?'第 '+v.round+' 輪':'等候玩家 '+v.seats.length+' / 6';
    $('points').textContent=playing?'你的點數 '+v.points:'';
    $('turn').textContent=done?(unveiling?'按座位順序揭曉結果…':v.result[v.me].marked?'你的座位被擊發，本局淘汰。':'你成功留下，獲得 1 枚籌碼！'):playing?(v.managed?.[v.turn]?'電腦託管中：'+v.seats[v.turn]:v.turn===v.me?'輪到你選擇行動':'等候 '+v.seats[v.turn]+' 行動'):v.readyRequired?'六人到齊且都準備好後，由房主開始。':'六人到齊後，由房主開始。';
    items('seats',Array.from({length:6},(_,i)=>({text:(v.phase==='lobby'?i+1:letters[i])+' · '+(v.seats[i]||'空位')+(v.ai?.[i]?'（AI）':i===v.me?'（你）':'')+(playing&&v.managed?.[i]?' · 電腦託管中':!playing&&!unveiling&&v.seats[i]?(v.ready?.[i]?' · 已準備':' · 未準備'):'')+(done&&(!unveiling||i<=reveal)?(v.result[i].marked?' · 淘汰':' · +1 籌碼'):''),className:done&&(!unveiling||i<=reveal)&&v.result[i].marked?'marked':playing&&i===v.turn?'current':''})));
    const allReady=v.ready?.length===6&&v.ready.every(Boolean);
    const targets=playing?v.seats.map((name,i)=>v.ai?.[i]?[i,name]:null).filter(Boolean):[];
    $('ask-wrap').hidden=!targets.length;
    const targetList=$('ask-target'), signature=JSON.stringify(targets);
    if(targetList.dataset.list!==signature){
      targetList.dataset.list=signature;
      targetList.replaceChildren(...targets.map(([i,name])=>{const opt=document.createElement('option');opt.value=i;opt.textContent=name;return opt;}));
    }
    $('ask-ai').disabled=busy;
    items('ai-debrief',done&&!unveiling&&v.aiDebrief?.length?v.aiDebrief.map(m=>'第 '+m.round+' 輪 · '+m.name+' 刻意誤導：「'+m.message+'」 · '+(m.evidence||'無法驗證')):['本局沒有記錄到 AI 刻意誤導。']);
    const inSeries=!!v.series&&v.series.completed<3;
    const canManageAI=v.host&&!playing&&!unveiling&&!inSeries;
    $('match-setup').hidden=!canManageAI||v.practice;
    $('match-mode').hidden=!(playing||done)||unveiling;
    $('match-mode').textContent=v.memoryOnly?'無筆記挑戰 · 羅盤線索關閉':'羅盤線索：'+(v.hints?'開啟':'關閉');
    $('series-board').hidden=!v.series||unveiling;
    if(v.series&&!unveiling){
      const {completed,total,standings}=v.series;
      const visible=completed===total;
      $('series-title').textContent=visible?'三局積分賽 · 最終排名':'三局積分賽 · '+(playing?'第 '+(completed+1)+' 局':'已完成 '+completed+' / '+total+' 局');
      const history=(v.series.history||[]);
      $('series-history').hidden=!history.length;
      items('series-history-list',history.map(g=>{
        const lead=g.standings[0]?.points||0;
        const leaders=g.standings.filter(p=>p.points===lead).map(p=>p.name);
        const you=g.standings.find(p=>p.name===v.seats[v.me]);
        return '第 '+g.game+' 局 · 存活得分：'+g.survivors.join('、')+'。局後領先：'+leaders.join('、')+'（'+lead+' 分）'+(you?'；你'+(lead===you.points?'並列領先':'落後 '+(lead-you.points)+' 分'):'')+'。當時排名：'+g.standings.map(p=>(g.standings.findIndex(x=>x.points===p.points)+1)+'｜'+p.name+' '+p.points+' 分').join('、');
      }));
      items('series-scores',standings.map((r,i)=>{const rank=standings.findIndex(x=>x.points===r.points)+1;return (visible?'第 '+rank+' 名 · ':'')+r.name+' · '+r.points+' 分';}));
    }
    $('fill-ai').hidden=!canManageAI||v.seats.length===6;
    $('fill-ai').disabled=busy;
    $('difficulty-wrap').hidden=!canManageAI;
    $('room-difficulty').value=v.difficulty||'hard';
    $('room-difficulty').disabled=busy;
    $('retry').hidden=$('remix').hidden=!v.practice||!done||unveiling;
    $('retry').disabled=$('remix').disabled=busy;
    $('add-ai').hidden=!canManageAI||v.seats.length===6;
    $('remove-ai').hidden=!canManageAI||!v.ai?.includes(true);
    $('add-ai').disabled=$('remove-ai').disabled=busy;
    $('ready').hidden=v.practice||playing||unveiling;
    $('ready').textContent=v.ready?.[v.me]?'取消準備':'準備好了';
    $('ready').disabled=busy;
    $('reclaim').hidden=!playing||!v.managed?.[v.me];
    $('reclaim').disabled=busy;
    $('control-notices').hidden=!v.notices?.length||unveiling;
    items('control-notices',(v.notices||[]).slice(-4).map(n=>n.name+(n.kind==='managed'?' 已由電腦託管':' 已取回控制')));
    $('start').hidden=v.practice||!v.host||v.seats.length!==6||playing||unveiling;
    $('start').textContent=done&&inSeries?'開始下一局':done?'再開一局':'六人開局';
    $('leave').disabled=busy;
    $('start').disabled=busy||(v.readyRequired&&!allReady);
    $('leave').hidden=(playing&&!v.practice)||unveiling;
    $('leave').textContent=v.practice?'退出練習':'離開房間';
    $('actions').hidden=!playing||v.turn!==v.me||!!v.managed?.[v.me];
    $('room').classList.toggle('your-turn',!$('actions').hidden);
    $('history').hidden=v.phase==='lobby';

    const clue=e=>{
      if(e.kind==='private'||e.kind==='open'){
        const later=v.events.filter(x=>x.seq>e.seq);
        const steps=later.reduce((n,x)=>n+(x.kind==='rotate1'?1:x.kind==='rotate2'?2:0),0);
        if(!e.marks)return '結果已隱藏';
        const shifted=e.marks.map((value,i)=>letters[(e.slot+i+steps)%6]+' '+mark(value)).join('、');
        const shifts=steps?' · 依你知道的轉盤：'+shifted+'（仍可能受未知行動影響）':'';
        return marksText(e)+shifts+(later.some(x=>x.kind==='hidden')?' · 有隱藏行動，位置可能已變':'');
      }
      return e.kind==='swap'?'已秘密交換 '+pair(e.slot):'已投入 '+e.amount+' 點';
    };
    items('notes',v.notes.length?v.notes.slice().reverse().map(n=>'第 '+eventRound(n)+' 輪 · #'+n.seq+' '+clue(n)):['還沒有私下紀錄。']);
    items('events',v.events.length?v.events.slice(-12).reverse().map(e=>'第 '+eventRound(e)+' 輪 · #'+e.seq+' '+v.seats[e.i]+actorTag(e)+(e.kind==='open'?'系統確認 · 公開調查 '+clue(e):eventText(e))):['等待第一個行動。']);
    selection();tickClock();
  }
  async function request(op,extra={}){
    if(busy||paused)return;
    busy=true;inFlight=op;clearTimeout(timer);
    if(op==='finish-swap'){moveState='sending';moveFeedback='交換送出中…';}
    if(op==='move'){moveState='sending';moveFeedback='出招送出中…';pendingMove=extra;}
    else if(op!=='state')say('連線中…');
    render();
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,...session,...extra}),cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});
      const result=await response.json();
      if(!response.ok){
        if(op==='state'&&[403,404].includes(response.status)){save(null);v=null;recovering=false;connection='原座位已失效，請重新加入房間。';}
        throw new Error(result.error||'房間暫時無法使用。');
      }
      if(result.left){save(null);v=null;}
      else{if(result.token)save({code:result.view.code,token:result.token});acceptView(result.view);}
      if(recovering&&v&&session){
        const missed=v.events.filter(e=>e.auto&&e.seq>(resumeSeq??v.seq));
        connection='已回到原座位。'+(missed.length?' 離線期間 '+missed.length+' 次逾時行動已補到公開紀錄。':'');
        recovering=false;resumeSeq=null;
      }
      if(op==='move'){
        moveState='sent';moveFeedback=v.exchange?'可以交換：請選擇相鄰兩格。':extra.kind==='swap'?'點數已投入，本回合結束。':'行動已完成：'+actionNames[extra.kind];pendingMove=null;
      }
      if(op==='finish-swap'){moveState='sent';moveFeedback='已完成秘密交換 '+pair(extra.slot)+'。';}
      if(op==='state'&&pendingMove&&v&&v.seq>pendingMove.seq){
        const actual=v.events.find(e=>e.seq===pendingMove.seq+1);
        if(actual&&!actual.auto&&actual.i===v.me){moveState='sent';moveFeedback='已從房間確認你的行動完成。';}
        pendingMove=null;
      }
      if(op==='chat'&&$('chat-input').value.trim()===extra.message)$('chat-input').value='';
      if(op!=='state'||failures)say('');failures=0;
    }catch(e){
      if(session&&(e.name==='AbortError'||e instanceof TypeError||e instanceof SyntaxError)){
        beginReconnect();
      }
      if(op==='move'||op==='finish-swap'){
        const uncertain=e.name==='AbortError'||e instanceof TypeError||e instanceof SyntaxError;
        moveState='error';moveFeedback=uncertain?'尚未確認出招結果，等候房間同步。':e.message;
        if(!uncertain)pendingMove=null;
      }
      failures=Math.min(4,failures+1);say(e.name==='AbortError'||e instanceof TypeError?'連不上房間，請確認網路；有座位時會自動重連。':e.message);}
    finally{clearTimeout(timeout);busy=false;inFlight=null;
      const queued=queuedMove;queuedMove=null;render();
      if(queued&&v?.phase==='play'&&v.turn===v.me&&v.matchId===queued.match&&v.seq===queued.seq&&(!localDeadline||Date.now()<localDeadline)&&v.exchange===queued.exchange){request(queued.op,queued.body);}
      else if(chatDraft&&session&&!paused){const {message}=chatDraft;chatDraft=null;sendChat(message);}else schedule();}
  }
  function schedule(){clearTimeout(timer);if(session&&!paused&&!document.hidden)timer=setTimeout(()=>request('state'),failures?Math.min(12000,1800*failures):v?.phase==='play'?1900:3000);}
  function enter(op){const name=$('nickname').value.trim(),code=$('code').value.trim().toUpperCase();if(!name){say('請先輸入暱稱。');return;}if(op==='join'&&!/^[A-HJ-NP-Z2-9]{8}$/.test(code)){say('請輸入 8 碼房間代碼。');return;}request(op,{name,code,...(op==='create'?{readyRequired:true,difficulty:$('entry-difficulty').value}:{})});}
  for(let i=0;i<6;i++){const opt=document.createElement('option');opt.value=i;opt.textContent=pair(i);$('pair').append(opt);}
  for(const [memory,hints] of [['match-memory','match-hints'],['practice-memory','practice-hints']]){
    $(memory).onchange=()=>{$(hints).disabled=$(memory).checked;if($(memory).checked)$(hints).checked=false;};
  }
  $('create').onclick=()=>enter('create');$('join').onclick=()=>enter('join');$('start').onclick=()=>request('start',v?.series&&v.series.completed<3?{}:{hints:$('match-hints').checked,memoryOnly:$('match-memory').checked,series:$('match-series').checked});$('leave').onclick=()=>{if(!v?.practice||v.phase!=='play'||window.confirm('退出這局單人練習？'))request('leave');};
  $('retry').onclick=()=>request('retry',{hints:v?.hints,memoryOnly:v?.memoryOnly});$('remix').onclick=()=>request('remix',{hints:v?.hints,memoryOnly:v?.memoryOnly});
  $('practice').onclick=()=>request('create',{name:$('nickname').value.trim()||'玩家',practice:true,hints:$('practice-hints').checked,memoryOnly:$('practice-memory').checked,readyRequired:true,difficulty:$('entry-difficulty').value});
  $('fill-ai').onclick=()=>request('fill-ai');
  $('room-difficulty').onchange=()=>request('difficulty',{difficulty:$('room-difficulty').value});
  $('ask-ai').onclick=()=>{if(!$('ask-wrap').hidden)request('chat',{message:'你查到什麼？',target:Number($('ask-target').value)});};
  $('add-ai').onclick=()=>request('add-ai');
  $('remove-ai').onclick=()=>{if(v?.ai?.includes(true))request('remove-ai',{seat:v.ai.lastIndexOf(true)});};
  $('ready').onclick=()=>{if(v)request('ready',{ready:!v.ready?.[v.me]});};
  $('reclaim').onclick=()=>request('reclaim');
  $('kind').onchange=$('amount').onchange=$('pair').onchange=selection;
  $('move').onclick=()=>{
    if(!v||v.turn!==v.me||$('move').disabled)return;
    const slot=Number($('pair').value);
    const op=v.exchange?'finish-swap':'move';
    const body=v.exchange?{exchange:v.exchange,slot}:{seq:v.seq,kind:$('kind').value,amount:Number($('amount').value),slot};
    if(inFlight==='state'){queuedMove={op,body,match:v.matchId,seq:v.seq,exchange:v.exchange};selection();}
    else request(op,body);
  };
  $('copy').onclick=async()=>{try{await navigator.clipboard.writeText(v.code);say('已複製房間代碼。');}catch{say('房間代碼：'+v.code);}};
  let resumeSeq=null;
  function beginReconnect(){
    if(!session)return;
    if(!recovering)resumeSeq=v?.seq??null;
    recovering=true;connection='正在重新連線… 回合倒數不會暫停。';
  }
  window.addEventListener('offline',()=>{beginReconnect();render();});
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden&&reveal>=0)finishReveal();
    if(document.hidden&&session){
      if(!recovering)resumeSeq=v?.seq??null;
      recovering=true;
    }
    if(!document.hidden){if(recovering)beginReconnect();render();}
    schedule();
  });
  window.LittleGamesApp={pauseForBackground(){paused=true;clearTimeout(timer);},resumeFromBackground(){paused=false;schedule();},back(){location.href='index.html';return true;}};
  const invitation=(new URLSearchParams(location.search).get('room')||'').toUpperCase();
  if(/^[A-HJ-NP-Z2-9]{8}$/.test(invitation))$('code').value=invitation;
  $('invite').onclick=async()=>{
    if(!v)return;
    const url=new URL('./',location.href);url.searchParams.set('room',v.code);
    try{await navigator.clipboard.writeText(url.href);say('已複製邀請連結。');}
    catch{say('邀請連結：'+url.href);}
  };
  if(session)connection='正在恢復原座位… 回合倒數不會暫停。';
  render();if(session)request('state');
})();
