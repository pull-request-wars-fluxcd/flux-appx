// ============================================================================
// FLUX WARS — A Star Wars × CNCF Space Shooter
// Pure vanilla JS, HTML5 Canvas 2D, Web Audio API
// ============================================================================

// ---------------------------------------------------------------------------
// SoundManager — Web Audio API synth sounds
// ---------------------------------------------------------------------------
class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.masterGain = null;
  }

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3;
      this.masterGain.connect(this.ctx.destination);
    } catch (_) {
      this.enabled = false;
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _tone(freq, duration, type = 'square', vol = 0.15) {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    osc.connect(g);
    g.connect(this.masterGain);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  _noise(duration, vol = 0.12) {
    if (!this.enabled || !this.ctx) return;
    const bufSize = this.ctx.sampleRate * duration;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    src.connect(g);
    g.connect(this.masterGain);
    src.start();
    src.stop(this.ctx.currentTime + duration);
  }

  laserPlayer() {
    this._tone(880, 0.1, 'sawtooth', 0.1);
    this._tone(440, 0.08, 'square', 0.06);
  }

  laserEnemy() {
    this._tone(220, 0.12, 'sawtooth', 0.08);
  }

  explosion() {
    this._noise(0.35, 0.2);
    this._tone(80, 0.3, 'sine', 0.15);
  }

  explosionBig() {
    this._noise(0.7, 0.3);
    this._tone(50, 0.6, 'sine', 0.2);
    this._tone(35, 0.8, 'sine', 0.15);
  }

  powerup() {
    this._tone(523, 0.08, 'sine', 0.12);
    setTimeout(() => this._tone(659, 0.08, 'sine', 0.12), 80);
    setTimeout(() => this._tone(784, 0.12, 'sine', 0.15), 160);
  }

  hit() {
    this._noise(0.08, 0.1);
    this._tone(150, 0.1, 'square', 0.08);
  }

  bossLaser() {
    this._tone(100, 0.5, 'sawtooth', 0.15);
    this._tone(60, 0.6, 'sine', 0.12);
  }

  victory() {
    const notes = [523, 523, 523, 698, 1047, 932, 880, 784, 1397, 1047];
    notes.forEach((n, i) => setTimeout(() => this._tone(n, 0.2, 'sine', 0.12), i * 180));
  }

  gameOver() {
    this._tone(200, 0.3, 'sine', 0.15);
    setTimeout(() => this._tone(150, 0.4, 'sine', 0.15), 300);
    setTimeout(() => this._tone(100, 0.6, 'sine', 0.2), 700);
  }
}

// ---------------------------------------------------------------------------
// StarField — parallax scrolling star background
// ---------------------------------------------------------------------------
class StarField {
  constructor(w, h) {
    this.layers = [
      this._makeLayer(w, h, 80, 0.3, 1),
      this._makeLayer(w, h, 50, 0.7, 1.5),
      this._makeLayer(w, h, 30, 1.2, 2.5),
    ];
    this.w = w;
    this.h = h;
  }

  _makeLayer(w, h, count, speed, size) {
    const stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({ x: Math.random() * w, y: Math.random() * h, speed, size, bright: 0.3 + Math.random() * 0.7 });
    }
    return stars;
  }

  update(dt) {
    for (const layer of this.layers) {
      for (const s of layer) {
        s.y += s.speed * dt * 60;
        if (s.y > this.h) { s.y = -2; s.x = Math.random() * this.w; }
      }
    }
  }

  draw(ctx) {
    for (const layer of this.layers) {
      for (const s of layer) {
        ctx.globalAlpha = s.bright;
        ctx.fillStyle = '#fff';
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }
    }
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------
// Particle — explosions, trails, impacts
// ---------------------------------------------------------------------------
class Particle {
  constructor(x, y, vx, vy, life, color, size) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life;
    this.color = color; this.size = size;
    this.dead = false;
  }

  update(dt) {
    this.x += this.vx * dt * 60;
    this.y += this.vy * dt * 60;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }

  draw(ctx) {
    const a = Math.max(0, this.life / this.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = this.color;
    const s = this.size * (0.3 + 0.7 * a);
    ctx.fillRect(this.x - s / 2, this.y - s / 2, s, s);
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------------------
// Projectile — lasers for player and enemies
// ---------------------------------------------------------------------------
class Projectile {
  constructor(x, y, vx, vy, damage, isPlayer, color, width, height) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.isPlayer = isPlayer;
    this.color = color || (isPlayer ? '#0f0' : '#f00');
    this.w = width || 3;
    this.h = height || 12;
    this.dead = false;
  }

  update(dt, W, H) {
    this.x += this.vx * dt * 60;
    this.y += this.vy * dt * 60;
    if (this.y < -20 || this.y > H + 20 || this.x < -20 || this.x > W + 20) this.dead = true;
  }

  draw(ctx) {
    ctx.save();
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 6;
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// PowerUp — CNCF project power-ups
// ---------------------------------------------------------------------------
class PowerUp {
  constructor(x, y, type) {
    this.x = x; this.y = y;
    this.type = type; // 'grafana','helm','prometheus','kubernetes','envoy','flatcar','cilium'
    this.vy = 1.5;
    this.radius = 16;
    this.dead = false;
    this.time = 0;
  }

  update(dt, H) {
    this.y += this.vy * dt * 60;
    this.time += dt;
    if (this.y > H + 30) this.dead = true;
  }

  draw(ctx) {
    const { x, y, type, time } = this;
    const pulse = 1 + 0.15 * Math.sin(time * 4);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pulse, pulse);

    // glow
    ctx.shadowBlur = 12;

    switch (type) {
      case 'grafana':
        ctx.shadowColor = '#f60';
        ctx.strokeStyle = '#f60';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#f60';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('GRAF', 0, 0);
        break;
      case 'helm':
        ctx.shadowColor = '#0af';
        ctx.fillStyle = '#0af';
        // helm wheel
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#024';
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#024';
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * 12, Math.sin(a) * 12);
          ctx.stroke();
        }
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 6px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('H', 0, 0);
        break;
      case 'prometheus':
        ctx.shadowColor = '#f44';
        ctx.fillStyle = '#f44';
        // flame shape
        ctx.beginPath();
        ctx.moveTo(0, -14);
        ctx.quadraticCurveTo(10, -4, 6, 6);
        ctx.quadraticCurveTo(3, 12, 0, 14);
        ctx.quadraticCurveTo(-3, 12, -6, 6);
        ctx.quadraticCurveTo(-10, -4, 0, -14);
        ctx.fill();
        ctx.fillStyle = '#ff0';
        ctx.font = 'bold 6px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('P', 0, 2);
        break;
      case 'kubernetes':
        ctx.shadowColor = '#326ce5';
        ctx.fillStyle = '#326ce5';
        // K8s wheel
        ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 - Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
          ctx.stroke();
        }
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('K8s', 0, 0);
        break;
      case 'envoy':
        ctx.shadowColor = '#c4a3ff';
        ctx.fillStyle = '#c4a3ff';
        ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2a0050';
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('ENV', 0, 0);
        break;
      case 'flatcar':
        ctx.shadowColor = '#3dbcf6';
        ctx.strokeStyle = '#3dbcf6';
        ctx.lineWidth = 2;
        ctx.strokeRect(-11, -8, 22, 16);
        ctx.fillStyle = '#3dbcf6';
        ctx.font = 'bold 6px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('FLAT', 0, 0);
        break;
      case 'cilium':
        ctx.shadowColor = '#8ce100';
        ctx.fillStyle = '#8ce100';
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
          const r = i % 2 === 0 ? 13 : 7;
          ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#1a2e00';
        ctx.font = 'bold 6px monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('CIL', 0, 0);
        break;
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Player — FluxCD X-Wing fighter
// ---------------------------------------------------------------------------
class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.w = 36; this.h = 40;
    this.speed = 4.5;
    this.lives = 3;
    this.maxHp = 100;
    this.hp = this.maxHp;
    this.fireRate = 0.15; // seconds between shots
    this.fireCooldown = 0;
    this.shieldActive = false;
    this.shieldTimer = 0;
    this.fireBoost = false;
    this.fireBoostTimer = 0;
    this.hasDrone = false;
    this.droneTimer = 0;
    this.invincible = false;
    this.invTimer = 0;
    this.speedBoost = false;
    this.speedBoostTimer = 0;
    this.slowField = false;
    this.slowFieldTimer = 0;
    this.engineTime = 0;
    this.dead = false;
  }

  update(dt, keys, W, H) {
    let dx = 0, dy = 0;
    if (keys['ArrowLeft'] || keys['KeyA']) dx -= 1;
    if (keys['ArrowRight'] || keys['KeyD']) dx += 1;
    if (keys['ArrowUp'] || keys['KeyW']) dy -= 1;
    if (keys['ArrowDown'] || keys['KeyS']) dy += 1;
    if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
    const spd = this.speedBoost ? this.speed * 1.6 : this.speed;
    this.x += dx * spd * dt * 60;
    this.y += dy * spd * dt * 60;
    this.x = Math.max(this.w / 2, Math.min(W - this.w / 2, this.x));
    this.y = Math.max(this.h / 2, Math.min(H - this.h / 2, this.y));

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.engineTime += dt;

    if (this.shieldActive) { this.shieldTimer -= dt; if (this.shieldTimer <= 0) this.shieldActive = false; }
    if (this.fireBoost) { this.fireBoostTimer -= dt; if (this.fireBoostTimer <= 0) this.fireBoost = false; }
    if (this.hasDrone) { this.droneTimer -= dt; if (this.droneTimer <= 0) this.hasDrone = false; }
    if (this.speedBoost) { this.speedBoostTimer -= dt; if (this.speedBoostTimer <= 0) this.speedBoost = false; }
    if (this.slowField) { this.slowFieldTimer -= dt; if (this.slowFieldTimer <= 0) this.slowField = false; }
    if (this.invincible) { this.invTimer -= dt; if (this.invTimer <= 0) this.invincible = false; }
  }

  canFire() {
    return this.fireCooldown <= 0;
  }

  fire() {
    const rate = this.fireBoost ? this.fireRate * 0.4 : this.fireRate;
    this.fireCooldown = rate;
    const shots = [];
    // main guns — two green bolts from wing tips
    shots.push(new Projectile(this.x - 12, this.y - 18, 0, -8, 10, true, '#0f0', 3, 14));
    shots.push(new Projectile(this.x + 12, this.y - 18, 0, -8, 10, true, '#0f0', 3, 14));
    if (this.hasDrone) {
      shots.push(new Projectile(this.x - 28, this.y, 0, -7, 7, true, '#f80', 2, 10));
      shots.push(new Projectile(this.x + 28, this.y, 0, -7, 7, true, '#f80', 2, 10));
    }
    return shots;
  }

  takeDamage(dmg) {
    if (this.invincible) return false;
    if (this.shieldActive) { dmg = Math.floor(dmg * 0.25); }
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.lives--;
      if (this.lives > 0) {
        this.hp = this.maxHp;
        this.invincible = true;
        this.invTimer = 2;
        return false; // not dead, just lost a life
      }
      this.dead = true;
      return true;
    }
    // brief invincibility
    this.invincible = true;
    this.invTimer = 0.3;
    return false;
  }

  applyPowerUp(type) {
    switch (type) {
      case 'grafana': this.hasDrone = true; this.droneTimer = 15; break;
      case 'helm': this.shieldActive = true; this.shieldTimer = 12; break;
      case 'prometheus': this.fireBoost = true; this.fireBoostTimer = 10; break;
      case 'kubernetes': this.lives = Math.min(this.lives + 1, 5); this.hp = this.maxHp; break;
      case 'envoy': this.speedBoost = true; this.speedBoostTimer = 12; break;
      case 'flatcar': this.invincible = true; this.invTimer = 5; break;
      case 'cilium': this.slowField = true; this.slowFieldTimer = 10; break;
    }
  }

  draw(ctx) {
    if (this.invincible && Math.floor(this.invTimer * 10) % 2 === 0 && this.invTimer > 0.3) return;
    const { x, y } = this;
    ctx.save();
    ctx.translate(x, y);

    // engine glow
    const flicker = 0.7 + 0.3 * Math.sin(this.engineTime * 20);
    ctx.fillStyle = `rgba(255,80,0,${flicker * 0.8})`;
    ctx.beginPath();
    ctx.ellipse(-8, 18, 3, 6 + flicker * 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(8, 18, 3, 6 + flicker * 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // S-foils (wings)
    ctx.fillStyle = '#bbb';
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    // left wing
    ctx.beginPath();
    ctx.moveTo(-4, -8);
    ctx.lineTo(-22, -14);
    ctx.lineTo(-22, 10);
    ctx.lineTo(-4, 14);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // right wing
    ctx.beginPath();
    ctx.moveTo(4, -8);
    ctx.lineTo(22, -14);
    ctx.lineTo(22, 10);
    ctx.lineTo(4, 14);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // wing cannons (red tips)
    ctx.fillStyle = '#f33';
    ctx.fillRect(-24, -16, 4, 4);
    ctx.fillRect(20, -16, 4, 4);

    // fuselage
    ctx.fillStyle = '#ddd';
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(-6, -5);
    ctx.lineTo(-6, 16);
    ctx.lineTo(6, 16);
    ctx.lineTo(6, -5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#999';
    ctx.stroke();

    // cockpit
    ctx.fillStyle = '#4af';
    ctx.beginPath();
    ctx.ellipse(0, -6, 4, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // FLUX label
    ctx.fillStyle = '#0ff';
    ctx.font = 'bold 7px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FLUX', 0, 8);

    // shield
    if (this.shieldActive) {
      ctx.strokeStyle = `rgba(0,180,255,${0.4 + 0.3 * Math.sin(this.engineTime * 6)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 28, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(0,255,255,${0.2 + 0.2 * Math.sin(this.engineTime * 8)})`;
      ctx.beginPath();
      ctx.arc(0, 0, 32, 0, Math.PI * 2);
      ctx.stroke();
    }

    // drone indicators
    if (this.hasDrone) {
      ctx.fillStyle = '#f80';
      const dAngle = this.engineTime * 3;
      for (let i = 0; i < 2; i++) {
        const a = dAngle + i * Math.PI;
        const dx = Math.cos(a) * 26;
        const dy = Math.sin(a) * 10;
        ctx.beginPath();
        ctx.arc(dx, dy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Enemy — TIE Fighter variants
// ---------------------------------------------------------------------------
class Enemy {
  constructor(x, y, type) {
    this.x = x; this.y = y;
    this.type = type; // 'tie','config','downtime'
    this.hp = type === 'downtime' ? 30 : type === 'config' ? 20 : 15;
    this.maxHp = this.hp;
    this.speed = type === 'downtime' ? 1.0 : type === 'config' ? 1.8 : 2.2;
    this.w = 28; this.h = 28;
    this.dead = false;
    this.fireTimer = 1 + Math.random() * 2;
    this.score = type === 'downtime' ? 150 : type === 'config' ? 100 : 50;
    this.time = Math.random() * 10;
    this.wobbleAmp = 0.5 + Math.random() * 1;
    this.label = type === 'downtime' ? 'DOWNTIME' : type === 'config' ? 'MANUAL CFG' : 'LEGACY';
  }

  update(dt, H, playerX) {
    this.time += dt;
    this.y += this.speed * dt * 60;
    this.x += Math.sin(this.time * 2) * this.wobbleAmp;
    this.fireTimer -= dt;
    if (this.y > H + 40) this.dead = true;
  }

  canFire() {
    return this.fireTimer <= 0;
  }

  fire() {
    this.fireTimer = 1.5 + Math.random() * 2;
    return new Projectile(this.x, this.y + 14, 0, 5, 12, false, '#f44', 3, 10);
  }

  takeDamage(dmg) {
    this.hp -= dmg;
    if (this.hp <= 0) { this.dead = true; return true; }
    return false;
  }

  draw(ctx) {
    const { x, y, type, time } = this;
    ctx.save();
    ctx.translate(x, y);

    // TIE Fighter shape
    // ball cockpit
    ctx.fillStyle = type === 'downtime' ? '#833' : type === 'config' ? '#838' : '#666';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1;
    ctx.stroke();

    // cockpit window
    ctx.fillStyle = '#335';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    // hexagonal wing panels
    ctx.fillStyle = '#555';
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    // left wing
    this._hexWing(ctx, -18, 0, 10, 16);
    // right wing
    this._hexWing(ctx, 18, 0, 10, 16);

    // struts
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-7, 0); ctx.lineTo(-12, 0); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(7, 0); ctx.lineTo(12, 0); ctx.stroke();

    // label
    ctx.fillStyle = '#f88';
    ctx.font = '5px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.label, 0, 24);

    // damage flash
    if (this.hp < this.maxHp * 0.5) {
      ctx.globalAlpha = 0.3 + 0.2 * Math.sin(time * 10);
      ctx.fillStyle = '#f00';
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  _hexWing(ctx, cx, cy, rx, ry) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      const px = cx + Math.cos(a) * rx;
      const py = cy + Math.sin(a) * ry;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Boss — Death Star labeled "INGRESS-NGINX"
// ---------------------------------------------------------------------------
class Boss {
  constructor(W) {
    this.x = W / 2;
    this.y = -120;
    this.targetY = 100;
    this.radius = 90;
    this.maxHp = 2000;
    this.hp = this.maxHp;
    this.dead = false;
    this.time = 0;
    this.rotation = 0;
    this.phase = 0; // 0=enter, 1=fight
    this.fireTimer = 0;
    this.patternTimer = 0;
    this.attackPattern = 0;
    this.score = 5000;
    this.W = W;
    this.flashTimer = 0;
    this.laserCharging = false;
    this.laserChargeTime = 0;
    this.dishAngle = -Math.PI / 4;
  }

  update(dt, playerX) {
    this.time += dt;
    this.rotation += dt * 0.15;
    this.flashTimer = Math.max(0, this.flashTimer - dt);

    if (this.phase === 0) {
      this.y += (this.targetY - this.y) * 0.02;
      if (Math.abs(this.y - this.targetY) < 2) this.phase = 1;
      return [];
    }

    // slow drift toward player
    this.x += (playerX - this.x) * 0.003;
    this.x = Math.max(this.radius, Math.min(this.W - this.radius, this.x));

    this.fireTimer -= dt;
    this.patternTimer -= dt;
    const shots = [];

    if (this.patternTimer <= 0) {
      this.attackPattern = (this.attackPattern + 1) % 4;
      this.patternTimer = 4;
    }

    if (this.fireTimer <= 0) {
      switch (this.attackPattern) {
        case 0: // radial burst
          for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2 + this.time;
            shots.push(new Projectile(
              this.x + Math.cos(a) * this.radius * 0.8,
              this.y + Math.sin(a) * this.radius * 0.8,
              Math.cos(a) * 3, Math.sin(a) * 3, 15, false, '#f44', 4, 4
            ));
          }
          this.fireTimer = 0.8;
          break;
        case 1: // aimed triple shot
          {
            const dx = playerX - this.x;
            const len = Math.sqrt(dx * dx + 300 * 300);
            const nx = dx / len, ny = 300 / len;
            for (let i = -1; i <= 1; i++) {
              shots.push(new Projectile(
                this.x, this.y + this.radius * 0.6,
                (nx + i * 0.15) * 4, ny * 4, 18, false, '#f88', 5, 5
              ));
            }
          }
          this.fireTimer = 0.5;
          break;
        case 2: // spiral
          {
            const a = this.time * 3;
            shots.push(new Projectile(
              this.x + Math.cos(a) * 30, this.y + this.radius * 0.5,
              Math.cos(a) * 2, 4, 12, false, '#fa0', 3, 8
            ));
          }
          this.fireTimer = 0.12;
          break;
        case 3: // super laser
          if (!this.laserCharging) {
            this.laserCharging = true;
            this.laserChargeTime = 0;
          }
          this.laserChargeTime += dt;
          if (this.laserChargeTime > 2) {
            // big laser burst
            for (let i = -3; i <= 3; i++) {
              shots.push(new Projectile(
                this.x + i * 10, this.y + this.radius * 0.6,
                i * 0.5, 6, 25, false, '#0f0', 6, 20
              ));
            }
            this.laserCharging = false;
            this.fireTimer = 1.5;
          } else {
            this.fireTimer = 0.05; // keep checking
          }
          break;
      }
    }
    return shots;
  }

  takeDamage(dmg) {
    this.hp -= dmg;
    this.flashTimer = 0.06;
    if (this.hp <= 0) { this.dead = true; return true; }
    return false;
  }

  draw(ctx) {
    const { x, y, radius, rotation, time, hp, maxHp } = this;
    ctx.save();
    ctx.translate(x, y);

    // main sphere
    const gradient = ctx.createRadialGradient(-radius * 0.3, -radius * 0.3, radius * 0.1, 0, 0, radius);
    gradient.addColorStop(0, '#888');
    gradient.addColorStop(0.6, '#555');
    gradient.addColorStop(1, '#333');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();

    // surface detail — grid lines
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 0.5;
    for (let i = -3; i <= 3; i++) {
      const yOff = i * (radius / 4);
      const halfW = Math.sqrt(Math.max(0, radius * radius - yOff * yOff));
      ctx.beginPath();
      ctx.moveTo(-halfW, yOff);
      ctx.lineTo(halfW, yOff);
      ctx.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rotation;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius);
      ctx.stroke();
    }

    // equatorial trench
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-radius, 0);
    ctx.lineTo(radius, 0);
    ctx.stroke();
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-radius, 0);
    ctx.lineTo(radius, 0);
    ctx.stroke();

    // superlaser dish
    const dishX = Math.cos(this.dishAngle) * radius * 0.55;
    const dishY = Math.sin(this.dishAngle) * radius * 0.55;
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.arc(dishX, dishY, radius * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#777';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // dish inner
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(dishX, dishY, radius * 0.12, 0, Math.PI * 2);
    ctx.fill();

    // laser charging effect
    if (this.laserCharging) {
      const intensity = Math.min(1, this.laserChargeTime / 2);
      ctx.fillStyle = `rgba(0,255,0,${intensity * 0.6})`;
      ctx.shadowColor = '#0f0';
      ctx.shadowBlur = 20 * intensity;
      ctx.beginPath();
      ctx.arc(dishX, dishY, radius * 0.15 * intensity, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // damage flash
    if (this.flashTimer > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // damage visual — sparks/fires at low health
    if (hp < maxHp * 0.5) {
      const n = Math.floor((1 - hp / maxHp) * 6);
      for (let i = 0; i < n; i++) {
        const a = (i * 1.618 + time * 0.5) % (Math.PI * 2);
        const r = radius * (0.3 + 0.4 * ((i * 0.37) % 1));
        ctx.fillStyle = `rgba(255,${100 + Math.random() * 100},0,${0.5 + Math.random() * 0.3})`;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r, Math.sin(a) * r, 4 + Math.random() * 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // label
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('INGRESS-NGINX', 0, radius + 18);

    // sub-label
    ctx.fillStyle = '#f88';
    ctx.font = '8px monospace';
    ctx.fillText('Death Star', 0, radius + 30);

    // HP bar
    ctx.fillStyle = '#300';
    ctx.fillRect(-50, radius + 36, 100, 6);
    const hpFrac = Math.max(0, hp / maxHp);
    ctx.fillStyle = hpFrac > 0.3 ? '#f44' : '#f00';
    ctx.fillRect(-50, radius + 36, 100 * hpFrac, 6);

    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// HUD — heads-up display overlay
// ---------------------------------------------------------------------------
class HUD {
  draw(ctx, player, score, wave, maxWaves, state, W, H) {
    ctx.save();

    // score
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE: ${score}`, 12, 28);

    // wave
    ctx.textAlign = 'right';
    ctx.fillText(state === 'BOSS' ? 'BOSS FIGHT' : `WAVE ${wave}/${maxWaves}`, W - 12, 28);

    // lives
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd700';
    ctx.font = '14px monospace';
    ctx.fillText('LIVES:', 12, 54);
    for (let i = 0; i < player.lives; i++) {
      this._miniShip(ctx, 80 + i * 22, 49);
    }

    // HP bar
    const barW = 150, barH = 10, barX = 12, barY = 62;
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barW, barH);
    const frac = Math.max(0, player.hp / player.maxHp);
    ctx.fillStyle = frac > 0.5 ? '#0f0' : frac > 0.25 ? '#ff0' : '#f00';
    ctx.fillRect(barX, barY, barW * frac, barH);
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    // active power-ups
    const pups = [];
    if (player.shieldActive) pups.push(`HELM SHIELD ${Math.ceil(player.shieldTimer)}s`);
    if (player.fireBoost) pups.push(`PROMETHEUS ${Math.ceil(player.fireBoostTimer)}s`);
    if (player.hasDrone) pups.push(`GRAFANA DRONE ${Math.ceil(player.droneTimer)}s`);
    if (player.speedBoost) pups.push(`ENVOY SPEED ${Math.ceil(player.speedBoostTimer)}s`);
    if (player.slowField) pups.push(`CILIUM SLOW ${Math.ceil(player.slowFieldTimer)}s`);
    ctx.fillStyle = '#0ff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    pups.forEach((t, i) => ctx.fillText(t, 12, 90 + i * 14));

    ctx.restore();
  }

  _miniShip(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#ddd';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(-5, 4);
    ctx.lineTo(5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Game — main game class
// ---------------------------------------------------------------------------
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = 800;
    this.H = 600;
    canvas.width = this.W;
    canvas.height = this.H;

    this.keys = {};
    this.state = 'CRAWL';
    this.lastTime = 0;
    this.score = 0;
    this.wave = 0;
    this.maxWaves = 5;
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.powerUps = [];
    this.boss = null;
    this.screenShake = 0;
    this.flashAlpha = 0;
    this.waveTimer = 0;
    this.waveEnemyCount = 0;
    this.waveSpawnTimer = 0;
    this.waveEnemiesSpawned = 0;
    this.crawlY = 0;

    this.sound = new SoundManager();
    this.starField = new StarField(this.W, this.H);
    this.hud = new HUD();
    this.player = new Player(this.W / 2, this.H - 80);

    this._initInput();
    this.sound.init();

    // Cilium trail particles (green)
    this.ciliumTrails = [];
  }

  _initInput() {
    const handler = (down) => (e) => {
      this.keys[e.code] = down;
      if (down && (e.code === 'Space' || e.code === 'Enter' || e.code.startsWith('Arrow'))) {
        e.preventDefault();
      }
      if (down) this.sound.resume();
    };
    window.addEventListener('keydown', handler(true));
    window.addEventListener('keyup', handler(false));
  }

  start() {
    this.state = 'CRAWL';
    this.crawlY = this.H * 0.4;
    this.lastTime = performance.now();
    this._loop(this.lastTime);
  }

  _loop(now) {
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this._update(dt);
    this._draw();
    requestAnimationFrame((t) => this._loop(t));
  }

  // --- Update ----------------------------------------------------------
  _update(dt) {
    this.starField.update(dt);
    this.screenShake = Math.max(0, this.screenShake - dt * 8);
    this.flashAlpha = Math.max(0, this.flashAlpha - dt * 4);

    switch (this.state) {
      case 'CRAWL': this._updateCrawl(dt); break;
      case 'MENU': this._updateMenu(dt); break;
      case 'PLAYING': this._updatePlaying(dt); break;
      case 'BOSS': this._updateBoss(dt); break;
      case 'GAME_OVER': this._updateGameOver(dt); break;
      case 'VICTORY': this._updateVictory(dt); break;
    }

    // update particles
    this.particles.forEach(p => p.update(dt));
    this.particles = this.particles.filter(p => !p.dead);

    // cilium trails
    this.ciliumTrails.forEach(p => p.update(dt));
    this.ciliumTrails = this.ciliumTrails.filter(p => !p.dead);
  }

  _updateCrawl(dt) {
    this.crawlY -= dt * 55;
    if (this.keys['Enter'] || this.keys['Space'] || this.crawlY < -500) {
      this.state = 'MENU';
      this.keys['Enter'] = false;
      this.keys['Space'] = false;
    }
  }

  _updateMenu(dt) {
    if (this.keys['Enter']) {
      this._startNewGame();
      this.keys['Enter'] = false;
    }
  }

  _startNewGame() {
    this.state = 'PLAYING';
    this.score = 0;
    this.wave = 0;
    this.enemies = [];
    this.projectiles = [];
    this.particles = [];
    this.powerUps = [];
    this.boss = null;
    this.player = new Player(this.W / 2, this.H - 80);
    this._nextWave();
  }

  _nextWave() {
    this.wave++;
    if (this.wave > this.maxWaves) {
      this.state = 'BOSS';
      this.boss = new Boss(this.W);
      this.sound.bossLaser();
      return;
    }
    this.waveEnemyCount = 5 + this.wave * 3;
    this.waveEnemiesSpawned = 0;
    this.waveSpawnTimer = 0;
    this.waveTimer = 0;
  }

  _updatePlaying(dt) {
    this.player.update(dt, this.keys, this.W, this.H);

    // player shooting
    if (this.keys['Space'] && this.player.canFire()) {
      const shots = this.player.fire();
      this.projectiles.push(...shots);
      this.sound.laserPlayer();
    }

    // spawn enemies
    this.waveSpawnTimer -= dt;
    if (this.waveEnemiesSpawned < this.waveEnemyCount && this.waveSpawnTimer <= 0) {
      const types = ['tie', 'config', 'downtime'];
      const type = types[Math.floor(Math.random() * Math.min(types.length, 1 + Math.floor(this.wave / 2)))];
      this.enemies.push(new Enemy(40 + Math.random() * (this.W - 80), -30, type));
      this.waveEnemiesSpawned++;
      this.waveSpawnTimer = 0.6 - this.wave * 0.05;
    }

    // update enemies
    const eDt = this.player.slowField ? dt * 0.4 : dt;
    this.enemies.forEach(e => {
      e.update(eDt, this.H, this.player.x);
      if (e.canFire()) {
        this.projectiles.push(e.fire());
        this.sound.laserEnemy();
      }
    });

    this._updateProjectiles(dt);
    this._updatePowerUps(dt);
    this._checkCollisions();
    this._addCiliumTrail();

    // wave complete?
    if (this.waveEnemiesSpawned >= this.waveEnemyCount && this.enemies.length === 0) {
      this.waveTimer += dt;
      if (this.waveTimer > 1.5) this._nextWave();
    }

    // check death
    if (this.player.dead) {
      this.state = 'GAME_OVER';
      this.sound.gameOver();
      this._spawnExplosion(this.player.x, this.player.y, 30, ['#f80', '#ff0', '#fff', '#f44']);
    }

    this.enemies = this.enemies.filter(e => !e.dead);
  }

  _updateBoss(dt) {
    this.player.update(dt, this.keys, this.W, this.H);

    if (this.keys['Space'] && this.player.canFire()) {
      const shots = this.player.fire();
      this.projectiles.push(...shots);
      this.sound.laserPlayer();
    }

    if (this.boss) {
      const bossShots = this.boss.update(dt, this.player.x);
      if (bossShots.length > 0) this.projectiles.push(...bossShots);
    }

    // spawn some TIE escorts during boss fight
    if (Math.random() < 0.003 * (1 + this.enemies.length < 4 ? 1 : 0)) {
      this.enemies.push(new Enemy(40 + Math.random() * (this.W - 80), -30, 'tie'));
    }

    const bDt = this.player.slowField ? dt * 0.4 : dt;
    this.enemies.forEach(e => {
      e.update(bDt, this.H, this.player.x);
      if (e.canFire()) {
        this.projectiles.push(e.fire());
        this.sound.laserEnemy();
      }
    });

    this._updateProjectiles(dt);
    this._updatePowerUps(dt);
    this._checkCollisions();
    this._addCiliumTrail();

    // boss dead
    if (this.boss && this.boss.dead) {
      this.score += this.boss.score;
      this.state = 'VICTORY';
      this.sound.explosionBig();
      this.sound.victory();
      this._spawnExplosion(this.boss.x, this.boss.y, 80, ['#f80', '#ff0', '#fff', '#f44', '#fa0']);
      this.screenShake = 3;
      this.flashAlpha = 1;
    }

    if (this.player.dead) {
      this.state = 'GAME_OVER';
      this.sound.gameOver();
      this._spawnExplosion(this.player.x, this.player.y, 30, ['#f80', '#ff0', '#fff', '#f44']);
    }

    this.enemies = this.enemies.filter(e => !e.dead);
  }

  _updateProjectiles(dt) {
    this.projectiles.forEach(p => p.update(dt, this.W, this.H));
    this.projectiles = this.projectiles.filter(p => !p.dead);
  }

  _updatePowerUps(dt) {
    this.powerUps.forEach(p => p.update(dt, this.H));
    this.powerUps = this.powerUps.filter(p => !p.dead);
  }

  _checkCollisions() {
    // player projectiles vs enemies
    for (const p of this.projectiles) {
      if (!p.isPlayer || p.dead) continue;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (this._aabb(p.x, p.y, p.w, p.h, e.x, e.y, e.w, e.h)) {
          p.dead = true;
          if (e.takeDamage(p.damage)) {
            this.score += e.score;
            this.sound.explosion();
            this._spawnExplosion(e.x, e.y, 12, ['#f80', '#ff0', '#fff']);
            this._maybeDropPowerUp(e.x, e.y);
          } else {
            this.sound.hit();
            this._spawnImpact(p.x, p.y, '#ff0');
          }
        }
      }
      // vs boss
      if (this.boss && !this.boss.dead && !p.dead) {
        const dx = p.x - this.boss.x, dy = p.y - this.boss.y;
        if (Math.sqrt(dx * dx + dy * dy) < this.boss.radius + 4) {
          p.dead = true;
          this.boss.takeDamage(p.damage);
          this._spawnImpact(p.x, p.y, '#ff0');
        }
      }
    }

    // enemy projectiles vs player
    if (!this.player.dead) {
      for (const p of this.projectiles) {
        if (p.isPlayer || p.dead) continue;
        if (this._aabb(p.x, p.y, p.w, p.h, this.player.x, this.player.y, this.player.w, this.player.h)) {
          p.dead = true;
          const died = this.player.takeDamage(p.damage);
          this.sound.hit();
          this.screenShake = Math.max(this.screenShake, 0.3);
          this.flashAlpha = Math.max(this.flashAlpha, 0.15);
          this._spawnImpact(p.x, p.y, '#f44');
        }
      }
    }

    // enemy ship collision with player
    if (!this.player.dead) {
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (this._aabb(this.player.x, this.player.y, this.player.w * 0.7, this.player.h * 0.7, e.x, e.y, e.w, e.h)) {
          e.dead = true;
          this.player.takeDamage(30);
          this.score += Math.floor(e.score / 2);
          this.sound.explosion();
          this._spawnExplosion(e.x, e.y, 10, ['#f80', '#ff0']);
          this.screenShake = Math.max(this.screenShake, 0.5);
        }
      }
    }

    // power-up pickup
    for (const pu of this.powerUps) {
      if (pu.dead) continue;
      if (this._dist(pu.x, pu.y, this.player.x, this.player.y) < pu.radius + 18) {
        pu.dead = true;
        this.player.applyPowerUp(pu.type);
        this.sound.powerup();
        this._spawnImpact(pu.x, pu.y, '#0ff');
      }
    }
  }

  _aabb(ax, ay, aw, ah, bx, by, bw, bh) {
    return Math.abs(ax - bx) < (aw + bw) / 2 && Math.abs(ay - by) < (ah + bh) / 2;
  }

  _dist(ax, ay, bx, by) {
    return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
  }

  _maybeDropPowerUp(x, y) {
    if (Math.random() < 0.2) {
      const types = ['grafana', 'helm', 'prometheus', 'kubernetes', 'envoy', 'flatcar', 'cilium'];
      this.powerUps.push(new PowerUp(x, y, types[Math.floor(Math.random() * types.length)]));
    }
  }

  _spawnExplosion(x, y, count, colors) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 0.5 + Math.random() * 3;
      this.particles.push(new Particle(
        x, y,
        Math.cos(a) * spd, Math.sin(a) * spd,
        0.3 + Math.random() * 0.6,
        colors[Math.floor(Math.random() * colors.length)],
        2 + Math.random() * 4
      ));
    }
  }

  _spawnImpact(x, y, color) {
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 0.5 + Math.random() * 1.5;
      this.particles.push(new Particle(x, y, Math.cos(a) * spd, Math.sin(a) * spd, 0.2, color, 2));
    }
  }

  _addCiliumTrail() {
    if (Math.random() < 0.3) {
      this.ciliumTrails.push(new Particle(
        this.player.x + (Math.random() - 0.5) * 10,
        this.player.y + 20,
        (Math.random() - 0.5) * 0.5, 1 + Math.random(),
        0.4 + Math.random() * 0.3,
        '#0f8', 2 + Math.random() * 2
      ));
    }
  }

  _updateGameOver(dt) {
    if (this.keys['Enter']) {
      this.state = 'CRAWL';
      this.crawlY = this.H * 0.4;
      this.keys['Enter'] = false;
    }
  }

  _updateVictory(dt) {
    // celebration particles
    if (Math.random() < 0.3) {
      const colors = ['#ff0', '#0ff', '#f0f', '#0f0', '#f80'];
      this._spawnExplosion(
        Math.random() * this.W, Math.random() * this.H,
        3, colors
      );
    }
    if (this.keys['Enter']) {
      this.state = 'CRAWL';
      this.crawlY = this.H * 0.4;
      this.keys['Enter'] = false;
    }
  }

  // --- Draw ------------------------------------------------------------
  _draw() {
    const { ctx, W, H } = this;
    ctx.save();

    // screen shake
    if (this.screenShake > 0) {
      const sx = (Math.random() - 0.5) * this.screenShake * 8;
      const sy = (Math.random() - 0.5) * this.screenShake * 8;
      ctx.translate(sx, sy);
    }

    // clear
    ctx.fillStyle = '#000';
    ctx.fillRect(-10, -10, W + 20, H + 20);

    // stars
    this.starField.draw(ctx);

    switch (this.state) {
      case 'CRAWL': this._drawCrawl(ctx); break;
      case 'MENU': this._drawMenu(ctx); break;
      case 'PLAYING': this._drawGame(ctx); break;
      case 'BOSS': this._drawGame(ctx); break;
      case 'GAME_OVER': this._drawGameOver(ctx); break;
      case 'VICTORY': this._drawVictory(ctx); break;
    }

    // flash overlay
    if (this.flashAlpha > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flashAlpha})`;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
  }

  _drawCrawl(ctx) {
    const { W, H } = this;
    // Star Wars style perspective crawl
    ctx.save();

    // "A long time ago..." header
    ctx.fillStyle = '#4af';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('A long time ago in a cluster far, far away...', W / 2, 40);

    // FLUX WARS title
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 48px monospace';
    ctx.fillText('FLUX WARS', W / 2, 100);

    // crawl text with perspective transform
    const lines = [
      'The CNCF Rebel Alliance faces its',
      'greatest challenge yet.',
      '',
      'Your mission: reach and defeat the',
      'INGRESS-NGINX Death Star before it',
      'takes over the galaxy.',
      '',
      'Legacy deployments plague the stars.',
      'Manual configurations spread chaos',
      'across production clusters.',
      '',
      'FluxCD, the brave GitOps warrior,',
      'must pilot an X-Wing through waves',
      'of foes standing between you and',
      'INGRESS-NGINX.',
      '',
      'Armed with allies from the Cloud',
      'Native ecosystem — Grafana, Helm,',
      'Prometheus, Kubernetes, Envoy,',
      'Flatcar, and Cilium — the fate of',
      'continuous delivery rests on your',
      'deployments...',
      '',
      '',
      '[Press ENTER to skip]',
    ];

    ctx.fillStyle = '#ffd700';
    ctx.font = '14px monospace';
    const lineH = 22;
    const startY = this.crawlY + 160;
    for (let i = 0; i < lines.length; i++) {
      const ly = startY + i * lineH;
      if (ly > 120 && ly < H - 20) {
        // fade at edges
        const distFromCenter = Math.abs(ly - H / 2) / (H / 2);
        ctx.globalAlpha = Math.max(0, 1 - distFromCenter * 0.8);
        ctx.fillText(lines[i], W / 2, ly);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawMenu(ctx) {
    const { W, H } = this;
    const t = performance.now() / 1000;

    // title
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 52px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FLUX WARS', W / 2, H / 2 - 80);

    // subtitle
    ctx.fillStyle = '#aaa';
    ctx.font = '14px monospace';
    ctx.fillText('A Cloud Native Space Shooter', W / 2, H / 2 - 45);

    // controls
    ctx.fillStyle = '#888';
    ctx.font = '12px monospace';
    ctx.fillText('WASD / Arrow Keys = Move    |    SPACE = Fire', W / 2, H / 2 + 10);

    // start prompt
    ctx.fillStyle = `rgba(255,215,0,${0.5 + 0.5 * Math.sin(t * 3)})`;
    ctx.font = 'bold 20px monospace';
    ctx.fillText('Press ENTER to Start', W / 2, H / 2 + 60);

    // credits
    ctx.fillStyle = '#555';
    ctx.font = '10px monospace';
    ctx.fillText('Powered by FluxCD × CNCF', W / 2, H - 30);

    // draw a demo X-Wing
    const demoPlayer = new Player(W / 2, H / 2 + 140);
    demoPlayer.engineTime = t;
    demoPlayer.draw(ctx);
  }

  _drawGame(ctx) {
    // cilium trails (behind everything)
    this.ciliumTrails.forEach(p => p.draw(ctx));

    // power-ups
    this.powerUps.forEach(p => p.draw(ctx));

    // enemies
    this.enemies.forEach(e => e.draw(ctx));

    // boss
    if (this.boss && !this.boss.dead) this.boss.draw(ctx);

    // projectiles
    this.projectiles.forEach(p => p.draw(ctx));

    // player
    if (!this.player.dead) this.player.draw(ctx);

    // particles (on top)
    this.particles.forEach(p => p.draw(ctx));

    // HUD
    this.hud.draw(ctx, this.player, this.score, this.wave, this.maxWaves, this.state, this.W, this.H);

    // wave announcement
    if (this.state === 'PLAYING' && this.waveEnemiesSpawned < 3 && this.wave > 0) {
      ctx.fillStyle = `rgba(255,215,0,${Math.max(0, 1 - this.waveEnemiesSpawned * 0.3)})`;
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`WAVE ${this.wave}`, this.W / 2, this.H / 2 - 40);
    }

    if (this.state === 'BOSS' && this.boss && this.boss.phase === 0) {
      ctx.fillStyle = '#f44';
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('WARNING: BOSS APPROACHING', this.W / 2, this.H / 2);
      ctx.fillStyle = '#f88';
      ctx.font = '14px monospace';
      ctx.fillText('INGRESS-NGINX Death Star', this.W / 2, this.H / 2 + 26);
    }
  }

  _drawGameOver(ctx) {
    const { W, H } = this;
    // still draw game state faded
    ctx.globalAlpha = 0.3;
    this._drawGame(ctx);
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#f44';
    ctx.font = 'bold 42px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', W / 2, H / 2 - 30);

    ctx.fillStyle = '#ffd700';
    ctx.font = '20px monospace';
    ctx.fillText(`Final Score: ${this.score}`, W / 2, H / 2 + 20);

    ctx.fillStyle = '#aaa';
    ctx.font = '12px monospace';
    ctx.fillText('Your deployments have failed...', W / 2, H / 2 + 50);

    const t = performance.now() / 1000;
    ctx.fillStyle = `rgba(255,215,0,${0.5 + 0.5 * Math.sin(t * 3)})`;
    ctx.font = 'bold 16px monospace';
    ctx.fillText('Press ENTER to Restart', W / 2, H / 2 + 90);
  }

  _drawVictory(ctx) {
    const { W, H } = this;
    this.particles.forEach(p => p.draw(ctx));

    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 42px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('VICTORY!', W / 2, H / 2 - 60);

    ctx.fillStyle = '#0f0';
    ctx.font = '18px monospace';
    ctx.fillText('The Death Star is defeated!', W / 2, H / 2 - 20);

    ctx.fillStyle = '#0ff';
    ctx.font = '14px monospace';
    ctx.fillText('See you never INGRESS-NGINX,', W / 2, H / 2 + 10);
    ctx.fillText('but thanks for your service!', W / 2, H / 2 + 30);

    ctx.fillStyle = '#ffd700';
    ctx.font = '22px monospace';
    ctx.fillText(`Score: ${this.score}`, W / 2, H / 2 + 70);

    const t = performance.now() / 1000;
    ctx.fillStyle = `rgba(255,215,0,${0.5 + 0.5 * Math.sin(t * 3)})`;
    ctx.font = 'bold 16px monospace';
    ctx.fillText('Press ENTER to Play Again', W / 2, H / 2 + 110);

    // CNCF cameos
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.fillText('Thanks to: FluxCD • Grafana • Helm • Prometheus • K8s • Envoy • Flatcar • Cilium', W / 2, H - 30);
  }
}

// ---------------------------------------------------------------------------
// startGame() — entry point
// ---------------------------------------------------------------------------
function startGame() {
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) {
    console.error('gameCanvas element not found');
    return;
  }
  const game = new Game(canvas);
  game.start();
  return game;
}

// Auto-start if DOM is ready and canvas exists
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { if (document.getElementById('gameCanvas')) startGame(); });
  } else {
    if (document.getElementById('gameCanvas')) startGame();
  }
}
