(()=>{
  'use strict';
  const endpoint='https://little-games-compass-rooms.ciclol.chatgpt.site/v1/room';
  const $=id=>document.getElementById(id),key='little-games-compass-web-v1:'+location.pathname,letters='ABCDEF';
  let session=null,v=null,busy=false,paused=false,timer=null,failures=0;
  try{const s=JSON.parse(localStorage.getItem(key));if(s&&typeof s.code==='string'&&typeof s.token==='string')session=s;}catch{}
  const say=s=>$('status').textContent=s;
  const pair=i=>letters[i]+'・'+letters[(i+1)%6];
  const mark=x=>x?'有標記':'空';
  const items=(id,rows)=>$(id).replaceChildren(...rows.map(row=>{
    const li=document.createElement('li');li.textContent=typeof row==='string'?row:row.text;if(row.className)li.className=row.className;return li;
  }));
  function save(s){session=s;try{if(s)localStorage.setItem(key,JSON.stringify(s));else localStorage.removeItem(key);}catch{}}
  function selection(){
    const kind=$('kind').value;
    $('amount-wrap').hidden=kind!=='swap';
    $('pair-wrap').hidden=!['open','private','swap'].includes(kind)||(kind==='swap'&&(v?.pool||0)+Number($('amount').value)<6);
    $('move').disabled=busy||!v||({open:1,private:2,rotate1:3,rotate2:4,swap:Number($('amount').value)}[kind]>v.points);
  }
  function render(){
    $('entry').hidden=!!session;$('room').hidden=!v;
    for(const id of ['create','join'])$(id).disabled=busy;
    if(!v)return;
    const playing=v.phase==='play',done=v.phase==='done';
    $('room-code').textContent=v.code;
    $('phase').textContent=done?'對局結算':playing?'第 '+v.round+' 輪':'等候玩家 '+v.seats.length+' / 6';
    $('points').textContent=playing?'你的點數 '+v.points:'';
    $('turn').textContent=done?(v.result[v.me].marked?'你中了淘汰標記。':'你成功留下，獲得 1 枚籌碼！'):playing?(v.turn===v.me?'輪到你選擇行動':'等候 '+v.seats[v.turn]+' 行動'):'六人到齊後，由房主開始。';
    items('seats',Array.from({length:6},(_,i)=>({text:(v.phase==='lobby'?i+1:letters[i])+' · '+(v.seats[i]||'空位')+(i===v.me?'（你）':'')+(done?(v.result[i].marked?' · 淘汰':' · +1 籌碼'):''),className:done&&v.result[i].marked?'marked':playing&&i===v.turn?'current':''})));
    $('start').hidden=!v.host||v.seats.length!==6||playing;
    $('start').textContent=done?'再開一局':'六人開局';
    $('start').disabled=$('leave').disabled=busy;
    $('leave').hidden=playing;
    $('actions').hidden=!playing||v.turn!==v.me;
    $('history').hidden=v.phase==='lobby';
    $('pool').textContent='交換累積 '+v.pool+' / 6';
    items('notes',v.notes.length?v.notes.slice().reverse().map(n=>'#'+n.seq+' '+(n.kind==='private'?pair(n.slot)+'：'+n.marks.map(mark).join('、'):n.kind==='swap'?'已秘密交換 '+pair(n.slot):'已投入 '+n.amount+' 點')):['還沒有私下紀錄。']);
    items('events',v.events.length?v.events.slice(-12).reverse().map(e=>'#'+e.seq+' '+v.seats[e.i]+' · '+(e.kind==='open'?pair(e.slot)+'：'+e.marks.map(mark).join('、'):({hidden:'隱藏行動',rotate1:'順轉一格',rotate2:'順轉兩格'}[e.kind]))):['等待第一個行動。']);
    selection();
  }
  async function request(op,extra={}){
    if(busy||paused)return;
    busy=true;clearTimeout(timer);if(op!=='state')say('連線中…');render();
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({op,...session,...extra}),cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});
      const result=await response.json();
      if(!response.ok){
        if(op==='state'&&[403,404].includes(response.status)){save(null);v=null;}
        throw new Error(result.error||'房間暫時無法使用。');
      }
      if(result.left){save(null);v=null;}
      else{if(result.token)save({code:result.view.code,token:result.token});v=result.view;}
      failures=0;say('');
    }catch(e){failures=Math.min(4,failures+1);say(e.name==='AbortError'||e instanceof TypeError?'連不上房間，請確認網路；有座位時會自動重連。':e.message);}
    finally{clearTimeout(timeout);busy=false;render();schedule();}
  }
  function schedule(){clearTimeout(timer);if(session&&!paused&&!document.hidden)timer=setTimeout(()=>request('state'),failures?Math.min(12000,1800*failures):v?.phase==='play'?1900:3000);}
  function enter(op){const name=$('nickname').value.trim(),code=$('code').value.trim().toUpperCase();if(!name){say('請先輸入暱稱。');return;}if(op==='join'&&!/^[A-HJ-NP-Z2-9]{8}$/.test(code)){say('請輸入 8 碼房間代碼。');return;}request(op,{name,code});}
  for(let i=0;i<6;i++){const opt=document.createElement('option');opt.value=i;opt.textContent=pair(i);$('pair').append(opt);}
  $('create').onclick=()=>enter('create');$('join').onclick=()=>enter('join');$('start').onclick=()=>request('start');$('leave').onclick=()=>request('leave');
  $('kind').onchange=$('amount').onchange=selection;
  $('move').onclick=()=>{if(v&&v.turn===v.me)request('move',{seq:v.seq,kind:$('kind').value,amount:Number($('amount').value),slot:Number($('pair').value)});};
  $('copy').onclick=async()=>{try{await navigator.clipboard.writeText(v.code);say('已複製房間代碼。');}catch{say('房間代碼：'+v.code);}};
  document.addEventListener('visibilitychange',schedule);
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
