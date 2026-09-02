/* ============================================================
   WORD LOVE-CODE — replica sequence
   Vanilla JS, Canvas API. No frameworks, no build step.
   ============================================================ */

/* ============================================================
   CONFIG — edit the words/timing here
   ============================================================ */
const CONFIG = {
  countdownFrom: 3,
  words: ["You", "Are", "My", "Love"],
  finalBefore: "I Love",
  finalHeart: "\u2764",
  finalAfter: "You",

  music: "music.mp3",

  timing: {
    introMs: 1800,
    digitFormMs: 480,
    digitHoldMs: 700,
    digitDissolveMs: 550,
    burstMs: 900,
    wordFormMs: 480,
    wordHoldMs: 1050,
    wordDissolveMs: 500,
    heartFormMs: 2200
  }
};

/* ============================================================
   DOM
   ============================================================ */
const dom = {
  canvas: document.getElementById("scene"),
  flash: document.getElementById("flash"),
  finalText: document.getElementById("final-text"),
  soundBtn: document.getElementById("sound-toggle"),
  soundIcon: document.getElementById("sound-icon"),
  audio: document.getElementById("bg-music")
};

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ============================================================
   UTIL
   ============================================================ */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// subtle overshoot-then-settle easing, used for magnetic-attraction formation
function easeOutBack(t, mag = 0.9) {
  const c1 = mag;
  const c3 = c1 + 1;
  const x = t - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
}

function tweenValue(obj, key, from, to, durationMs, easing = easeOutCubic) {
  return new Promise((resolve) => {
    if (prefersReducedMotion) durationMs = Math.min(durationMs, 160);
    const start = performance.now();
    function step(now) {
      const t = clamp((now - start) / durationMs, 0, 1);
      obj[key] = lerp(from, to, easing(t));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

/* ============================================================
   CANVAS & RESIZE
   ============================================================ */
const ctx = dom.canvas.getContext("2d", { alpha: false });
let canvasWidth = 0;
let canvasHeight = 0;
let dpr = 1;
const isMobile = () => window.matchMedia("(max-width: 767px)").matches;

// offscreen canvas used to sample pixel points from rendered text
const off = document.createElement("canvas");
const offCtx = off.getContext("2d", { willReadFrequently: true });

function resizeCanvas() {
  dpr = clamp(window.devicePixelRatio || 1, 1, 2);
  canvasWidth = window.innerWidth;
  canvasHeight = window.innerHeight;

  dom.canvas.width = Math.floor(canvasWidth * dpr);
  dom.canvas.height = Math.floor(canvasHeight * dpr);
  dom.canvas.style.width = canvasWidth + "px";
  dom.canvas.style.height = canvasHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  off.width = Math.floor(canvasWidth * dpr);
  off.height = Math.floor(canvasHeight * dpr);
  offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  bokeh && bokeh.onResize();
  rain && rain.onResize();
  heartField.center.x = canvasWidth / 2;
  heartField.center.y = canvasHeight * 0.44;
  heartField.scale = clamp((Math.min(canvasWidth, canvasHeight) * 0.72) / 32, 6, 22);
}

/* ============================================================
   BOKEH — soft drifting dust circles
   ============================================================ */
class Bokeh {
  constructor() {
    this.dots = [];
    this.onResize();
  }
  onResize() {
    const count = isMobile() ? 48 : 80;
    this.dots = new Array(count).fill(null).map(() => ({
      x: rand(0, canvasWidth),
      y: rand(0, canvasHeight),
      r: rand(1.1, 3.6),
      vy: rand(-0.016, -0.006),
      opacity: rand(0.18, 0.9)
    }));
  }
  update(dt) {
    for (const d of this.dots) {
      d.y += d.vy * dt;
      if (d.y < -10) d.y = canvasHeight + 10;
    }
  }
  draw() {
    for (const d of this.dots) {
      ctx.globalAlpha = d.opacity;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

/* ============================================================
   RAIN — dense pink "LOVE / YOU" code rain with heart glyphs
   ============================================================ */
const RAIN_CHARS = "LOVEYOULOVEYOU\u2764\u2665\u2764YOULOVEYOU01<>{}[];#@!ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

// Pink colour palette for rain drops
const PINK_COLORS = [
  "rgba(255, 105, 180, ALPHA)",   // hot pink
  "rgba(255, 20, 147, ALPHA)",    // deep pink
  "rgba(255, 182, 193, ALPHA)",   // light pink
  "rgba(220, 80, 160, ALPHA)",    // medium pink
  "rgba(255, 140, 200, ALPHA)",   // soft pink
  "rgba(255, 255, 255, ALPHA)",   // white (minority)
];

class Rain {
  constructor() {
    this.fontSize = 12;
    this.columns = [];
    this.onResize();
  }
  onResize() {
    // Denser: tighter column spacing
    const colSpacing = this.fontSize * 0.72;
    const count = Math.ceil(canvasWidth / colSpacing) + 6;
    this.columns = new Array(count).fill(null).map((_, i) => {
      const opacity = rand(0.18, 1.0);
      // 80% pink, 20% white
      const colorIdx = Math.random() < 0.8
        ? (Math.random() * 5) | 0
        : 5;
      return {
        x: i * colSpacing,
        y: rand(-canvasHeight * 1.2, 0),
        speed: rand(0.6, 2.4),   // faster
        char: RAIN_CHARS[(Math.random() * RAIN_CHARS.length) | 0],
        swap: rand(0, 60),
        opacity,
        colorIdx,
        trailLen: (Math.random() * 8 + 3) | 0  // trail length
      };
    });
  }
  update(dt) {
    for (const c of this.columns) {
      c.y += c.speed * dt * 0.09;
      c.swap -= dt * 0.1;
      if (c.swap <= 0) {
        c.char = RAIN_CHARS[(Math.random() * RAIN_CHARS.length) | 0];
        c.swap = 20 + rand(0, 70);
      }
      if (c.y > canvasHeight + this.fontSize) {
        c.y = -this.fontSize - rand(0, canvasHeight * 0.3);
        c.opacity = rand(0.18, 1.0);
        // re-randomize color occasionally
        c.colorIdx = Math.random() < 0.8 ? (Math.random() * 5) | 0 : 5;
      }
    }
  }
  draw(fade) {
    ctx.font = `${this.fontSize}px 'JetBrains Mono', monospace`;
    ctx.textBaseline = "top";
    for (const c of this.columns) {
      const alpha = c.opacity * fade;
      // Head character: bright
      const col = PINK_COLORS[c.colorIdx].replace("ALPHA", String(clamp(alpha, 0, 1)));
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.fillText(c.char, c.x, c.y);

      // Fade-out trail below head
      for (let t = 1; t <= c.trailLen; t++) {
        const trailAlpha = alpha * (1 - t / (c.trailLen + 1)) * 0.55;
        if (trailAlpha < 0.02) break;
        ctx.globalAlpha = trailAlpha;
        ctx.fillStyle = PINK_COLORS[c.colorIdx].replace("ALPHA", "1");
        ctx.fillText(c.char, c.x, c.y - t * this.fontSize);
      }
    }
    ctx.globalAlpha = 1;
  }
}

/* ============================================================
   SHAPE SAMPLING — deterministic dot-matrix LED text
   ============================================================ */
const DOT_MATRIX_FONT = {
  "0": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["01110", "10001", "00001", "00110", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "01110", "00001", "10001", "01110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "11100"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  M: ["10001", "11011", "10101", "10001", "10001", "10001", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  V: ["10001", "10001", "10001", "01010", "01010", "00100", "00100"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "♥": ["01010", "10101", "10001", "01010", "00100", "00000", "00000"],
  "?": ["01110", "10001", "00001", "00110", "01000", "00000", "01000"]
};

// Build dot-matrix: ONE centered dot per active cell
function buildDotMatrixPoints(text, cellSize = 10, y = null) {
  const glyphs = [...String(text).toUpperCase()];
  const points = [];
  let cursorX = 0;

  for (const glyph of glyphs) {
    const pattern = DOT_MATRIX_FONT[glyph] || DOT_MATRIX_FONT["?"];
    if (glyph === " ") {
      cursorX += cellSize * 2.5;
      continue;
    }
    for (let row = 0; row < pattern.length; row++) {
      for (let col = 0; col < pattern[row].length; col++) {
        if (pattern[row][col] === "1") {
          points.push({
            x: cursorX + col * cellSize + cellSize * 0.5,
            y: row * cellSize + cellSize * 0.5
          });
        }
      }
    }
    cursorX += pattern[0].length * cellSize + cellSize * 0.7;
  }

  if (!points.length) return [];

  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const width = maxX - minX;
  const height = maxY - minY;

  const centerX = canvasWidth / 2;
  const centerY = typeof y === "number" ? y : canvasHeight * 0.44;
  const offsetX = centerX - (minX + width / 2);
  const offsetY = centerY - (minY + height / 2);

  return points.map((p) => ({
    x: p.x + offsetX,
    y: p.y + offsetY
  }));
}

function sampleTextPoints(text, { y = null, cellSize }) {
  const cs = cellSize || (isMobile() ? 12 : 16);
  return buildDotMatrixPoints(text, cs, y);
}

function fitFontSize(text, targetWidthRatio, startPx) {
  let px = startPx;
  offCtx.font = `800 ${px}px 'Poppins', 'Arial Black', sans-serif`;
  const targetW = canvasWidth * targetWidthRatio;
  while (px > 20 && offCtx.measureText(text).width > targetW) {
    px -= 4;
    offCtx.font = `800 ${px}px 'Poppins', 'Arial Black', sans-serif`;
  }
  return px;
}

// Dense filled-numeral sampler — rasterizes a bold digit and samples the
// solid shape on a fine staggered grid, giving a chunky "packed with tiny
// lights" numeral instead of a sparse 5x7 dot-matrix outline.
function sampleFilledGlyphPoints(text, { targetHeightRatio = 0.62, spacing = 11, y = null } = {}) {
  const glyph = String(text);
  const targetH = canvasHeight * targetHeightRatio;

  // find a font size whose rendered glyph height matches targetH
  let px = targetH * 1.3;
  offCtx.font = `800 ${px}px 'Poppins', 'Arial Black', sans-serif`;
  let m = offCtx.measureText(glyph);
  let capH = (m.actualBoundingBoxAscent || px * 0.72) + (m.actualBoundingBoxDescent || 0);
  if (capH > 0) px *= targetH / capH;
  offCtx.font = `800 ${px}px 'Poppins', 'Arial Black', sans-serif`;
  m = offCtx.measureText(glyph);
  const ascent = m.actualBoundingBoxAscent || px * 0.72;
  const descent = m.actualBoundingBoxDescent || 0;

  // render the glyph, solid white, centered on the offscreen canvas
  offCtx.save();
  offCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  offCtx.fillStyle = "#fff";
  offCtx.textAlign = "left";
  offCtx.textBaseline = "alphabetic";
  const drawX = (canvasWidth - m.width) / 2 - (m.actualBoundingBoxLeft || 0);
  const centerY = typeof y === "number" ? y : canvasHeight * 0.44;
  const drawY = centerY - (ascent + descent) / 2 + ascent;
  offCtx.fillText(glyph, drawX, drawY);
  offCtx.restore();

  // sample the filled shape on a fine, row-staggered grid (organic packed look)
  const imageData = offCtx.getImageData(0, 0, off.width, off.height);
  const data = imageData.data;
  const stepDevice = Math.max(1, Math.round(spacing * dpr));
  const points = [];
  let rowIndex = 0;
  for (let sy = 0; sy < off.height; sy += stepDevice, rowIndex++) {
    const rowOffset = rowIndex % 2 === 0 ? 0 : stepDevice / 2;
    for (let sx = rowOffset; sx < off.width; sx += stepDevice) {
      const idx = (Math.floor(sy) * off.width + Math.floor(sx)) * 4 + 3; // alpha channel
      if (data[idx] > 140) {
        const jx = (Math.random() - 0.5) * spacing * 0.3;
        const jy = (Math.random() - 0.5) * spacing * 0.3;
        points.push({ x: sx / dpr + jx, y: sy / dpr + jy });
      }
    }
  }
  offCtx.clearRect(0, 0, canvasWidth, canvasHeight);
  return points;
}

/* ============================================================
   FORMATION PARTICLES — tiny falling dots (background effect)
   ============================================================ */
class DotParticle {
  constructor() {
    this.resetFall();
    this.targetX = 0;
    this.targetY = 0;
    this.size = rand(2.6, 4.3);
    this.phase = rand(0, Math.PI * 2);
    this.renderX = this.fallX;
    this.renderY = this.fallY;
  }
  resetFall() {
    this.fallX = rand(0, canvasWidth);
    this.fallY = rand(-canvasHeight, 0);
    this.fallSpeed = rand(0.5, 1.5);
  }
  update(dt, influence) {
    this.fallY += this.fallSpeed * dt * 0.07;
    if (this.fallY > canvasHeight + 20) {
      this.fallX = rand(0, canvasWidth);
      this.fallY = -20;
    }
    this.renderX = lerp(this.fallX, this.targetX, influence);
    this.renderY = lerp(this.fallY, this.targetY, influence);
  }
  draw(influence, globalFade) {
    const alpha = clamp(influence, 0.12, 1) * globalFade;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.beginPath();
    ctx.arc(this.renderX, this.renderY, this.size * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

/* ============================================================
   SHIMMER DOT PARTICLE — large circle with gray ring + white core
   Matches frame_005.png reference style exactly.
   ============================================================ */
class ShimmerDotParticle {
  constructor(cellSize, opts = {}) {
    this.resetFall(opts.fallSpread ?? 1);
    this.targetX = 0;
    this.targetY = 0;
    // cellSize drives both ring radius and core radius
    this.ringR  = cellSize * 0.46;   // outer gray ring radius
    this.coreR  = cellSize * 0.28;   // inner white core radius
    this.phase = rand(0, Math.PI * 2);
    this.shimmerSpeed = rand(0.8, 2.0);
    this.shimmer = 1;
    this.renderX = this.fallX;
    this.renderY = this.fallY;

    // ---- formation personality: staggered magnetic attraction ----
    this.delayFrac  = rand(0, opts.maxDelay ?? 0.2);              // ~0-100ms of the form window
    this.useBack    = Math.random() < (opts.overshootChance ?? 0.4);
    this.backMag    = rand(0.3, opts.overshootMag ?? 0.7);
    this.driftAmp   = rand(4, 16) * (opts.driftScale ?? 1);       // horizontal wander while falling/attracting
    this.driftPhase = rand(0, Math.PI * 2);
    this.driftFreq  = rand(0.6, 1.4);

    // ---- hold: micro floating + shimmer ----
    const microAmp = opts.microAmp ?? 1.5;
    this.microAmpX  = rand(0.4, microAmp);
    this.microAmpY  = rand(0.4, microAmp);
    this.microFreqX = rand(0.5, 1.6);
    this.microFreqY = rand(0.5, 1.6);
    this.brightPulseOn = Math.random() < (opts.brightPulseChance ?? 0.18);
    this.glowEligible = Math.random() < 0.12; // only a few dots carry the soft glow — keeps frame cost low
    this.brightPulseSpeed = rand(0.6, 1.3);

    // ---- dissolve: crack-apart into light dust ----
    this.breakAngle   = rand(0, Math.PI * 2);
    this.breakSpeed   = rand(0.5, 1.6);
    this.breakGravity = Math.random() < 0.5;
    this.breakLateral = rand(-1, 1);
    this.dissolveOriginX = this.fallX;
    this.dissolveOriginY = this.fallY;

    this.sparkle = !!opts.sparkle;      // tiny secondary decorative dot (not part of the letterform)
    if (this.sparkle) {
      this.ringR *= 0.32;
      this.coreR *= 0.32;
    }
  }
  resetFall(spread = 1) {
    const pad = canvasWidth * (spread - 1) * 0.5;
    this.fallX = rand(-pad, canvasWidth + pad);
    this.fallY = rand(-canvasHeight * spread, 0);
    this.fallSpeed = rand(0.5, 1.5);
  }
  update(dt, formation, timeSec) {
    const phase = formation.phase;

    if (phase === "forming") {
      this.fallY += this.fallSpeed * dt * 0.07;
      if (this.fallY > canvasHeight + 20) {
        this.fallX = rand(0, canvasWidth);
        this.fallY = -20;
      }
      // raw local progress, gated by this particle's own small delay
      const raw = clamp((formation.t - this.delayFrac) / Math.max(0.0001, 1 - this.delayFrac), 0, 1);
      const eased = this.useBack ? easeOutBack(raw, this.backMag) : easeOutCubic(raw);
      const driftFade = 1 - easeOutCubic(raw); // horizontal wander fades out as it locks onto target
      const driftX = Math.sin(timeSec * this.driftFreq + this.driftPhase) * this.driftAmp * driftFade;
      this.renderX = lerp(this.fallX, this.targetX, eased) + driftX;
      this.renderY = lerp(this.fallY, this.targetY, eased);
      this.shimmer = 0.78 + Math.abs(Math.sin(timeSec * this.shimmerSpeed + this.phase)) * 0.22;
      this.dissolveOriginX = this.renderX;
      this.dissolveOriginY = this.renderY;
    } else if (phase === "holding") {
      const mx = Math.sin(timeSec * this.microFreqX + this.phase) * this.microAmpX;
      const my = Math.cos(timeSec * this.microFreqY + this.phase * 1.3) * this.microAmpY;
      this.renderX = this.targetX + mx;
      this.renderY = this.targetY + my;
      const pulseBoost = this.brightPulseOn
        ? Math.max(0, Math.sin(timeSec * this.brightPulseSpeed + this.phase)) * 0.3
        : 0;
      this.shimmer = 0.78 + Math.abs(Math.sin(timeSec * this.shimmerSpeed + this.phase)) * 0.22 + pulseBoost;
      this.dissolveOriginX = this.renderX;
      this.dissolveOriginY = this.renderY;
    } else if (phase === "dissolving") {
      const t = formation.t; // 0 -> 1 dissolve progress
      const sec = formation.dissolveElapsed / 1000;
      const radial = t * this.breakSpeed * 130;
      const gravity = this.breakGravity ? t * t * 70 : 0;
      const lateral = Math.sin(sec * 3 + this.phase) * this.breakLateral * 26;
      this.renderX = this.dissolveOriginX + Math.cos(this.breakAngle) * radial + lateral;
      this.renderY = this.dissolveOriginY + Math.sin(this.breakAngle) * radial * 0.7 + gravity;
      this.shimmer = 0.55;
    }
  }
  draw(formation, globalFade) {
    const phase = formation.phase;
    let influence = 1;
    if (phase === "forming") {
      influence = clamp((formation.t - this.delayFrac) / Math.max(0.0001, 1 - this.delayFrac), 0, 1);
    } else if (phase === "dissolving") {
      influence = clamp(1 - formation.t, 0, 1);
    }
    if (influence < 0.02) return;

    const sh = this.shimmer;
    const pulse = formation.pulse || 0;
    const pulseMag = formation.pulseIntensity ?? 0.12;
    const sparkleFade = this.sparkle ? 0.5 : 1;
    const alpha = clamp(influence, 0.05, 1) * globalFade * sparkleFade;

    let rx = this.renderX;
    let ry = this.renderY;
    if (formation.lockScale && formation.lockScale !== 1 && phase !== "dissolving") {
      rx = formation.center.x + (rx - formation.center.x) * formation.lockScale;
      ry = formation.center.y + (ry - formation.center.y) * formation.lockScale;
    }
    const rR = this.ringR;
    const cR = this.coreR * (0.88 + sh * 0.12) * (1 + pulse * pulseMag);

    // ---- soft glow, only for a sparse subset of dots near completion/hold — no shadowBlur (expensive) ----
    const glowAmt = Math.max(formation.glow || 0, pulse * 0.6);
    if (this.glowEligible && glowAmt > 0.01 && phase !== "dissolving") {
      ctx.globalAlpha = alpha * glowAmt * 0.4;
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.beginPath();
      ctx.arc(rx, ry, rR * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- Layer 1: outer gray ring (makes the circle-with-ring appearance) ----
    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle   = "rgba(170, 170, 180, 1)";
    ctx.beginPath();
    ctx.arc(rx, ry, rR, 0, Math.PI * 2);
    ctx.fill();

    // ---- Layer 2: dark gap (punch hole to separate ring from core) ----
    // We skip this — the difference in grey vs white is enough contrast

    // ---- Layer 3: bright white core ----
    ctx.globalAlpha = alpha * (0.82 + sh * 0.18);
    ctx.fillStyle   = "#ffffff";
    ctx.beginPath();
    ctx.arc(rx, ry, cR, 0, Math.PI * 2);
    ctx.fill();

    // ---- Layer 4: tiny hot-white specular on peak shimmer ----
    if (sh > 0.92) {
      ctx.globalAlpha = alpha * sh * 0.7;
      ctx.fillStyle   = "rgba(255, 255, 255, 1)";
      ctx.beginPath();
      ctx.arc(rx - cR * 0.28, ry - cR * 0.28, cR * 0.30, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  }
}

let activeFormations = [];   // multiple formations can be alive at once (seamless digit/word transitions)
let globalTimeSec = 0;

function getPointsBounds(points) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, maxX, minY, maxY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
}

// per-frame bookkeeping for a formation's glow (called once per formation, not per particle)
function updateFormationMeta(formation, timeSec) {
  if (formation.phase === "forming") {
    formation.glow = clamp((formation.t - 0.7) / 0.3, 0, 1) * 0.8;
  } else if (formation.phase === "holding") {
    formation.glow = 0.32 + Math.sin(timeSec * 1.1) * 0.08;
  } else {
    formation.glow = 0;
  }
}

async function playFormation(points, cellSize, opts = {}) {
  const bounds = getPointsBounds(points);
  const particles = points.map((p) => {
    const d = new ShimmerDotParticle(cellSize, opts);
    d.targetX = p.x;
    d.targetY = p.y;
    return d;
  });

  // secondary sparkle particles — decorative only, keep sparse words from looking empty
  if (opts.sparkleCount) {
    for (let i = 0; i < opts.sparkleCount; i++) {
      const sp = new ShimmerDotParticle(cellSize * 0.5, { ...opts, sparkle: true });
      sp.targetX = rand(bounds.minX - cellSize, bounds.maxX + cellSize);
      sp.targetY = rand(bounds.minY - cellSize, bounds.maxY + cellSize);
      particles.push(sp);
    }
  }

  const formation = {
    particles,
    t: 0,                 // 0->1 raw linear progress (forming) or dissolve progress (dissolving)
    phase: "forming",
    glow: 0,
    pulse: 0,
    pulseIntensity: opts.pulseIntensity ?? 0.12,
    lockScale: 1,
    dissolveElapsed: 0,
    center: { x: canvasWidth / 2, y: bounds.centerY }
  };
  activeFormations.push(formation);
  return formation;
}

// raw linear tween — each particle applies its own easing/delay/overshoot on top of this
async function formIn(formation, ms) {
  await tweenValue(formation, "t", 0, 1, ms, (t) => t);
  formation.phase = "holding";
  formation.t = 1;
}

// brief hold -> pulse -> crack-apart -> dissolve into background dust
async function formOut(formation, ms) {
  formation.phase = "dissolving";
  formation.t = 0;
  formation.dissolveElapsed = 0;
  const start = performance.now();
  await new Promise((resolve) => {
    function step(now) {
      const elapsed = now - start;
      formation.dissolveElapsed = elapsed;
      formation.t = clamp(elapsed / ms, 0, 1);
      if (formation.t < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
  const idx = activeFormations.indexOf(formation);
  if (idx !== -1) activeFormations.splice(idx, 1);
}

// short bright bump right before a formation breaks apart (~100-220ms)
async function pulseFormation(formation, ms = 100) {
  await tweenValue(formation, "pulse", 0, 1, ms * 0.45, easeOutCubic);
  await tweenValue(formation, "pulse", 1, 0, ms * 0.55, easeInOutCubic);
}

// word "locking" into its final shape: scale 0.94 -> 1.035 -> 1.0
async function playLockScale(formation) {
  formation.lockScale = 0.94;
  await tweenValue(formation, "lockScale", 0.94, 1.035, 90, easeOutCubic);
  await tweenValue(formation, "lockScale", 1.035, 1.0, 110, easeInOutCubic);
}

async function playDigit(str) {
  // Digit fills ~62% of screen height, sampled as a dense filled numeral
  // (bold rasterized glyph, staggered grid) instead of a sparse dot-matrix font.
  const mobile = isMobile();
  const heightRatio = mobile ? 0.48 : 0.56;                 // smaller digit — was filling the whole phone screen
  const spacing = mobile
    ? clamp(Math.round(canvasHeight * 0.034), 16, 26)       // fewer, larger dots on phones (was causing the open-delay)
    : clamp(Math.round(canvasHeight * 0.026), 13, 22);
  const points = sampleFilledGlyphPoints(str, { targetHeightRatio: heightRatio, spacing });
  const cs = spacing * 1.7; // controls each dot's ring/core size — bigger overlap compensates for fewer dots
  const formation = await playFormation(points, cs, {
    maxDelay: 0.2,
    overshootChance: 0.35,
    overshootMag: 0.5,
    driftScale: 1,
    microAmp: 1.5,
    pulseIntensity: 0.14
  });

  await formIn(formation, CONFIG.timing.digitFormMs);

  const pulseMs = 100;
  await sleep(Math.max(0, CONFIG.timing.digitHoldMs - pulseMs));
  await pulseFormation(formation, pulseMs); // hold -> pulse

  // crack apart & dissolve; let the next digit start falling before this one
  // has fully faded, so 3 -> 2 -> 1 feels seamless rather than gapped
  const dissolving = formOut(formation, CONFIG.timing.digitDissolveMs);
  await sleep(CONFIG.timing.digitDissolveMs * 0.8);
  dissolving.catch(() => {}); // let the tail end of the dissolve finish in the background
}

const WORD_PROFILES = {
  you:  { maxDelay: 0.16, overshootChance: 0.25, overshootMag: 0.4, driftScale: 0.7,  fallSpread: 1.0, microAmp: 1.0, brightPulseChance: 0.12, sparkleCount: 0,  pulseIntensity: 0.10, dramatic: false },
  are:  { maxDelay: 0.2,  overshootChance: 0.5,  overshootMag: 0.7, driftScale: 1.2,  fallSpread: 1.4, microAmp: 1.1, brightPulseChance: 0.22, sparkleCount: 6,  pulseIntensity: 0.12, dramatic: false },
  my:   { maxDelay: 0.14, overshootChance: 0.4,  overshootMag: 0.5, driftScale: 0.5,  fallSpread: 0.7, microAmp: 1.0, brightPulseChance: 0.16, sparkleCount: 10, pulseIntensity: 0.12, dramatic: false },
  love: { maxDelay: 0.26, overshootChance: 0.6,  overshootMag: 0.9, driftScale: 1.5,  fallSpread: 1.8, microAmp: 1.3, brightPulseChance: 0.3,  sparkleCount: 8,  pulseIntensity: 0.24, dramatic: true }
};

async function playWord(str) {
  // Word fills ~24% of screen height.
  const cs = Math.round(canvasHeight * 0.24 / 7);
  const points = sampleTextPoints(str, { cellSize: cs });
  const profile = WORD_PROFILES[str.toLowerCase()] || WORD_PROFILES.you;

  const formation = await playFormation(points, cs, profile);

  await formIn(formation, CONFIG.timing.wordFormMs);
  await playLockScale(formation); // word "locks" into its final shape

  const pulseMs = profile.dramatic ? 220 : 120;
  await sleep(Math.max(0, CONFIG.timing.wordHoldMs - pulseMs));
  await pulseFormation(formation, pulseMs); // soft pulse before letting go

  await formOut(formation, CONFIG.timing.wordDissolveMs);
}

/* ============================================================
   BURST — spark particles + white flash after the countdown
   ============================================================ */
let burstParticles = [];

async function playBurst() {
  const cx = canvasWidth / 2;
  const cy = canvasHeight * 0.42;
  const count = isMobile() ? 90 : 160;
  burstParticles = new Array(count).fill(null).map(() => {
    const angle = rand(0, Math.PI * 2);
    const speed = rand(0.06, 0.32);
    return {
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: rand(1.5, 3.4),
      life: 1
    };
  });
  dom.flash.classList.remove("pulse");
  void dom.flash.offsetWidth; // restart animation
  dom.flash.classList.add("pulse");

  const start = performance.now();
  await new Promise((resolve) => {
    function step(now) {
      const t = clamp((now - start) / CONFIG.timing.burstMs, 0, 1);
      for (const p of burstParticles) p.life = 1 - t;
      if (t < 1) requestAnimationFrame(step);
      else {
        burstParticles = [];
        resolve();
      }
    }
    requestAnimationFrame(step);
  });
}

function updateAndDrawBurst(dt) {
  if (!burstParticles.length) return;
  ctx.shadowBlur = 8;
  ctx.shadowColor = "rgba(255,255,255,0.9)";
  for (const p of burstParticles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    ctx.globalAlpha = clamp(p.life, 0, 1);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

/* ============================================================
   HEART — final wreath of tiny hearts, holds forever
   ============================================================ */
function heartCurvePoint(t) {
  const x = 16 * Math.pow(Math.sin(t), 3);
  const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
  return { x, y: -y };
}

function drawMiniHeart(x, y, size, alpha) {
  const s = size;
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.32);
  ctx.bezierCurveTo(x + s, y - s * 0.42, x + s * 0.5, y - s * 1.1, x, y - s * 0.36);
  ctx.bezierCurveTo(x - s * 0.5, y - s * 1.1, x - s, y - s * 0.42, x, y + s * 0.32);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;
}

class HeartDotParticle {
  constructor() {
    this.resetFall();
    this.curveX = 0;
    this.curveY = 0;
    this.size = rand(3, 6.5);
    this.phase = rand(0, Math.PI * 2);
    this.renderX = this.fallX;
    this.renderY = this.fallY;
  }
  resetFall() {
    this.fallX = rand(0, canvasWidth);
    this.fallY = rand(-canvasHeight, 0);
    this.fallSpeed = rand(0.5, 1.5);
  }
  update(dt, influence, center, scale, timeSec) {
    this.fallY += this.fallSpeed * dt * 0.07;
    if (this.fallY > canvasHeight + 20) {
      this.fallX = rand(0, canvasWidth);
      this.fallY = -20;
    }
    const pulse = 1 + Math.sin(timeSec * 1.4 + this.phase * 0.15) * 0.022;
    const tx = center.x + this.curveX * scale * pulse;
    const ty = center.y + this.curveY * scale * pulse;
    this.renderX = lerp(this.fallX, tx, influence);
    this.renderY = lerp(this.fallY, ty, influence);
    this.flicker = 0.7 + Math.sin(timeSec * 2.1 + this.phase) * 0.3;
  }
  draw(influence, globalFade) {
    const alpha = clamp(influence, 0.1, 1) * globalFade * (this.flicker ?? 1);
    ctx.fillStyle = "#ffffff";
    drawMiniHeart(this.renderX, this.renderY, this.size * 0.9, alpha);
  }
}

const heartField = {
  center: { x: 0, y: 0 },
  scale: 10,
  particles: [],
  influence: 0,
  formed: false
};

function buildHeartParticles() {
  const perT = isMobile() ? 2 : 3;
  const steps = isMobile() ? 90 : 140;
  const list = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const base = heartCurvePoint(t);
    for (let k = 0; k < perT; k++) {
      const jitter = k === 0 ? 0 : rand(-0.55, 0.55);
      const p = new HeartDotParticle();
      p.curveX = base.x + jitter;
      p.curveY = base.y + jitter;
      list.push(p);
    }
  }
  return list;
}

async function formFinalHeart() {
  heartField.particles = buildHeartParticles();
  heartField.influence = 0;
  await tweenValue(heartField, "influence", 0, 1, CONFIG.timing.heartFormMs, easeOutCubic);
  heartField.formed = true;
  showFinalText();
}

function showFinalText() {
  dom.finalText.innerHTML =
    `${CONFIG.finalBefore} <span class="heart-glyph">${CONFIG.finalHeart}</span> ${CONFIG.finalAfter}`;
  dom.finalText.classList.remove("hidden");
  requestAnimationFrame(() => dom.finalText.classList.add("show"));
}

/* ============================================================
   MAIN LOOP
   ============================================================ */
let bokeh = null;
let rain = null;
let rafId = null;
let lastFrameTime = performance.now();

function frame(now) {
  const dt = clamp(now - lastFrameTime, 0, 48);
  lastFrameTime = now;
  const timeSec = now / 1000;
  globalTimeSec = timeSec;

  ctx.fillStyle = "rgba(5, 4, 10, 0.24)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  bokeh.update(dt);
  bokeh.draw();

  rain.update(dt);
  rain.draw(1);

  for (const formation of activeFormations) {
    updateFormationMeta(formation, timeSec);
    for (const p of formation.particles) p.update(dt, formation, timeSec);
    for (const p of formation.particles) p.draw(formation, 1);
  }

  updateAndDrawBurst(dt);

  if (heartField.particles.length) {
    for (const p of heartField.particles) p.update(dt, heartField.influence, heartField.center, heartField.scale, timeSec);
    for (const p of heartField.particles) p.draw(heartField.influence, 1);
  }

  rafId = requestAnimationFrame(frame);
}

function startLoop() {
  lastFrameTime = performance.now();
  if (!rafId) rafId = requestAnimationFrame(frame);
}
function stopLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") stopLoop();
  else startLoop();
});

let resizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(resizeCanvas, 120);
});

/* ============================================================
   AUDIO
   ============================================================ */
const audioController = {
  playing: false,
  init() {
    dom.audio.src = CONFIG.music;
    dom.audio.volume = 0.55;
  },
  toggle() {
    if (this.playing) {
      dom.audio.pause();
      this.playing = false;
      dom.soundBtn.classList.remove("playing");
      dom.soundIcon.textContent = "\u2715";
    } else {
      dom.audio
        .play()
        .then(() => {
          this.playing = true;
          dom.soundBtn.classList.add("playing");
          dom.soundIcon.textContent = "\u266A";
        })
        .catch(() => {
          this.playing = false;
        });
    }
  }
};
dom.soundBtn.addEventListener("click", () => audioController.toggle());

/* ============================================================
   SEQUENCE
   ============================================================ */
async function runSequence() {
  await sleep(CONFIG.timing.introMs);

  for (let n = CONFIG.countdownFrom; n >= 1; n--) {
    await playDigit(String(n));
    await sleep(40);
  }

  await playBurst();

  for (const word of CONFIG.words) {
    await playWord(word);
    await sleep(120);
  }

  await sleep(250);
  await formFinalHeart();
}

/* ============================================================
   BOOTSTRAP
   ============================================================ */
async function init() {
  bokeh = new Bokeh();
  rain = new Rain();
  resizeCanvas();
  audioController.init();
  dom.soundBtn.classList.remove("hidden");
  startLoop();

  try {
    const fontSet = document.fonts;
    await fontSet.load("800 100px 'Poppins'");
    await fontSet.ready;
  } catch (e) {
    /* font failed to preload — canvas falls back to a system sans-serif */
  }

  runSequence();
}

init();