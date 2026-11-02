(() => {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const canvas = byId('sky');
  const ctx = canvas.getContext('2d');
  const stars = [];
  let lore = [];
  let leaders = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let pointer = { x: 0, y: 0, px: 0, py: 0 };
  let hovered = null;
  let cardTimer = null;
  let socket = null;
  let reconnectDelay = 800;
  const now = () => Date.now();

  function hash(value) {
    let result = 2166136261;
    for (const character of String(value ?? '')) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
    return result >>> 0;
  }
  function birthTime(entry) { const parsed = new Date(entry.born_at || 0).getTime(); return Number.isFinite(parsed) ? parsed : 0; }
  function isLiving(entry) { const usedAt = new Date(entry.last_used_at || 0).getTime(); return usedAt > 0 && now() - usedAt <= 7 * 86400000; }
  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width || innerWidth; height = rect.height || innerHeight; dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layoutStars();
  }
  function layoutStars() {
    const sorted = [...lore].sort((a,b) => birthTime(a)-birthTime(b));
    const oldest = sorted[0] ? birthTime(sorted[0]) : 0;
    const newest = sorted.length ? birthTime(sorted[sorted.length-1]) : 0;
    const span = Math.max(1,newest-oldest);
    const marginX = Math.max(70,width*.075); const available = Math.max(1,width-marginX*2);
    sorted.forEach((entry,index) => {
      let star = stars.find((item) => item.entry.id === entry.id);
      if (!star) { star = { entry, phase: Math.random()*Math.PI*2, burstUntil: 0 }; stars.push(star); }
      star.entry = entry;
      const t = sorted.length < 2 ? .5 : (birthTime(entry)-oldest)/span;
      const spread = sorted.length < 2 ? 0 : ((index/(sorted.length-1))-.5)*Math.min(available*.035,42);
      star.x = marginX+t*available+spread;
      star.y = height*.15+(hash(entry.id)%10000)/10000*height*.7;
      star.radius = Math.min(11,3.2+Math.log1p(Math.max(0,Number(entry.uses)||0))*1.5);
      star.living = isLiving(entry);
    });
    for (let i=stars.length-1;i>=0;i-=1) if (!lore.some((entry)=>entry.id===stars[i].entry.id)) stars.splice(i,1);
    byId('empty-state').style.display = lore.length ? 'none' : 'block';
    updateStats();
  }
  function updateStats() {
    byId('stat-lore').textContent = String(lore.length);
    byId('stat-initiates').textContent = String(lore.reduce((total,entry)=>total+(Number(entry.initiates)||0),0));
    const oldest = [...lore].sort((a,b)=>birthTime(a)-birthTime(b))[0];
    byId('stat-oldest').textContent = oldest?.title || 'Waiting to be remembered';
  }
  function starColor(star) { return star.living ? '#f5c451' : '#bac3d3'; }
  function draw(time) {
    ctx.clearRect(0,0,width,height);
    pointer.px += (pointer.x-pointer.px)*.025; pointer.py += (pointer.y-pointer.py)*.025;
    ctx.save(); ctx.translate(pointer.px*.018,pointer.py*.018);
    for (let i=0;i<110;i+=1) {
      const seed=(i*7919)%10007; const x=(seed%997)/997*width; const y=((seed*7)%991)/991*height;
      const shimmer=.18+(.22+.22*Math.sin(time*.0008+i*2.1));
      ctx.globalAlpha=shimmer; ctx.fillStyle='#d9d8f1'; ctx.beginPath(); ctx.arc(x,y,(i%7===0)?1.35:.65,0,Math.PI*2); ctx.fill();
    }
    const ordered=[...stars].sort((a,b)=>birthTime(a.entry)-birthTime(b.entry));
    ctx.globalAlpha=.17; ctx.lineWidth=1; ctx.strokeStyle='#c1a6ed'; ctx.beginPath();
    ordered.forEach((star,index)=>{ if(index===0) ctx.moveTo(star.x,star.y); else ctx.lineTo(star.x,star.y); }); ctx.stroke();
    for (const star of ordered) {
      const pulse=.86+Math.sin(time*.0014+star.phase)*.14;
      const hoveredStar=hovered===star;
      const radius=(star.radius+(hoveredStar?4:0))*pulse;
      const color=starColor(star);
      ctx.globalAlpha=star.living ? .94 : .6;
      ctx.shadowColor=color; ctx.shadowBlur=star.living?16:7; ctx.fillStyle=color;
      ctx.beginPath(); ctx.arc(star.x,star.y,radius,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0; ctx.globalAlpha=.85; ctx.fillStyle='#fff5d8'; ctx.beginPath(); ctx.arc(star.x-radius*.18,star.y-radius*.2,Math.max(1,radius*.28),0,Math.PI*2); ctx.fill();
      if (time<star.burstUntil) {
        const progress=1-(star.burstUntil-time)/1200; const burstRadius=radius+progress*95;
        ctx.globalAlpha=(1-progress)*.75; ctx.strokeStyle=color; ctx.lineWidth=2.5*(1-progress)+.5; ctx.beginPath(); ctx.arc(star.x,star.y,burstRadius,0,Math.PI*2); ctx.stroke();
        for(let ray=0;ray<14;ray+=1){const angle=ray/14*Math.PI*2;const length=18*(1-progress);ctx.globalAlpha=(1-progress)*.8;ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(star.x+Math.cos(angle)*radius,star.y+Math.sin(angle)*radius);ctx.lineTo(star.x+Math.cos(angle)*(radius+length),star.y+Math.sin(angle)*(radius+length));ctx.stroke();}
      }
    }
    ctx.restore(); ctx.globalAlpha=1; requestAnimationFrame(draw);
  }
  function findStar(x,y) { let found=null; let nearest=26; for(const star of stars){const distance=Math.hypot(x-star.x,y-star.y);if(distance<Math.max(nearest,star.radius+9)){found=star;nearest=distance;}} return found; }
  function setHover(event) {
    const rect=canvas.getBoundingClientRect(); const x=event.clientX-rect.left; const y=event.clientY-rect.top;
    pointer.x=x-width/2; pointer.y=y-height/2;
    const star=findStar(x,y); hovered=star; canvas.style.cursor=star?'pointer':'default';
    const tooltip=byId('star-tooltip');
    if(star){tooltip.textContent=`LORE #${star.entry.n||'?'} ? ${star.entry.title||'Untitled'}`;tooltip.style.display='block';tooltip.style.left=`${Math.min(width-260,x+18)}px`;tooltip.style.top=`${Math.max(42,y-14)}px`;}
    else tooltip.style.display='none';
  }
  function makeAvatar(user,className='') {
    const wrap=document.createElement('span');wrap.className=`avatar-wrap ${className}`;
    const image=document.createElement('img');image.alt='';image.loading='lazy';
    const avatar=typeof user?.avatar==='string'?user.avatar:'';
    image.onerror=()=>{image.remove();wrap.textContent=String(user?.display_name||user?.login||'?').charAt(0).toUpperCase();wrap.style.display='grid';wrap.style.placeItems='center';wrap.style.color='#fff1d2';wrap.style.fontWeight='700';};
    if(avatar){image.src=avatar;wrap.append(image);}else{wrap.textContent=String(user?.display_name||user?.login||'?').charAt(0).toUpperCase();wrap.style.display='grid';wrap.style.placeItems='center';wrap.style.color='#fff1d2';wrap.style.fontWeight='700';}
    return wrap;
  }
  function renderLeaderboard() {
    const list=byId('leaderboard-list');list.replaceChildren();
    if(!leaders.length){const li=document.createElement('li');li.className='loading-row';li.textContent='No Loremasters yet';list.append(li);return;}
    leaders.slice(0,8).forEach((user,index)=>{
      const row=document.createElement('li');row.className='leader-row';
      const rank=document.createElement('span');rank.className='leader-rank';rank.textContent=String(index+1);
      const avatar=makeAvatar(user);
      const name=document.createElement('span');name.className='leader-name';name.textContent=user.display_name||user.login||'Witness';
      const score=document.createElement('span');score.className='leader-score';score.textContent=`${Number(user.score)||0} pts`;
      if(index===0){const crown=document.createElement('span');crown.className='crown';crown.textContent='?';rank.replaceChildren(crown);}
      row.append(rank,avatar,name,score);list.append(row);
    });
  }
  function openRecord(entry,auto=false) {
    if(!entry)return;
    clearTimeout(cardTimer);
    byId('record-number').textContent=`LORE #${Number(entry.n)||'?'}`;
    byId('record-title').textContent=entry.title||'A Moment Remembered';
    byId('record-sigil').textContent=entry.sigil||'?';
    byId('record-date').textContent=new Date(entry.born_at||Date.now()).toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'});
    byId('record-story').textContent=entry.story||'This moment has not yet been written down.';
    byId('record-explainer').textContent=entry.explainer||'The community keeps this memory alive.';
    byId('record-uses').textContent=`${Number(entry.uses)||0} uses`;
    byId('record-initiates').textContent=`${Number(entry.initiates)||0} initiates`;
    byId('record-born').textContent=new Date(entry.born_at||Date.now()).toLocaleString();
    const witnesses=byId('record-witnesses');witnesses.replaceChildren();
    (entry.witnesses||[]).forEach(user=>{const item=document.createElement('div');item.className='witness';item.append(makeAvatar(user));const name=document.createElement('span');name.textContent=user.display_name||user.login||'Witness';item.append(name);witnesses.append(item);});
    const clipFrame=byId('clip-frame');clipFrame.querySelector('iframe')?.remove();
    const clipId=entry.clip?.id||entry.clip?.url?.match(/clips\.twitch\.tv\/([\w-]+)/)?.[1];
    byId('clip-placeholder').style.display='grid';
    if(clipId){const frame=document.createElement('iframe');frame.title='Preserved Twitch clip';frame.allow='autoplay; fullscreen';frame.src=`https://clips.twitch.tv/embed?clip=${encodeURIComponent(clipId)}&parent=${encodeURIComponent(location.hostname)}`;clipFrame.append(frame);byId('clip-placeholder').style.display='none';}
    const backdrop=byId('card-backdrop');const card=byId('lore-record');backdrop.style.display='block';card.style.display='block';backdrop.setAttribute('aria-hidden','false');card.setAttribute('aria-hidden','false');
    if(window.gsap){gsap.fromTo(backdrop,{opacity:0},{opacity:1,duration:.25});gsap.fromTo(card,{opacity:0,y:34,scale:.82},{opacity:1,y:0,scale:1,duration:.55,ease:'back.out(1.55)'});}else{backdrop.style.opacity='1';card.style.opacity='1';card.style.transform='translate(-50%,-50%) scale(1)';}
    byId('close-card').focus();
    if(auto)cardTimer=setTimeout(closeRecord,5000);
  }
  function closeRecord(){clearTimeout(cardTimer);const card=byId('lore-record');const backdrop=byId('card-backdrop');if(window.gsap){gsap.to(card,{opacity:0,scale:.9,y:18,duration:.23,onComplete:()=>{card.style.display='none';card.setAttribute('aria-hidden','true');}});gsap.to(backdrop,{opacity:0,duration:.23,onComplete:()=>{backdrop.style.display='none';backdrop.setAttribute('aria-hidden','true');}});}else{card.style.display='none';backdrop.style.display='none';card.setAttribute('aria-hidden','true');backdrop.setAttribute('aria-hidden','true');}}
  function clickStar(event){const rect=canvas.getBoundingClientRect();const star=findStar(event.clientX-rect.left,event.clientY-rect.top);if(star)openRecord(star.entry);}
  async function load() {
    const [healthResponse,loreResponse,leadersResponse]=await Promise.all([fetch('/api/health'),fetch('/api/lore'),fetch('/api/loremasters')]);
    const [health,entries,leaderboard]=await Promise.all([healthResponse.json(),loreResponse.json(),leadersResponse.json()]);
    const channel=String(health.login||'THE COMMUNITY').toUpperCase();document.title=`THE LORE OF ${channel}`;byId('page-title').textContent=`THE LORE OF ${channel}`;
    lore=Array.isArray(entries)?entries:[];leaders=Array.isArray(leaderboard)?leaderboard:[];layoutStars();renderLeaderboard();
  }
  function connect() {
    if(socket)return;
    const protocol=location.protocol==='https:'?'wss:':'ws:';
    socket=new WebSocket(`${protocol}//${location.host}/ws`);
    socket.addEventListener('message',event=>{
      let message;try{message=JSON.parse(event.data);}catch{return;}
      if(message.type==='canonized'){
        const entry=message.data;if(!entry)return;
        lore=lore.filter(item=>item.id!==entry.id);lore.push(entry);layoutStars();
        const star=stars.find(item=>item.entry.id===entry.id);if(star)star.burstUntil=performance.now()+1200;
        openRecord(entry,true);
      } else if(message.type==='lore_updated'){
        lore=lore.map(item=>item.id===message.data?.id?message.data:item);layoutStars();
      } else if(message.type==='initiation' && message.data?.lore){
        lore=lore.map(item=>item.id===message.data.lore.id?message.data.lore:item);layoutStars();
      } else if(message.type==='lore_deleted'){
        lore=lore.filter(item=>item.id!==message.data?.id);layoutStars();
      }
    });
    socket.addEventListener('close',()=>{socket=null;setTimeout(connect,reconnectDelay);reconnectDelay=Math.min(8000,reconnectDelay*1.7);});
    socket.addEventListener('open',()=>{reconnectDelay=800;});
  }
  byId('close-card').addEventListener('click',closeRecord);
  byId('card-backdrop').addEventListener('click',closeRecord);
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&byId('lore-record').style.display==='block')closeRecord();});
  window.addEventListener('resize',resize);canvas.addEventListener('pointermove',setHover);canvas.addEventListener('pointerleave',()=>{hovered=null;byId('star-tooltip').style.display='none';});canvas.addEventListener('click',clickStar);
  resize();requestAnimationFrame(draw);load().then(connect).catch(error=>{console.error('[codex] Archive load failed:',error);byId('empty-state').textContent='The archive could not be reached. Try refreshing the page.';});
})();
