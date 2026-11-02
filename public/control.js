(() => {
  'use strict';
  const byId=(id)=>document.getElementById(id);
  const rangeIds=['summonThreshold','summonSeconds','voteSeconds','trialSeconds'];
  let configTimer=null;
  let socket=null;
  let loreCache=[];
  const timeNow=()=>new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  async function request(url,options={}) {
    const response=await fetch(url,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
    const value=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(value.error||`Request failed: ${response.status}`);
    return value;
  }
  function showMessage(text,error=false){const node=byId('action-message');node.textContent=text;node.style.color=error?'#ff9696':'#91e7b4';}
  function addChat(message) {
    const list=byId('chat-feed');list.querySelector('.empty-row')?.remove();
    const row=document.createElement('li');row.className='chat-row';
    const time=document.createElement('time');time.textContent=timeNow();
    const content=document.createElement('div');const name=document.createElement('strong');name.textContent=message.display_name||message.login||'Witness';
    const text=document.createElement('p');text.textContent=message.text||'';content.append(name,text);row.append(time,content);list.append(row);
    while(list.children.length>120)list.firstElementChild.remove();list.scrollTop=list.scrollHeight;
  }
  function renderState(state={}) {
    const ritual=state.ritual||state;const phase=ritual.phase||'IDLE';
    byId('ritual-phase').textContent=phase.replaceAll('_',' ');
    byId('phase-light').style.background=phase==='IDLE'?'#6e6a77':'#b878ff';
    byId('trial-state').textContent=state.trial?.active?'A lore trial is underway':'No trial running';
  }
  function renderLore(entries) {
    loreCache=Array.isArray(entries)?entries:[];
    const list=byId('lore-list');list.replaceChildren();byId('lore-count').textContent=`${loreCache.length} ${loreCache.length===1?'entry':'entries'}`;
    if(!loreCache.length){const empty=document.createElement('li');empty.className='empty-row';empty.textContent='No canonized lore yet';list.append(empty);return;}
    [...loreCache].sort((a,b)=>(Number(b.n)||0)-(Number(a.n)||0)).forEach(entry=>{
      const row=document.createElement('li');row.className='lore-row';const info=document.createElement('div');info.className='lore-info';const title=document.createElement('strong');title.textContent=`LORE #${Number(entry.n)||'?'} · ${entry.title||'Untitled'}`;const meta=document.createElement('small');meta.textContent=`${Number(entry.uses)||0} uses · ${Number(entry.initiates)||0} initiates`;info.append(title,meta);
      const remove=document.createElement('button');remove.type='button';remove.className='delete-lore';remove.setAttribute('aria-label',`Delete ${entry.title||'lore entry'}`);remove.textContent='×';remove.addEventListener('click',async()=>{if(!window.confirm(`Delete LORE #${Number(entry.n)||'?'}: ${entry.title||'Untitled'}?`))return;try{await request(`/api/lore/${encodeURIComponent(entry.id)}`,{method:'DELETE'});renderLore(loreCache.filter(item=>item.id!==entry.id));}catch(error){showMessage(error.message,true);}});
      row.append(info,remove);list.append(row);
    });
  }
  async function refreshStatus() {
    try {
      const [health,state]=await Promise.all([request('/api/health'),request('/api/state')]);
      const light=byId('connection-light');light.classList.toggle('online',Boolean(health.connected));light.classList.toggle('offline',!health.connected);
      byId('connection-status').textContent=health.connected?'Connected':'Disconnected';byId('connection-login').textContent=health.login?`@${health.login}`:(health.error||'No broadcaster login');renderState(state);
    } catch(error) {byId('connection-status').textContent='Server unavailable';byId('connection-login').textContent=error.message;}
  }
  async function load() {
    const [config,lore]=await Promise.all([request('/api/config'),request('/api/lore')]);
    rangeIds.forEach(id=>{const input=byId(id);if(config[id]!==undefined)input.value=config[id];updateRange(input);});renderLore(lore);await refreshStatus();
  }
  function updateRange(input){byId(`${input.id}-value`).textContent=input.id==='summonThreshold'?input.value:`${input.value}s`;}
  async function saveConfig(){
    byId('config-status').textContent='Saving...';
    const settings=Object.fromEntries(rangeIds.map(id=>[id,Number(byId(id).value)]));
    try{await request('/api/config',{method:'POST',body:JSON.stringify(settings)});byId('config-status').textContent='Saved';}
    catch(error){byId('config-status').textContent='Save failed';showMessage(error.message,true);}
  }
  async function action(url,label){const button=byId(label);button.disabled=true;showMessage('Sending...');try{await request(url,{method:'POST',body:'{}'});showMessage('Command sent');await refreshStatus();}catch(error){showMessage(error.message,true);}finally{button.disabled=false;}}
  async function simulateCrowd(texts,users){return request('/api/simulate/crowd',{method:'POST',body:JSON.stringify({texts,users})});}
  async function quickSimulation(kind){
    try {
      if(kind==='summoners'){await simulateCrowd(['!lore','!lore','!lore'],3);showMessage('Three summoners sent.');}
      if(kind==='votes'){await simulateCrowd(['1','2','1','3','1','2','1','3'],8);showMessage('Simulated votes sent. Start a ritual first, then use this during voting.');}
      if(kind==='answers'){await simulateCrowd(['A','B','C','D','A','B','C','D'],8);showMessage('Trial answers sent. Start a trial first.');}
      if(kind==='newcomer'){
        const entry=loreCache[0];if(!entry){showMessage('Canonize some lore first.',true);return;}
        const login=`newcomer_${Date.now()}`;await request('/api/simulate',{method:'POST',body:JSON.stringify({login,text:`what is ${entry.title}?`})});showMessage('A newcomer question was sent.');
      }
      if(kind==='raid'){await request('/api/simulate/raid',{method:'POST',body:JSON.stringify({from:{login:'visiting_party',display_name:'Visiting Party'},viewers:42})});showMessage('A simulated raid was sent.');}
      await refreshStatus();
    }catch(error){showMessage(error.message,true);}
  }
  rangeIds.forEach(id=>byId(id).addEventListener('input',event=>{updateRange(event.currentTarget);clearTimeout(configTimer);byId('config-status').textContent='Unsaved';configTimer=setTimeout(saveConfig,350);}));
  byId('start-summon').addEventListener('click',()=>action('/api/control/summon','start-summon'));
  byId('start-trial').addEventListener('click',()=>action('/api/control/trial','start-trial'));
  byId('simulate-crowd').addEventListener('click',async()=>{const texts=byId('crowd-texts').value.split(String.fromCharCode(10)).map(text=>text.trim()).filter(Boolean);const users=Math.max(1,Number(byId('crowd-users').value)||1);if(!texts.length){showMessage('Add at least one chat message.',true);return;}try{const result=await simulateCrowd(texts,users);showMessage(`Sent ${result.injected} messages from ${result.users} fake users.`);}catch(error){showMessage(error.message,true);}});
  byId('simulate-summoners').addEventListener('click',()=>quickSimulation('summoners'));
  byId('simulate-votes').addEventListener('click',()=>quickSimulation('votes'));
  byId('simulate-answers').addEventListener('click',()=>quickSimulation('answers'));
  byId('simulate-newcomer').addEventListener('click',()=>quickSimulation('newcomer'));
  byId('simulate-raid').addEventListener('click',()=>quickSimulation('raid'));
  function connect(){if(socket)return;const protocol=location.protocol==='https:'?'wss:':'ws:';socket=new WebSocket(`${protocol}//${location.host}/ws`);socket.addEventListener('message',event=>{let message;try{message=JSON.parse(event.data);}catch{return;}if(message.type==='chat')addChat(message.data||{});if(message.type==='ritual_state')renderState({ritual:message.data});if(message.type==='canonized'){loreCache.push(message.data);renderLore(loreCache);}if(message.type==='lore_updated'){loreCache=loreCache.map(entry=>entry.id===message.data?.id?message.data:entry);renderLore(loreCache);}if(message.type==='initiation'){loreCache=loreCache.map(entry=>entry.id===message.data?.lore?.id?message.data.lore:entry);renderLore(loreCache);}if(message.type==='lore_deleted')renderLore(loreCache.filter(entry=>entry.id!==message.data?.id));});socket.addEventListener('close',()=>{socket=null;setTimeout(connect,2000);});}
  load().catch(error=>showMessage(error.message,true));connect();setInterval(refreshStatus,5000);
})();
