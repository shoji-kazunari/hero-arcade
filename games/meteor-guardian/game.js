(function () {
  "use strict";

  var BEST_KEY = "heroArcade.meteorGuardian.bestWave";

  var HP_MAX = 24;
  var CHAIN_HEAL = 1;
  var MAX_AMMO = 5;
  var TAP_MAX_DIST = 12;
  var WAVE_INTRO_DURATION = 1.4;
  var EXPLOSION_DURATION = 1.0;
  var BULLET_SPEED = 620;
  var BLACK_CHANCE = 0.12;
  var GRID_COLS = 6;
  var GRID_ROWS = 5;
  var CELL_REMOVE_CHANCE = 0.15;

  var SIZE_DEF = {
    small: { radius: 10, blast: 100, damage: 2, weight: 45 },
    medium: { radius: 15, blast: 130, damage: 4, weight: 35 },
    large: { radius: 21, blast: 170, damage: 8, weight: 20 }
  };
  var SIZE_NAMES = Object.keys(SIZE_DEF);

  var canvas = document.getElementById("gameCanvas");
  var ctx = canvas.getContext("2d");
  var hudWave = document.getElementById("hudWave");
  var startOverlay = document.getElementById("startOverlay");
  var gameOverOverlay = document.getElementById("gameOverOverlay");
  var startButton = document.getElementById("startButton");
  var retryButton = document.getElementById("retryButton");
  var finalWaveEl = document.getElementById("finalScore");
  var bestWaveEl = document.getElementById("bestScore");

  var W = 0;
  var H = 0;
  var dpr = 1;
  var damageLine = 0;
  var shipY = 0;

  var STATE_READY = "ready";
  var STATE_INTRO = "intro";
  var STATE_PLAYING = "playing";
  var STATE_OVER = "over";
  var state = STATE_READY;

  var ship = { x: 0, targetX: 0, radius: 18 };
  var hp = HP_MAX;
  var ammo = MAX_AMMO;
  var waveNumber = 1;
  var introTimer = 0;

  var bullets = [];
  var meteors = [];
  var explosions = [];
  var particles = [];
  var popups = [];

  var chainCount = 0;
  var chainDisplayTimer = 0;
  var waveAnyLeaked = false;

  var shake = 0;
  var lastTime = 0;

  var pointerActive = false;
  var pointerStartX = 0;
  var pointerStartY = 0;
  var pointerMoved = 0;

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    damageLine = H * 0.8;
    shipY = H * 0.75;

    if (ship.x === 0) {
      ship.x = W / 2;
      ship.targetX = W / 2;
    }
    ship.x = clamp(ship.x, ship.radius + 8, W - ship.radius - 8);
    ship.targetX = clamp(ship.targetX, ship.radius + 8, W - ship.radius - 8);
  }

  function pickWeightedSize() {
    var total = 0;
    var i;
    for (i = 0; i < SIZE_NAMES.length; i++) total += SIZE_DEF[SIZE_NAMES[i]].weight;
    var r = Math.random() * total;
    for (i = 0; i < SIZE_NAMES.length; i++) {
      r -= SIZE_DEF[SIZE_NAMES[i]].weight;
      if (r <= 0) return SIZE_NAMES[i];
    }
    return SIZE_NAMES[0];
  }

  function isGridConnected(occupied, rows, cols) {
    var total = 0;
    var startR = -1;
    var startC = -1;
    var r, c;
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        if (occupied[r][c]) {
          total++;
          if (startR < 0) {
            startR = r;
            startC = c;
          }
        }
      }
    }
    if (total === 0) return true;
    var seen = [];
    for (r = 0; r < rows; r++) seen.push(new Array(cols).fill(false));
    var stack = [[startR, startC]];
    seen[startR][startC] = true;
    var reached = 1;
    while (stack.length) {
      var cur = stack.pop();
      for (var dr = -1; dr <= 1; dr++) {
        for (var dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          var nr = cur[0] + dr;
          var nc = cur[1] + dc;
          if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
          if (!occupied[nr][nc] || seen[nr][nc]) continue;
          seen[nr][nc] = true;
          reached++;
          stack.push([nr, nc]);
        }
      }
    }
    return reached === total;
  }

  function buildWave(number) {
    var rows = GRID_ROWS;
    var cols = GRID_COLS;
    var marginX = 40;
    var colGap = (W - marginX * 2) / (cols - 1);
    var rowGap = 52;

    var occupied = [];
    var r, c;
    for (r = 0; r < rows; r++) {
      occupied.push(new Array(cols).fill(true));
    }

    var order = [];
    for (r = 0; r < rows; r++) for (c = 0; c < cols; c++) order.push([r, c]);
    order.sort(function () { return Math.random() - 0.5; });

    order.forEach(function (cell) {
      if (Math.random() < CELL_REMOVE_CHANCE) {
        occupied[cell[0]][cell[1]] = false;
        if (!isGridConnected(occupied, rows, cols)) {
          occupied[cell[0]][cell[1]] = true;
        }
      }
    });

    var list = [];
    var hasGray = false;
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        if (!occupied[r][c]) continue;
        var size = pickWeightedSize();
        var color = Math.random() < BLACK_CHANCE ? "black" : "gray";
        if (color === "gray") hasGray = true;
        list.push({
          x: marginX + c * colGap + rand(-4, 4),
          offsetY: r * rowGap + rand(-4, 4),
          size: size,
          radius: SIZE_DEF[size].radius,
          color: color,
          rotation: rand(0, Math.PI * 2),
          spin: rand(-1, 1),
          craters: makeCraters(SIZE_DEF[size].radius)
        });
      }
    }
    if (!hasGray && list.length > 0) list[0].color = "gray";

    var vy = 36 + Math.min(number, 12) * 4;
    var startY = -(rows - 1) * rowGap - 60;

    return { meteors: list, formationY: startY, vy: vy, anyLeaked: false };
  }

  function makeCraters(radius) {
    var count = 2 + Math.floor(radius / 8);
    var craters = [];
    for (var i = 0; i < count; i++) {
      var a = rand(0, Math.PI * 2);
      var d = rand(0, radius * 0.5);
      craters.push({
        x: Math.cos(a) * d,
        y: Math.sin(a) * d,
        r: rand(radius * 0.15, radius * 0.3)
      });
    }
    return craters;
  }

  var wave = null;

  function meteorY(m) {
    return wave.formationY + m.offsetY;
  }

  function spawnBurst(x, y, color, count) {
    for (var i = 0; i < count; i++) {
      var a = rand(0, Math.PI * 2);
      var speed = rand(40, 220);
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0,
        maxLife: rand(0.3, 0.6),
        radius: rand(1.5, 4),
        color: color
      });
    }
  }

  function spawnPopup(x, y, text, color) {
    popups.push({ x: x, y: y, text: text, color: color, life: 0, maxLife: 0.7 });
  }

  function triggerExplosion(m) {
    var idx = meteors.indexOf(m);
    if (idx === -1) return;
    meteors.splice(idx, 1);
    explosions.push({
      x: m.x,
      y: meteorY(m),
      age: 0,
      duration: EXPLOSION_DURATION,
      maxRadius: SIZE_DEF[m.size].blast
    });
    spawnBurst(m.x, meteorY(m), m.color === "black" ? "120,120,140" : "255,180,90", 14);
    chainCount += 1;
    chainDisplayTimer = 0.8;
    hp = Math.min(HP_MAX, hp + CHAIN_HEAL);
  }

  function startWave() {
    wave = buildWave(waveNumber);
    meteors = wave.meteors;
    bullets = [];
    explosions = [];
    waveAnyLeaked = false;
    chainCount = 0;
    chainDisplayTimer = 0;
    hudWave.textContent = "WAVE " + waveNumber;
    state = STATE_INTRO;
    introTimer = WAVE_INTRO_DURATION;
  }

  function resetGame() {
    hp = HP_MAX;
    ammo = MAX_AMMO;
    waveNumber = 1;
    particles = [];
    popups = [];
    ship.x = W / 2;
    ship.targetX = W / 2;
    startWave();
  }

  function startGame() {
    resetGame();
    startOverlay.hidden = true;
    gameOverOverlay.hidden = true;
  }

  function endGame() {
    state = STATE_OVER;
    var best = Number(localStorage.getItem(BEST_KEY) || 0);
    if (waveNumber > best) {
      best = waveNumber;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
    }
    finalWaveEl.textContent = String(waveNumber);
    bestWaveEl.textContent = String(best);
    gameOverOverlay.hidden = false;
  }

  function fireBullet() {
    if (ammo <= 0) return;
    ammo -= 1;
    bullets.push({ x: ship.x, y: shipY - ship.radius * 0.6 });
  }

  function updateIntro(dt) {
    introTimer -= dt;
    if (introTimer <= 0) {
      state = STATE_PLAYING;
    }
  }

  function updatePlaying(dt) {
    wave.formationY += wave.vy * dt;

    for (var bi = bullets.length - 1; bi >= 0; bi--) {
      var b = bullets[bi];
      b.y -= BULLET_SPEED * dt;
      if (b.y < -20) {
        bullets.splice(bi, 1);
        continue;
      }
      for (var mi = 0; mi < meteors.length; mi++) {
        var m = meteors[mi];
        var my = meteorY(m);
        var dx = b.x - m.x;
        var dy = b.y - my;
        if (dx * dx + dy * dy <= m.radius * m.radius) {
          bullets.splice(bi, 1);
          if (m.color === "black") {
            spawnBurst(m.x, my, "120,120,140", 4);
          } else {
            triggerExplosion(m);
          }
          break;
        }
      }
    }

    for (var ei = explosions.length - 1; ei >= 0; ei--) {
      var ex = explosions[ei];
      ex.age += dt;
      var radius = ex.maxRadius * Math.min(1, ex.age / ex.duration);
      for (var qi = meteors.length - 1; qi >= 0; qi--) {
        var meteor = meteors[qi];
        var mx = meteor.x;
        var myy = meteorY(meteor);
        var ddx = mx - ex.x;
        var ddy = myy - ex.y;
        if (ddx * ddx + ddy * ddy <= radius * radius) {
          triggerExplosion(meteor);
        }
      }
      if (ex.age >= ex.duration) explosions.splice(ei, 1);
    }

    for (var mi2 = meteors.length - 1; mi2 >= 0; mi2--) {
      var meteor2 = meteors[mi2];
      meteor2.rotation += meteor2.spin * dt;
      var my2 = meteorY(meteor2);
      if (my2 + meteor2.radius >= damageLine) {
        meteors.splice(mi2, 1);
        var dmg = SIZE_DEF[meteor2.size].damage;
        hp -= dmg;
        waveAnyLeaked = true;
        shake = 0.3;
        spawnBurst(meteor2.x, damageLine, "255,120,70", 14);
        spawnPopup(meteor2.x, damageLine - 16, "-" + dmg, "#ff6b4a");
        if (hp <= 0) {
          hp = 0;
          endGame();
          return;
        }
      }
    }

    if (chainDisplayTimer > 0) {
      chainDisplayTimer -= dt;
      if (chainDisplayTimer <= 0) chainCount = 0;
    }

    if (meteors.length === 0 && explosions.length === 0) {
      if (!waveAnyLeaked) {
        ammo = Math.min(MAX_AMMO, ammo + 1);
        spawnPopup(W / 2, shipY - 60, "WAVE CLEAR!", "#7cffb2");
      }
      waveNumber += 1;
      startWave();
    }
  }

  function update(dt) {
    if (pointerActive) {
      ship.targetX = clamp(ship.targetX, ship.radius + 8, W - ship.radius - 8);
    }
    ship.x += (ship.targetX - ship.x) * Math.min(1, dt * 14);

    if (state === STATE_INTRO) updateIntro(dt);
    else if (state === STATE_PLAYING) updatePlaying(dt);

    for (var pi = particles.length - 1; pi >= 0; pi--) {
      var p = particles[pi];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
      if (p.life >= p.maxLife) particles.splice(pi, 1);
    }

    for (var qi = popups.length - 1; qi >= 0; qi--) {
      var q = popups[qi];
      q.life += dt;
      if (q.life >= q.maxLife) popups.splice(qi, 1);
    }

    if (shake > 0) shake = Math.max(0, shake - dt * 1.4);
  }

  function drawBackdrop() {
    var grad = ctx.createLinearGradient(0, damageLine, 0, H);
    grad.addColorStop(0, "#123a1f");
    grad.addColorStop(1, "#0a2013");
    ctx.fillStyle = grad;
    ctx.fillRect(0, damageLine, W, H - damageLine);

    ctx.beginPath();
    ctx.moveTo(0, damageLine);
    ctx.lineTo(W, damageLine);
    ctx.strokeStyle = "rgba(120,255,170,0.35)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function drawShip() {
    ctx.save();
    ctx.translate(ship.x, shipY);
    ctx.font = (ship.radius * 2.1) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🦸", 0, 2);
    ctx.restore();
  }

  function drawMeteor(m) {
    var my = meteorY(m);
    ctx.save();
    ctx.translate(m.x, my);
    ctx.rotate(m.rotation);
    ctx.beginPath();
    ctx.arc(0, 0, m.radius, 0, Math.PI * 2);
    ctx.fillStyle = m.color === "black" ? "#2b2b33" : "#7a6a5c";
    ctx.fill();
    ctx.fillStyle = m.color === "black" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.25)";
    m.craters.forEach(function (c) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawBullet(b) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#ffe4a8";
    ctx.shadowColor = "#ff6b4a";
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawExplosion(ex) {
    var t = Math.min(1, ex.age / ex.duration);
    var radius = ex.maxRadius * t;
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,150,60," + (0.22 * (1 - t)) + ")";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,200,110," + (0.6 * (1 - t)) + ")";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  function drawParticles() {
    particles.forEach(function (p) {
      var t = 1 - p.life / p.maxLife;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * t, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(" + p.color + "," + t + ")";
      ctx.fill();
    });
  }

  function drawPopups() {
    ctx.textAlign = "center";
    ctx.font = "bold 15px sans-serif";
    popups.forEach(function (q) {
      var t = q.life / q.maxLife;
      ctx.fillStyle = q.color;
      ctx.globalAlpha = 1 - t;
      ctx.fillText(q.text, q.x, q.y - t * 36);
      ctx.globalAlpha = 1;
    });
  }

  function drawHpBar() {
    var barW = W - 32;
    var barH = 16;
    var barX = 16;
    var barY = H - 28;
    var ratio = clamp(hp / HP_MAX, 0, 1);
    var color = ratio > 0.5 ? "#7cffb2" : ratio > 0.25 ? "#ffd66e" : "#ff6b4a";

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = color;
    ctx.fillRect(barX, barY, barW * ratio, barH);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(barX, barY, barW, barH);
  }

  function drawAmmo() {
    var baseX = 26;
    var baseY = H - 40;
    var gap = 16;
    for (var i = 0; i < MAX_AMMO; i++) {
      var cy = baseY - i * gap;
      ctx.beginPath();
      ctx.arc(baseX, cy, 6, 0, Math.PI * 2);
      if (i < ammo) {
        ctx.fillStyle = "#ffd66e";
        ctx.fill();
      } else {
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  function drawChainCounter() {
    if (chainDisplayTimer <= 0 || chainCount <= 0) return;
    ctx.textAlign = "center";
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = "#ffd66e";
    ctx.fillText(chainCount + " CHAIN!", W / 2, H - 46);
  }

  function drawWaveIntro() {
    ctx.save();
    ctx.globalAlpha = clamp(introTimer / 0.4, 0, 1) * clamp((WAVE_INTRO_DURATION - introTimer) / 0.4, 0, 1) || 1;
    ctx.textAlign = "center";
    ctx.font = "bold 30px sans-serif";
    ctx.fillStyle = "#eef1fb";
    ctx.fillText("WAVE " + waveNumber, W / 2, H * 0.4);
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    if (shake > 0) {
      ctx.translate(rand(-6, 6) * shake, rand(-6, 6) * shake);
    }

    drawBackdrop();
    if (wave) meteors.forEach(drawMeteor);
    explosions.forEach(drawExplosion);
    bullets.forEach(drawBullet);
    drawParticles();
    drawPopups();
    if (state === STATE_PLAYING || state === STATE_INTRO) drawShip();

    ctx.restore();

    if (state === STATE_PLAYING || state === STATE_INTRO) {
      drawHpBar();
      drawAmmo();
      drawChainCounter();
    }
    if (state === STATE_INTRO) drawWaveIntro();
  }

  function loop(ts) {
    if (!lastTime) lastTime = ts;
    var dt = Math.min(0.04, (ts - lastTime) / 1000);
    lastTime = ts;

    if (state === STATE_INTRO || state === STATE_PLAYING) {
      update(dt);
    }
    draw();
    requestAnimationFrame(loop);
  }

  function eventX(e) {
    var rect = canvas.getBoundingClientRect();
    return (e.clientX !== undefined ? e.clientX : e.touches[0].clientX) - rect.left;
  }

  function eventY(e) {
    var rect = canvas.getBoundingClientRect();
    return (e.clientY !== undefined ? e.clientY : e.touches[0].clientY) - rect.top;
  }

  canvas.addEventListener("pointerdown", function (e) {
    if (state !== STATE_PLAYING && state !== STATE_INTRO) return;
    pointerActive = true;
    pointerStartX = eventX(e);
    pointerStartY = eventY(e);
    pointerMoved = 0;
    ship.targetX = clamp(pointerStartX, ship.radius + 8, W - ship.radius - 8);
  });

  canvas.addEventListener("pointermove", function (e) {
    if (!pointerActive) return;
    var x = eventX(e);
    var y = eventY(e);
    var dx = x - pointerStartX;
    var dy = y - pointerStartY;
    pointerMoved = Math.max(pointerMoved, Math.sqrt(dx * dx + dy * dy));
    ship.targetX = clamp(x, ship.radius + 8, W - ship.radius - 8);
  });

  function pointerEnd() {
    if (!pointerActive) return;
    pointerActive = false;
    if (pointerMoved <= TAP_MAX_DIST && state === STATE_PLAYING) {
      fireBullet();
    }
  }

  canvas.addEventListener("pointerup", pointerEnd);
  canvas.addEventListener("pointercancel", pointerEnd);

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);

  startButton.addEventListener("click", startGame);
  retryButton.addEventListener("click", startGame);

  resize();
  requestAnimationFrame(loop);
})();
