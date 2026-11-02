(() => {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const sceneLayer = byId('scene-layer');
  const overlay = byId('overlay');
  const query = new URLSearchParams(location.search);
  const demoMode = query.get('demo') === '1';
  const sceneChoices = new Set(['summon', 'fizzle', 'decipher', 'vote', 'canonized', 'initiation', 'trial']);
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
  let sceneDemoTimer = null;
  let countdownTimer = null;
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
  if (query.get('bg') === '1') document.body.classList.add('preview-bg');
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
    return `<div class="scene-backwash"></div><div class="summon-title scene-title">THE SUMMONING</div><div id="summon-caption" class="summon-subtitle scene-subtitle"></div><div class="summon-pillar" id="summon-pillar"></div><div class="summoning-circle" id="summoning-circle"><svg viewBox="0 0 700 700" aria-hidden="true"><circle class="circle-line" cx="350" cy="350" r="320"></circle><circle class="circle-line dim" cx="350" cy="350" r="294"></circle><circle class="circle-line" cx="350" cy="350" r="260"></circle><g id="rune-ring-a">${chars}</g><g id="sigil-hex" class="sigil-geometry"><polygon points="350,55 605,202 605,498 350,645 95,498 95,202"></polygon></g><g id="sigil-triangle" class="sigil-geometry"><polygon points="350,125 545,485 155,485"></polygon></g><circle id="sigil-core" class="sigil-geometry" cx="350" cy="350" r="125"></circle><circle id="summon-countdown" class="countdown-ring" cx="350" cy="350" r="338"></circle></svg></div><div id="summon-slots"></div><div class="summon-combo-display" id="summon-combo-display"></div>`;
  }

  function updateSummon(data = {}) {
    const caption = byId('summon-caption');
    const slots = byId('summon-slots');
    if (!caption || !slots) return;
    const joiners = data.joiners || [];
    const needed = Math.max(0, Number(data.needed) || 0);
    const total = joiners.length + needed;
    caption.textContent = `TYPE !lore TO JOIN \u00B7 ${joiners.length}/${total || joiners.length}`;
    const known = new Set([...slots.querySelectorAll('[data-login]')].map((node) => node.dataset.login));
    joiners.forEach((user, index) => {
      const key = String(user.login || user.display_name || index);
      if (known.has(key)) return;
      const angle = (-150 + (total <= 1 ? 60 : index * 120 / (total - 1))) * Math.PI / 180;
      const radius = Math.min(310, window.innerHeight * .29);
      const left = 50 + Math.cos(angle) * radius / window.innerWidth * 100;
      const top = 52 + Math.sin(angle) * radius / window.innerHeight * 100;
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
        motion.set(node, { opacity: 0, x: side * 850, y: 130, scale: .25, rotation: side * 22 });
        motion.timeline()
          .to(node, { opacity: .8, x: side * 330, y: -120, scale: .78, rotation: side * 9, duration: .42, ease: 'sine.out' })
          .to(node, { opacity: 1, x: 0, y: 0, scaleX: 1.14, scaleY: .86, rotation: 0, duration: .18, ease: 'back.out(1.8)' })
          .to(node, { scaleX: 1, scaleY: 1, duration: .18, ease: 'elastic.out(1,.35)' });
        motion.fromTo(node.querySelector('.summon-plus'), { opacity: 0, y: 10, scale: .35 }, { opacity: 1, y: -16, scale: 1.25, duration: .32, delay: .58, ease: 'back.out(2)', onComplete: () => motion.to(node.querySelector('.summon-plus'), { opacity: 0, y: -35, duration: .3 }) });
      }
      sound.chime();
      particles.burst(window.innerWidth * left / 100, window.innerHeight * top / 100, 'spark', 20, '#3ee6ff');
      const combo = byId('summon-combo-display');
      if (combo) { combo.textContent = known.size === 1 ? '+1' : `${known.size}x ${known.size >= 3 ? 'SUMMONED!' : 'COMBO'}`; combo.classList.add('is-visible'); if (motion) motion.fromTo(combo, { scaleX: .72, scaleY: 1.32 }, { scaleX: 1, scaleY: 1, duration: .42, ease: 'elastic.out(1,.4)', overwrite: true }); }
    });
    if (joiners.length) safeTween(byId('summoning-circle'), { filter: `drop-shadow(0 0 ${20 + joiners.length * 8}px #3ee6ff) drop-shadow(0 0 ${35 + joiners.length * 14}px #f5c451)`, duration: .45 });
    if (motion && joiners.length) { motion.killTweensOf(['#rune-ring-a', '#sigil-hex', '#sigil-triangle', '#sigil-core']); const speed = Math.max(6, 50 / joiners.length); motion.to('#rune-ring-a', { rotation: 360, duration: speed, repeat: -1, ease: 'none' }); motion.to('#sigil-hex', { rotation: 360, svgOrigin: '350 350', duration: Math.max(5, speed * .55), repeat: -1, ease: 'none' }); motion.to('#sigil-triangle', { rotation: -360, svgOrigin: '350 350', duration: Math.max(5, speed * .72), repeat: -1, ease: 'none' }); motion.to('#sigil-core', { scale: 1.12, duration: Math.max(.35, 1.2 / joiners.length), yoyo: true, repeat: -1, ease: 'sine.inOut' }); }
    if (needed === 0 && !slots.dataset.threshold) {
      slots.dataset.threshold = '1';
      hitStopImpact('#f5c451');
      sound.whoosh();
      showCallout('SUMMONED!', '#f5c451');
      particles.burst(window.innerWidth / 2, window.innerHeight * .7, 'coin', 36);
      safeTween(byId('summon-pillar'), { opacity: .82, scaleY: 1, duration: .8, ease: 'expo.out' });
      safeTween(byId('summoning-circle'), { filter: 'drop-shadow(0 0 45px #fff3b9) drop-shadow(0 0 90px #f5c451)', duration: .45, yoyo: true, repeat: 1 });
      safeTween(byId('flash'), { opacity: .52, duration: .12, yoyo: true, repeat: 1 });
      if (motion) motion.to(sceneLayer, { x: 7, y: -5, duration: .045, yoyo: true, repeat: 7 });
      particles.burst(window.innerWidth / 2, window.innerHeight * .54, 'spark', 80);
    }
  }

  function showCallout(text, color = '#f5c451') {
    const scene = sceneLayer.firstElementChild;
    if (!scene) return;
    const node = document.createElement('div');
    node.className = 'impact-callout'; node.textContent = text; node.style.setProperty('--callout-color', color); scene.append(node);
    if (motion) motion.fromTo(node, { opacity: 0, scale: .25, rotationX: -42, y: 60 }, { opacity: 1, scale: 1, rotationX: 0, y: 0, duration: .5, ease: 'back.out(2.4)', onComplete: () => motion.to(node, { opacity: 0, y: -70, scale: 1.08, duration: .45, delay: 1.05, onComplete: () => node.remove() }) });
    else setTimeout(() => node.remove(), 1600);
  }

  function renderSummon(data, scene) {
    setSceneMarkup('summon-scene', summonMarkup());
    if (motion) {
      const timeline = motion.timeline();
      timeline.fromTo(byId('summoning-circle'), { y: 420, scale: .72, opacity: 0, rotation: -5 }, { y: 0, scale: 1, opacity: 1, rotation: 0, duration: 1.35, ease: 'back.out(1.35)' }, 0)
        .fromTo('.sigil-geometry', { opacity: 0, scale: .7 }, { opacity: .82, scale: 1, svgOrigin: '350 350', duration: 1, stagger: .16, ease: 'back.out(1.5)' }, .4);
      motion.to('#rune-ring-a', { rotation: 360, duration: 50, repeat: -1, ease: 'none' });
      byId('summon-countdown').style.strokeDasharray = '2123.7';
      motion.to('#summon-countdown', { strokeDashoffset: 2130, duration: Math.max(.2, (new Date(data.endsAt || Date.now() + 20000).getTime() - Date.now()) / 1000), ease: 'none' });
    }
    sound.whoosh();
    updateSummon(data);
    scene.cleanups.push(() => {
      if (motion) motion.killTweensOf(['#rune-ring-a', '#sigil-hex', '#sigil-triangle', '#sigil-core', '#summoning-circle', '#summon-countdown']);
    });
  }

  function renderFizzle(_data, _scene, complete) {
    setSceneMarkup('fizzle-scene', `<div class="fizzle-title">the lore fades...<br><span class="scene-subtitle">(not enough witnesses)</span></div><div class="summoning-circle" id="fizzle-circle"><svg viewBox="0 0 700 700"><circle class="circle-line" cx="350" cy="350" r="320"></circle><circle class="circle-line dim" cx="350" cy="350" r="260"></circle>${svgRuneRing(350, 350, 305, 24, 'circle-runes')}</svg></div>`);
    sound.whoosh();
    particles.burst(window.innerWidth / 2, window.innerHeight * .64, 'smoke', 45);
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
    setSceneMarkup('decipher-scene', `${tomeMarkup()}<div class="decipher-caption">THE ARCHIVE DECIPHERS...</div>`);
    const runeNode = byId('tome-runes');
    const scramble = setInterval(() => { runeNode.textContent = Array.from({ length: 7 }, () => randomRunes(28)).join('\n'); }, 85);
    scene.cleanups.push(() => clearInterval(scramble));
    sound.pageFlip();
    if (motion) {
      motion.set('#tome-wrap', { y: -500, rotationX: 24, scale: .72, opacity: 0 });
      const timeline = motion.timeline({ onComplete: complete });
      timeline.to('#tome-wrap', { y: 0, rotationX: 0, scale: 1, opacity: 1, duration: 1.1, ease: 'back.out(1.35)' }, .1)
        .to('#tome-cover', { rotateY: -158, duration: 2, ease: 'power3.inOut' }, 1.1)
        .fromTo('.decipher-caption', { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: .7 }, 1.6)
        .to('#tome-wrap', { y: -12, duration: .8, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 3.2)
        .to({}, { duration: .8 }, 3.8);
    } else setTimeout(complete, 4500);
  }

  function renderVote(data, scene) {
    currentVoteLeader = null;
    lastCountdownSecond = null;
    const titles = data.titles || [];
    const scrolls = titles.slice(0, 3).map((title, index) => `<article class="vote-scroll" data-index="${index}"><div class="vote-number"><span>${index + 1}</span></div><div class="vote-title">${escapeHtml(title)}</div><div class="vote-count" data-count="${index}">0 witnesses</div><div class="vote-percent" data-percent="${index}">0%</div><div class="vote-bar-track"><div class="vote-bar-fill" data-bar="${index}"></div></div></article>`).join('');
    setSceneMarkup('vote-scene', `<div class="scene-title vote-heading">THE PEOPLE CHOOSE</div><div class="vote-question">TYPE 1, 2 OR 3 IN CHAT</div><div class="scroll-row">${scrolls}</div>${makeCountdown('vote-clock-progress', '⌛')}`);
    if (motion) {
      const timeline = motion.timeline();
      timeline.fromTo('.vote-heading', { opacity: 0, y: -18 }, { opacity: 1, y: 0, duration: .8, ease: 'power2.out' }, 0)
        .fromTo('.vote-question', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .7 }, .35)
        .to('.vote-scroll', { scaleY: 1, duration: .9, stagger: .17, ease: 'back.out(1.55)' }, .15);
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
    if (leader !== null && currentVoteLeader !== null && leader !== currentVoteLeader) { showCallout('TAKES THE LEAD!', '#3ee6ff'); sound.chime(); particles.burst(window.innerWidth / 2, window.innerHeight * .5, 'spark', 24, '#3ee6ff'); }
    currentVoteLeader = leader;
    normalized.forEach((count, index) => {
      const bar = sceneLayer.querySelector(`[data-bar="${index}"]`);
      const countNode = sceneLayer.querySelector(`[data-count="${index}"]`);
      const percentNode = sceneLayer.querySelector(`[data-percent="${index}"]`);
      const card = sceneLayer.querySelector(`.vote-scroll[data-index="${index}"]`);
      const percent = total ? Math.round(count / total * 100) : 0;
      if (countNode) countNode.textContent = `${count} ${count === 1 ? 'witness' : 'witnesses'}`;
      if (percentNode) percentNode.textContent = `${percent}%`;
      if (bar && motion) motion.to(bar, { scaleX: percent / 100, transformOrigin: 'left center', duration: .55, ease: 'power2.out' });
      else if (bar) bar.style.transform = `scaleX(${percent / 100})`;
      if (card) {
        const isLeading = maximum > 0 && count === maximum;
        card.classList.toggle('leading', isLeading);
        if (motion) motion.to(card, { y: isLeading ? -12 : 0, duration: .45, ease: 'power2.out' });
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
      const timeline = motion.timeline({ onComplete: () => {
        if (sceneHoldMode) return;
        collectionCount += 1;
        const chip = byId('corner-chip');
        chip.innerHTML = `<span class="chip-sigil">${sigil}</span><span>LORE #${loreNumber}</span><b class="chip-count">+1</b>`;
        motion.fromTo(chip, { opacity: 0, y: -20, scale: .75 }, { opacity: 1, y: 0, scale: 1, duration: .55, ease: 'back.out(1.8)' });
        if (chipHideTimer) clearTimeout(chipHideTimer);
        chipHideTimer = setTimeout(() => safeTween(chip, { opacity: 0, y: -12, duration: .6 }), 30000);
        safeTween(byId('vignette'), { opacity: 0, duration: .5 }); safeTween(byId('ray-field'), { opacity: 0, duration: .5 });
        complete();
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
        .to('#rarity-callout', { opacity: 1, scale: 1, rotationX: 0, duration: .55, ease: 'back.out(2)' }, 3.25)
        .to('#rarity-callout', { opacity: 0, y: -40, duration: .35 }, 4.45)
        .to('#canon-stamp', { opacity: .92, scale: 1, duration: .55, ease: 'back.out(2.5)', onStart: () => { sound.stamp(); particles.burst(window.innerWidth / 2, window.innerHeight * .5, 'ember', 34, '#ff4d4d'); particles.burst(window.innerWidth / 2, window.innerHeight * .5, 'spark', 22, '#ff4d4d'); } }, 4.65)
        .to(wrap, { rotationY: 5, duration: 2, yoyo: true, repeat: 1, ease: 'sine.inOut' }, 5.3)
        .to({}, { duration: sceneHoldMode ? 6 : 2.25 }, 7.1);
      if (!sceneHoldMode) timeline.to(wrap, { x: window.innerWidth * .36, y: -window.innerHeight * .34, scale: .16, opacity: 0, duration: .8, ease: 'power3.in' }, 9.35);
    } else setTimeout(complete, 10000);
    scene.cleanups.push(() => { safeTween(byId('vignette'), { opacity: 0, duration: .25 }); safeTween(byId('ray-field'), { opacity: 0, duration: .25 }); });
  }

  function renderInitiation(data, scene, complete) {
    const user = data.user || {};
    const lore = data.lore || {};
    setSceneMarkup('initiation-scene', `<div class="achievement-pill" id="achievement-pill"><div class="achievement-icon">${imageTag(user)}<span class="candle-icon">🕯</span></div><div class="achievement-copy"><b>ACHIEVEMENT UNLOCKED</b><strong>@${escapeHtml(user.display_name || user.login || 'witness')}: Initiated into ${escapeHtml(lore.title || 'The Living Archive')}</strong><small>+1 LORE KNOWN</small></div><i class="achievement-sheen"></i></div>`);
    const avatar = sceneLayer.querySelector('.achievement-icon .avatar-orb');
    if (motion) motion.fromTo('#achievement-pill', { x: 640, opacity: 0, scale: 1.09 }, { x: 0, opacity: 1, scale: 1, duration: .65, ease: 'back.out(1.7)' });
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
      return `<div class="trial-tile" data-tile="${index}"><span class="tile-rune">${escapeHtml(letter)}</span><span class="tile-copy">${escapeHtml(title)}</span><span class="tile-count" data-trial-count="${index}">0</span></div>`;
    }).join('');
    setSceneMarkup('trial-scene', `<div class="trial-banner">⚔ THE LORE TRIALS ⚔</div><div class="trial-question">${escapeHtml(question)}</div><div class="trial-grid">${tiles}</div>${makeCountdown('trial-clock-progress', '⌛')}`);
    if (motion) {
      const timeline = motion.timeline();
      timeline.fromTo('.trial-banner', { y: -150, rotation: -8, opacity: 0 }, { y: 0, rotation: -2, opacity: 1, duration: .9, ease: 'back.out(2)' }, 0)
        .fromTo('.trial-question', { opacity: 0, scale: .82, y: 20 }, { opacity: 1, scale: 1, y: 0, duration: .7, ease: 'back.out(1.5)' }, .25)
        .fromTo('.trial-tile', { opacity: 0, y: 40, rotationX: 40, scale: .75 }, { opacity: 1, y: 0, rotationX: 0, scale: 1, duration: .65, stagger: .12, ease: 'back.out(1.6)' }, .4);
    }
    runCountdown(byId('trial-clock-progress'), data.endsAt, 20);
    updateTrialTally(latestTrialCounts);
  }

  function updateTrialTally(counts = []) {
    [0, 1, 2, 3].forEach((index) => {
      const node = sceneLayer.querySelector(`[data-trial-count="${index}"]`);
      if (node) { const next = String(Math.max(0, Number(counts[index]) || 0)); if (node.textContent !== next && motion) motion.fromTo(node, { scale: .7 }, { scale: 1.35, duration: .18, yoyo: true, repeat: 1, ease: 'back.out(2)' }); node.textContent = next; }
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
    const users = data.correctUsers || [];
    const leaderboard = data.leaderboard || [];
    const podiumNames = ['first', 'second', 'third'];
    const podium = leaderboard.slice(0, 3).map((user, index) => `<div class="podium-user ${podiumNames[index]}">${index === 0 ? '<span class="crown">\u{1F451}</span>' : ''}${imageTag(user, 'podium-avatar')}<strong>${escapeHtml(user.display_name || user.login)}</strong><small>${Number(user.score) || 0} lore points</small></div>`).join('');
    const rest = leaderboard.slice(3, 5).map((user, index) => `<span>${index + 4}. ${escapeHtml(user.display_name || user.login)} (${Number(user.score) || 0})</span>`).join('');
    const rain = users.map((user) => imageTag(user)).join('');
    setSceneMarkup('trial-result-scene', `<div class="trial-banner">\u{2694} THE LORE TRIALS \u{2694}</div><div class="trial-question">${escapeHtml(trial.question || 'Which tale belongs to the archive?')}</div><div class="trial-grid">${tiles}</div><div class="trial-result-panel"><div class="correct-rain" id="correct-rain">${rain}</div><div class="podium" id="podium">${podium || '<div class="podium-user first">No Loremaster this round</div>'}</div><div class="podium-rest">${rest}</div></div>`);
    if (motion) {
      motion.fromTo('.trial-banner', { y: -120, opacity: 0 }, { y: 0, opacity: 1, duration: .7, ease: 'back.out(2)' });
      motion.fromTo('.trial-tile', { scaleX: .68, scaleY: .94 }, { scaleX: 1, scaleY: 1, duration: .8, stagger: .08, ease: 'elastic.out(1,.55)' });
      motion.to('.trial-tile.correct', { scale: 1.08, duration: .4, delay: .8, ease: 'back.out(1.7)' });
      motion.fromTo('.podium-avatar', { y: -120, opacity: 0, scale: .3 }, { y: 0, opacity: 1, scale: 1, duration: .7, stagger: .15, delay: 1.45, ease: 'bounce.out' });
      motion.fromTo('#correct-rain .avatar-orb', { y: -500, opacity: 0, rotation: -24 }, { y: 0, opacity: 1, rotation: 0, duration: 1, stagger: .12, delay: .45, ease: 'bounce.out' });
      motion.fromTo('#podium', { y: 100, opacity: 0, scale: .78 }, { y: 0, opacity: 1, scale: 1, duration: .9, delay: 1.3, ease: 'back.out(1.6)' });
      motion.fromTo('.podium-rest', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: .6, delay: 2.1 });
      motion.delayedCall(6.8, complete);
    } else setTimeout(complete, 6800);
    sound.drumroll();
    hitStopImpact('#b6ff3e');
    showCallout('CORRECT!', '#b6ff3e');
    sound.stamp();
    particles.rain(window.innerWidth / 2, -20, 46);
    particles.burst(window.innerWidth / 2, window.innerHeight * .38, 'confetti', 100);
  }

  function routeMessage(event) {
    if (!event || typeof event.type !== 'string') return;
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

  function startSingleScene(name) {
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
        routeMessage({ type: 'summon', data: { joiners: witnesses.slice(0, 3), needed: 0, endsAt: new Date(Date.now() + 9000).toISOString() } });
        break;
      case 'fizzle': routeMessage({ type: 'fizzle', data: {} }); break;
      case 'decipher': routeMessage({ type: 'decipher', data: { summoners: witnesses.slice(0, 3) } }); break;
      case 'vote':
        routeMessage({ type: 'vote_open', data: { titles, endsAt: new Date(Date.now() + 12_000).toISOString() } });
        routeMessage({ type: 'vote_tally', data: { counts: [5, 8, 3] } });
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
        routeMessage({ type: 'trial_tally', data: { counts: [3, 8, 2, 1] } });
        sceneDemoTimer = setTimeout(() => routeMessage({
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
        }), 2200);
        break;
      }
    }
  }

  async function demoLoop() {
    while (!demoStopped) {
      routeMessage({ type: 'pressure', data: { phrase: 'the bucket', value: .4 } });
      await wait(900);
      routeMessage({ type: 'pressure', data: { phrase: 'chat is this real', value: .88 } });
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
    if (sceneDemoTimer) clearTimeout(sceneDemoTimer);
  });
})();
