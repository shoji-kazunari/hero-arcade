(function () {
  "use strict";

  var BEST_KEY = "heroArcade.meteorGuardian.best";
  var CATCH_RADIUS = 42;
  var HERO_FLASH_DURATION = 0.25;

  var canvas = document.getElementById("gameCanvas");
  var ctx = canvas.getContext("2d");
  var hudLives = document.getElementById("hudLives");
  var hudScore = document.getElementById("hudScore");
  var startOverlay = document.getElementById("startOverlay");
  var gameOverOverlay = document.getElementById("gameOverOverlay");
  var startButton = document.getElementById("startButton");
  var retryButton = document.getElementById("retryButton");
  var finalScoreEl = document.getElementById("finalScore");
  var bestScoreEl = document.getElementById("bestScore");

  var W = 0;
  var H = 0;
  var dpr = 1;

  var STATE_READY = "ready";
  var STATE_PLAYING = "playing";
  var STATE_OVER = "over";
  var state = STATE_READY;

  var earth = { x: 0, y: 0, radius: 0 };
  var hero = { x: 0, y: 0, targetX: 0, radius: 18 };
  var meteors = [];
  var particles = [];
  var popups = [];

  var score = 0;
  var lives = 3;
  var elapsed = 0;
  var spawnTimer = 0;
  var heroFlash = 0;
  var shake = 0;
  var lastTime = 0;
  var moveLeft = false;
  var moveRight = false;

  var METEOR_KINDS = [
    { name: "small", radiusMin: 13, radiusMax: 17, speedMult: 1.3, points: 10, weight: 55 },
    { name: "medium", radiusMin: 21, radiusMax: 27, speedMult: 1.0, points: 25, weight: 32 },
    { name: "large", radiusMin: 32, radiusMax: 40, speedMult: 0.75, points: 50, weight: 13 }
  ];

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    earth.radius = W * 0.58;
    earth.x = W / 2;
    earth.y = H + earth.radius * 0.42;

    hero.y = earthTopY() - 70;
    if (hero.x === 0) {
      hero.x = W / 2;
      hero.targetX = W / 2;
    }
    hero.x = clamp(hero.x, hero.radius + 8, W - hero.radius - 8);
    hero.targetX = clamp(hero.targetX, hero.radius + 8, W - hero.radius - 8);
  }

  function earthTopY() {
    return earth.y - earth.radius;
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function pickMeteorKind() {
    var bonus = clamp(elapsed / 40, 0, 1);
    var weights = METEOR_KINDS.map(function (k, i) {
      if (i === 0) return k.weight * (1 - bonus * 0.5);
      return k.weight * (1 + bonus * 0.8);
    });
    var total = weights.reduce(function (a, b) { return a + b; }, 0);
    var r = Math.random() * total;
    for (var i = 0; i < METEOR_KINDS.length; i++) {
      r -= weights[i];
      if (r <= 0) return METEOR_KINDS[i];
    }
    return METEOR_KINDS[0];
  }

  function spawnMeteor() {
    var kind = pickMeteorKind();
    var radius = rand(kind.radiusMin, kind.radiusMax);
    var baseSpeed = 50 + elapsed * 2.2;
    meteors.push({
      x: rand(radius + 6, W - radius - 6),
      y: -radius - 10,
      radius: radius,
      vy: (baseSpeed + rand(-8, 8)) * kind.speedMult,
      rotation: rand(0, Math.PI * 2),
      spin: rand(-1.2, 1.2),
      points: kind.points,
      resolved: false,
      craters: makeCraters(radius)
    });
  }

  function makeCraters(radius) {
    var count = 3 + Math.floor(radius / 10);
    var craters = [];
    for (var i = 0; i < count; i++) {
      var a = rand(0, Math.PI * 2);
      var d = rand(0, radius * 0.55);
      craters.push({
        x: Math.cos(a) * d,
        y: Math.sin(a) * d,
        r: rand(radius * 0.12, radius * 0.28)
      });
    }
    return craters;
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

  function resetGame() {
    meteors = [];
    particles = [];
    popups = [];
    score = 0;
    lives = 3;
    elapsed = 0;
    spawnTimer = 0;
    heroFlash = 0;
    shake = 0;
    hero.x = W / 2;
    hero.targetX = W / 2;
    renderHud();
  }

  function renderHud() {
    hudScore.textContent = String(score);
    hudLives.innerHTML = "";
    for (var i = 0; i < 3; i++) {
      var span = document.createElement("span");
      span.textContent = "❤️";
      if (i >= lives) span.className = "hud__life--lost";
      hudLives.appendChild(span);
    }
  }

  function startGame() {
    resetGame();
    state = STATE_PLAYING;
    startOverlay.hidden = true;
    gameOverOverlay.hidden = true;
  }

  function endGame() {
    state = STATE_OVER;
    var best = Number(localStorage.getItem(BEST_KEY) || 0);
    if (score > best) {
      best = score;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
    }
    finalScoreEl.textContent = String(score);
    bestScoreEl.textContent = String(best);
    gameOverOverlay.hidden = false;
  }

  function update(dt) {
    elapsed += dt;

    if (moveLeft) hero.targetX -= 340 * dt;
    if (moveRight) hero.targetX += 340 * dt;
    hero.targetX = clamp(hero.targetX, hero.radius + 8, W - hero.radius - 8);
    hero.x += (hero.targetX - hero.x) * Math.min(1, dt * 12);

    if (heroFlash > 0) heroFlash = Math.max(0, heroFlash - dt);

    spawnTimer -= dt;
    var spawnInterval = Math.max(0.5, 1.5 - elapsed * 0.018);
    if (spawnTimer <= 0) {
      spawnMeteor();
      spawnTimer = spawnInterval;
    }

    for (var mi = meteors.length - 1; mi >= 0; mi--) {
      var m = meteors[mi];
      m.y += m.vy * dt;
      m.rotation += m.spin * dt;

      if (!m.resolved && m.y + m.radius >= hero.y) {
        m.resolved = true;
        if (Math.abs(m.x - hero.x) <= CATCH_RADIUS) {
          score += m.points;
          heroFlash = HERO_FLASH_DURATION;
          spawnBurst(m.x, m.y, "255,214,110", 16);
          spawnPopup(hero.x, hero.y - hero.radius - 10, "CATCH +" + m.points, "#ffd66e");
          meteors.splice(mi, 1);
          renderHud();
          continue;
        }
      }

      if (m.y + m.radius >= earthTopY()) {
        meteors.splice(mi, 1);
        lives -= 1;
        shake = 0.35;
        spawnBurst(m.x, earthTopY(), "255,120,70", 18);
        spawnPopup(m.x, earthTopY() - 16, "MISS", "#ff6b4a");
        renderHud();
        if (lives <= 0) {
          endGame();
          return;
        }
        continue;
      }
    }

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

  function drawEarth() {
    var grad = ctx.createRadialGradient(
      earth.x - earth.radius * 0.3, earth.y - earth.radius * 0.3, earth.radius * 0.1,
      earth.x, earth.y, earth.radius
    );
    grad.addColorStop(0, "#3aa0ff");
    grad.addColorStop(0.55, "#1c6fd6");
    grad.addColorStop(1, "#0c3a80");
    ctx.beginPath();
    ctx.arc(earth.x, earth.y, earth.radius, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.fillStyle = "rgba(40,180,110,0.55)";
    ctx.beginPath();
    ctx.ellipse(earth.x - earth.radius * 0.35, earth.y - earth.radius * 0.55, earth.radius * 0.35, earth.radius * 0.18, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(earth.x + earth.radius * 0.3, earth.y - earth.radius * 0.35, earth.radius * 0.28, earth.radius * 0.14, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(earth.x, earth.y, earth.radius + 6, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(120,190,255,0.35)";
    ctx.lineWidth = 6;
    ctx.stroke();
  }

  function drawHero() {
    var scale = heroFlash > 0 ? 1 + (heroFlash / HERO_FLASH_DURATION) * 0.35 : 1;
    ctx.save();
    ctx.translate(hero.x, hero.y);
    ctx.scale(scale, scale);
    ctx.font = (hero.radius * 2.1) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🦸", 0, 2);
    ctx.restore();

    if (heroFlash > 0) {
      var t = 1 - heroFlash / HERO_FLASH_DURATION;
      ctx.beginPath();
      ctx.arc(hero.x, hero.y, hero.radius + t * 40, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,214,110," + (1 - t) + ")";
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }

  function drawMeteor(m) {
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(m.rotation);
    ctx.beginPath();
    ctx.arc(0, 0, m.radius, 0, Math.PI * 2);
    ctx.fillStyle = "#7a6a5c";
    ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    m.craters.forEach(function (c) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
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

  function draw() {
    ctx.clearRect(0, 0, W, H);

    ctx.save();
    if (shake > 0) {
      ctx.translate(rand(-6, 6) * shake, rand(-6, 6) * shake);
    }

    drawEarth();
    meteors.forEach(drawMeteor);
    drawParticles();
    drawPopups();
    if (state === STATE_PLAYING) drawHero();

    ctx.restore();
  }

  function loop(ts) {
    if (!lastTime) lastTime = ts;
    var dt = Math.min(0.04, (ts - lastTime) / 1000);
    lastTime = ts;

    if (state === STATE_PLAYING) {
      update(dt);
    }
    draw();
    requestAnimationFrame(loop);
  }

  function pointerX(e) {
    var rect = canvas.getBoundingClientRect();
    return (e.clientX !== undefined ? e.clientX : e.touches[0].clientX) - rect.left;
  }

  canvas.addEventListener("pointerdown", function (e) {
    hero.targetX = clamp(pointerX(e), hero.radius + 8, W - hero.radius - 8);
  });
  canvas.addEventListener("pointermove", function (e) {
    if (e.pressure === 0 && e.pointerType === "mouse") return;
    hero.targetX = clamp(pointerX(e), hero.radius + 8, W - hero.radius - 8);
  });

  window.addEventListener("keydown", function (e) {
    if (e.key === "ArrowLeft") moveLeft = true;
    if (e.key === "ArrowRight") moveRight = true;
  });
  window.addEventListener("keyup", function (e) {
    if (e.key === "ArrowLeft") moveLeft = false;
    if (e.key === "ArrowRight") moveRight = false;
  });

  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", resize);

  startButton.addEventListener("click", startGame);
  retryButton.addEventListener("click", startGame);

  resize();
  renderHud();
  requestAnimationFrame(loop);
})();
