(() => {
  'use strict';

  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const W = 1920;
  const H = 1080;
  const GROUND = 870;
  const HERO_X = 470;
  const query = new URLSearchParams(location.search);
  const hero = { x: 470, y: GROUND, vy: 0, jumping: false, climbing: false, climb: 0, leg: 0, squash: 1, blink: 0 };
  const obstacles = [];
  const pickups = [];
  const dust = [];
  let cameraX = 0;
  let worldX = 470;
  let nextObstacleX = 980;
  let nextPickupX = 720;
  let score = 0;
  let bonusScore = 0;
  let coins = 0;
  let distanceScore = 0;
  let lastFrame = 0;
  let elapsed = 0;
  let moment = null;
  let nextMomentAt = 45;
  let shake = 0;

  const obstacleKinds = ['crate', 'spikes', 'crab', 'crate', 'spikes'];
  const GRAVITY = 1700;
  const JUMP_VELOCITY = -1000;
  const AIR_TIME = -2 * JUMP_VELOCITY / GRAVITY;
  const coinKinds = ['coin', 'coin', 'gem'];
  const randomFrom = (seed, max) => ((Math.sin(seed * 12.9898) * 43758.5453) % 1 + 1) % 1 * max;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  }

  function addObstacle(x) {
    const kind = obstacleKinds[Math.floor(randomFrom(Math.floor(x), obstacleKinds.length))];
    obstacles.push({ x, kind, passed: false, phase: randomFrom(x + 13, 6.28) });
  }

  function fillAhead() {
    while (nextObstacleX < worldX + 2700) {
      addObstacle(nextObstacleX);
      nextObstacleX += 560 + randomFrom(nextObstacleX, 260);
    }
    while (nextPickupX < worldX + 2700) {
      const kind = coinKinds[Math.floor(randomFrom(nextPickupX, coinKinds.length))];
      pickups.push({ x: nextPickupX, y: GROUND - 120 - randomFrom(nextPickupX + 29, 210), kind, taken: false, spin: randomFrom(nextPickupX + 9, 6.28) });
      nextPickupX += 190 + randomFrom(nextPickupX, 180);
    }
  }

  function puff(x, y, amount = 7) {
    for (let i = 0; i < amount; i += 1) {
      dust.push({ x: x + (Math.random() - .5) * 35, y: y - Math.random() * 8, vx: (Math.random() - .5) * 95, vy: -25 - Math.random() * 95, life: .35 + Math.random() * .4, max: .75, size: 4 + Math.random() * 9 });
    }
  }

  function triggerMoment() {
    if (moment) return;
    moment = { start: elapsed, duration: 11.5 };
    shake = 0;
  }

  function nearestObstacle() {
    return obstacles.find((item) => !item.passed && item.x > worldX - 80);
  }

  function update(dt) {
    elapsed += dt;
    if (elapsed >= nextMomentAt) {
      triggerMoment();
      nextMomentAt = elapsed + 45;
    }
    if (moment) {
      if (elapsed - moment.start >= moment.duration) {
        moment = null;
        worldX += 520;
        for (let i = obstacles.length - 1; i >= 0; i -= 1) {
          if (obstacles[i].x > worldX - 200 && obstacles[i].x < worldX + 420) obstacles.splice(i, 1);
        }
        nextObstacleX = Math.max(nextObstacleX, worldX + 700);
        hero.x = worldX;
        hero.y = GROUND;
        hero.vy = 0;
        hero.jumping = false;
        hero.climbing = false;
        hero.squash = .76;
        puff(HERO_X, GROUND, 12);
        nextMomentAt = elapsed + 45;
      }
      updateDust(dt * .6);
      return;
    }

    fillAhead();
    const speed = 272 + Math.min(90, elapsed * .28);
    worldX += speed * dt;
    hero.x = worldX;
    cameraX = Math.max(0, worldX - HERO_X);
    hero.leg += dt * (hero.jumping ? 8 : 17);
    hero.blink = Math.max(0, hero.blink - dt);

    const next = nearestObstacle();
    const takeoff = speed * AIR_TIME / 2;
    if (next && !hero.jumping && next.x - worldX < takeoff && next.x - worldX > 0) {
      hero.jumping = true;
      hero.vy = JUMP_VELOCITY;
      hero.squash = 1.18;
      puff(HERO_X - 10, GROUND, 5);
    }
    if (hero.jumping) {
      hero.vy += GRAVITY * dt;
      hero.y += hero.vy * dt;
      if (hero.y >= GROUND) {
        hero.y = GROUND;
        hero.vy = 0;
        hero.jumping = false;
        hero.squash = .72;
        puff(HERO_X, GROUND, 8);
      }
    }
    hero.squash += (1 - hero.squash) * Math.min(1, dt * 7);
    distanceScore += speed * dt * .04;
    score = Math.floor(distanceScore) + bonusScore;

    for (const pickup of pickups) {
      if (pickup.taken) continue;
      const sx = pickup.x - worldX + HERO_X;
      const sy = pickup.y;
      if (Math.abs(sx - HERO_X) < 42 && Math.abs(sy - (hero.y - 55)) < 85) {
        pickup.taken = true;
        if (pickup.kind === 'coin') { coins += 1; bonusScore += 25; }
        else { coins += 3; bonusScore += 100; }
        score = Math.floor(distanceScore) + bonusScore;
      }
    }
    for (const item of obstacles) {
      if (item.x < worldX - 100) item.passed = true;
    }
    while (obstacles.length && obstacles[0].x < worldX - 900) obstacles.shift();
    while (pickups.length && (pickups[0].x < worldX - 900 || pickups[0].taken)) pickups.shift();
    updateDust(dt);
  }

  function updateDust(dt) {
    for (let i = dust.length - 1; i >= 0; i -= 1) {
      const mote = dust[i];
      mote.life -= dt;
      mote.x += mote.vx * dt;
      mote.y += mote.vy * dt;
      mote.vy += 160 * dt;
      if (mote.life <= 0) dust.splice(i, 1);
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function drawBackground(time, camera) {
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#17102f'); sky.addColorStop(.48, '#39235d'); sky.addColorStop(.77, '#784c72'); sky.addColorStop(1, '#d59666');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 160; i += 1) {
      const x = ((i * 193.7 - camera * .04) % W + W) % W;
      const y = 50 + ((i * 83.17) % 500);
      if (x > W - 360 && y < 120) continue;
      const blink = .28 + .35 * (1 + Math.sin(time * .001 + i * 2.4));
      ctx.globalAlpha = blink;
      ctx.fillStyle = i % 9 === 0 ? '#f5c451' : '#fff1fa';
      ctx.beginPath(); ctx.arc(x, y, i % 12 === 0 ? 2 : 1.15, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const moonGlow = ctx.createRadialGradient(1410, 255, 20, 1410, 255, 155);
    moonGlow.addColorStop(0, '#ffe9bb66'); moonGlow.addColorStop(1, '#ffe9bb00');
    ctx.fillStyle = moonGlow; ctx.beginPath(); ctx.arc(1410, 255, 155, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f9e4ba'; ctx.beginPath(); ctx.arc(1410, 255, 49, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#bba3c5';
    for (let i = 0; i < 13; i += 1) {
      const x = 180 + i * 130 - camera * .12;
      const wrapped = ((x % 2250) + 2250) % 2250 - 160;
      const y = 615 + Math.sin(i * 2.1) * 27;
      ctx.beginPath(); ctx.ellipse(wrapped, y, 180, 100 + (i % 3) * 14, 0, Math.PI, 0); ctx.fill();
    }
    drawCastle(camera * .28);
    ctx.fillStyle = '#35274e';
    for (let i = 0; i < 15; i += 1) {
      const x = ((i * 184 - camera * .43) % 2400 + 2400) % 2400 - 220;
      if (x < 410) continue;
      const y = 757 + Math.sin(i * 1.7) * 25;
      ctx.beginPath(); ctx.ellipse(x, y, 220, 91, 0, Math.PI, 0); ctx.fill();
    }
  }

  function drawCastle(offset) {
    const base = 690;
    for (let i = 0; i < 3; i += 1) {
      const x = ((440 + i * 430 - offset) % 2400 + 2400) % 2400 - 220;
      ctx.fillStyle = i === 1 ? '#241a39' : '#2c1f43';
      ctx.fillRect(x, base - 175, 220, 175);
      ctx.fillRect(x - 23, base - 225, 72, 225);
      ctx.fillRect(x + 78, base - 265, 67, 265);
      ctx.fillRect(x + 170, base - 205, 74, 205);
      ctx.fillStyle = '#17132b';
      for (const tx of [x - 23, x + 78, x + 170]) {
        ctx.beginPath(); ctx.moveTo(tx - 8, base - (tx === x + 78 ? 265 : tx === x - 23 ? 225 : 205));
        ctx.lineTo(tx + 30, base - (tx === x + 78 ? 316 : tx === x - 23 ? 278 : 253));
        ctx.lineTo(tx + 72, base - (tx === x + 78 ? 265 : tx === x - 23 ? 225 : 205)); ctx.fill();
      }
      for (let wx = 0; wx < 5; wx += 1) {
        const glow = .45 + .25 * Math.sin(elapsed * 1.2 + wx + i);
        ctx.fillStyle = `rgba(245,196,81,${glow})`;
        ctx.fillRect(x + 22 + wx * 39, base - 108 - (wx % 2) * 20, 10, 25);
      }
    }
  }

  function drawGround(camera, cliff = false) {
    const ground = ctx.createLinearGradient(0, GROUND, 0, H);
    ground.addColorStop(0, '#563d55'); ground.addColorStop(.13, '#352540'); ground.addColorStop(1, '#171523');
    ctx.fillStyle = ground;
    if (cliff) {
      ctx.fillRect(0, GROUND, 670, H - GROUND);
      ctx.fillRect(1170, GROUND, W - 1170, H - GROUND);
      ctx.fillStyle = '#1b1227';
      ctx.beginPath(); ctx.moveTo(670, GROUND); ctx.lineTo(1170, GROUND); ctx.lineTo(1170, H); ctx.lineTo(670, H); ctx.fill();
      ctx.fillStyle = '#f5c451'; ctx.fillRect(300, GROUND, 370, 8); ctx.fillRect(1170, GROUND, W - 1170, 8);
    } else {
      ctx.fillRect(0, GROUND, W, H - GROUND);
      ctx.fillStyle = '#f5c451'; ctx.fillRect(300, GROUND, W - 300, 8);
      ctx.fillStyle = '#ffe8aa'; ctx.globalAlpha = .45; ctx.fillRect(300, GROUND + 8, W - 300, 3); ctx.globalAlpha = 1;
    }
    const offset = camera % 90;
    ctx.fillStyle = '#dfb269';
    for (let i = 0; i < 24; i += 1) {
      const x = i * 90 - offset;
      if (x < 300) continue;
      ctx.fillRect(x, GROUND + 31 + (i % 3) * 12, 31 + (i % 4) * 6, 4);
    }
    for (let i = 0; i < 21; i += 1) {
      const x = ((i * 147 - camera * .72) % W + W) % W;
      const y = GROUND - 13 - (i % 3) * 13;
      if (x < 300) continue;
      ctx.fillStyle = i % 3 === 0 ? '#77a768' : '#66815f';
      ctx.beginPath(); ctx.ellipse(x, y, 22 + i % 4 * 5, 13, 0, Math.PI, 0); ctx.fill();
    }
  }

  function drawPickup(pickup, screenX, time) {
    if (pickup.taken || screenX < -80 || screenX > W + 80) return;
    const bob = Math.sin(time * .004 + pickup.spin) * 8;
    ctx.save(); ctx.translate(screenX, pickup.y + bob); ctx.rotate(Math.sin(time * .002 + pickup.spin) * .12);
    if (pickup.kind === 'coin') {
      const glow = ctx.createRadialGradient(0, 0, 3, 0, 0, 39);
      glow.addColorStop(0, '#fff6bd99'); glow.addColorStop(1, '#f5c45100');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, 0, 39, 0, Math.PI * 2); ctx.fill();
      const coin = ctx.createLinearGradient(-16, -24, 18, 24);
      coin.addColorStop(0, '#fff4a9'); coin.addColorStop(.45, '#f5c451'); coin.addColorStop(1, '#b46a23');
      ctx.fillStyle = coin; ctx.beginPath(); ctx.ellipse(0, 0, 18, 26, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff2b6'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, 10, 18, 0, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.shadowColor = '#3ee6ff'; ctx.shadowBlur = 26;
      const gem = ctx.createLinearGradient(-15, -22, 18, 25);
      gem.addColorStop(0, '#caffff'); gem.addColorStop(.42, '#3ee6ff'); gem.addColorStop(1, '#7553ff');
      ctx.fillStyle = gem; ctx.beginPath(); ctx.moveTo(0, -28); ctx.lineTo(23, -7); ctx.lineTo(15, 22); ctx.lineTo(0, 29); ctx.lineTo(-17, 19); ctx.lineTo(-22, -8); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = '#d8ffff'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.restore();
  }

  function drawObstacle(obstacle, screenX, time) {
    if (screenX < -150 || screenX > W + 150) return;
    if (obstacle.kind === 'crate') {
      const wood = ctx.createLinearGradient(screenX - 45, GROUND - 92, screenX + 45, GROUND);
      wood.addColorStop(0, '#c17a46'); wood.addColorStop(.5, '#8b4e38'); wood.addColorStop(1, '#583449');
      ctx.fillStyle = wood; roundRect(screenX - 47, GROUND - 91, 94, 87, 10); ctx.fill();
      ctx.strokeStyle = '#edbd72'; ctx.lineWidth = 8; ctx.stroke();
      ctx.strokeStyle = '#70424a'; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(screenX - 34, GROUND - 78); ctx.lineTo(screenX + 34, GROUND - 17); ctx.moveTo(screenX + 34, GROUND - 78); ctx.lineTo(screenX - 34, GROUND - 17); ctx.stroke();
      ctx.strokeStyle = '#f3ce8b'; ctx.lineWidth = 3; ctx.stroke();
    } else if (obstacle.kind === 'spikes') {
      ctx.fillStyle = '#52405f'; ctx.fillRect(screenX - 68, GROUND - 8, 136, 15);
      const metal = ctx.createLinearGradient(screenX, GROUND - 85, screenX, GROUND);
      metal.addColorStop(0, '#e5d7fb'); metal.addColorStop(.55, '#8e7dba'); metal.addColorStop(1, '#4d426c');
      ctx.fillStyle = metal;
      for (let i = 0; i < 4; i += 1) {
        ctx.beginPath(); ctx.moveTo(screenX - 66 + i * 34, GROUND + 3); ctx.lineTo(screenX - 49 + i * 34, GROUND - 79 - (i % 2) * 11); ctx.lineTo(screenX - 32 + i * 34, GROUND + 3); ctx.closePath(); ctx.fill();
      }
    } else if (obstacle.kind === 'ladder') {
      ctx.strokeStyle = '#e0b66b'; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(screenX - 35, GROUND); ctx.lineTo(screenX - 35, GROUND - 210); ctx.moveTo(screenX + 35, GROUND); ctx.lineTo(screenX + 35, GROUND - 210); ctx.stroke();
      ctx.strokeStyle = '#f8d991'; ctx.lineWidth = 8;
      for (let rung = 0; rung < 7; rung += 1) { ctx.beginPath(); ctx.moveTo(screenX - 32, GROUND - 22 - rung * 29); ctx.lineTo(screenX + 32, GROUND - 22 - rung * 29); ctx.stroke(); }
      ctx.fillStyle = '#a47e66'; ctx.fillRect(screenX - 59, GROUND - 7, 118, 11);
    } else {
      const scuttle = Math.sin(time * .012 + obstacle.phase) * 7;
      ctx.strokeStyle = '#7d263b'; ctx.lineWidth = 8; ctx.lineCap = 'round';
      for (let side = -1; side <= 1; side += 2) {
        for (let leg = 0; leg < 3; leg += 1) {
          const x = screenX + side * (27 + leg * 7);
          ctx.beginPath(); ctx.moveTo(screenX + side * 17, GROUND - 25); ctx.lineTo(x, GROUND - 17 + leg * 4); ctx.lineTo(x + side * 10, GROUND + scuttle); ctx.stroke();
        }
      }
      ctx.fillStyle = '#c23f50'; ctx.beginPath(); ctx.ellipse(screenX, GROUND - 34 + scuttle * .3, 39, 27, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ec6871'; ctx.beginPath(); ctx.ellipse(screenX - 9, GROUND - 43, 19, 10, -.22, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#cc4654'; ctx.lineWidth = 7;
      for (let side = -1; side <= 1; side += 2) { ctx.beginPath(); ctx.moveTo(screenX + side * 23, GROUND - 53); ctx.quadraticCurveTo(screenX + side * 45, GROUND - 77, screenX + side * 42, GROUND - 88); ctx.stroke(); }
      ctx.fillStyle = '#fff0ce'; ctx.beginPath(); ctx.arc(screenX - 12, GROUND - 48, 5, 0, Math.PI * 2); ctx.arc(screenX + 3, GROUND - 48, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#171222'; ctx.beginPath(); ctx.arc(screenX - 11, GROUND - 48, 2, 0, Math.PI * 2); ctx.arc(screenX + 4, GROUND - 48, 2, 0, Math.PI * 2); ctx.fill();
      ctx.lineCap = 'butt';
    }
  }

  function drawBucket(x, bottom, time, cinematic = false) {
    const run = hero.leg;
    const sx = cinematic ? 1 : hero.squash;
    const sy = cinematic ? 1 : 2 - hero.squash;
    ctx.save(); ctx.translate(x, bottom); ctx.scale(sx, sy);
    const legSwing = Math.sin(run) * (hero.jumping || cinematic ? 4 : 13);
    ctx.strokeStyle = '#273b77'; ctx.lineWidth = 13; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-20, -5); ctx.lineTo(-27 + legSwing, 5); ctx.lineTo(-29 + legSwing, 14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(20, -5); ctx.lineTo(27 - legSwing, 5); ctx.lineTo(29 - legSwing, 14); ctx.stroke();
    ctx.fillStyle = '#15203b'; ctx.beginPath(); ctx.ellipse(-30 + legSwing, 15, 15, 7, -.12, 0, Math.PI * 2); ctx.ellipse(30 - legSwing, 15, 15, 7, .12, 0, Math.PI * 2); ctx.fill();
    const body = ctx.createLinearGradient(-50, -130, 55, -8);
    body.addColorStop(0, '#9beaff'); body.addColorStop(.27, '#49b9ee'); body.addColorStop(.72, '#3183dc'); body.addColorStop(1, '#2056ad');
    ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(-48, -107); ctx.lineTo(48, -107); ctx.lineTo(34, -12); ctx.quadraticCurveTo(0, 1, -34, -12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#afefff'; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(-48, -108); ctx.quadraticCurveTo(0, -121, 48, -108); ctx.stroke();
    ctx.strokeStyle = '#2362b8'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(0, -105, 48, 12, 0, 0, Math.PI); ctx.stroke();
    ctx.fillStyle = '#ffffff55'; ctx.beginPath(); ctx.ellipse(-27, -73, 8, 26, -.18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff8df'; ctx.beginPath(); ctx.ellipse(-15, -71, 12, 16, 0, 0, Math.PI * 2); ctx.ellipse(17, -71, 12, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#152347'; ctx.beginPath(); ctx.arc(-12 + Math.sin(time * .001) * 1.5, -68, 6, 0, Math.PI * 2); ctx.arc(20 + Math.sin(time * .001) * 1.5, -68, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffb7ae'; ctx.beginPath(); ctx.arc(-37, -48, 7, 0, Math.PI * 2); ctx.arc(37, -48, 7, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#17315e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(3, -45, 9, .16, Math.PI - .16); ctx.stroke();
    ctx.strokeStyle = '#234c91'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(-45, -88); ctx.quadraticCurveTo(-62, -65, -52, -48); ctx.moveTo(45, -88); ctx.quadraticCurveTo(62, -65, 52, -48); ctx.stroke();
    ctx.restore();
  }

  function drawDust(camera) {
    for (const mote of dust) {
      const x = mote.x - camera;
      if (x < 300) continue;
      ctx.globalAlpha = clamp(mote.life / mote.max, 0, 1) * .65;
      ctx.fillStyle = '#f0c98e'; ctx.beginPath(); ctx.arc(x, mote.y, mote.size * (1 - mote.life / mote.max + .35), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    const panel = ctx.createLinearGradient(36, 34, 36, 143);
    panel.addColorStop(0, '#18112ddb'); panel.addColorStop(1, '#141020a8');
    ctx.fillStyle = panel; roundRect(34, 34, 372, 128, 17); ctx.fill();
    ctx.strokeStyle = '#f5c451'; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = '#fff0bf'; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = '900 32px Georgia, serif'; ctx.lineWidth = 5; ctx.strokeStyle = '#1b1128';
    ctx.strokeText('BUCKET QUEST', 57, 77); ctx.fillText('BUCKET QUEST', 57, 77);
    ctx.font = '900 23px Georgia, serif'; ctx.fillStyle = '#f5e9d1';
    ctx.strokeText(`SCORE  ${String(score).padStart(6, '0')}`, 58, 119); ctx.fillText(`SCORE  ${String(score).padStart(6, '0')}`, 58, 119);
    ctx.fillStyle = '#ffd55c'; ctx.strokeText(`COINS  ${String(coins).padStart(3, '0')}  ◆`, 58, 148); ctx.fillText(`COINS  ${String(coins).padStart(3, '0')}  ◆`, 58, 148);
  }

  function momentPosition(t) {
    const points = [
      [0, 510, 868], [.72, 735, 800], [1.45, 930, 740], [2.3, 1035, 660], [3.15, 1090, 710],
      [4.2, 1190, 630], [5.05, 1280, 710], [6.2, 1515, 790], [8.8, 1515, 790],
    ];
    for (let i = 1; i < points.length; i += 1) {
      if (t <= points[i][0]) {
        const a = points[i - 1]; const b = points[i];
        let p = clamp((t - a[0]) / (b[0] - a[0]), 0, 1);
        p = p * p * (3 - 2 * p);
        return { x: a[1] + (b[1] - a[1]) * p, y: a[2] + (b[2] - a[2]) * p, bounce: i === 2 || i === 4 || i === 6 };
      }
    }
    return { x: 1515, y: 790, bounce: false };
  }

  function drawMoment(time) {
    const t = Math.min(8.8, (elapsed - moment.start) * .78);
    drawBackground(time, 0);
    drawGround(0, true);
    ctx.fillStyle = '#332743'; ctx.fillRect(0, GROUND + 8, 670, 180);
    ctx.fillStyle = '#6e4b5c'; ctx.beginPath(); ctx.moveTo(670, GROUND + 8); ctx.lineTo(715, GROUND + 48); ctx.lineTo(746, GROUND + 148); ctx.lineTo(780, 1075); ctx.lineTo(670, 1075); ctx.fill();
    ctx.fillStyle = '#2b203d'; ctx.beginPath(); ctx.moveTo(1170, GROUND + 8); ctx.lineTo(1123, GROUND + 65); ctx.lineTo(1080, 1060); ctx.lineTo(1170, 1060); ctx.fill();
    ctx.fillStyle = '#e3b566'; ctx.fillRect(1454, 789, 122, 18);
    ctx.fillStyle = '#6f4f76'; ctx.fillRect(1465, 807, 100, GROUND + 165 - 807);
    ctx.strokeStyle = '#ffe89f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(1450, 789); ctx.lineTo(1580, 789); ctx.stroke();
    for (const [x, y, color] of [[930, 781, '#f5c451'], [1090, 750, '#3ee6ff'], [1280, 752, '#ff3ea5']]) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 4 + x) * .18);
      ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 22; ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#fff7db'; ctx.beginPath(); ctx.arc(-6, -7, 6, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    const pose = momentPosition(t);
    const bounceWindow = [1.45, 3.15, 5.05].some((beat) => Math.abs(t - beat) < .38);
    shake = bounceWindow ? Math.max(shake, 12) : shake * .82;
    const sx = (Math.random() - .5) * shake;
    const sy = (Math.random() - .5) * shake;
    drawBucket(pose.x + sx, pose.y + sy, time, true);
    const popupAlpha = clamp((t - 6.1) * 2, 0, 1) * clamp((8.8 - t) * 2, 0, 1);
    if (popupAlpha > 0) {
      const pop = 1 + Math.sin(clamp((t - 6.1) * 2, 0, 1) * Math.PI) * .16;
      ctx.save(); ctx.globalAlpha = popupAlpha; ctx.translate(960, 400); ctx.scale(pop, pop);
      ctx.font = '900 100px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 19; ctx.strokeStyle = '#3d1d50'; ctx.strokeText('IMPOSSIBLE!', 0, 0);
      const gold = ctx.createLinearGradient(0, -60, 0, 65); gold.addColorStop(0, '#fff7c4'); gold.addColorStop(.48, '#f5c451'); gold.addColorStop(1, '#f18a4f');
      ctx.fillStyle = gold; ctx.shadowColor = '#f5c451'; ctx.shadowBlur = 42; ctx.fillText('IMPOSSIBLE!', 0, 0); ctx.restore();
    }
    drawHud();
  }

  function render(time) {
    ctx.save();
    if (moment) drawMoment(time);
    else {
      drawBackground(time, cameraX);
      drawGround(cameraX);
      for (const pickup of pickups) drawPickup(pickup, pickup.x - cameraX, time);
      for (const obstacle of obstacles) drawObstacle(obstacle, obstacle.x - cameraX, time);
      drawDust(cameraX);
      drawBucket(worldX - cameraX, hero.y, time);
      drawHud();
    }
    ctx.restore();
  }

  function frame(time) {
    if (!lastFrame) lastFrame = time;
    const dt = Math.min(.04, Math.max(0, (time - lastFrame) / 1000));
    lastFrame = time;
    update(dt);
    render(time);
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'm' && !event.repeat) triggerMoment();
  });
  resize();
  requestAnimationFrame(frame);
  if (query.get('moment') === '1') setTimeout(triggerMoment, 250);
})();
