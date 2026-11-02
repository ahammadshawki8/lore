(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const canvas = byId('sky-map');
  const ctx = canvas.getContext('2d');
  const stars = [];
  const rarityColors = { common: '#c9cdd6', rare: '#3ee6ff', epic: '#ff3ea5', legendary: '#f5c451' };
  let lore = [];
  let leaders = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let hovered = null;
  let activeFilter = 'all';
  let socket = null;
  let reconnectTimer = null;
  let reconnectDelay = 800;
  let previousFocus = null;
  const newIds = new Set();
  const now = () => Date.now();

  function hash(value) {
    let result = 2166136261;
    for (const character of String(value ?? '')) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
    return result >>> 0;
  }

  function birthTime(entry) {
    const parsed = new Date(entry.born_at || 0).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function rarityFor(entry) {
    const count = (entry.witnesses || []).length;
    return count >= 10 ? 'legendary' : count >= 7 ? 'epic' : count >= 4 ? 'rare' : 'common';
  }

  function isLiving(entry) {
    const usedAt = new Date(entry.last_used_at || 0).getTime();
    return usedAt > 0 && now() - usedAt <= 7 * 86400000;
  }

  function sizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    layoutStars();
  }

  function layoutStars() {
    const sorted = [...lore].sort((a, b) => birthTime(a) - birthTime(b));
    const padX = Math.min(92, Math.max(45, width * .09));
    const padY = Math.min(140, Math.max(105, height * .28));
    const rangeX = Math.max(1, width - padX * 2);
    const rangeY = Math.max(1, height - padY * 2);
    sorted.forEach((entry, index) => {
      let star = stars.find((item) => item.entry.id === entry.id);
      if (!star) {
        star = { entry, phase: Math.random() * Math.PI * 2, burstUntil: 0, bornAt: 0 };
        stars.push(star);
      }
      star.entry = entry;
      const seed = hash(entry.id || entry.title);
      const timePosition = sorted.length < 2 ? .5 : index / (sorted.length - 1);
      const scatterX = ((seed % 1000) / 1000 - .5) * Math.min(rangeX * .35, 170);
      const scatterY = (((seed >>> 10) % 1000) / 1000 - .5) * rangeY * .72;
      star.x = Math.min(width - padX, Math.max(padX, padX + timePosition * rangeX + scatterX));
      star.y = Math.min(height - padY, Math.max(padY, height / 2 + scatterY));
      star.radius = Math.min(45, 24 + Math.log1p(Math.max(0, Number(entry.uses) || 0)) * 4);
      star.color = rarityColors[rarityFor(entry)];
      star.sigil = String(entry.sigil || '✧').slice(0, 8);
    });
    for (let index = stars.length - 1; index >= 0; index -= 1) {
      if (!lore.some((entry) => entry.id === stars[index].entry.id)) stars.splice(index, 1);
    }
    byId('empty-state').style.display = lore.length ? 'none' : 'grid';
    updateStats();
  }

  function countUp(node, target, format = String) {
    const end = Number(target) || 0;
    const start = Number(node.dataset.value || 0);
    node.dataset.value = String(end);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      node.textContent = format(end);
      return;
    }
    const startTime = performance.now();
    const duration = 800;
    function tick(time) {
      const progress = Math.min(1, (time - startTime) / duration);
      const eased = 1 - (1 - progress) ** 3;
      node.textContent = format(Math.round(start + (end - start) * eased));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function updateStats() {
    countUp(byId('stat-lore'), lore.length);
    countUp(byId('stat-initiates'), lore.reduce((total, entry) => total + (Number(entry.initiates) || 0), 0));
    countUp(byId('stat-legendary'), lore.filter((entry) => rarityFor(entry) === 'legendary').length);
    const oldestLiving = lore.filter(isLiving).sort((a, b) => birthTime(a) - birthTime(b))[0];
    byId('stat-oldest').textContent = oldestLiving?.title || 'No living joke yet';
    const counts = { all: lore.length, legendary: 0, epic: 0, rare: 0, common: 0 };
    for (const entry of lore) counts[rarityFor(entry)] += 1;
    for (const [rarity, count] of Object.entries(counts)) byId(`count-${rarity}`).textContent = String(count);
  }

  function draw(time) {
    ctx.clearRect(0, 0, width, height);
    for (let index = 0; index < 70; index += 1) {
      const seed = (index * 7919) % 10007;
      ctx.globalAlpha = .12 + .16 * (1 + Math.sin(time * .0006 + index * 2.1));
      ctx.fillStyle = '#d9d8f1';
      ctx.beginPath();
      ctx.arc((seed % 997) / 997 * width, ((seed * 7) % 991) / 991 * height, index % 8 === 0 ? 1.1 : .55, 0, Math.PI * 2);
      ctx.fill();
    }
    const ordered = [...stars].sort((a, b) => birthTime(a.entry) - birthTime(b.entry));
    if (ordered.length > 1) {
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#f5c45128');
      gradient.addColorStop(.5, '#f5c451ad');
      gradient.addColorStop(1, '#3ee6ff30');
      ctx.globalAlpha = .8;
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 8]);
      ctx.lineDashOffset = -time * .018;
      ctx.beginPath();
      ordered.forEach((star, index) => index ? ctx.lineTo(star.x, star.y) : ctx.moveTo(star.x, star.y));
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const star of ordered) {
      const pulse = .94 + Math.sin(time * .0015 + star.phase) * .06;
      const radius = star.radius * pulse;
      const color = star.color;
      ctx.save();
      ctx.globalAlpha = .22 + .08 * Math.sin(time * .001 + star.phase);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 28;
      ctx.beginPath();
      ctx.arc(star.x, star.y, radius * 1.52, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = .98;
      ctx.shadowBlur = hovered === star ? 35 : 23;
      ctx.beginPath();
      ctx.arc(star.x, star.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#fff7df';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.max(16, radius * .82)}px serif`;
      ctx.fillText(star.sigil, star.x, star.y + 1, radius * 1.6);
      const fullTitle = String(star.entry.title || 'Untitled');
      const label = fullTitle.length > 24 ? `${fullTitle.slice(0, 23).trimEnd()}…` : fullTitle;
      ctx.font = '700 20px Inter, Arial, sans-serif';
      const labelWidth = Math.min(Math.max(ctx.measureText(label).width + 28, 120), Math.max(120, width * .24));
      const labelHeight = 40;
      const labelY = star.y + radius + 26;
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.roundRect(star.x - labelWidth / 2, labelY - labelHeight / 2, labelWidth, labelHeight, 12);
      ctx.fillStyle = 'rgba(14, 10, 28, .96)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, .18)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#f7f3ff';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, star.x, labelY, labelWidth - 20);
      ctx.restore();
      if (time < star.burstUntil) {
        const progress = 1 - (star.burstUntil - time) / 1250;
        ctx.globalAlpha = (1 - progress) * .8;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3 * (1 - progress) + .5;
        ctx.shadowColor = color;
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.arc(star.x, star.y, radius + progress * 92, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(draw);
  }

  function findStar(x, y) {
    let nearest = 34;
    let found = null;
    for (const star of stars) {
      const distance = Math.hypot(x - star.x, y - star.y);
      if (distance < Math.max(nearest, star.radius + 10)) {
        nearest = distance;
        found = star;
      }
    }
    return found;
  }

  function showTooltip(star, x, y) {
    const tooltip = byId('star-tooltip');
    if (!star) {
      tooltip.style.display = 'none';
      return;
    }
    tooltip.textContent = `LORE #${Number(star.entry.n) || '?'} · ${star.entry.title || 'Untitled'}`;
    tooltip.style.display = 'block';
    tooltip.style.left = `${Math.max(8, Math.min(width - 250, x + 16))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(height - 40, y - 12))}px`;
  }

  function imageOrInitial(user, className = 'card-witness-avatar') {
    const wrap = document.createElement('span');
    wrap.className = className;
    const name = String(user?.display_name || user?.login || 'Witness');
    const avatar = typeof user?.avatar === 'string' ? user.avatar : '';
    if (avatar) {
      const image = document.createElement('img');
      image.alt = '';
      image.loading = 'lazy';
      image.src = avatar;
      image.addEventListener('error', () => image.replaceWith(initial(name)), { once: true });
      wrap.append(image);
    } else {
      wrap.append(initial(name));
    }
    return wrap;
  }

  function initial(name) {
    const span = document.createElement('span');
    span.textContent = name.charAt(0).toUpperCase() || '?';
    return span;
  }

  function makeCard(entry, { modal = false, isNew = false } = {}) {
    const rarity = rarityFor(entry);
    const card = document.createElement('article');
    card.className = `lore-card ${rarity}${isNew ? ' new-card' : ''}`;
    card.dataset.id = String(entry.id ?? '');
    card.tabIndex = modal ? -1 : 0;
    card.setAttribute('role', modal ? 'group' : 'button');
    if (!modal) card.setAttribute('aria-label', `Open LORE number ${Number(entry.n) || ''}, ${entry.title || 'Untitled'}`);

    const edge = document.createElement('div'); edge.className = 'card-edge';
    const meta = document.createElement('header'); meta.className = 'card-meta';
    const number = document.createElement('span'); number.textContent = `LORE #${Number(entry.n) || '?'}`;
    const date = document.createElement('time'); date.textContent = new Date(birthTime(entry) || now()).toLocaleDateString();
    meta.append(number, date);
    const art = document.createElement('div'); art.className = 'card-art';
    const sigil = document.createElement('span'); sigil.className = 'sigil-art'; sigil.textContent = entry.sigil || '✧';
    const caption = document.createElement('span'); caption.className = 'art-caption'; caption.textContent = 'A MOMENT PRESERVED'; art.append(sigil, caption);
    const ribbon = document.createElement('div'); ribbon.className = 'card-ribbon';
    const title = document.createElement('h3');
    const titleWords = String(entry.title || 'A Moment Remembered').trim().split(/\s+/);
    title.textContent = `${titleWords.slice(0, 5).join(' ')}${titleWords.length > 5 ? '…' : ''}`;
    ribbon.append(title);
    const copy = document.createElement('div'); copy.className = 'card-copy';
    const story = document.createElement('p'); story.className = 'card-story'; story.textContent = entry.story || 'This moment has not yet been written down.';
    const explainer = document.createElement('p'); explainer.className = 'card-explainer'; explainer.textContent = entry.explainer || '';
    copy.append(story, explainer);
    const witnessTitle = document.createElement('div'); witnessTitle.className = 'card-witness-title'; witnessTitle.textContent = `WITNESSES ${(entry.witnesses || []).length}`;
    const witnesses = document.createElement('div'); witnesses.className = 'card-witnesses';
    const witnessList = entry.witnesses || [];
    witnessList.slice(0, 7).forEach((user) => witnesses.append(imageOrInitial(user)));
    if (witnessList.length > 7) {
      const overflow = document.createElement('span');
      overflow.className = 'card-witness-avatar witness-overflow';
      overflow.textContent = `+${witnessList.length - 7}`;
      witnesses.append(overflow);
    }
    const foil = document.createElement('div'); foil.className = 'card-foil';
    const footer = document.createElement('footer'); footer.className = 'card-footer';
    const rarityLabel = document.createElement('span'); rarityLabel.textContent = rarity.toUpperCase();
    const channel = document.createElement('span'); channel.textContent = `THE LORE OF ${String(entry.channel || 'THIS CHANNEL').toUpperCase()}`;
    footer.append(rarityLabel, channel);
    card.append(edge, meta, art, ribbon, copy, witnessTitle, witnesses, foil, footer);
    if (isNew) { const fresh = document.createElement('span'); fresh.className = 'new-ribbon'; fresh.textContent = 'NEW!'; card.append(fresh); }
    if (!modal) {
      card.addEventListener('click', () => openRecord(entry, card));
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openRecord(entry, card); }
      });
      card.addEventListener('pointermove', (event) => {
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const rect = card.getBoundingClientRect();
        const x = (event.clientX - rect.left) / rect.width;
        const y = (event.clientY - rect.top) / rect.height;
        card.style.transform = `perspective(900px) rotateX(${(0.5 - y) * 9}deg) rotateY(${(x - 0.5) * 11}deg) translateY(-5px)`;
        card.style.setProperty('--foil-x', `${x * 100}%`);
      });
      card.addEventListener('pointerleave', () => { card.style.transform = ''; });
    }
    return card;
  }

  function renderCollection() {
    const container = byId('card-collection');
    const visible = lore.filter((entry) => activeFilter === 'all' || rarityFor(entry) === activeFilter)
      .sort((a, b) => birthTime(b) - birthTime(a));
    container.replaceChildren();
    if (!visible.length) {
      const empty = document.createElement('div'); empty.className = 'collection-empty';
      empty.textContent = lore.length ? 'No cards in this rarity yet.' : 'The first LORE card is waiting to be written.';
      container.append(empty);
      return;
    }
    for (const entry of visible) {
      const isNew = newIds.has(entry.id);
      container.append(makeCard(entry, { isNew }));
      if (isNew) setTimeout(() => newIds.delete(entry.id), 1800);
    }
  }

  function rankCrown(index) {
    const palette = index === 0 ? ['#fff2a6', '#f5c451', '#a86c17'] : index === 1 ? ['#ffffff', '#c9d3e0', '#68798d'] : ['#ffd6ac', '#c6814e', '#75401f'];
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 32 26'); svg.setAttribute('class', 'rank-crown'); svg.setAttribute('aria-label', `${['Gold', 'Silver', 'Bronze'][index]} rank`);
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
    gradient.id = `crown-${index}`; gradient.setAttribute('x1', '0'); gradient.setAttribute('y1', '0'); gradient.setAttribute('x2', '0'); gradient.setAttribute('y2', '1');
    palette.forEach((color, stopIndex) => { const stop = document.createElementNS('http://www.w3.org/2000/svg', 'stop'); stop.setAttribute('offset', `${stopIndex * 50}%`); stop.setAttribute('stop-color', color); gradient.append(stop); });
    defs.append(gradient);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M2 5l7 6 7-9 7 9 7-6-3 17H5L2 5z'); path.setAttribute('fill', `url(#${gradient.id})`); path.setAttribute('stroke', palette[2]); path.setAttribute('stroke-width', '1.2');
    svg.append(defs, path);
    return svg;
  }

  function renderLeaderboard() {
    const list = byId('leaderboard-list');
    list.replaceChildren();
    if (!leaders.length) {
      const item = document.createElement('li'); item.className = 'loading-row'; item.textContent = 'No Loremasters yet'; list.append(item); return;
    }
    leaders.slice(0, 8).forEach((user, index) => {
      const row = document.createElement('li'); row.className = 'leader-row';
      const rank = document.createElement('span'); rank.className = 'leader-rank'; rank.textContent = String(index + 1);
      if (index < 3) rank.replaceChildren(rankCrown(index));
      const avatar = imageOrInitial(user, 'avatar-wrap');
      const name = document.createElement('span'); name.className = 'leader-name'; name.textContent = user.display_name || user.login || 'Witness';
      const score = document.createElement('span'); score.className = 'leader-score'; score.textContent = `${Number(user.score) || 0} pts`;
      row.append(rank, avatar, name, score); list.append(row);
    });
  }

  function showClip(entry) {
    const frame = byId('clip-frame');
    frame.querySelector('iframe')?.remove();
    const clipId = entry.clip?.id || entry.clip?.url?.match(/clips\.twitch\.tv\/([\w-]+)/)?.[1];
    byId('clip-placeholder').style.display = 'grid';
    if (!clipId) return;
    const iframe = document.createElement('iframe');
    iframe.title = 'Preserved Twitch clip'; iframe.allow = 'autoplay; fullscreen';
    iframe.src = `https://clips.twitch.tv/embed?clip=${encodeURIComponent(clipId)}&parent=${encodeURIComponent(location.hostname)}`;
    frame.append(iframe); byId('clip-placeholder').style.display = 'none';
  }

  function openRecord(entry, source = null) {
    if (!entry) return;
    previousFocus = source || document.activeElement;
    byId('record-number').textContent = `COMMUNITY CANON · LORE #${Number(entry.n) || '?'}`;
    byId('record-title').textContent = entry.title || 'A Moment Remembered';
    byId('record-story').textContent = entry.story || 'This moment has not yet been written down.';
    byId('record-explainer').textContent = entry.explainer || 'The community keeps this memory alive.';
    byId('record-uses').textContent = `${Number(entry.uses) || 0} uses`;
    byId('record-initiates').textContent = `${Number(entry.initiates) || 0} initiates`;
    byId('record-born').textContent = new Date(birthTime(entry) || now()).toLocaleString();
    const witnesses = byId('record-witnesses'); witnesses.replaceChildren();
    (entry.witnesses || []).forEach((user) => {
      const item = document.createElement('div'); item.className = 'witness'; item.append(imageOrInitial(user, 'avatar-wrap'));
      const name = document.createElement('span'); name.textContent = user.display_name || user.login || 'Witness'; item.append(name); witnesses.append(item);
    });
    showClip(entry);
    const slot = byId('modal-card-slot'); slot.replaceChildren(makeCard(entry, { modal: true }));
    const backdrop = byId('card-backdrop'); const modal = byId('lore-record');
    backdrop.style.display = 'block'; backdrop.setAttribute('aria-hidden', 'false');
    modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
    if (window.gsap) {
      gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: .25 });
      gsap.fromTo(modal, { opacity: 0, y: 28, scale: .96 }, { opacity: 1, y: 0, scale: 1, duration: .38, ease: 'power2.out' });
    }
    byId('close-card').focus();
  }

  function closeRecord() {
    const modal = byId('lore-record'); const backdrop = byId('card-backdrop');
    if (!modal.classList.contains('open')) return;
    const hide = () => { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); backdrop.style.display = 'none'; backdrop.setAttribute('aria-hidden', 'true'); };
    if (window.gsap) {
      gsap.to(modal, { opacity: 0, y: 18, scale: .97, duration: .2, onComplete: hide });
      gsap.to(backdrop, { opacity: 0, duration: .2 });
    } else hide();
    previousFocus?.focus?.();
  }

  function updateEntry(entry) {
    if (!entry?.id) return;
    const found = lore.some((item) => item.id === entry.id);
    lore = lore.filter((item) => item.id !== entry.id);
    lore.push(entry);
    if (!found) newIds.add(entry.id);
    layoutStars(); renderCollection();
    const star = stars.find((item) => item.entry.id === entry.id);
    if (star && !found) star.burstUntil = performance.now() + 1250;
    if (!found) {
      const card = byId('card-collection').querySelector(`[data-id="${CSS.escape(String(entry.id))}"]`);
      card?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  async function load() {
    const [healthResponse, loreResponse, leadersResponse] = await Promise.all([fetch('/api/health'), fetch('/api/lore'), fetch('/api/loremasters')]);
    if (!healthResponse.ok || !loreResponse.ok || !leadersResponse.ok) throw new Error('Archive service returned an error');
    const [health, entries, leaderboard] = await Promise.all([healthResponse.json(), loreResponse.json(), leadersResponse.json()]);
    const channel = String(health.login || 'THE COMMUNITY').toUpperCase();
    document.title = `THE LORE OF ${channel}`; byId('page-title').textContent = `THE LORE OF ${channel}`;
    lore = Array.isArray(entries) ? entries : []; leaders = Array.isArray(leaderboard) ? leaderboard : [];
    layoutStars(); renderCollection(); renderLeaderboard();
  }

  function connect() {
    if (socket || !navigator.onLine) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const candidate = new WebSocket(`${protocol}//${location.host}/ws`);
    socket = candidate;
    candidate.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message.type === 'canonized') updateEntry(message.data);
      else if (message.type === 'lore_updated' || message.type === 'initiation') {
        const entry = message.data?.lore || message.data;
        if (!entry?.id) return;
        lore = lore.map((item) => item.id === entry.id ? entry : item);
        layoutStars(); renderCollection();
      } else if (message.type === 'lore_deleted') {
        lore = lore.filter((item) => item.id !== message.data?.id); layoutStars(); renderCollection();
      } else if (message.type === 'leaderboard') {
        leaders = Array.isArray(message.data) ? message.data : leaders; renderLeaderboard();
      }
    });
    candidate.addEventListener('open', () => { reconnectDelay = 800; clearTimeout(reconnectTimer); reconnectTimer = null; });
    candidate.addEventListener('close', () => {
      if (socket !== candidate) return;
      socket = null;
      reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, reconnectDelay + Math.random() * 400);
      reconnectDelay = Math.min(10000, reconnectDelay * 1.7);
    });
    candidate.addEventListener('error', () => candidate.close());
  }

  byId('filter-chips').addEventListener('click', (event) => {
    const button = event.target.closest('[data-filter]');
    if (!button) return;
    activeFilter = button.dataset.filter;
    byId('filter-chips').querySelectorAll('.filter-chip').forEach((chip) => chip.classList.toggle('active', chip === button));
    renderCollection();
  });
  byId('close-card').addEventListener('click', closeRecord);
  byId('card-backdrop').addEventListener('click', closeRecord);
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeRecord(); });
  window.addEventListener('resize', sizeCanvas);
  window.addEventListener('online', connect);
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left; const y = event.clientY - rect.top;
    hovered = findStar(x, y); canvas.style.cursor = hovered ? 'pointer' : 'default'; showTooltip(hovered, x, y);
  });
  canvas.addEventListener('pointerleave', () => { hovered = null; canvas.style.cursor = 'default'; showTooltip(null); });
  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect(); const star = findStar(event.clientX - rect.left, event.clientY - rect.top);
    if (star) openRecord(star.entry, canvas);
  });
  sizeCanvas(); requestAnimationFrame(draw);
  load().then(connect).catch((error) => {
    console.error('[codex] Archive load failed:', error);
    byId('empty-state').textContent = 'The archive could not be reached. Try refreshing the page.';
  });
})();
