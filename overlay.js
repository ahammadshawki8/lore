(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const sceneLayer = byId('scene-layer');
  const overlay = byId('overlay');
  const query = new URLSearchParams(location.search);
  const demoMode = query.get('demo') === '1';
  const sceneChoices = new Set(['summon', 'fizzle', 'decipher', 'vote', 'canonized', 'initiation', 'trial', 'raid', 'recall']);
  const sceneOnly = sceneChoices.has(query.get('scene')) ? query.get('scene') : null;
  const sceneHoldMode = Boolean(sceneOnly);
  const runeGlyphs = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ', 'ᛇ', 'ᛈ', 'ᛉ', 'ᛊ'];
  const scrollGlyphs = [...runeGlyphs, '✦', '✧', '◈', '☼'];
  const motion = window.gsap;
  let activeScene = null;
  let sceneQueue = [];
  let lastTitles = [];
  let latestTrial = null;
  let latestTrialCounts = [0, 0, 0, 0];
  let socket = null;
  let reconnectDelay = 500;
  let reconnectTimer = null;
  let heartbeatStop = null;
  let scrambleInterval = null;
  let chipHideTimer = null;
  let demoStopped = false;
  let demoSummonSeen = false;
  let pressureData = { phrase: '', value: 0 };
  const sceneDemoTimers = [];
  const raidTimers = [];
  let countdownTimer = null;
  let recallHideTimer = null;
  let currentVoteLeader = null;
  let hitStopTimer = null;
  let collectionCount = 0;
  let lastCountdownSecond = null;

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
  const avatarSeed = (user) => String(user?.login || user?.display_name || 'witness');
  const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

  function safeTween(target, vars) {
    if (motion) return motion.to(target, vars);
    if (vars.opacity !== undefined) target.style.opacity = vars.opacity;
    if (vars.onComplete) setTimeout(vars.onComplete, (vars.duration || 0) * 1000);
    return null;
  }

  function svgRuneRing(centerX, centerY, radius, count, className, rotate = 0) {
    return Array.from({ length: count }, (_, index) => {
      const angle = (index / count) * Math.PI * 2 - Math.PI / 2 + rotate;
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      return `<text class="${className}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" transform="rotate(${(angle * 180 / Math.PI + 90).toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})">${runeGlyphs[index % runeGlyphs.length]}</text>`;
    }).join('');
  }

  const runeRing = (radius, count, className, rotate = 0) => svgRuneRing(100, 100, radius, count, className, rotate);

  function initPressure() {
    const svg = byId('pressure-svg');
    svg.innerHTML = `<circle class="pressure-track" cx="100" cy="100" r="72"></circle><circle id="pressure-progress" class="pressure-fill" cx="100" cy="100" r="72"></circle><g id="pressure-rune-ring">${runeRing(88, 12, 'pressure-rune')}</g>`;
    const progress = byId('pressure-progress');
    progress.style.strokeDasharray = '452.4';
    progress.style.strokeDashoffset = '452.4';
  }

  function syncPressureVisibility() {
    const amount = Math.max(0, Math.min(1, Number(pressureData.value) || 0));
    const root = byId('pressure');
    const progress = byId('pressure-progress');
    byId('pressure-phrase').textContent = String(pressureData.phrase || 'lore stirs').slice(0, 28);
    root.classList.toggle('is-surging', amount > .7);
    const hidden = Boolean(activeScene) || (demoMode && demoSummonSeen);
    if (amount <= 0 || hidden) {
      if (heartbeatStop) heartbeatStop();
      heartbeatStop = null;
      safeTween(root, { opacity: 0, y: 24, scale: .92, duration: .45, ease: 'power2.in' });
      if (amount <= 0) safeTween(progress, { strokeDashoffset: 452.4, duration: .5, ease: 'power2.out' });
      return;
    }
    safeTween(root, { opacity: 1, y: 0, scale: 1 + amount * .06, filter: `drop-shadow(0 0 ${12 + amount * 24}px rgba(145,70,255,${.3 + amount * .4}))`, duration: .45, ease: 'back.out(1.7)' });
    safeTween(progress, { strokeDashoffset: 452.4 * (1 - amount), duration: .5, ease: 'power2.out' });
    if (amount > .7 && !heartbeatStop) heartbeatStop = sound.heartbeat();
    if (amount <= .7 && heartbeatStop) {
      heartbeatStop();
      heartbeatStop = null;
    }
  }

  function setPressure(data = {}) {
    pressureData = { phrase: String(data.phrase || ''), value: Math.max(0, Math.min(1, Number(data.value) || 0)) };
    syncPressureVisibility();
  }

  class ParticleSystem {
    constructor(canvas) {
      this.canvas = canvas;
      this.context = canvas.getContext('2d');
      this.particles = [];
      this.width = 0;
      this.height = 0;
      this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      this.resize();
      window.addEventListener('resize', () => this.resize());
      this.seedMotes();
      requestAnimationFrame((time) => this.frame(time));
    }
    resize() {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.context.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
    seedMotes() {
      for (let index = 0; index < 50; index += 1) {
        this.add({ kind: 'mote', x: Math.random() * this.width, y: Math.random() * this.height, vx: (Math.random() - .5) * .18, vy: -.1 - Math.random() * .3, life: 5000 + Math.random() * 9000, size: .5 + Math.random() * 1.8, alpha: .12 + Math.random() * .3 });
      }
    }
    add(particle) {
      this.particles.push({ age: 0, ...particle });
      if (this.particles.length > 150) this.particles.splice(0, this.particles.length - 150);
    }
    burst(x, y, kind = 'spark', count = 24, color) {
      for (let index = 0; index < count; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = kind === 'smoke' ? 18 + Math.random() * 55 : 55 + Math.random() * 230;
        this.add({
          kind, x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - (kind === 'ember' ? 55 : 0),
          life: kind === 'smoke' ? 900 + Math.random() * 1200 : 450 + Math.random() * 900,
          size: kind === 'smoke' ? 9 + Math.random() * 24 : (kind === 'confetti' ? 4 + Math.random() * 6 : 1.5 + Math.random() * 4),
          rotation: Math.random() * Math.PI, spin: (Math.random() - .5) * 9,
          alpha: .55 + Math.random() * .4, color,
        });
      }
    }
    rain(x, y, count = 28) {
      for (let index = 0; index < count; index += 1) {
        this.add({ kind: 'ember', x: x + (Math.random() - .5) * 700, y: y - Math.random() * 280, vx: (Math.random() - .5) * 65, vy: 60 + Math.random() * 170, life: 1500 + Math.random() * 1100, size: 2 + Math.random() * 4, alpha: .8 });
      }
    }
    frame(time) {
      const ctx = this.context;
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let index = this.particles.length - 1; index >= 0; index -= 1) {
        const particle = this.particles[index];
        const delta = particle.lastTime ? Math.min(40, time - particle.lastTime) / 1000 : 0;
        particle.lastTime = time;
        particle.age += delta * 1000;
        if (particle.age >= particle.life) {
          if (particle.kind === 'mote') {
            particle.age = 0;
            particle.x = Math.random() * this.width;
            particle.y = this.height + 8;
          } else {
            this.particles.splice(index, 1);
            continue;
          }
        }
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.rotation = (particle.rotation || 0) + (particle.spin || 0) * delta;
        if (particle.kind === 'confetti' || particle.kind === 'coin') particle.vy += 210 * delta;
        if (particle.kind === 'mote' && particle.y < -8) particle.y = this.height + 8;
        const progress = particle.age / particle.life;
        const fade = Math.min(1, progress * 5, (1 - progress) * 2.4);
        const alpha = particle.alpha * fade;
        if (particle.kind === 'smoke') {
          const radius = particle.size * (1 + progress * 1.5);
          const gradient = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, radius);
          gradient.addColorStop(0, `rgba(189,177,173,${alpha * .28})`);
          gradient.addColorStop(1, 'rgba(100,94,101,0)');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
          ctx.fill();
        } else if (particle.kind === 'confetti' || particle.kind === 'coin') {
          const color = particle.color || (particle.kind === 'coin' ? '#f5c451' : ['#ff3ea5', '#3ee6ff', '#b6ff3e', '#f5c451'][index % 4]);
          ctx.save(); ctx.translate(particle.x, particle.y); ctx.rotate(particle.rotation); ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10;
          if (particle.kind === 'coin') { ctx.beginPath(); ctx.ellipse(0, 0, particle.size, particle.size * .72, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff0a6'; ctx.lineWidth = 1; ctx.stroke(); }
          else ctx.fillRect(-particle.size / 2, -particle.size, particle.size, particle.size * 1.7);
          ctx.restore();
        } else {
          const color = particle.color || (particle.kind === 'ember' ? '#ff6b36' : particle.kind === 'mote' ? '#f5c451' : '#ffe9a6');
          ctx.globalAlpha = alpha;
          ctx.fillStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = particle.kind === 'mote' ? 5 : 13;
          ctx.beginPath();
          ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      requestAnimationFrame((next) => this.frame(next));
    }
  }

  class Synth {
    constructor() {
      this.context = null;
      this.master = null;
      this.enabled = false;
    }
    async enable() {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!this.context) {
        this.context = new Audio();
        this.master = this.context.createGain();
        this.master.gain.value = .6;
        this.master.connect(this.context.destination);
      }
      await this.context.resume();
      this.enabled = true;
      this.chime();
    }
    gainEnvelope(gain, start, peak, duration, decay = .5) {
      const now = this.context.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(start, now);
      gain.gain.linearRampToValueAtTime(peak, now + .02);
      gain.gain.exponentialRampToValueAtTime(.001, now + duration * decay);
    }
    tone(frequency, endFrequency, duration, type = 'sine', volume = .2) {
      if (!this.enabled) return;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, this.context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), this.context.currentTime + duration);
      this.gainEnvelope(gain, .0001, volume, duration, 1);
      oscillator.connect(gain).connect(this.master);
      oscillator.start();
      oscillator.stop(this.context.currentTime + duration + .04);
    }
    noise(duration, filterType, startFrequency, endFrequency, volume, center = 0) {
      if (!this.enabled) return;
      const length = Math.max(1, Math.floor(this.context.sampleRate * duration));
      const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let index = 0; index < length; index += 1) samples[index] = Math.random() * 2 - 1;
      const source = this.context.createBufferSource();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      source.buffer = buffer;
      filter.type = filterType;
      filter.frequency.setValueAtTime(startFrequency, this.context.currentTime);
      filter.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), this.context.currentTime + duration);
      if (center) filter.Q.value = center;
      this.gainEnvelope(gain, .0001, volume, duration, .8);
      source.connect(filter).connect(gain).connect(this.master);
      source.start();
      source.stop(this.context.currentTime + duration + .02);
    }
    riser() { this.tone(75, 520, 1.75, 'sawtooth', .16); this.noise(1.35, 'bandpass', 180, 4200, .12, .7); }
    tick() { this.tone(940, 720, .055, 'square', .075); }
    drumroll() { for (let index = 0; index < 9; index += 1) setTimeout(() => this.noise(.09, 'highpass', 900, 1800, .065), index * 62); }
    boom() {
      this.tone(120, 30, .8, 'sine', .65);
      this.noise(.32, 'lowpass', 900, 90, .26);
    }
    chime() {
      if (!this.enabled) return;
      [587.33, 880, 1174.66].forEach((frequency, index) => this.tone(frequency, frequency * .98, 1.15 + index * .18, 'sine', .14 / (index + 1)));
    }
    whoosh() { this.noise(.9, 'bandpass', 280, 5200, .32, .6); }
    heartbeat() {
      if (!this.enabled) return () => {};
      const oscillator = this.context.createOscillator();
      const lfo = this.context.createOscillator();
      const lfoGain = this.context.createGain();
      const gain = this.context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 48;
      gain.gain.value = .025;
      lfo.frequency.value = 1.25;
      lfoGain.gain.value = .02;
      lfo.connect(lfoGain).connect(gain.gain);
      oscillator.connect(gain).connect(this.master);
      oscillator.start();
      lfo.start();
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        const now = this.context.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setTargetAtTime(.0001, now, .12);
        oscillator.stop(now + .45);
        lfo.stop(now + .45);
      };
    }
    stamp() {
      this.tone(75, 34, .28, 'sine', .58);
      this.noise(.14, 'lowpass', 600, 100, .38);
    }
    pageFlip() { this.noise(.36, 'bandpass', 1500, 450, .22, 1.2); }
  }

  const particles = new ParticleSystem(byId('particle-canvas'));
  const sound = new Synth();
  initPressure();
  if (query.get('bg') === '1') {
    const preview = byId('stage-preview');
    preview.src = 'stage.html';
    preview.hidden = false;
  }
  if (query.get('sound') === '1') {
    const button = byId('sound-enable');
    button.style.display = 'block';
    button.addEventListener('click', async () => {
      await sound.enable();
      button.style.display = 'none';
    }, { once: true });
  }

  function imageTag(user, className = '') {
    const name = user?.display_name || user?.login || 'witness';
    let hash = 0;
    for (const character of avatarSeed(user)) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    const hue = hash % 360;
    const initial = escapeHtml(name.trim().charAt(0).toUpperCase() || 'W');
    return `<span class="avatar-orb ${className}" role="img" aria-label="${escapeHtml(name)}" style="--avatar-hue:${hue}"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="47"/><path d="M17 91c3-22 15-33 33-33s30 11 33 33"/><circle cx="50" cy="37" r="18"/><text x="50" y="94">${initial}</text></svg></span>`;
  }

  function hitStopImpact(color = '#f5c451', x = window.innerWidth / 2, y = window.innerHeight / 2) {
    if (motion) {
      motion.globalTimeline.timeScale(0);
      if (hitStopTimer) clearTimeout(hitStopTimer);
      hitStopTimer = setTimeout(() => motion.globalTimeline.timeScale(1), 72);
    }
    const shock = byId('shockwave');
    shock.style.left = `${x}px`; shock.style.top = `${y}px`; shock.style.borderColor = color; shock.style.filter = `drop-shadow(0 0 20px ${color})`;
    if (motion) {
      motion.fromTo(shock, { opacity: .95, scale: .08 }, { opacity: 0, scale: 8, duration: .62, ease: 'power2.out', overwrite: true });
      motion.fromTo(byId('chromatic-flash'), { opacity: .72 }, { opacity: 0, duration: .34, ease: 'power2.out', overwrite: true });
      motion.fromTo(byId('flash'), { opacity: .72 }, { opacity: 0, duration: .23, ease: 'power2.out', overwrite: true });
      motion.to(sceneLayer, { x: 7, y: -5, duration: .04, yoyo: true, repeat: 6, overwrite: true });
    }
    particles.burst(x, y, 'spark', 28, color);
  }

  function setSceneMarkup(className, markup) {
    sceneLayer.innerHTML = `<div class="scene ${className}">${markup}</div>`;
    if (motion) motion.set(sceneLayer, { opacity: 1, x: 0, y: 0, scale: 1 });
    else sceneLayer.style.opacity = '1';
    return sceneLayer.firstElementChild;
  }

  function makeCountdown(id, label = '⌛') {
    return `<svg class="countdown" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="50"></circle><circle class="countdown-progress" id="${id}" cx="60" cy="60" r="50"></circle><text x="60" y="60">${label}</text></svg>`;
  }

  function runCountdown(progress, endsAt, durationFallback = 20) {
    if (!progress) return;
    const circumference = 314.2;
    const candidateEnd = endsAt ? new Date(endsAt).getTime() : Date.now() + durationFallback * 1000;
    const end = Number.isFinite(candidateEnd) ? candidateEnd : Date.now() + durationFallback * 1000;
    const remaining = Math.max(0, end - Date.now());
    if (remaining <= 0) {
      progress.style.strokeDashoffset = String(circumference);
      const text = progress.parentElement?.querySelector('text');
      if (text) text.textContent = '0';
      return;
    }
    if (motion) motion.to(progress, { strokeDashoffset: circumference, duration: remaining / 1000, ease: 'none' });
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      const seconds = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      const text = progress.parentElement?.querySelector('text');
      if (text) text.textContent = `${seconds}`;
      const finalNode = byId('final-countdown');
      if (finalNode) { finalNode.textContent = seconds <= 5 && seconds > 0 ? String(seconds) : ''; finalNode.classList.toggle('is-live', seconds <= 5 && seconds > 0); if (seconds <= 5 && seconds > 0 && seconds !== lastCountdownSecond) { lastCountdownSecond = seconds; sound.tick(); if (motion) motion.fromTo(finalNode, { scale: 1.55, opacity: .4 }, { scale: 1, opacity: 1, duration: .24, ease: 'back.out(2)' }); } }
      if (seconds <= 0) clearInterval(countdownTimer);
    }, 250);
  }

  function runBarCountdown(bar, endsAt, durationFallback = 20) {
    if (!bar) return;
    const candidateEnd = endsAt ? new Date(endsAt).getTime() : Date.now() + durationFallback * 1000;
    const remaining = Math.max(.2, (Number.isFinite(candidateEnd) ? candidateEnd : Date.now() + durationFallback * 1000) - Date.now());
    if (motion) motion.to(bar, { scaleX: 0, duration: remaining / 1000, ease: 'none' });
    else {
      bar.style.transition = `transform ${remaining}ms linear`;
      requestAnimationFrame(() => { bar.style.transform = 'scaleX(0)'; });
    }
  }

  function addCleanup(cleanup) {
    if (activeScene) activeScene.cleanups.push(cleanup);
  }

  function finishActive() {
    const scene = activeScene;
    if (!scene || scene.finishing) return;
    scene.finishing = true;
    if (scene.safetyTimer) clearTimeout(scene.safetyTimer);
    if (countdownTimer) clearInterval(countdownTimer);
    countdownTimer = null;
    for (const cleanup of scene.cleanups) cleanup();
    if (motion) {
      motion.killTweensOf(sceneLayer);
      motion.to(sceneLayer, { opacity: 0, duration: .32, ease: 'power2.in', onComplete: () => {
        if (activeScene !== scene) return;
        sceneLayer.innerHTML = '';
        activeScene = null;
        runQueue();
      } });
    } else {
      sceneLayer.style.opacity = '0';
      sceneLayer.innerHTML = '';
      activeScene = null;
      runQueue();
    }
  }

  function enqueue(type, data) {
    if (type === 'pressure') {
      setPressure(data);
      return;
    }
    if (type === 'summon' && activeScene?.type === 'summon') {
      updateSummon(data);
      return;
    }
    if (type === 'vote_tally' && activeScene?.type === 'vote_open') {
      updateVoteTally(data.counts || []);
      return;
    }
    if (type === 'vote_tally') return;
    if (type === 'trial_tally' && activeScene?.type === 'trial_open') {
      latestTrialCounts = data.counts || latestTrialCounts;
      updateTrialTally(latestTrialCounts);
      return;
    }
    if (type === 'trial_tally') return;
    if (!['summon', 'fizzle', 'decipher', 'vote_open', 'canonized', 'initiation', 'trial_open', 'trial_result'].includes(type)) return;
    if (type === 'decipher' && activeScene?.type === 'summon') {
      sceneQueue.push({ type, data });
      finishActive();
      return;
    }
    if (type === 'fizzle' && activeScene?.type === 'summon') {
      sceneQueue.push({ type, data });
      finishActive();
      return;
    }
    if (type === 'canonized' && activeScene?.type === 'vote_open') {
      sceneQueue.push({ type, data });
      finishActive();
      return;
    }
    if (type === 'trial_result' && activeScene?.type === 'trial_open') {
      sceneQueue.push({ type, data: { ...data, trial: latestTrial, counts: latestTrialCounts } });
      finishActive();
      return;
    }
    if (type === 'vote_open') lastTitles = data.titles || [];
    if (type === 'trial_open') {
      latestTrial = data;
      latestTrialCounts = [0, 0, 0, 0];
    }
    sceneQueue.push({ type, data });
    runQueue();
  }

  function runQueue() {
    if (activeScene) return;
    if (!sceneQueue.length) {
      syncPressureVisibility();
      return;
    }
    const item = sceneQueue.shift();
    const scene = { type: item.type, cleanups: [], finishing: false };
    activeScene = scene;
    if (demoMode && item.type === 'summon') demoSummonSeen = true;
    syncPressureVisibility();
    const complete = () => {
      if (activeScene !== scene) return;
      if (sceneHoldMode) {
        scene.finalFrame = true;
        if (scene.safetyTimer) clearTimeout(scene.safetyTimer);
        return;
      }
      finishActive();
    };
    const deadline = item.data?.endsAt ? new Date(item.data.endsAt).getTime() : NaN;
    const remaining = Number.isFinite(deadline) ? Math.max(0, deadline - Date.now()) : 0;
    const persistent = ['summon', 'vote_open', 'trial_open'].includes(item.type);
    const safetyMs = persistent ? Math.min(30_000, Math.max(15_000, remaining + 5000)) : 15_000;
    if (!sceneHoldMode) {
      scene.safetyTimer = setTimeout(() => {
        if (activeScene === scene) finishActive();
      }, safetyMs);
    }
    switch (item.type) {
      case 'summon': renderSummon(item.data, scene, complete); break;
      case 'fizzle': renderFizzle(item.data, scene, complete); break;
      case 'decipher': renderDecipher(item.data, scene, complete); break;
      case 'vote_open': renderVote(item.data, scene); break;
      case 'canonized': renderCanonized(item.data, scene, complete); break;
      case 'initiation': renderInitiation(item.data, scene, complete); break;
      case 'trial_open': renderTrial(item.data, scene); break;
      case 'trial_result': renderTrialResult(item.data, scene, complete); break;
      default: complete(); break;
    }
  }

  function summonMarkup() {
    const chars = Array.from({ length: 24 }, (_, index) => {
      const angle = index / 24 * Math.PI * 2;
      const x = 350 + Math.cos(angle - Math.PI / 2) * 305;
      const y = 350 + Math.sin(angle - Math.PI / 2) * 305;
      return `<text class="circle-runes" x="${x.toFixed(2)}" y="${y.toFixed(2)}" transform="rotate(${(angle * 180 / Math.PI + 90).toFixed(1)} ${x.toFixed(2)} ${y.toFixed(2)})">${runeGlyphs[index % runeGlyphs.length]}</text>`;
    }).join('');
    return `<section class="broadcast-panel summon-panel"><h1 class="panel-heading summon-title">THE SUMMONING</h1><div class="summoning-circle" id="summoning-circle"><svg viewBox="0 0 700 700" aria-hidden="true"><circle class="circle-line" cx="350" cy="350" r="320"></circle><circle class="circle-line dim" cx="350" cy="350" r="294"></circle><circle class="circle-line" cx="350" cy="350" r="260"></circle><g id="rune-ring-a">${chars}</g><g id="sigil-hex" class="sigil-geometry"><polygon points="350,55 605,202 605,498 350,645 95,498 95,202"></polygon></g><g id="sigil-triangle" class="sigil-geometry"><polygon points="350,110 558,470 142,470"></polygon></g><circle id="sigil-core" class="sigil-geometry" cx="350" cy="350" r="125"></circle></svg></div><div id="summon-slots"></div><div class="summon-counter-row"><div class="summon-witness-counter" id="summon-witness-counter">0 / 3 WITNESSES</div><div class="summon-combo-display" id="summon-combo-display" aria-live="polite"></div></div><div class="summon-countdown-track"><span id="summon-countdown-bar"></span></div><div id="summon-caption" class="summon-instruction">Type !lore to join</div></section>`;
  }

  function updateSummon(data = {}) {
    const caption = byId('summon-caption');
    const slots = byId('summon-slots');
    if (!caption || !slots) return;
    const joiners = data.joiners || [];
    const needed = Math.max(0, Number(data.needed) || 0);
    const total = joiners.length + needed;
    caption.textContent = 'Type !lore to join';
    const counter = byId('summon-witness-counter');
    if (counter) counter.textContent = `${joiners.length} / ${total || joiners.length} WITNESSES`;
    const known = new Set([...slots.querySelectorAll('[data-login]')].map((node) => node.dataset.login));
    joiners.forEach((user, index) => {
      const key = String(user.login || user.display_name || index);
      const angle = (-90 + index * 360 / Math.max(1, joiners.length)) * Math.PI / 180;
      const radius = 130;
      const panel = slots.closest('.summon-panel');
      const panelWidth = panel?.clientWidth || 416;
      const panelHeight = panel?.clientHeight || 780;
      const left = 50 + Math.cos(angle) * radius / panelWidth * 100;
      const top = 40 + Math.sin(angle) * radius / panelHeight * 100;
      const existing = [...slots.children].find((node) => node.dataset.login === key);
      if (existing) {
        if (motion) motion.to(existing, { left: `${left}%`, top: `${top}%`, duration: .25, ease: 'power3.out' });
        else { existing.style.left = `${left}%`; existing.style.top = `${top}%`; }
        return;
      }
      const node = document.createElement('div');
      node.className = 'summon-avatar-slot';
      node.dataset.login = key;
      node.style.left = `${left}%`;
      node.style.top = `${top}%`;
      node.innerHTML = `${imageTag(user)}<span>${escapeHtml(user.display_name || user.login)}</span><b class="summon-plus">+1</b>`;
      slots.append(node);
      known.add(key);
      if (motion) {
        const side = index % 2 ? 1 : -1;
        motion.set(node, { opacity: 0, x: side * 36, y: 18, scale: .82 });
        motion.to(node, { opacity: 1, x: 0, y: 0, scale: 1, duration: .35, ease: 'back.out(1.7)' });
        motion.fromTo(node.querySelector('.summon-plus'), { opacity: 0, y: 10, scale: .35 }, { opacity: 1, y: -16, scale: 1.25, duration: .32, delay: .58, ease: 'back.out(2)', onComplete: () => motion.to(node.querySelector('.summon-plus'), { opacity: 0, y: -35, duration: .3 }) });
      }
      sound.chime();
      particles.burst(window.innerWidth - 64 - panelWidth + panelWidth * left / 100, 120 + panelHeight * top / 100, 'spark', 8, '#f5c451');
      const combo = byId('summon-combo-display');
      if (combo) { combo.textContent = `x${known.size}`; combo.classList.add('is-visible'); if (motion) motion.fromTo(combo, { scale: .7 }, { scale: 1, duration: .3, ease: 'back.out(1.8)', overwrite: true }); }
    });
    if (joiners.length) safeTween(byId('summoning-circle'), { filter: `drop-shadow(0 0 22px #f5c451)`, duration: .3 });
    if (motion && joiners.length) { motion.killTweensOf(['#rune-ring-a', '#sigil-hex', '#sigil-triangle', '#sigil-core']); const speed = Math.max(6, 50 / joiners.length); motion.to('#rune-ring-a', { rotation: 360, svgOrigin: '350 350', duration: speed, repeat: -1, ease: 'none' }); motion.to('#sigil-hex', { rotation: 360, svgOrigin: '350 350', duration: Math.max(5, speed * .55), repeat: -1, ease: 'none' }); motion.to('#sigil-triangle', { rotation: -360, svgOrigin: '350 350', duration: Math.max(5, speed * .72), repeat: -1, ease: 'none' }); motion.to('#sigil-core', { scale: 1.12, svgOrigin: '350 350', duration: Math.max(.35, 1.2 / joiners.length), yoyo: true, repeat: -1, ease: 'sine.inOut' }); }
    if (needed === 0 && !slots.dataset.threshold) {
      slots.dataset.threshold = '1';
      const panel = slots.closest('.summon-panel');
      panel?.classList.add('threshold-flash');
      setTimeout(() => panel?.classList.remove('threshold-flash'), 500);
      sound.whoosh();
      showCallout('SUMMONED!', '#f5c451', 1.2);
      safeTween(byId('summoning-circle'), { filter: 'drop-shadow(0 0 45px #fff3b9) drop-shadow(0 0 90px #f5c451)', duration: .45, yoyo: true, repeat: 1 });
    }
  }

  function showCallout(text, color = '#f5c451', visibleDuration = 2) {
    const scene = sceneLayer.firstElementChild;
    if (!scene) return;
    const node = document.createElement('div');
    node.className = 'impact-callout'; node.textContent = text; node.style.setProperty('--callout-color', color); scene.append(node);
    if (motion) motion.fromTo(node, { opacity: 0, scale: .82, y: 18 }, { opacity: 1, scale: 1, y: 0, duration: .2, ease: 'power3.out', onComplete: () => motion.to(node, { opacity: 0, y: -24, scale: 1.02, duration: .2, delay: Math.max(0, visibleDuration - .4), onComplete: () => node.remove() }) });
    else setTimeout(() => node.remove(), visibleDuration * 1000);
  }

  function renderSummon(data, scene) {
    setSceneMarkup('summon-scene', summonMarkup());
    const candidateEnd = data.endsAt ? new Date(data.endsAt).getTime() : Date.now() + 20000;
    const duration = Math.max(.2, ((Number.isFinite(candidateEnd) ? candidateEnd : Date.now() + 20000) - Date.now()) / 1000);
    const countdown = byId('summon-countdown-bar');
    if (motion) {
      motion.fromTo('.summon-panel', { x: 32, opacity: 0 }, { x: 0, opacity: 1, duration: .4, ease: 'power3.out' });
      motion.fromTo(byId('summoning-circle'), { scale: .85, opacity: 0 }, { scale: 1, opacity: 1, duration: .4, ease: 'power3.out' });
      motion.fromTo('.sigil-geometry', { opacity: 0, scale: .7 }, { opacity: .82, scale: 1, svgOrigin: '350 350', duration: .4, stagger: .08, ease: 'power3.out' });
      motion.to('#rune-ring-a', { rotation: 360, duration: 50, repeat: -1, ease: 'none' });
      motion.to(countdown, { scaleX: 0, duration, ease: 'none' });
    } else if (countdown) {
      countdown.style.transition = `transform ${duration}s linear`;
      requestAnimationFrame(() => { countdown.style.transform = 'scaleX(0)'; });
    }
    sound.whoosh();
    updateSummon(data);
    scene.cleanups.push(() => {
      if (motion) motion.killTweensOf(['#rune-ring-a', '#sigil-hex', '#sigil-triangle', '#sigil-core', '#summoning-circle', '#summon-countdown-bar', '.summon-panel']);
    });
  }

  function renderFizzle(_data, _scene, complete) {
    setSceneMarkup('fizzle-scene', `<div class="fizzle-title">the lore fades...<br><span class="scene-subtitle">(not enough witnesses)</span></div><div class="summoning-circle" id="fizzle-circle"><svg viewBox="0 0 700 700"><circle class="circle-line" cx="350" cy="350" r="320"></circle><circle class="circle-line dim" cx="350" cy="350" r="260"></circle>${svgRuneRing(350, 350, 305, 24, 'circle-runes')}</svg></div>`);
    sound.whoosh();
    particles.burst(window.innerWidth - 272, Math.min(560, window.innerHeight * .48), 'smoke', 24);
    if (motion) {
      const timeline = motion.timeline({ onComplete: complete });
      timeline.fromTo('#fizzle-circle', { y: 0, opacity: .8, scale: 1 }, { y: 45, opacity: 0, scale: .88, filter: 'grayscale(1) blur(8px)', duration: 3.7, ease: 'power2.in' }, 0)
        .fromTo('.fizzle-title', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: .8, ease: 'power2.out' }, 0)
        .to({}, { duration: .7 }, 3.7);
    } else setTimeout(complete, 4400);
  }

  function tomeMarkup(canonPages = null) {
    const lines = Array.from({ length: 7 }, () => randomRunes(28)).join('<br>');
    const pages = canonPages ?? `<div class="tome-page left"><div class="tome-runes" id="tome-runes">${lines}</div></div><div class="tome-page right"><h2 class="archive-title">THE ARCHIVE</h2><p class="archive-copy">A memory waits beneath the veil of names.</p></div>`;
    return `<div class="light-rays" id="light-rays"></div><div class="tome-wrap" id="tome-wrap"><div class="tome" id="tome"><div class="tome-pages"></div>${pages}<div class="tome-seam"></div><div class="tome-cover" id="tome-cover"><span class="cover-sigil">✧</span></div></div></div>`;
  }

  function randomRunes(length) {
    return Array.from({ length }, () => scrollGlyphs[Math.floor(Math.random() * scrollGlyphs.length)]).join('');
  }

  function startScramble(node, finalText, duration = 1050) {
    if (!node) return;
    if (scrambleInterval) clearInterval(scrambleInterval);
    const start = performance.now();
    scrambleInterval = setInterval(() => {
      const progress = Math.min(1, (performance.now() - start) / duration);
      const fixed = Math.floor(finalText.length * progress);
      node.textContent = finalText.slice(0, fixed) + randomRunes(Math.max(0, finalText.length - fixed));
      if (progress >= 1) {
        clearInterval(scrambleInterval);
        scrambleInterval = null;
        node.textContent = finalText;
      }
    }, 55);
    addCleanup(() => {
      if (scrambleInterval) clearInterval(scrambleInterval);
      scrambleInterval = null;
    });
  }

  function renderDecipher(_data, scene, complete) {
    setSceneMarkup('decipher-scene', `<section class="broadcast-panel decipher-panel"><h1 class="panel-heading">DECIPHERING...</h1><div class="decipher-runes" id="tome-runes"></div><div class="decipher-progress"><span></span></div></section>`);
    const runeNode = byId('tome-runes');
    const scramble = setInterval(() => { runeNode.textContent = Array.from({ length: 7 }, () => randomRunes(28)).join('\n'); }, 85);
    scene.cleanups.push(() => clearInterval(scramble));
    sound.pageFlip();
    if (motion) {
      motion.fromTo('.decipher-panel', { x: 32, opacity: 0 }, { x: 0, opacity: 1, duration: .4, ease: 'power3.out' });
      motion.fromTo('.decipher-progress span', { scaleX: 0 }, { scaleX: 1, duration: 4.1, ease: 'power3.out', onComplete: complete });
    } else setTimeout(complete, 4500);
  }

  function renderVote(data, scene) {
    currentVoteLeader = null;
    lastCountdownSecond = null;
    const titles = data.titles || [];
    const scrolls = titles.slice(0, 3).map((title, index) => `<article class="vote-scroll" data-index="${index}"><div class="vote-number"><span>${index + 1}</span></div><div class="vote-title">${escapeHtml(title)}</div><div class="vote-count" data-count="${index}">0 witnesses</div><div class="vote-percent" data-percent="${index}">0%</div><div class="vote-bar-track"><div class="vote-bar-fill" data-bar="${index}"></div></div><div class="vote-leader-badge" hidden>TAKES THE LEAD!</div></article>`).join('');
    setSceneMarkup('vote-scene', `<section class="vote-lower-third"><div class="vote-label-block"><strong>NAME THIS MOMENT</strong><span>Type 1, 2 or 3</span>${makeCountdown('vote-clock-progress', '⌛')}</div><div class="vote-options">${scrolls}</div></section>`);
    if (motion) {
      motion.fromTo('.vote-lower-third', { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: .35, ease: 'power3.out' });
    }
    runCountdown(byId('vote-clock-progress'), data.endsAt, 20);
    updateVoteTally([0, 0, 0]);
    scene.cleanups.push(() => { if (motion) motion.killTweensOf('.vote-scroll'); });
  }

  function updateVoteTally(counts = []) {
    const normalized = [0, 1, 2].map((index) => Math.max(0, Number(counts[index]) || 0));
    const total = normalized.reduce((sum, value) => sum + value, 0);
    const maximum = Math.max(...normalized);
    const leader = maximum ? normalized.indexOf(maximum) : null;
    if (leader !== null && currentVoteLeader !== null && leader !== currentVoteLeader) sound.chime();
    currentVoteLeader = leader;
    normalized.forEach((count, index) => {
      const bar = sceneLayer.querySelector(`[data-bar="${index}"]`);
      const countNode = sceneLayer.querySelector(`[data-count="${index}"]`);
      const percentNode = sceneLayer.querySelector(`[data-percent="${index}"]`);
      const card = sceneLayer.querySelector(`.vote-scroll[data-index="${index}"]`);
      const percent = total ? Math.round(count / total * 100) : 0;
      if (countNode) countNode.textContent = `${count} ${count === 1 ? 'witness' : 'witnesses'}`;
      if (percentNode) percentNode.textContent = `${percent}%`;
      const leaderBadge = card?.querySelector('.vote-leader-badge');
      if (leaderBadge) leaderBadge.hidden = !(maximum > 0 && count === maximum && normalized.filter((value) => value === maximum).length === 1);
      if (bar && motion) motion.to(bar, { scaleX: percent / 100, transformOrigin: 'left center', duration: .55, ease: 'power2.out' });
      else if (bar) bar.style.transform = `scaleX(${percent / 100})`;
      if (card) {
        const isLeading = maximum > 0 && count === maximum;
        card.classList.toggle('leading', isLeading);
        if (motion) motion.to(card, { y: isLeading ? -8 : 0, duration: .3, ease: 'power3.out' });
      }
    });
  }

  function renderCanonized(entry, scene, complete) {
    const title = entry.title || 'A Moment Remembered';
    const witnesses = entry.witnesses || [];
    const count = witnesses.length;
    const rarity = count >= 10 ? 'legendary' : count >= 7 ? 'epic' : count >= 4 ? 'rare' : 'common';
    const rarityName = rarity[0].toUpperCase() + rarity.slice(1);
    const rarityColor = { common: '#c9cdd6', rare: '#3ee6ff', epic: '#ff3ea5', legendary: '#f5c451' }[rarity];
    const visibleWitnesses = witnesses.slice(0, 5);
    const witnessMarkup = visibleWitnesses.map((user) => `<div class="card-witness">${imageTag(user)}</div>`).join('');
    const witnessOverflow = count > visibleWitnesses.length ? `<div class="card-witness card-witness-overflow">+${count - visibleWitnesses.length}</div>` : '';
    const sigil = escapeHtml(entry.sigil || '?');
    const loreNumber = Number(entry.n) || 1;
    const story = entry.story || 'A moment became legend, and the community carried it into the archive.';
    const titleWords = title.trim().split(/\s+/);
    const displayTitle = `${titleWords.slice(0, 5).join(' ')}${titleWords.length > 5 ? '\u2026' : ''}`;
    setSceneMarkup('canon-scene', `<div class="card-rays" id="card-rays"></div><div class="card-pack" id="card-pack"><span>${sigil}</span></div><div class="impact-callout rarity-callout" id="rarity-callout">${rarityName.toUpperCase()} LORE!</div><div class="card-wrap" id="card-wrap"><div class="card-shell" id="card-shell"><div class="card-face card-back"><span class="back-sigil">${sigil}</span><b>THE LORE ARCHIVE</b><small>WITNESSED. REMEMBERED. CANON.</small></div><article class="lore-card ${rarity}" style="--rarity-color:${rarityColor}"><div class="card-edge"></div><div class="rarity-pill">${rarityName.toUpperCase()}</div><header class="card-meta"><span>LORE #${loreNumber}</span><time>${escapeHtml(entry.date || (entry.born_at ? new Date(entry.born_at).toLocaleDateString() : new Date().toLocaleDateString()))}</time></header><div class="card-art"><div class="nebula"></div><div class="sigil-art">${sigil}</div><div class="art-caption">A MOMENT PRESERVED</div></div><div class="card-ribbon"><h1 id="card-title">${escapeHtml(randomRunes(Math.max(12, displayTitle.length)))}</h1></div><div class="card-copy"><p class="card-story" id="card-story">${escapeHtml(story)}</p><p class="card-explainer">${escapeHtml(entry.explainer || '')}</p></div><div class="card-witness-title">WITNESSES ${count}</div><div class="card-witnesses">${witnessMarkup}${witnessOverflow}</div><div class="card-stamp" id="canon-stamp">CANONIZED</div><div class="card-foil"></div><footer class="card-footer"><span>${rarityName.toUpperCase()}</span><span>THE LORE OF ${escapeHtml(String(entry.channel || 'THIS CHANNEL').toUpperCase())}</span></footer></article></div></div>`);
    sound.riser();
    safeTween(byId('ray-field'), { opacity: .25, duration: .6 });
    safeTween(byId('vignette'), { opacity: .3, duration: .6 });
    const pack = byId('card-pack');
    const wrap = byId('card-wrap');
    const color = rarityColor;
    if (motion) {
      motion.set(pack, { y: -window.innerHeight * .8, rotation: 0, scale: .45, opacity: 0 });
      motion.set(wrap, { y: 100, scale: .38, rotationY: 180, opacity: 0 });
      motion.set('#card-story', { opacity: 0, y: 15, filter: 'blur(8px)' });
      motion.set('.card-witness', { opacity: 0, y: 28, scale: .5 });
      motion.set('#canon-stamp', { opacity: 0, scale: 2.7, rotation: -13 });
      const chip = byId('corner-chip');
      const chipRect = chip.getBoundingClientRect();
      const flyX = chipRect.left + chipRect.width / 2 - window.innerWidth / 2;
      const flyY = chipRect.top + chipRect.height / 2 - window.innerHeight / 2;
    const timeline = motion.timeline({ onComplete: () => {
        collectionCount += 1;
        chip.innerHTML = `<span class="chip-sigil">${sigil}</span><span>LORE #${loreNumber} · ${escapeHtml(displayTitle)}</span>`;
        motion.fromTo(chip, { opacity: 0, y: -12 }, { opacity: 1, y: 0, duration: .3, ease: 'power3.out' });
        if (chipHideTimer) clearTimeout(chipHideTimer);
        chipHideTimer = setTimeout(() => safeTween(chip, { opacity: 0, y: -12, duration: .3 }), 30000);
        safeTween(byId('vignette'), { opacity: 0, duration: .5 }); safeTween(byId('ray-field'), { opacity: 0, duration: .5 });
        if (sceneHoldMode) finishActive();
        else complete();
      }});
      timeline.to(pack, { y: window.innerHeight * .48, opacity: 1, scale: 1.08, duration: 1.18, ease: 'bounce.out' }, 0)
        .to(pack, { rotation: 4, duration: .07, ease: 'none' }, 1.18)
        .to(pack, { rotation: -6, duration: .07, ease: 'none' })
        .to(pack, { rotation: 8, duration: .07, ease: 'none' })
        .to(pack, { rotation: -12, duration: .07, ease: 'none' })
        .to(pack, { rotation: 17, duration: .08, ease: 'none' })
        .to(pack, { opacity: 0, scale: 1.9, duration: .22, onStart: () => { hitStopImpact(color); sound.boom(); particles.burst(window.innerWidth / 2, window.innerHeight / 2, 'spark', 100, color); particles.burst(window.innerWidth / 2, window.innerHeight / 2, 'confetti', 90); particles.burst(window.innerWidth / 2, window.innerHeight / 2, 'coin', 28); } }, 1.9)
        .to(wrap, { y: 0, scale: 1, rotationY: 0, opacity: 1, duration: .9, ease: 'back.out(1.6)' }, 2.05)
        .call(() => { startScramble(byId('card-title'), displayTitle, 1050); sound.pageFlip(); }, [], 2.55)
        .to('#card-story', { opacity: 1, y: 0, filter: 'blur(0px)', duration: .7 }, 3.05)
        .to('.card-witness', { opacity: 1, y: 0, scale: 1, duration: .45, stagger: .055, ease: 'back.out(1.7)' }, 3.25)
        .to('#rarity-callout', { opacity: 1, scale: 1, rotationX: 0, duration: .35, ease: 'back.out(2)' }, 1.5)
        .to('#rarity-callout', { opacity: 0, scale: 1.12, duration: .25, ease: 'power2.in' }, 2.15)
        .to('#canon-stamp', { opacity: .92, scale: 1, duration: .55, ease: 'back.out(2.5)', onStart: () => { sound.stamp(); particles.burst(window.innerWidth / 2, window.innerHeight * .5, 'ember', 34, '#ff4d4d'); particles.burst(window.innerWidth / 2, window.innerHeight * .5, 'spark', 22, '#ff4d4d'); } }, 4.65)
        .to(wrap, { rotationY: 3, duration: .5, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 5.3)
        .to({}, { duration: 1.1 }, 7.1)
        .to(wrap, { x: flyX, y: flyY, scale: .14, opacity: 0, duration: .8, ease: 'power3.in' }, 8.2);
    } else setTimeout(() => {
      const chip = byId('corner-chip');
      chip.innerHTML = `<span class="chip-sigil">${sigil}</span><span>LORE #${loreNumber} · ${escapeHtml(displayTitle)}</span>`;
      chip.style.opacity = '1';
      wrap.style.opacity = '0';
      byId('vignette').style.opacity = '0';
      byId('ray-field').style.opacity = '0';
      if (sceneHoldMode) finishActive();
      else complete();
    }, 9000);
    scene.cleanups.push(() => { safeTween(byId('vignette'), { opacity: 0, duration: .25 }); safeTween(byId('ray-field'), { opacity: 0, duration: .25 }); });
  }

  function renderInitiation(data, scene, complete) {
    const user = data.user || {};
    const lore = data.lore || {};
    setSceneMarkup('initiation-scene', `<div class="achievement-pill" id="achievement-pill"><div class="achievement-icon">${imageTag(user)}<span class="candle-icon">🕯</span></div><div class="achievement-copy"><b>ACHIEVEMENT UNLOCKED</b><strong>@${escapeHtml(user.display_name || user.login || 'witness')}: Initiated into ${escapeHtml(lore.title || 'The Living Archive')}</strong><small>+1 LORE KNOWN</small></div><i class="achievement-sheen"></i></div>`);
    const avatar = sceneLayer.querySelector('.achievement-icon .avatar-orb');
    if (motion) motion.fromTo('#achievement-pill', { x: 640, opacity: 0, scale: .95 }, { x: 0, opacity: 1, scale: 1, duration: .45, ease: 'power3.out' });
    sound.chime();
    particles.burst(window.innerWidth * .84, window.innerHeight * .84, 'spark', 26, '#f5c451');
    scene.cleanups.push(() => { if (motion) motion.killTweensOf(avatar); });
    setTimeout(() => { if (motion) motion.to('#achievement-pill', { x: 760, opacity: 0, duration: .4, onComplete: complete }); else complete(); }, 5000);
  }

  function renderTrial(data, scene) {
    const options = data.options || [];
    const question = data.question || 'Which tale belongs to the archive?';
    const tiles = Array.from({ length: 4 }, (_, index) => {
      const option = options[index];
      const letter = option?.letter || ['A', 'B', 'C', 'D'][index];
      const title = typeof option === 'string' ? option : option?.title || 'An untold tale';
      return `<div class="trial-tile" data-tile="${index}"><span class="tile-rune">${escapeHtml(letter)}</span><span class="tile-copy">${escapeHtml(title)}</span><span class="tile-count" data-trial-count="${index}">0</span><span class="tile-bar" aria-hidden="true"><span data-trial-bar="${index}"></span></span></div>`;
    }).join('');
    setSceneMarkup('trial-scene', `<section class="broadcast-panel trial-panel"><h1 class="panel-heading">LORE TRIALS</h1><div class="trial-question">${escapeHtml(question)}</div><div class="trial-grid">${tiles}</div><div class="trial-countdown-track"><span id="trial-countdown-bar"></span></div></section>`);
    if (motion) {
      motion.fromTo('.trial-panel', { x: 32, opacity: 0 }, { x: 0, opacity: 1, duration: .35, ease: 'power3.out' });
      motion.fromTo('.trial-tile', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .3, stagger: .06, ease: 'power3.out' });
    }
    runBarCountdown(byId('trial-countdown-bar'), data.endsAt, 20);
    updateTrialTally(latestTrialCounts);
  }

  function updateTrialTally(counts = []) {
    [0, 1, 2, 3].forEach((index) => {
      const node = sceneLayer.querySelector(`[data-trial-count="${index}"]`);
      if (node) { const next = String(Math.max(0, Number(counts[index]) || 0)); if (node.textContent !== next && motion) motion.fromTo(node, { scale: .7 }, { scale: 1.35, duration: .18, yoyo: true, repeat: 1, ease: 'back.out(2)' }); node.textContent = next; }
    });
    const total = [0, 1, 2, 3].reduce((sum, index) => sum + Math.max(0, Number(counts[index]) || 0), 0);
    [0, 1, 2, 3].forEach((index) => {
      const fill = sceneLayer.querySelector(`[data-trial-bar="${index}"]`);
      const value = Math.max(0, Number(counts[index]) || 0);
      const scale = total ? value / total : 0;
      if (fill && motion) motion.to(fill, { scaleX: scale, duration: .3, ease: 'power3.out' });
      else if (fill) fill.style.transform = `scaleX(${scale})`;
    });
  }

  function renderTrialResult(data, _scene, complete) {
    const trial = data.trial || latestTrial || {};
    const options = trial.options || [];
    const correctIndex = Number(data.correctIndex) || 0;
    const tiles = Array.from({ length: 4 }, (_, index) => {
      const option = options[index];
      const title = typeof option === 'string' ? option : option?.title || 'An untold tale';
      const letter = option?.letter || ['A', 'B', 'C', 'D'][index];
      const className = index === correctIndex ? 'correct' : 'wrong';
      return `<div class="trial-tile ${className}" data-result-tile="${index}"><span class="tile-rune">${escapeHtml(letter)}</span><span class="tile-copy">${escapeHtml(title)}</span><span class="tile-count">${Math.max(0, Number(data.counts?.[index]) || 0)}</span></div>`;
    }).join('');
    const leaderboard = data.leaderboard || [];
    const podiumNames = ['first', 'second', 'third'];
    const podium = leaderboard.slice(0, 3).map((user, index) => `<div class="podium-user ${podiumNames[index]}">${index === 0 ? '<span class="crown">\u{1F451}</span>' : ''}${imageTag(user, 'podium-avatar')}<strong>${escapeHtml(user.display_name || user.login)}</strong><small>${Number(user.score) || 0} lore points</small></div>`).join('');
    const rest = leaderboard.slice(3, 5).map((user, index) => `<span>${index + 4}. ${escapeHtml(user.display_name || user.login)} (${Number(user.score) || 0})</span>`).join('');
    setSceneMarkup('trial-result-scene', `<section class="broadcast-panel trial-panel"><h1 class="panel-heading">LORE TRIALS</h1><div class="trial-question">${escapeHtml(trial.question || 'Which tale belongs to the archive?')}</div><div class="trial-grid">${tiles}</div><div class="trial-result-panel"><div class="podium" id="podium">${podium || '<div class="podium-user first">No Loremaster this round</div>'}</div><div class="podium-rest">${rest}</div></div></section>`);
    if (motion) {
      motion.fromTo('.trial-tile', { scale: .96 }, { scale: 1, duration: .3, stagger: .04, ease: 'power3.out' });
      motion.to('.trial-tile.correct', { scale: 1.06, duration: .3, delay: .25, ease: 'power3.out' });
      motion.fromTo('.podium-avatar', { y: -120, opacity: 0, scale: .3 }, { y: 0, opacity: 1, scale: 1, duration: .7, stagger: .15, delay: 1.45, ease: 'bounce.out' });
      motion.fromTo('#podium', { y: 100, opacity: 0, scale: .78 }, { y: 0, opacity: 1, scale: 1, duration: .9, delay: 1.3, ease: 'back.out(1.6)' });
      motion.fromTo('.podium-rest', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .6, delay: 2.1 });
      motion.delayedCall(6.8, complete);
    } else {
      const resultPanel = sceneLayer.querySelector('.trial-result-panel');
      if (resultPanel) { resultPanel.style.opacity = '0'; setTimeout(() => { resultPanel.style.opacity = '1'; }, 1300); }
      setTimeout(complete, 6800);
    }
    sound.drumroll();
    showCallout('CORRECT!', '#f5c451', 1);
    sound.stamp();
  }

  function routeMessage(event) {
    if (!event || typeof event.type !== 'string') return;
    if (event.type === 'raid') { renderRaid(event.data || {}); return; }
    if (event.type === 'recall') { renderRecall(event.data || {}); return; }
    if (event.type === 'trial_result') {
      enqueue(event.type, event.data || {});
      return;
    }
    enqueue(event.type, event.data || {});
  }

  function scheduleReconnect() {
    if (demoMode || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectDelay);
    reconnectDelay = Math.min(8000, reconnectDelay * 1.7);
  }

  function connect() {
    if (demoMode || socket || reconnectTimer) return;
    try {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const nextSocket = new WebSocket(`${protocol}//${location.host}/ws`);
      socket = nextSocket;
      nextSocket.addEventListener('open', () => { reconnectDelay = 500; });
      nextSocket.addEventListener('message', (message) => {
        if (socket !== nextSocket) return;
        try { routeMessage(JSON.parse(message.data)); } catch { /* Ignore malformed server frames. */ }
      });
      nextSocket.addEventListener('close', () => {
        if (socket !== nextSocket) return;
        socket = null;
        scheduleReconnect();
      });
      nextSocket.addEventListener('error', () => nextSocket.close());
    } catch {
      socket = null;
      scheduleReconnect();
    }
  }

  function demoUser(login, displayName = login) {
    return { login, display_name: displayName };
  }

  function clearRaidTimers() {
    raidTimers.forEach(clearTimeout);
    raidTimers.length = 0;
  }

  function laterRaid(callback, delay) {
    const timer = setTimeout(() => {
      const index = raidTimers.indexOf(timer);
      if (index >= 0) raidTimers.splice(index, 1);
      callback();
    }, delay);
    raidTimers.push(timer);
  }

  function renderRaid(data = {}) {
    clearRaidTimers();
    const from = data.from || {};
    const displayName = String(from.display_name || from.displayName || from.login || 'Another channel');
    const banner = byId('raid-banner');
    banner.replaceChildren();
    const avatarWrap = document.createElement('span'); avatarWrap.className = 'raid-avatar-wrap';
    if (from.avatar) {
      const avatar = document.createElement('img'); avatar.src = from.avatar; avatar.alt = ''; avatar.loading = 'lazy';
      avatar.addEventListener('error', () => { avatarWrap.textContent = displayName.charAt(0).toUpperCase(); }, { once: true });
      avatarWrap.append(avatar);
    } else avatarWrap.textContent = displayName.charAt(0).toUpperCase();
    const welcome = document.createElement('span'); welcome.className = 'raid-banner-copy';
    const label = document.createElement('small'); label.textContent = 'RAID INCOMING';
    const name = document.createElement('strong'); name.textContent = displayName;
    const viewers = document.createElement('span'); viewers.textContent = `${Math.max(0, Number(data.viewers) || 0)} raiders`;
    welcome.append(label, name, viewers);
    banner.append(avatarWrap, welcome);
    banner.classList.add('is-visible');
    banner.setAttribute('aria-hidden', 'false');

    const panel = byId('raid-panel');
    const slot = byId('raid-card-slot');
    const entries = Array.isArray(data.top) ? data.top.slice(0, 3) : [];
    slot.replaceChildren();
    panel.classList.add('is-visible');
    panel.setAttribute('aria-hidden', 'false');
    const showCard = (index) => {
      slot.replaceChildren();
      if (!entries.length) {
        const empty = document.createElement('p'); empty.className = 'raid-empty'; empty.textContent = 'Our legends are being written.'; slot.append(empty); return;
      }
      const entry = entries[index];
      const card = document.createElement('article'); card.className = 'raid-lore-card';
      const sigil = document.createElement('span'); sigil.className = 'raid-lore-sigil'; sigil.textContent = entry.sigil || '✧';
      const copy = document.createElement('div'); copy.className = 'raid-lore-copy';
      const title = document.createElement('strong'); title.textContent = entry.title || 'Untitled legend';
      const explainer = document.createElement('span'); explainer.textContent = entry.explainer || entry.story || 'A legend kept alive by chat.';
      copy.append(title, explainer); card.append(sigil, copy); slot.append(card);
      const counter = document.createElement('span'); counter.className = 'raid-card-count'; counter.textContent = `${String(index + 1).padStart(2, '0')} / ${String(entries.length).padStart(2, '0')}`;
      slot.append(counter);
    };
    showCard(0);
    laterRaid(() => { banner.classList.remove('is-visible'); banner.setAttribute('aria-hidden', 'true'); }, 2600);
    if (entries.length > 1) laterRaid(() => showCard(1), 3300);
    if (entries.length > 2) laterRaid(() => showCard(2), 6600);
    laterRaid(() => {
      panel.classList.remove('is-visible');
      panel.setAttribute('aria-hidden', 'true');
      banner.classList.remove('is-visible');
      banner.setAttribute('aria-hidden', 'true');
    }, 10_000);
  }

  function renderRecall(data = {}) {
    const lore = data.lore || {};
    const chip = byId('recall-chip');
    chip.replaceChildren();
    const sigil = document.createElement('span'); sigil.className = 'chip-sigil'; sigil.textContent = lore.sigil || '✧';
    const copy = document.createElement('span'); copy.className = 'recall-copy';
    const label = document.createElement('strong'); label.textContent = 'LORE RECALLED';
    const title = document.createElement('span'); title.className = 'recall-title'; title.textContent = lore.title || 'A living legend';
    const uses = document.createElement('small'); uses.textContent = `used ${Math.max(0, Number(data.uses ?? lore.uses) || 0)}x`;
    copy.append(label, title, uses); chip.append(sigil, copy);
    chip.classList.add('is-visible'); chip.setAttribute('aria-hidden', 'false');
    if (recallHideTimer) clearTimeout(recallHideTimer);
    recallHideTimer = setTimeout(() => {
      chip.classList.remove('is-visible'); chip.setAttribute('aria-hidden', 'true'); recallHideTimer = null;
    }, 5000);
  }

  function scheduleScenePreview(delay, callback) {
    const timer = setTimeout(callback, delay);
    sceneDemoTimers.push(timer);
    return timer;
  }

  function startSingleScene(name) {
    sceneDemoTimers.forEach(clearTimeout);
    sceneDemoTimers.length = 0;
    const titles = ['The Bucket That Knew Too Much', 'The Great Reality Audit', 'The Ladder of Unwise Ambition'];
    const witnesses = [demoUser('maple_mage', 'Maple Mage'), demoUser('bucketbard', 'Bucket Bard'), demoUser('ladderknight', 'Ladder Knight'), demoUser('crabwise', 'Crabwise'), demoUser('real_or_rune', 'Real or Rune'), demoUser('mosskeeper', 'Moss Keeper'), demoUser('starling', 'Starling'), demoUser('runefox', 'Rune Fox'), demoUser('emberowl', 'Ember Owl'), demoUser('moonlit', 'Moonlit')];
    const entry = {
      id: 'scene-preview', n: 2, title: titles[1], sigil: '🔎',
      story: 'When the impossible happened on screen, the streamer paused to inspect the evidence. Chat asked whether any of it was real, and the question became the community’s answer to every unlikely triumph.',
      explainer: 'Chat asks this whenever a moment seems too strange to be true.',
      clip: null, witnesses,
    };
    switch (name) {
      case 'summon':
        routeMessage({ type: 'summon', data: { joiners: witnesses.slice(0, 1), needed: 2, endsAt: new Date(Date.now() + 9000).toISOString() } });
        scheduleScenePreview(1500, () => routeMessage({ type: 'summon', data: { joiners: witnesses.slice(0, 2), needed: 1, endsAt: new Date(Date.now() + 7500).toISOString() } }));
        scheduleScenePreview(3000, () => routeMessage({ type: 'summon', data: { joiners: witnesses.slice(0, 3), needed: 0, endsAt: new Date(Date.now() + 6000).toISOString() } }));
        break;
      case 'fizzle': routeMessage({ type: 'fizzle', data: {} }); break;
      case 'decipher': routeMessage({ type: 'decipher', data: { summoners: witnesses.slice(0, 3) } }); break;
      case 'vote':
        routeMessage({ type: 'vote_open', data: { titles, endsAt: new Date(Date.now() + 12_000).toISOString() } });
        const voteCounts = [0, 0, 0];
        for (let tick = 1; tick <= 20; tick += 1) {
          scheduleScenePreview(tick * 500, () => {
            voteCounts[(tick - 1) % 3] += 1;
            routeMessage({ type: 'vote_tally', data: { counts: voteCounts } });
          });
        }
        break;
      case 'canonized':
        lastTitles = titles;
        routeMessage({ type: 'canonized', data: entry });
        break;
      case 'initiation':
        routeMessage({ type: 'initiation', data: { user: demoUser('new_witness', 'New Witness'), lore: entry, initiateNumber: 12 } });
        break;
      case 'trial': {
        const options = titles.concat('The Crab’s Brief Reign').map((title, index) => ({ letter: ['A', 'B', 'C', 'D'][index], title }));
        latestTrial = { question: 'What phrase marks the channel’s most unbelievable surprises?', options, endsAt: new Date(Date.now() + 8000).toISOString() };
        routeMessage({ type: 'trial_open', data: latestTrial });
        const trialCounts = [0, 0, 0, 0];
        for (let tick = 1; tick <= 12; tick += 1) {
          scheduleScenePreview(tick * 500, () => {
            const index = (tick - 1) % 4;
            trialCounts[index] += index === 1 ? 2 : 1;
            routeMessage({ type: 'trial_tally', data: { counts: trialCounts } });
          });
        }
        scheduleScenePreview(6500, () => routeMessage({
          type: 'trial_result',
          data: {
            correctIndex: 1,
            correctUsers: [demoUser('real_or_rune', 'Real or Rune'), demoUser('crabwise', 'Crabwise')],
            leaderboard: [
              { ...demoUser('maple_mage', 'Maple Mage'), score: 860 },
              { ...demoUser('bucketbard', 'Bucket Bard'), score: 720 },
              { ...demoUser('ladderknight', 'Ladder Knight'), score: 610 },
              { ...demoUser('crabwise', 'Crabwise'), score: 490 },
              { ...demoUser('real_or_rune', 'Real or Rune'), score: 350 },
            ],
          },
        }));
        break;
      }
      case 'raid':
        routeMessage({ type: 'raid', data: { from: { login: 'maple_mage', display_name: 'Maple Mage' }, viewers: 42, top: [entry, { ...entry, title: titles[0], sigil: '☾', explainer: 'The bucket became the witness.' }, { ...entry, title: titles[2], sigil: '✦', explainer: 'Ambition met an unusually tall ladder.' }] } });
        break;
      case 'recall':
        routeMessage({ type: 'recall', data: { lore: entry, uses: 24 } });
        break;
    }
  }

  async function demoLoop() {
    while (!demoStopped) {
      routeMessage({ type: 'pressure', data: { phrase: 'the bucket', value: .4 } });
      await wait(900);
      routeMessage({ type: 'pressure', data: { phrase: 'chat is this real', value: .88 } });
      routeMessage({ type: 'raid', data: { from: { login: 'maple_mage', display_name: 'Maple Mage' }, viewers: 42, top: [
        { title: 'The Great Reality Audit', sigil: '⌕', explainer: 'Chat asks this whenever a moment seems too strange to be true.' },
        { title: 'The Bucket That Knew Too Much', sigil: '☾', explainer: 'The bucket became the witness.' },
        { title: 'The Ladder of Unwise Ambition', sigil: '✦', explainer: 'Ambition met an unusually tall ladder.' },
      ] } });
      await wait(10_200);
      routeMessage({ type: 'recall', data: { lore: { title: 'The Great Reality Audit', sigil: '⌕' }, uses: 24 } });
      await wait(5200);
      const summonStart = Date.now();
      routeMessage({ type: 'summon', data: { joiners: [demoUser('maple_mage', 'Maple Mage')], needed: 2, endsAt: new Date(summonStart + 8500).toISOString() } });
      await wait(750);
      routeMessage({ type: 'summon', data: { joiners: [demoUser('maple_mage', 'Maple Mage'), demoUser('bucketbard', 'Bucket Bard')], needed: 1, endsAt: new Date(summonStart + 8500).toISOString() } });
      await wait(750);
      routeMessage({ type: 'summon', data: { joiners: [demoUser('maple_mage', 'Maple Mage'), demoUser('bucketbard', 'Bucket Bard'), demoUser('ladderknight', 'Ladder Knight')], needed: 0, endsAt: new Date(summonStart + 8500).toISOString() } });
      await wait(1800);
      routeMessage({ type: 'decipher', data: { summoners: [] } });
      await wait(5000);
      const titles = ['The Bucket That Knew Too Much', 'The Great Reality Audit', 'The Ladder of Unwise Ambition'];
      routeMessage({ type: 'vote_open', data: { titles, endsAt: new Date(Date.now() + 7000).toISOString() } });
      routeMessage({ type: 'vote_tally', data: { counts: [2, 5, 1] } });
      await wait(750);
      routeMessage({ type: 'vote_tally', data: { counts: [4, 7, 2] } });
      await wait(3000);
      routeMessage({ type: 'canonized', data: {
        id: 'demo-lore', n: 2, title: titles[1], sigil: '🔎',
        story: 'When the impossible happened on screen, the streamer paused to inspect the evidence. Chat asked whether any of it was real, and the question became the community’s answer to every unlikely triumph.',
        explainer: 'Chat asks this whenever a moment seems too strange to be true.',
        clip: null,
        witnesses: [demoUser('maple_mage', 'Maple Mage'), demoUser('bucketbard', 'Bucket Bard'), demoUser('ladderknight', 'Ladder Knight'), demoUser('crabwise', 'Crabwise'), demoUser('real_or_rune', 'Real or Rune'), demoUser('mosskeeper', 'Moss Keeper'), demoUser('starling', 'Starling'), demoUser('runefox', 'Rune Fox'), demoUser('emberowl', 'Ember Owl'), demoUser('moonlit', 'Moonlit')],
      } });
      await wait(9700);
      routeMessage({ type: 'initiation', data: { user: demoUser('new_witness', 'New Witness'), lore: { title: titles[1], explainer: 'Chat asks this whenever a moment seems too strange to be true.' }, initiateNumber: 12 } });
      await wait(6500);
      const options = ['The Bucket That Knew Too Much', 'The Great Reality Audit', 'The Ladder of Unwise Ambition', 'The Crab’s Brief Reign'].map((title, index) => ({ letter: ['A', 'B', 'C', 'D'][index], title }));
      latestTrial = { question: 'What phrase marks the channel’s most unbelievable surprises?', options, endsAt: new Date(Date.now() + 6000).toISOString() };
      routeMessage({ type: 'trial_open', data: latestTrial });
      routeMessage({ type: 'trial_tally', data: { counts: [3, 1, 4, 2] } });
      await wait(2400);
      routeMessage({ type: 'trial_result', data: {
        correctIndex: 1,
        correctUsers: [demoUser('real_or_rune', 'Real or Rune'), demoUser('crabwise', 'Crabwise')],
        leaderboard: [
          { ...demoUser('maple_mage', 'Maple Mage'), score: 860 },
          { ...demoUser('bucketbard', 'Bucket Bard'), score: 720 },
          { ...demoUser('ladderknight', 'Ladder Knight'), score: 610 },
          { ...demoUser('crabwise', 'Crabwise'), score: 490 },
          { ...demoUser('real_or_rune', 'Real or Rune'), score: 350 },
        ],
      } });
      await wait(7600);
      const fizzleAt = Date.now();
      routeMessage({ type: 'summon', data: { joiners: [demoUser('quiet_lurker', 'Quiet Lurker')], needed: 2, endsAt: new Date(fizzleAt + 5000).toISOString() } });
      await wait(1700);
      routeMessage({ type: 'fizzle', data: {} });
      await wait(5100);
    }
  }

  if (sceneOnly) startSingleScene(sceneOnly);
  else if (demoMode) void demoLoop();
  else connect();
  window.addEventListener('beforeunload', () => {
    demoStopped = true;
    if (socket) socket.close();
    if (heartbeatStop) heartbeatStop();
    if (countdownTimer) clearInterval(countdownTimer);
    if (chipHideTimer) clearTimeout(chipHideTimer);
    if (recallHideTimer) clearTimeout(recallHideTimer);
    clearRaidTimers();
    sceneDemoTimers.forEach(clearTimeout);
  });
})();
