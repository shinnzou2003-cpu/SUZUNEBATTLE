'use strict';
/* CHRONO FIGHT — SUZUNE × AOI  © SZOU */
const W = 1280, H = 720, STAGE_W = 2000, GROUND = 600, GY = 612, DH = 318, GRAV = 0.85;
const $ = s => document.querySelector(s);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

const cv = $('#game'), ctx = cv.getContext('2d');
let scale = 1, dpr = 1;
function resize() {
  const vw = innerWidth, vh = innerHeight;
  scale = Math.min(vw / W, vh / H);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(W * scale * dpr); cv.height = Math.round(H * scale * dpr);
  cv.style.width = (W * scale) + 'px'; cv.style.height = (H * scale) + 'px';
  const portrait = vh > vw * 1.05;
  document.body.classList.toggle('portrait', portrait);
}
addEventListener('resize', resize);

/* ---------- assets ---------- */
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function loadImg(src) { return new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(mk(4, 4)); i.src = src; }); }
function silhouette(img, color) {
  const c = mk(img.width, img.height), x = c.getContext('2d');
  x.drawImage(img, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); return c;
}
function glowOf(img, color) {
  const s = silhouette(img, color);
  const sw = Math.max(6, (img.width / 12) | 0), sh = Math.max(6, (img.height / 12) | 0);
  const sm = mk(sw + 8, sh + 8), sx = sm.getContext('2d'); sx.drawImage(s, 4, 4, sw, sh);
  const md = mk(sm.width * 3, sm.height * 3), mx = md.getContext('2d'); mx.drawImage(sm, 0, 0, md.width, md.height);
  const c = mk(img.width + 96, img.height + 96), x = c.getContext('2d'); x.drawImage(md, 0, 0, c.width, c.height); return c;
}
function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return [h, s, l]; }
function hsl2rgb(h, s, l) { h /= 360; const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < .5) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }; if (s === 0) return [l * 255, l * 255, l * 255]; const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255]; }
function recolor(img, test, shift) {
  const c = mk(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0);
  try {
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      if (p[i + 3] < 8) continue;
      const [h, s, l] = rgb2hsl(p[i], p[i + 1], p[i + 2]);
      if (test(h, s, l)) { const [r, g, b] = hsl2rgb((h + shift) % 360, s, l); p[i] = r; p[i + 1] = g; p[i + 2] = b; }
    }
    x.putImageData(d, 0, 0);
  } catch (e) { /* ignore */ }
  return c;
}

const CHARS = {
  suzune: { id: 'suzune', name: 'SUZUNE', role: '高速近接・連撃', c1: '#ffc24a', c2: '#ff3350', rgb: '255,190,90', rgb2: '255,70,90', speed: 6.4, jump: -26.2, anchor: .6, exName: '桜閃レール', ultName: '桜花彗星' },
  aoi: { id: 'aoi', name: 'AOI', role: 'ドローン・遠距離', c1: '#5cc8ff', c2: '#a970ff', rgb: '110,195,255', rgb2: '170,110,255', speed: 5.2, jump: -24.7, anchor: .58, exName: 'ホーミング・ビット', ultName: 'オービタル・レイ' },
  // ARCA-07 rides the four-legged MAGITEK ARSENAL: big, heavy, long reach, magic artillery
  arca: { id: 'arca', name: 'ARCA-07', role: '魔道兵器・重砲撃', c1: '#2ee6c8', c2: '#e0405a', rgb: '46,230,200', rgb2: '235,80,100', speed: 4.3, jump: -15.5, anchor: .55, h: 625, hurtW: 156, hurtH: 550, exName: 'ルーン・ミサイル', ultName: 'アーセナル・ノヴァ' },
  // SAKURA: sky-city aircraft engineer. Draws blueprints with her compass and summons the IDEA DRAGON (AOI-style summoner)
  sakura: { id: 'sakura', name: 'SAKURA', role: '設計図・竜召喚', c1: '#ff9ec4', c2: '#e8c25a', rgb: '255,158,200', rgb2: '232,194,90', speed: 5.0, jump: -24.5, anchor: .55, hurtW: 52, hurtH: 310, exName: 'アイディア・ドラゴン', ultName: 'ドラフト・ノヴァ' },
  // MIO-07: android painter of IF TOKYO 2099. Fights with the giant brush "Kibou-fude" and paint; her ULT paints a giant blue paint hound into being
  mio: { id: 'mio', name: 'MIO-07', role: '巨大筆・絵具', c1: '#9acfff', c2: '#ff688a', rgb: '120,190,255', rgb2: '255,104,138', speed: 5.3, jump: -24.8, anchor: .55, hurtW: 54, hurtH: 300, exName: 'ブルー・ストローク', ultName: 'キャンバス・ハウンド' }
};
const ALT = {
  suzune: { c1: '#7fd8ff', c2: '#4f7bff', rgb: '130,215,255', rgb2: '90,120,255', test: (h, s, l) => (h > 33 && h < 64 && s > .3) || ((h < 12 || h > 340) && s > .55), shift: 175 },
  aoi: { c1: '#ff7aa8', c2: '#ffb347', rgb: '255,120,170', rgb2: '255,180,80', test: (h, s, l) => h > 175 && h < 300 && s > .25, shift: 150 },
  arca: { c1: '#ffb347', c2: '#5a8cff', rgb: '255,180,70', rgb2: '90,140,255', test: (h, s, l) => (h < 16 || h > 335) && s > .35 && l > .12, shift: 215 },
  sakura: { c1: '#7fe0d0', c2: '#9aa8ff', rgb: '120,225,210', rgb2: '150,170,255', test: (h, s, l) => (h > 300 || h < 20) && s > .2, shift: 170 },
  mio: { c1: '#ffb15a', c2: '#7ad7a0', rgb: '255,170,80', rgb2: '110,215,160', test: (h, s, l) => h > 185 && h < 250 && s > .22, shift: 190 }
};
const GFX = {};
async function buildAssets() {
  const A = window.ASSETS;
  const [su, ao, drone, suci, aoci, ar, arci, arp, sa, saci, mi, mici] = await Promise.all([A.su, A.ao, A.drone, A.suci, A.aoci, A.ar, A.arci, A.arp, A.sa, A.saci, A.mi, A.mici].map(p => track(loadImg(p))));
  const base = { suzune: { img: su, ci: suci }, aoi: { img: ao, ci: aoci }, arca: { img: ar, ci: arci }, sakura: { img: sa, ci: saci }, mio: { img: mi, ci: mici } };
  GFX.arcaPilot = arp;
  for (const id of ['suzune', 'aoi', 'arca', 'sakura', 'mio']) {
    const ch = CHARS[id], al = ALT[id];
    const make = (img, ci, c1, rgb) => ({ img, ci, white: silhouette(img, '#fff'), tint: silhouette(img, c1), glow: glowOf(img, `rgb(${rgb})`) });
    GFX[id] = [make(base[id].img, base[id].ci, ch.c1, ch.rgb), null];
    GFX[id].altLazy = () => GFX[id][1] || (GFX[id][1] = make(recolor(base[id].img, al.test, al.shift), recolor(base[id].ci, al.test, al.shift), al.c1, al.rgb));
  }
  GFX.drone = drone; GFX.droneAlt = null;
  GFX.droneAltLazy = () => GFX.droneAlt || (GFX.droneAlt = recolor(drone, ALT.aoi.test, ALT.aoi.shift));
}

/* ---------- sprite animations (video-extracted) ---------- */
const ANIMS = {};
const frameCount = (id, n) => ANIMS[id] && ANIMS[id].a[n] ? ANIMS[id].a[n].length : 0;
// visual size balance between characters (SUZUNE's source video was framed larger)
const CHAR_SCALE = { suzune: .92, aoi: 1.07, arca: 625 / 318, sakura: 1.33, mio: 1.25 };   // AOI stands taller; SUZUNE fights from a low crouch
const LOAD = { done: 0, total: 0 };
function track(p) { LOAD.total++; return p.then(v => { LOAD.done++; const el = document.getElementById('loadPct'); if (el) el.textContent = Math.round(LOAD.done / Math.max(1, LOAD.total) * 100) + '%'; return v; }); }
// Atlases are NOT decoded at boot any more: only the fighters in the current match are kept in memory,
// so the roster can grow (10+ characters) without phones running out of RAM.
const ANIM_META = {};
const ANIM_LOAD = {};          // id -> Promise while loading
async function buildAnims() {
  await Promise.all(Object.keys(CHARS).map(async id => {
    try { ANIM_META[id] = await (await fetch('anim/' + id + '.json')).json(); } catch (e) { }
  }));
}
function loadAnim(id, onTick) {
  if (ANIMS[id]) return Promise.resolve();
  if (ANIM_LOAD[id]) return ANIM_LOAD[id];
  const meta = ANIM_META[id]; if (!meta) return Promise.resolve();
  const AN = { k: DH / meta.storeH * (CHAR_SCALE[id] || 1), a: {}, fps: {}, atlases: [], alt: [], altBusy: false, cutBox: meta.cutinBox || [564, 420], dragonK: meta.dragonK || 1 };
  const idx = {}, paths = [];
  for (const k in meta.anims) {
    const an = meta.anims[k];
    AN.fps[k] = an.fps || 24;
    const ais = an.atlases.map(p => { if (!(p in idx)) { idx[p] = paths.length; paths.push(p); } return idx[p]; });
    AN.a[k] = an.frames.map(r => ({ ai: ais[r.a], sx: r.x, sy: r.y, w: r.w, h: r.h, ox: r.ox, oy: r.oy }));
  }
  const dec = im => (im.decode ? im.decode().catch(() => { }) : Promise.resolve()).then(() => im);
  const pr = Promise.all(paths.map((p, i) => loadImg(p).then(dec).then(im => { AN.atlases[i] = im; onTick && onTick(); })))
    .then(() => { if (ANIM_LOAD[id] === pr) { ANIMS[id] = AN; delete ANIM_LOAD[id]; } });
  pr.count = paths.length;
  return ANIM_LOAD[id] = pr;
}
function unloadAnim(id) {
  const AN = ANIMS[id]; delete ANIMS[id]; delete ANIM_LOAD[id];
  if (!AN) return;
  AN.atlases.forEach(im => { if (im && 'src' in im) im.src = ''; });
  AN.alt.forEach(b => { if (b && b.close) b.close(); else if (b) b.width = b.height = 0; });
  AN.atlases.length = AN.alt.length = 0; AN.altBusy = false;
}
const atlasCount = id => { const m = ANIM_META[id]; if (!m) return 0; const s = new Set(); for (const k in m.anims) m.anims[k].atlases.forEach(p => s.add(p)); return s.size; };
// keep exactly `ids` in memory; free everyone else. onPct(0..100) reports progress.
async function ensureAnims(ids, onPct) {
  const keep = new Set(ids);
  Object.keys(ANIMS).concat(Object.keys(ANIM_LOAD)).forEach(id => { if (!keep.has(id)) unloadAnim(id); });
  const need = [...keep].filter(id => !ANIMS[id]);
  let total = need.reduce((a, id) => a + atlasCount(id), 0), done = 0;
  const tick = () => { done++; onPct && onPct(Math.min(99, Math.round(done / Math.max(1, total) * 100))); };
  await Promise.all(need.map(id => loadAnim(id, tick)));
  onPct && onPct(100);
}
// warm up a character while the player is still on the select screen (nothing is freed here)
function preloadAnim(id) { if (ANIM_META[id]) loadAnim(id); }
// colour-variant atlases for mirror matches, built a few at a time so the game never stalls
function prepareAlt(id) {
  const AN = ANIMS[id]; if (!AN || AN.altBusy || AN.alt.length === AN.atlases.length) return;
  AN.altBusy = true; let i = 0;
  const step = () => {
    if (i >= AN.atlases.length) { AN.altBusy = false; return; }
    const j = i++, c = recolor(AN.atlases[j], ALT[id].test, ALT[id].shift);
    if (window.createImageBitmap) createImageBitmap(c).then(b => { AN.alt[j] = b; c.width = c.height = 0; setTimeout(step, 0); }).catch(() => { AN.alt[j] = c; setTimeout(step, 0); });
    else { AN.alt[j] = c; setTimeout(step, 0); }
  };
  setTimeout(step, 30);
}
function frameSrc(fr, f) { const AN = ANIMS[f.id]; return (f.alt && AN.alt[fr.ai]) || AN.atlases[fr.ai]; }
function pickFrame(f) {
  const AN = ANIMS[f.id]; if (!AN) return null;
  const a = AN.a;
  // returns { fr, fr2, mix } so two neighbouring frames can be cross-faded for smoother motion
  // cross-fade only the slow 12fps loops; 24fps clips are shown frame-accurate (sharper, no ghosting)
  const LOOPS = { idle: 1, win: 1, ultCharge: 1, winPose: 1 };
  const smooth = n => !!LOOPS[n];
  const at = (n, i) => { const arr = a[n] || a.idle, L = arr.length, x = clamp(i, 0, L - 1), i0 = Math.floor(x); return { fr: arr[i0], fr2: arr[Math.min(L - 1, i0 + 1)], mix: smooth(n) ? x - i0 : 0 }; };
  const prog = (n, p) => at(n, clamp(p, 0, 1) * ((a[n] || a.idle).length - 1));
  const loop = (n, fps) => { const arr = a[n] || a.idle, L = arr.length, x = (G.frame * fps / 60) % L, i0 = Math.floor(x); return { fr: arr[i0], fr2: arr[(i0 + 1) % L], mix: smooth(n) ? x - i0 : 0 }; };
  const t = Math.max(0, f.t);
  switch (f.state) {
    case 'idle': { const bd = boardState(f); if (bd && bd.t < BOARD.arrive && a.idleEmpty) return loop('idleEmpty', AN.fps.idleEmpty || 8); }
      return f.land > 0 ? at('jump', 2) : loop('idle', AN.fps.idle || 12);
    case 'walk': return loop('walk', AN.fps.walk || 12);
    case 'guard': return at('guard', 0);
    case 'jump': return f.vy < -8 && f.t < 10 ? at('jump', 0) : at('jump', 1);
    case 'dash': if (f.id === 'arca') return f.dashDir === f.face ? loop('walk', 20) : at('guard', 0);
      return f.dashDir === f.face ? at('ex', 99) : at('guard', 0);
    case 'tagin': if (f.id === 'arca') return loop('walk', 20); return f.t < f.tg.L * .45 ? at('jump', 0) : at('jump', 1);
    case 'dashin': return f.id !== 'suzune' ? loop('walk', (AN.fps.walk || 12) * 1.2) : at('ex', 99);
    case 'hit': return prog('hit', t / (t + Math.max(1, f.stun)));
    case 'air': return prog('air', t / 16);
    case 'down': return at('down', t < 6 ? 0 : 1);
    case 'getup': return prog('getup', t / 26);
    case 'win': {
      if (a.winPose) {   // victory pose clip: stance -> rise -> pose, then a slow breathing ping-pong on its last frames
        const n = a.winPose.length, i = t * (AN.fps.winPose || 24) / 60;
        if (i < n - 1) return at('winPose', i);
        const L = Math.min(8, n), per = 2 * L - 2, x = ((i - (n - 1)) * .4) % per, k = x < L - 1 ? x : per - x;
        return at('winPose', n - 1 - k);
      }
      const wl = f.id === 'arca' ? 105 : 18;
      return t < wl ? prog('winIn', t / wl) : loop('win', AN.fps.win || 12);
    }
    case 'atk': {
      const m = f.move, p = t / m.total;
      if (f.id === 'arca') {
        if (m.key === 'a') return prog(f.chain >= 2 ? 'a3' : 'a', p);
        if (m.key === 'b') return prog('b', p);
        if (m.key === 'ex') return prog('ex', p);
        if (m.key === 'ult') { const u = t - m.st; if (u < 45) return loop('ultCharge', AN.fps.ultCharge || 8); return prog('ultFire', (u - 45) / 14); }
      }
      if (f.id === 'sakura') {
        if (m.key === 'a') { const n = ['a1', 'a2', 'a3'][Math.min(2, f.chain)]; return prog(a[n] ? n : 'a', p); }
        if (m.key === 'b') return prog('b', p);
        if (m.key === 'ex') return prog('ex', Math.min(1, t / (m.st + 20)));
        if (m.key === 'ult') { const u = t - m.st; if (u < 45) return loop('ultCharge', AN.fps.ultCharge || 10); return prog('ultFire', Math.min(1, (u - 45) / 20)); }
      }
      if (f.id === 'mio') {
        if (m.key === 'a') { const n = ['a1', 'a2', 'a3'][Math.min(2, f.chain)]; return prog(a[n] ? n : 'a', p); }
        if (m.key === 'b') return prog('b', p);
        if (m.key === 'ex') return prog('ex', p);
        if (m.key === 'ult') { const u = t - m.st; if (u < MIO_ULT.summon) return loop('ultCharge', AN.fps.ultCharge || 10); return prog('ultFire', Math.min(1, (u - MIO_ULT.summon) / 26)); }
      }
      if (f.id === 'aoi') {
        if (m.key === 'a') return prog('a', p);
        if (m.key === 'b') return prog('b', p);
        if (m.key === 'ex') return prog('ex', p);
        if (m.key === 'ult') { const u = t - m.st; if (u < 45) return loop('ultCharge', AN.fps.ultCharge || 10); if (u < 105) return prog('ultFire', (u - 45) / 14); return prog('ultFire', 1); }
      }
      if (m.key === 'a') return prog(f.chain === 0 ? 'a1' : f.chain === 1 ? 'a2' : 'a3', p);
      if (m.key === 'b') return prog('b', p);
      if (m.key === 'ex') { if (t < m.st) return prog('ex', t / m.st * .75); if (t < m.st + m.act) return at('ex', 99); return prog('ex', (1 - (t - m.st - m.act) / m.rec) * .75); }
      if (m.key === 'ult') { const u = t - m.st; if (u < 16) return prog('ultUp', u / 16); if (!m.landed) return at('ex', 99); return prog('ultLand', (t - m.landT) / Math.max(1, m.total - m.landT)); }
    }
  }
  return loop('idle', 6);
}


/* ---------- victory cinematics (keyed video frames, screen space) ---------- */
const VICT = {};
async function buildVictory() {
  const jobs = [];
  for (const id of ['aoi']) {
    let meta; try { meta = await (await fetch('anim/' + id + '_victory.json')).json(); } catch (e) { continue; }
    const fr = meta.frames.map(f => ({ x: f.vx, y: f.vy, w: f.vw, h: f.vh, img: null }));
    const byAtlas = {};
    meta.frames.forEach((f, i) => (byAtlas[f.atlas] = byAtlas[f.atlas] || []).push(i));
    for (const src in byAtlas) jobs.push(track(loadImg(src)).then(at => byAtlas[src].forEach(i => { const f = meta.frames[i], c = mk(f.w, f.h); c.getContext('2d').drawImage(at, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h); fr[i].img = c; })));
    VICT[id] = { fps: meta.fps, frames: fr };
  }
  await Promise.all(jobs);
}

/* ---------- audio ---------- */
const SND = { ac: null, on: true, master: null };
function audioInit() {
  if (SND.ac) { if (SND.ac.state === 'suspended') SND.ac.resume(); return; }
  try { SND.ac = new (window.AudioContext || window.webkitAudioContext)(); SND.master = SND.ac.createGain(); SND.master.gain.value = .55; SND.master.connect(SND.ac.destination); } catch (e) { }
}
let noiseBuf = null;
function noise(dur, f0, f1, q, vol, type = 'bandpass') {
  const ac = SND.ac; if (!ac || !SND.on) return;
  if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const t = ac.currentTime, s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ac.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(f); f.connect(g); g.connect(SND.master); s.start(t); s.stop(t + dur + .05);
}
function tone(dur, f0, f1, vol, type = 'sine', delay = 0) {
  const ac = SND.ac; if (!ac || !SND.on) return;
  const t = ac.currentTime + delay, o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g); g.connect(SND.master); o.start(t); o.stop(t + dur + .05);
}
/* ---------- BGM (opening + title loop) ---------- */
const BGM = { buf: null, bufBattle: null, cur: 'title', src: null, gain: null, on: true, loopStart: 6.1, vol: .8 };
async function loadBGM() {
  try {
    const ab = await (await fetch('media/bgm.mp3')).arrayBuffer();
    if (!SND.ac) { SND.ac = new (window.AudioContext || window.webkitAudioContext)(); SND.master = SND.ac.createGain(); SND.master.gain.value = .55; SND.master.connect(SND.ac.destination); }
    BGM.buf = await new Promise((res, rej) => SND.ac.decodeAudioData(ab, res, rej));
  } catch (e) { BGM.buf = null; }
  try {
    const ab2 = await (await fetch('media/bgm_battle.mp3')).arrayBuffer();
    BGM.bufBattle = await new Promise((res, rej) => SND.ac.decodeAudioData(ab2, res, rej));
  } catch (e) { BGM.bufBattle = null; }
}
function bgmPlay(offset = 0) {
  const battle = BGM.cur === 'battle' && BGM.bufBattle, buf = battle ? BGM.bufBattle : BGM.buf;
  if (!buf || !SND.ac) return;
  bgmStop();
  const ac = SND.ac;
  if (!BGM.gain) { BGM.gain = ac.createGain(); BGM.gain.connect(duckNode(ac)); }
  BGM.gain.gain.setValueAtTime(BGM.on ? BGM.vol : 0, ac.currentTime);
  const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.loopStart = battle ? 0 : BGM.loopStart; s.loopEnd = buf.duration - .05;
  s.connect(BGM.gain); s.start(ac.currentTime + .02, offset); BGM.src = s;
}
// switch between the title song and the battle song (short fade so the cut isn't harsh)
function bgmTrack(name, vol) {
  if (BGM.cur === name && BGM.src) { bgmVolume(vol); return; }
  BGM.cur = name; BGM.vol = vol;
  if (!SND.ac || !BGM.gain) { bgmPlay(name === 'battle' ? 0 : BGM.loopStart); return; }
  const t = SND.ac.currentTime, old = BGM.src; BGM.src = null;
  BGM.gain.gain.cancelScheduledValues(t); BGM.gain.gain.setValueAtTime(BGM.gain.gain.value, t); BGM.gain.gain.linearRampToValueAtTime(0, t + .35);
  setTimeout(() => { if (old) { try { old.stop(); } catch (e) { } } bgmPlay(name === 'battle' ? 0 : BGM.loopStart); }, 380);
}
function bgmStop() { if (BGM.src) { try { BGM.src.stop(); } catch (e) { } BGM.src = null; } }
function bgmVolume(v, sec = .6) { BGM.vol = v; if (!BGM.gain || !SND.ac) return; const t = SND.ac.currentTime; BGM.gain.gain.cancelScheduledValues(t); BGM.gain.gain.setValueAtTime(BGM.gain.gain.value, t); BGM.gain.gain.linearRampToValueAtTime(BGM.on ? v : 0, t + sec); }

/* ---------- character voices ---------- */
// each key lists candidate clips (media/voice/<id>.mp3); missing files are simply skipped
const VOICE_MAP = {
  suzune: { a0: ['su_01', 'su_03'], a1: ['su_02'], a2: ['su_04'], b: ['su_05'], jump: ['su_06'], guard: ['su_07'], hit: ['su_08'], hitBig: ['su_09'],
    getup: ['su_10'], ko: ['su_11'], ex: ['su_12'], ult: ['su_13'], select: ['su_14'], round: ['su_15'], winMovie: ['su_16'], win: ['su_17'], lose: ['su_18'] },
  arca: { a0: ['ar_01', 'ar_03'], a1: ['ar_02'], a2: ['ar_04'], b: ['ar_05'], jump: ['ar_06'], guard: ['ar_07'], hit: ['ar_08'], hitBig: ['ar_09'],
    getup: ['ar_10'], ko: ['ar_11'], ex: ['ar_12'], ult: ['ar_13'], select: ['ar_14'], round: ['ar_15'], winMovie: ['ar_16'], win: ['ar_17'], lose: ['ar_18'] },
  sys: { r1: ['sys_01'], r2: ['sys_02'], final: ['sys_03'], fight: ['sys_04'], ko: ['sys_05'], timeup: ['sys_06'] },
  aoi: { a0: ['ao_01', 'ao_03'], a1: ['ao_02'], a2: ['ao_04'], b: ['ao_05'], jump: ['ao_06'], guard: ['ao_07'], hit: ['ao_08'], hitBig: ['ao_09'],
    getup: ['ao_10'], ko: ['ao_11'], ex: ['ao_12'], ult: ['ao_13'], select: ['ao_14'], round: ['ao_15'], winMovie: ['ao_16'], win: ['ao_17'], lose: ['ao_18'] },
  sakura: { a0: ['sa_01', 'sa_03'], a1: ['sa_02'], a2: ['sa_04'], b: ['sa_05'], jump: ['sa_06'], guard: ['sa_07'], hit: ['sa_08'], hitBig: ['sa_09'],
    getup: ['sa_10'], ko: ['sa_11'], ex: ['sa_12'], ult: ['sa_13'], select: ['sa_14'], round: ['sa_15'], winMovie: ['sa_16'], win: ['sa_17'], lose: ['sa_18'] },
  mio: { a0: ['mi_01', 'mi_03'], a1: ['mi_02'], a2: ['mi_04'], b: ['mi_05'], jump: ['mi_06'], guard: ['mi_07'], hit: ['mi_08'], hitBig: ['mi_09'],
    getup: ['mi_10'], ko: ['mi_11'], ex: ['mi_12'], ult: ['mi_13'], select: ['mi_14'], round: ['mi_15'], winMovie: ['mi_16'], win: ['mi_17'], lose: ['mi_18'] }
};
const VOICE = { buf: {}, gain: null, last: {} };
// BGM ducking bus: music dips while a character is speaking so lines cut through
function duckNode(ac) { if (!SND.duck) { SND.duck = ac.createGain(); SND.duck.connect(ac.destination); } return SND.duck; }
function duckFor(t0, dur) {
  const ac = SND.ac, g = duckNode(ac).gain; g.cancelScheduledValues(t0); g.setValueAtTime(g.value, t0);
  g.linearRampToValueAtTime(.42, t0 + .08); g.setValueAtTime(.42, t0 + dur); g.linearRampToValueAtTime(1, t0 + dur + .45);
}
async function loadVoices() {
  if (!SND.ac) return;
  const ids = new Set(); Object.values(VOICE_MAP).forEach(m => Object.values(m).forEach(l => l.forEach(i => ids.add(i))));
  await Promise.all([...ids].map(async id => {
    try {
      const r = await fetch('media/voice/' + id + '.mp3'); if (!r.ok) return;
      const ab = await r.arrayBuffer(); VOICE.buf[id] = await new Promise((res, rej) => SND.ac.decodeAudioData(ab, res, rej));
    } catch (e) { }
  }));
}
// who: fighter object (voice cut per fighter) or a character id string. opts: { p: probability, cd: cooldown frames, delay: seconds }
function voice(who, key, opts = {}) {
  const ac = SND.ac; if (!ac || !SND.on) return;
  const id = typeof who === 'string' ? who : who.id, list = (VOICE_MAP[id] || {})[key]; if (!list) return;
  const avail = list.filter(v => VOICE.buf[v]); if (!avail.length) return;
  if (opts.p !== undefined && Math.random() > opts.p) return;
  const slot = typeof who === 'string' ? 'ui_' + id : 'f' + who.side;
  if (opts.cd && VOICE.last[slot + key] && G.frame - VOICE.last[slot + key] < opts.cd) return;
  VOICE.last[slot + key] = G.frame;
  if (!VOICE.gain) {   // character lines: 2x louder, with a limiter so the boost never clips
    VOICE.gain = ac.createGain(); VOICE.gain.gain.value = 2.3;
    const c = ac.createDynamicsCompressor(); c.threshold.value = -9; c.knee.value = 4; c.ratio.value = 14; c.attack.value = .002; c.release.value = .16;
    const mk = ac.createGain(); mk.gain.value = 1.05; VOICE.gain.connect(c); c.connect(mk); mk.connect(ac.destination);
  }
  const prev = VOICE['src_' + slot]; if (prev) { try { prev.stop(); } catch (e) { } }
  const s = ac.createBufferSource(); s.buffer = VOICE.buf[avail[Math.floor(Math.random() * avail.length)]];
  if (id === 'sys') { if (!VOICE.sys) { VOICE.sys = ac.createGain(); VOICE.sys.gain.value = 1.15; VOICE.sys.connect(ac.destination); } s.connect(VOICE.sys); } else s.connect(VOICE.gain);
  s.start(ac.currentTime + (opts.delay || 0)); VOICE['src_' + slot] = s;
  if (id !== 'sys') duckFor(ac.currentTime + (opts.delay || 0), s.buffer.duration);
  s.onended = () => { if (VOICE['src_' + slot] === s) VOICE['src_' + slot] = null; };
}

/* ---------- sampled sound effects (media/sfx/*.mp3); synth versions below are the fallback ---------- */
const SFXB = { buf: {}, gain: null };
const SFX_FILES = ['whoosh_punch', 'whoosh_punch2', 'whoosh_kick', 'whoosh_kick_heavy', 'hit_light', 'hit_mid', 'hit_heavy', 'guard', 'impact_big',
  'laser_shot', 'laser_homing', 'beam', 'charge', 'special_start', 'ult_start', 'dash', 'jump', 'land',
  'arca_saw', 'arca_stomp', 'arca_rail', 'arca_missile', 'arca_step', 'arca_armor', 'arca_boot', 'arca_nova'];
async function loadSfx() {
  if (!SND.ac) return;
  await Promise.all(SFX_FILES.map(async n => {
    try { const r = await fetch('media/sfx/' + n + '.mp3'); if (!r.ok) return; const ab = await r.arrayBuffer(); SFXB.buf[n] = await new Promise((res, rej) => SND.ac.decodeAudioData(ab, res, rej)); } catch (e) { }
  }));
}
function playS(name, vol = 1, rate = 1, delay = 0) {
  const ac = SND.ac, b = SFXB.buf[name]; if (!ac || !b) return false; if (!SND.on) return true;
  if (!SFXB.gain) { SFXB.gain = ac.createGain(); SFXB.gain.gain.value = .9; SFXB.gain.connect(ac.destination); }
  const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = b;
  s.playbackRate.value = rate * (.95 + Math.random() * .1); g.gain.value = vol;
  s.connect(g); g.connect(SFXB.gain); s.start(ac.currentTime + delay); return true;
}
/* ---------- cutscene soundtracks (media/sfx/movie_<ex|win>_<id>.mp3), loaded after boot ---------- */
const MOVIE_AUDIO = { buf: {}, src: null, gain: null, bgmVol: null };
async function loadMovieAudio() {
  if (!SND.ac) return;
  const ids = Object.keys(CHARS).flatMap(id => ['ex_' + id, 'win_' + id]);
  await Promise.all(ids.map(async n => {
    try { const r = await fetch('media/sfx/movie_' + n + '.mp3'); if (!r.ok) return; const ab = await r.arrayBuffer(); MOVIE_AUDIO.buf[n] = await new Promise((res, rej) => SND.ac.decodeAudioData(ab, res, rej)); } catch (e) { }
  }));
}
function movieAudio(name) {
  const ac = SND.ac, b = MOVIE_AUDIO.buf[name]; stopMovieAudio(); if (!ac || !b || !SND.on) return !!b;
  if (!MOVIE_AUDIO.gain) { MOVIE_AUDIO.gain = ac.createGain(); MOVIE_AUDIO.gain.connect(duckNode(ac)); }
  MOVIE_AUDIO.gain.gain.value = .95;
  const s = ac.createBufferSource(); s.buffer = b; s.connect(MOVIE_AUDIO.gain); s.start(ac.currentTime + .02); MOVIE_AUDIO.src = s;
  if (MOVIE_AUDIO.bgmVol === null) MOVIE_AUDIO.bgmVol = BGM.vol;
  bgmVolume(.08, .25);   // the battle song steps back while the cutscene score plays
  return true;
}
function stopMovieAudio(fade = .25) {
  const s = MOVIE_AUDIO.src; MOVIE_AUDIO.src = null;
  if (s && SND.ac) { const t = SND.ac.currentTime, g = MOVIE_AUDIO.gain.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + fade); try { s.stop(t + fade + .02); } catch (e) { } }
  if (MOVIE_AUDIO.bgmVol !== null) { const v = MOVIE_AUDIO.bgmVol; MOVIE_AUDIO.bgmVol = null; return v; }
  return null;
}
const _synth = {
  swing() { noise(.14, 2400, 700, 1.2, .25); },
  heavySwing() { noise(.26, 3000, 400, .9, .35); },
  hit(p = 1) { noise(.12 + .08 * p, 1800, 200, .8, .5 * p + .2); tone(.18 + .1 * p, 160 * (1 + p * .3), 45, .55 * Math.min(1.3, p)); },
  guard() { tone(.25, 1500, 1100, .18, 'triangle'); noise(.08, 5000, 3000, 2, .15); },
  laser() { tone(.16, 1800, 300, .16, 'sawtooth'); tone(.12, 900, 200, .12, 'square'); },
  charge() { tone(.9, 180, 1400, .12, 'sawtooth'); noise(.9, 400, 5000, 1, .12); },
  beam() { tone(1.2, 90, 60, .35, 'sawtooth'); noise(1.2, 900, 300, .6, .35); tone(1.2, 440, 380, .08, 'square'); },
  boom() { noise(.9, 900, 60, .5, .8, 'lowpass'); tone(.8, 110, 30, .9); },
  dash() { noise(.35, 600, 5000, 1, .3); },
  cutin() { tone(.5, 300, 2200, .14, 'sawtooth'); noise(.5, 800, 6000, .8, .2); },
  jump() { tone(.12, 300, 700, .1, 'triangle'); },
  land() { noise(.12, 500, 100, 1, .25, 'lowpass'); },
  announce() { tone(.35, 520, 520, .12, 'square'); tone(.5, 780, 780, .12, 'square', .12); },
  ko() { noise(1.6, 1200, 40, .5, .9, 'lowpass'); tone(1.4, 90, 25, 1); }
};
const sfx = {
  swing() { playS(Math.random() < .5 ? 'whoosh_punch' : 'whoosh_punch2', .75) || _synth.swing(); },
  kick() { playS('whoosh_kick', .95) || _synth.heavySwing(); },
  heavyKick() { playS('whoosh_kick_heavy', 1) || _synth.heavySwing(); },
  heavySwing() { playS('whoosh_punch', .95, .78) || _synth.heavySwing(); },
  hit(p = 1) { (p < .95 ? playS('hit_light', .9) : p < 1.7 ? playS('hit_mid', 1) : playS('hit_heavy', 1)) || _synth.hit(p); },
  guard() { playS('guard', .7) || _synth.guard(); },
  laser() { playS('laser_shot', .6) || _synth.laser(); },
  homing() { playS('laser_homing', .7) || _synth.laser(); },
  charge() { playS('charge', .7) || _synth.charge(); },
  beam() { playS('beam', .95) || _synth.beam(); },
  boom() { playS('impact_big', .95) || _synth.boom(); },
  dash() { playS('dash', .8) || _synth.dash(); },
  cutin() { playS('special_start', .55) || _synth.cutin(); },
  special() { playS('special_start', 1) || _synth.cutin(); },
  ultimate() { playS('ult_start', 1) || _synth.cutin(); },
  jump() { playS('jump', .45) || _synth.jump(); },
  land() { playS('land', .6) || _synth.land(); },
  announce() { _synth.announce(); },
  ko() { if (!playS('impact_big', 1)) _synth.ko(); playS('hit_heavy', .8, .85); }
};

/* ---------- input ---------- */
const KEYS = new Set();
addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  KEYS.add(e.code); audioInit();
  if (e.code === 'Escape' || (e.code === 'KeyP' && G.mode !== 'pvp')) togglePause();
});
addEventListener('keyup', e => KEYS.delete(e.code));
addEventListener('blur', () => KEYS.clear());
const MAP1 = { l: ['KeyA'], r: ['KeyD'], u: ['KeyW'], d: ['KeyS'], a: ['KeyJ'], s: ['KeyK', 'KeyL'], dh: ['KeyI'], tg: ['KeyU'] };
const MAP1solo = { l: ['KeyA', 'ArrowLeft'], r: ['KeyD', 'ArrowRight'], u: ['KeyW', 'ArrowUp', 'Space'], d: ['KeyS', 'ArrowDown'], a: ['KeyJ', 'KeyZ'], s: ['KeyK', 'KeyX', 'KeyL'], dh: ['KeyC', 'KeyI'], tg: ['KeyV', 'KeyU'] };
const MAP2 = { l: ['ArrowLeft'], r: ['ArrowRight'], u: ['ArrowUp'], d: ['ArrowDown'], a: ['Comma', 'Numpad1'], s: ['Period', 'Numpad2'], dh: ['Slash', 'Numpad3'], tg: ['Quote', 'Numpad4'] };
const TOUCH = [{}, {}];
function readHuman(side) {
  const map = G.mode === 'pvp' ? (side === 0 ? MAP1 : MAP2) : MAP1solo;
  const o = {};
  for (const k in map) o[k] = map[k].some(c => KEYS.has(c)) || !!TOUCH[side][k];
  return o;
}

/* ---------- state ---------- */
const G = {
  scene: 'title', mode: 'cpu', diff: 1, picks: ['suzune', 'aoi'], fighters: [], fx: [], proj: [], frame: 0,
  cam: { x: STAGE_W / 2, z: 1, shake: 0, kick: 0 }, hitstop: 0, slow: 1, slowT: 0, flash: 0, flashCol: '255,255,255', freeze: 0, cutin: null,
  round: 1, timer: 99, timerF: 0, phase: 'intro', phaseT: 0, banner: null, paused: false, speedlines: 0, tintA: 0, tintC: '110,195,255', matchOver: false
};

/* ---------- effects ---------- */
function addFx(o) { G.fx.push(o); return o; }
function fxSpark(x, y, rgb, n = 14, pw = 1, dir = 0) {
  for (let i = 0; i < n; i++) {
    const a = dir ? (dir > 0 ? 0 : Math.PI) + rnd(-1.1, 1.1) : rnd(0, TAU), sp = rnd(6, 22) * pw;
    addFx({ k: 'streak', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rnd(0, 3), life: rnd(12, 26), t: 0, rgb, w: rnd(1.5, 3.5) * Math.min(1.6, pw) });
  }
}
function fxCore(x, y, rgb, r = 90, life = 14) { addFx({ k: 'core', x, y, rgb, r, life, t: 0 }); }
function fxRing(x, y, rgb, r0, r1, life = 20, w = 6, sy = 1) { addFx({ k: 'ring', x, y, rgb, r0, r1, life, t: 0, w, sy }); }
function fxArc(x, y, r, a0, a1, rgb, face, life = 18, w = 40) { addFx({ k: 'arc', x, y, r, a0, a1, rgb, face, life, t: 0, w }); }
function fxPetals(x, y, n = 10, pw = 1) { for (let i = 0; i < n; i++) addFx({ k: 'petal', x, y, vx: rnd(-6, 6) * pw, vy: rnd(-9, -1) * pw, rot: rnd(0, TAU), vr: rnd(-.3, .3), life: rnd(50, 90), t: 0, s: rnd(5, 9) }); }
function fxDust(x, y, n = 8, pw = 1) { for (let i = 0; i < n; i++) addFx({ k: 'dust', x: x + rnd(-30, 30), y: y - 4, vx: rnd(-5, 5) * pw, vy: rnd(-2.5, -.2) * pw, life: rnd(22, 40), t: 0, r: rnd(10, 26) * pw }); }
function fxText(x, y, txt, rgb, size = 40, life = 50) { addFx({ k: 'text', x, y, txt, rgb, size, life, t: 0 }); }
function fxHex(x, y, rgb, face) { addFx({ k: 'hex', x, y, rgb, face, life: 18, t: 0 }); }
/* SF-mecha energy colours: SUZUNE gold / AOI blue (mirror-match colour swaps keep their own palette) */
const AURA = { suzune: { rgb: '255,196,64', hot: '255,244,200' }, aoi: { rgb: '64,168,255', hot: '205,240,255' }, arca: { rgb: '46,230,200', hot: '215,255,245' }, sakura: { rgb: '255,150,200', hot: '255,236,246' }, mio: { rgb: '110,180,255', hot: '232,246,255' } };
const auraRgb = f => f.alt ? f.col.rgb : AURA[f.id].rgb;
const auraHot = f => f.alt ? '255,255,255' : AURA[f.id].hot;
function fxBolt(x0, y0, x1, y1, rgb, life = 9) {
  const pts = [], n = 9; for (let i = 0; i <= n; i++) { const u = i / n; pts.push([lerp(x0, x1, u) + (i && i < n ? rnd(-22, 22) : 0), lerp(y0, y1, u) + (i && i < n ? rnd(-22, 22) : 0)]); }
  addFx({ k: 'bolt', pts, rgb, life, t: 0 });
}
// big-impact package: anamorphic flare, light pillar, radial spikes, hex/diamond shards, arcs of lightning
function fxBig(x, y, rgb, hot, pw = 2, dir = 1) {
  const q = Math.min(1.6, pw / 2);
  addFx({ k: 'flare', x, y, rgb, hot, life: 22 + 8 * q, t: 0, len: 520 + 520 * q });
  addFx({ k: 'pillar', x, y: Math.min(GROUND, y + 140), rgb, hot, life: 26 + 10 * q, t: 0, w: 70 + 50 * q });
  addFx({ k: 'rays', x, y, rgb, hot, life: 16 + 6 * q, t: 0, n: 14, r: 200 + 160 * q, rot: rnd(0, TAU) });
  for (let i = 0; i < 10 + 10 * q; i++) { const a = dir > 0 ? rnd(-1.3, 1.3) : Math.PI + rnd(-1.3, 1.3), sp = rnd(8, 24) * (.8 + q * .4);
    addFx({ k: 'shard', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rnd(2, 7), rot: rnd(0, TAU), vr: rnd(-.4, .4), s: rnd(6, 15), rgb, hot, life: rnd(28, 48), t: 0 }); }
  for (let i = 0; i < 2 + 2 * q; i++) { const a = rnd(0, TAU), r = rnd(120, 240) * (.8 + q * .3); fxBolt(x, y, x + Math.cos(a) * r, y + Math.sin(a) * r * .7, rgb, 8 + rnd(0, 6)); }
  fxRing(x, y, rgb, 30, 240 + 120 * q, 22 + 6 * q, 12, .45); fxRing(x, y, hot, 10, 160 + 80 * q, 16, 6);
}
// ULT / EX power-up burst around a fighter
function fxPowerUp(f, big) {
  const rgb = auraRgb(f), hot = auraHot(f);
  addFx({ k: 'pillar', x: f.x, y: GROUND, rgb, hot, life: big ? 46 : 26, t: 0, w: big ? 170 : 100 });
  fxRing(f.x, GROUND - 4, rgb, 20, big ? 320 : 200, big ? 30 : 20, 10, .22); fxRing(f.x, f.y - 170, hot, 20, big ? 260 : 150, 20, 6);
  if (big) { addFx({ k: 'rays', x: f.x, y: f.y - 170, rgb, hot, life: 28, t: 0, n: 18, r: 420, rot: rnd(0, TAU) }); for (let i = 0; i < 4; i++) fxBolt(f.x + rnd(-40, 40), f.y - rnd(40, 320), f.x + rnd(-200, 200), f.y - rnd(0, 360), rgb, 12); }
}
function shake(v) { G.cam.shake = Math.max(G.cam.shake, v); }
// whole-screen quake: the game canvas itself jolts (on top of the in-world camera shake)
const QUAKE = { amp: 0, t0: 0, dur: 1 };
function quake(amp, dur = .5, buzz = 0) {
  const now = performance.now(), cur = quakeNow(now);
  if (amp >= cur) { QUAKE.amp = amp; QUAKE.t0 = now; QUAKE.dur = dur * 1000; }
  if (buzz && navigator.vibrate) { try { navigator.vibrate(buzz); } catch (e) { } }
}
function quakeNow(now) { const u = (now - QUAKE.t0) / QUAKE.dur; return u >= 1 ? 0 : QUAKE.amp * (1 - u) * (1 - u); }
function applyQuake() {
  const a = G.paused ? 0 : quakeNow(performance.now());
  if (a < .3) { if (cv.style.transform) cv.style.transform = ''; return; }
  const dx = rnd(-a, a), dy = rnd(-a, a) * .8, r = rnd(-a, a) * .045, sc = 1 + a / 300;
  cv.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) rotate(${r.toFixed(2)}deg) scale(${sc.toFixed(3)})`;
}
function flash(a, rgb = '255,255,255') { if (a >= G.flash) { G.flash = a; G.flashCol = rgb; } }
function slowmo(s, frames) { G.slow = s; G.slowT = frames; }
function zoomKick(v) { G.cam.kick = Math.max(G.cam.kick, v); }

function updateFx(dt) {
  const arr = G.fx;
  for (let i = arr.length - 1; i >= 0; i--) {
    const f = arr[i]; f.t += dt;
    if (f.k === 'streak') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= Math.pow(.9, dt); f.vy = f.vy * Math.pow(.9, dt) + .35 * dt; }
    else if (f.k === 'petal') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= Math.pow(.97, dt); f.vy = Math.min(2.2, f.vy + .22 * dt); f.rot += f.vr * dt; }
    else if (f.k === 'dust') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= Math.pow(.92, dt); }
    else if (f.k === 'text') { f.y -= .8 * dt; }
    else if (f.k === 'ember') { f.x += f.vx * dt; f.y += f.vy * dt; f.vy -= .05 * dt; }
    else if (f.k === 'bit') { f.y += f.vy * dt; f.x += Math.sin((f.t + f.ph) * .15) * .4 * dt; }
    else if (f.k === 'paint') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= Math.pow(.97, dt); f.vy += .55 * dt; if (f.y >= GROUND) { if (!f.landed) { f.landed = true; if (Math.random() < .5) fxPuddle(f.x, f.rgb, f.r * 4, 160); } f.t = f.life; } }
    else if (f.k === 'shard') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= Math.pow(.95, dt); f.vy = f.vy * Math.pow(.95, dt) + .45 * dt; f.rot += f.vr * dt; }
    if (f.t >= f.life) arr.splice(i, 1);
  }
  // SF-mecha aura: rising energy bits / data flecks around each fighter
  if (G.fighters) for (const f of G.fighters) {
    if (f.hidden || !AURA[f.id]) continue;
    const hot = f.gauge >= 100 || f.state === 'win' || (f.state === 'atk' && f.move && (f.move.key === 'ult' || f.move.key === 'ex'));
    f._bitAcc = (f._bitAcc || 0) + dt * (hot ? .9 : .38);
    while (f._bitAcc >= 1) {
      f._bitAcc -= 1;
      arr.push({ k: 'bit', x: f.x + rnd(-80, 80), y: f.y - rnd(0, 300), vy: -rnd(1.6, 4.2) * (hot ? 1.4 : 1), len: rnd(8, 26), w: Math.random() < .3 ? 3 : 1.6, sq: Math.random() < .35, ph: rnd(0, 60), rgb: auraRgb(f), life: rnd(26, 50), t: 0 });
    }
  }
  if (arr.length > 700) arr.splice(0, arr.length - 700);
}
function drawFx(layer) {
  for (const f of G.fx) {
    const p = f.t / f.life, a = 1 - p;
    if (layer === 'add') {
      if (f.k === 'streak') {
        ctx.strokeStyle = `rgba(${f.rgb},${a})`; ctx.lineWidth = f.w; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x - f.vx * 2.2, f.y - f.vy * 2.2); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${a * .9})`; ctx.lineWidth = f.w * .4; ctx.stroke();
      } else if (f.k === 'core') {
        const r = f.r * (0.6 + p * 0.9), g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
        g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(.25, `rgba(255,240,210,${a * .9})`); g.addColorStop(.55, `rgba(${f.rgb},${a * .55})`); g.addColorStop(1, `rgba(${f.rgb},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.fill();
      } else if (f.k === 'ring') {
        const e = 1 - Math.pow(1 - p, 3), r = lerp(f.r0, f.r1, e);
        ctx.strokeStyle = `rgba(${f.rgb},${a})`; ctx.lineWidth = f.w * a + .5;
        ctx.beginPath(); ctx.ellipse(f.x, f.y, r, r * f.sy, 0, 0, TAU); ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${a * .7})`; ctx.lineWidth = f.w * a * .35 + .3; ctx.stroke();
      } else if (f.k === 'arc') { drawArcRibbon(f, p); }
      else if (f.k === 'ember') { ctx.fillStyle = `rgba(${f.rgb},${a})`; ctx.fillRect(f.x, f.y, 3, 3); }
      else if (f.k === 'bit') {
        const al = Math.min(1, f.t / 6) * a;
        if (f.sq) { ctx.fillStyle = `rgba(${f.rgb},${al})`; ctx.fillRect(f.x - 2, f.y - 2, 4, 4); ctx.fillStyle = `rgba(255,255,255,${al * .8})`; ctx.fillRect(f.x - 1, f.y - 1, 2, 2); }
        else { const g = ctx.createLinearGradient(0, f.y, 0, f.y + f.len); g.addColorStop(0, `rgba(255,255,255,${al})`); g.addColorStop(.3, `rgba(${f.rgb},${al * .9})`); g.addColorStop(1, `rgba(${f.rgb},0)`); ctx.fillStyle = g; ctx.fillRect(f.x - f.w / 2, f.y, f.w, f.len); }
      } else if (f.k === 'bolt') {
        const al = a * (Math.random() < .25 ? .35 : 1);
        ctx.lineJoin = 'miter'; ctx.beginPath(); f.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.strokeStyle = `rgba(${f.rgb},${al * .55})`; ctx.lineWidth = 9; ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${al})`; ctx.lineWidth = 2.2; ctx.stroke();
      } else if (f.k === 'flare') {
        const e = 1 - Math.pow(1 - Math.min(1, p * 3), 2), L = f.len * (.4 + .6 * e), th = 16 * a + 2;
        let g = ctx.createLinearGradient(f.x - L, 0, f.x + L, 0);
        g.addColorStop(0, `rgba(${f.rgb},0)`); g.addColorStop(.42, `rgba(${f.rgb},${a * .8})`); g.addColorStop(.5, `rgba(${f.hot},${a})`); g.addColorStop(.58, `rgba(${f.rgb},${a * .8})`); g.addColorStop(1, `rgba(${f.rgb},0)`);
        ctx.fillStyle = g; ctx.fillRect(f.x - L, f.y - th / 2, L * 2, th); ctx.fillRect(f.x - L * .6, f.y - th * .15, L * 1.2, th * .3);
        g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 120 * (1 + p)); g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(.3, `rgba(${f.hot},${a * .7})`); g.addColorStop(1, `rgba(${f.rgb},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, 120 * (1 + p), 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(${f.hot},${a * .6})`; ctx.fillRect(f.x - 2, f.y - L * .35, 4, L * .7);
      } else if (f.k === 'pillar') {
        const w = f.w * (1 - p * .6) * (p < .1 ? p / .1 : 1), top = -80;
        const g = ctx.createLinearGradient(f.x - w, 0, f.x + w, 0);
        g.addColorStop(0, `rgba(${f.rgb},0)`); g.addColorStop(.35, `rgba(${f.rgb},${a * .5})`); g.addColorStop(.5, `rgba(${f.hot},${a * .95})`); g.addColorStop(.65, `rgba(${f.rgb},${a * .5})`); g.addColorStop(1, `rgba(${f.rgb},0)`);
        ctx.fillStyle = g; ctx.fillRect(f.x - w, top, w * 2, f.y - top);
        for (let j = 0; j < 5; j++) { const yy = f.y - ((f.t * 22 + j * 140) % (f.y - top)); ctx.fillStyle = `rgba(255,255,255,${a * .5})`; ctx.fillRect(f.x - w * .8, yy, w * 1.6, 2); }
      } else if (f.k === 'rays') {
        const r = f.r * (0.5 + p * .7);
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot + p * .5);
        for (let j = 0; j < f.n; j++) { const L = r * (j % 2 ? .6 : 1), wv = (j % 2 ? .05 : .08);
          ctx.rotate(TAU / f.n); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L, -L * wv); ctx.lineTo(L * 1.05, 0); ctx.lineTo(L, L * wv); ctx.closePath();
          ctx.fillStyle = `rgba(${j % 2 ? f.hot : f.rgb},${a * .7})`; ctx.fill(); }
        ctx.restore();
      } else if (f.k === 'shard') {
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); const s2 = f.s * (1 - p * .4);
        ctx.beginPath(); ctx.moveTo(0, -s2); ctx.lineTo(s2 * .45, 0); ctx.lineTo(0, s2); ctx.lineTo(-s2 * .45, 0); ctx.closePath();
        ctx.fillStyle = `rgba(${f.rgb},${a * .85})`; ctx.fill(); ctx.strokeStyle = `rgba(${f.hot},${a})`; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
      }
      else if (f.k === 'hex') {
        ctx.save(); ctx.translate(f.x, f.y); ctx.scale(f.face, 1);
        const s = 1 + p * .25; ctx.strokeStyle = `rgba(${f.rgb},${a})`; ctx.lineWidth = 3;
        for (let j = -1; j <= 1; j++) for (let k = -2; k <= 2; k++) { hexPath(20 + Math.abs(k) * 2, (j * 44 + (k & 1) * 22) * s * .6 + 30, k * 38 * s, 22); ctx.stroke(); }
        ctx.fillStyle = `rgba(${f.rgb},${a * .15})`; ctx.fillRect(10, -110, 44, 220); ctx.restore();
      }
    } else {
      if (f.k === 'paint') {
        const sp = Math.hypot(f.vx, f.vy), ang = Math.atan2(f.vy, f.vx), st = 1 + Math.min(1.6, sp / 10);
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(ang); ctx.globalAlpha = Math.min(1, a * 2);
        ctx.fillStyle = `rgb(${f.rgb})`; ctx.beginPath(); ctx.ellipse(0, 0, f.r * st, f.r, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(f.r * .3, -f.r * .35, f.r * .35, f.r * .22, 0, 0, TAU); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
      } else if (f.k === 'petal') {
        ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.globalAlpha = Math.min(1, a * 1.5);
        ctx.fillStyle = '#ffd3e0'; ctx.beginPath(); ctx.ellipse(0, 0, f.s, f.s * .55, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = '#ff9ab8'; ctx.beginPath(); ctx.ellipse(f.s * .3, 0, f.s * .35, f.s * .25, 0, 0, TAU); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
      } else if (f.k === 'dust') {
        ctx.fillStyle = `rgba(200,180,210,${a * .28})`; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 + p), 0, TAU); ctx.fill();
      } else if (f.k === 'text') {
        const pop = p < .12 ? 1.6 - p / .12 * .6 : 1;
        ctx.save(); ctx.translate(f.x, f.y); ctx.scale(pop, pop); ctx.globalAlpha = Math.min(1, a * 2);
        ctx.font = `800 ${f.size}px 'Chakra Petch', 'Shippori Mincho B1', sans-serif`; ctx.textAlign = 'center';
        ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(10,6,20,.85)'; ctx.strokeText(f.txt, 0, 0);
        ctx.fillStyle = `rgb(${f.rgb})`; ctx.fillText(f.txt, 0, 0); ctx.restore(); ctx.globalAlpha = 1;
      }
    }
  }
}
function hexPath(r, x, y) { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + Math.PI / 6; ctx.lineTo(x + Math.cos(a) * r * .5, y + Math.sin(a) * r * .5); } ctx.closePath(); }
function drawArcRibbon(f, p) {
  const reveal = Math.min(1, f.t / 5), fade = p < .35 ? 1 : 1 - (p - .35) / .65;
  const a0 = f.a0, a1 = lerp(f.a0, f.a1, reveal), steps = 26;
  ctx.save(); ctx.translate(f.x, f.y); ctx.scale(f.face, 1);
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) { const t = i / steps, a = lerp(a0, a1, t), w = f.w * Math.sin(t * Math.PI) * (pass ? .35 : 1); ctx.lineTo(Math.cos(a) * (f.r + w * .5), Math.sin(a) * (f.r + w * .5)); }
    for (let i = steps; i >= 0; i--) { const t = i / steps, a = lerp(a0, a1, t), w = f.w * Math.sin(t * Math.PI) * (pass ? .35 : 1); ctx.lineTo(Math.cos(a) * (f.r - w * .5), Math.sin(a) * (f.r - w * .5)); }
    ctx.closePath();
    ctx.fillStyle = pass ? `rgba(255,255,255,${fade * .95})` : `rgba(${f.rgb},${fade * .85})`; ctx.fill();
  }
  ctx.restore();
}

/* ---------- fighters ---------- */
function makeFighter(id, side, alt) {
  const ch = CHARS[id], col = alt ? ALT[id] : ch;
  return {
    id, ch, side, alt, col, gfx: alt ? GFX[id].altLazy() : GFX[id][0],
    x: side === 0 ? STAGE_W / 2 - 300 : STAGE_W / 2 + 300, y: GROUND, top: 0, bot: 0, wave: 0, land: 0, glitch: 0, flip: false, flipT: 0, holdBack: false, vx: 0, vy: 0, face: side === 0 ? 1 : -1,
    hp: 100, dispHp: 100, gauge: 0, state: 'idle', t: 0, move: null, hitIds: new Set(), stun: 0, combo: 0, inv: 0,
    sx: 1, sy: 1, rot: 0, ox: 0, oy: 0, whiteT: 0, ai: null, prev: {}, buf: {}, trail: [], rail: [], chain: 0, hidden: false, wins: 0,
    droneX: 0, droneY: 0, droneA: 0, charge: 0, ko: false, ghosts: [], _hits: 0, _lastHitT: 0
  };
}
const onGround = f => f.y >= GROUND - .01;
function hurt(f) { const w = f.ch.hurtW || 58, h = f.ch.hurtH || 280; return { x0: f.x - w, x1: f.x + w, y0: f.y - h, y1: f.y }; }
function overlap(a, b) { return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0; }
function box(f, x0, x1, y0, y1) { const a = f.x + f.face * x0, b = f.x + f.face * x1; return { x0: Math.min(a, b), x1: Math.max(a, b), y0: f.y + y0, y1: f.y + y1 }; }

const MOVES = {
  suzune: {
    a: { st: 4, act: 4, rec: 11, cost: 0 },
    b: { st: 8, act: 11, rec: 16, cost: 0 },
    ex: { st: 10, act: 26, rec: 18, cost: 50 },
    ult: { st: 0, act: 150, rec: 30, cost: 100 }
  },
  arca: {
    a: { st: 9, act: 5, rec: 15, cost: 0 },
    b: { st: 12, act: 4, rec: 22, cost: 0 },
    ex: { st: 14, act: 24, rec: 20, cost: 50 },
    ult: { st: 0, act: 150, rec: 30, cost: 100 }
  },
  sakura: {
    a: { st: 5, act: 4, rec: 12, cost: 0 },
    b: { st: 9, act: 4, rec: 20, cost: 0 },
    ex: { st: 16, act: 44, rec: 16, cost: 50 },
    ult: { st: 0, act: 150, rec: 30, cost: 100 }
  },
  mio: {
    a: { st: 5, act: 4, rec: 12, cost: 0 },
    b: { st: 9, act: 4, rec: 19, cost: 0 },
    ex: { st: 12, act: 30, rec: 16, cost: 50 },
    ult: { st: 0, act: 150, rec: 30, cost: 100 }
  },
  aoi: {
    a: { st: 6, act: 2, rec: 14, cost: 0 },
    b: { st: 7, act: 7, rec: 17, cost: 0 },
    ex: { st: 12, act: 10, rec: 20, cost: 50 },
    ult: { st: 0, act: 150, rec: 30, cost: 100 }
  }
};

function startMove(f, key) {
  const m = MOVES[f.id][key];
  if (f.gauge < m.cost) return false;
  if (key === 'ult' && f.hp > 50) return false;
  f.gauge -= m.cost;
  if (key === 'a' && f.state === 'atk' && f.move && f.move.key === 'a') f.chain++; else f.chain = 0;
  f.state = 'atk'; f.t = -1; f.move = { key, ...m, total: m.st + m.act + m.rec, id: Math.random() }; f.hitIds.clear();
  if (key === 'ult') { startUlt(f); voice(f, 'ult'); }
  if (key === 'ex') { fxPowerUp(f, false); sfx.special(); voice(f, 'ex'); f.inv = f.id === 'suzune' ? 30 : 0; sfx.charge(); }
  if (key === 'a') voice(f, 'a' + Math.min(2, f.chain), { p: f.chain === 2 ? 1 : .75 });
  if (key === 'b') voice(f, 'b');
  if (f.id === 'suzune') { if (key === 'b') sfx.heavyKick(); else if (key === 'a') f.chain === 2 ? sfx.kick() : sfx.swing(); }
  else if (f.id === 'arca') { if (key === 'a') f.chain >= 2 ? playS('arca_stomp', 1) : playS('arca_saw', .9); else if (key === 'b') playS('arca_rail', 1); }
  else if (key === 'b') sfx.heavySwing();
  return true;
}
function startUlt(f) {
  sfx.ultimate(); f.inv = 999;
  if (!exMovieStart(f)) { G.freeze = 78; G.cutin = { f, t: 0 }; flash(.6, f.col.rgb); }   // fallback: in-canvas cut-in
  G.tintA = .55; G.tintC = auraRgb(f); fxPowerUp(f, true);
}

function hitTarget(att, tgt, o) {
  if (tgt.inv > 0 || tgt.ko || tgt.state === 'down' || G.phase !== 'fight') return false;
  const fromDir = Math.sign(tgt.x - att.x) || att.face;
  const guarding = (tgt.state === 'guard' || (tgt.holdBack && (tgt.state === 'walk' || tgt.state === 'idle'))) && onGround(tgt) && tgt.face === -fromDir;
  const hx = (att.x + tgt.x) / 2 + fromDir * 20, hy = tgt.y - (o.hy || 160);
  if (guarding && !o.unblock) {
    tgt.hp = Math.max(1, tgt.hp - o.dmg * (o.ult ? .2 : .05)); tgt.vx = fromDir * (o.kb || 4) * (o.ult ? .5 : .4); tgt.stun = o.ult ? 9 : 7; tgt.t = 0;   // stronger guard: small chip, short blockstun, little pushback
    tgt.gauge = Math.min(100, tgt.gauge + o.dmg * .6); att.gauge = Math.min(100, att.gauge + o.dmg * .4);
    fxHex(tgt.x - fromDir * 40, tgt.y - 150, tgt.col.rgb, -fromDir); fxSpark(hx, hy, '180,220,255', 8, .6, -fromDir); fxRing(hx, hy, '180,220,255', 10, 70, 12, 4);
    G.hitstop = Math.max(G.hitstop, 4); shake(4); sfx.guard(); voice(tgt, 'guard', { p: .5, cd: 240 });
    return true;
  }
  tgt.combo = (tgt.state === 'hit' || tgt.state === 'air') ? tgt.combo + 1 : 1;
  const sc = o.noScale ? 1 : Math.max(.45, 1 - .08 * (tgt.combo - 1));
  const dmg = o.dmg * sc;
  tgt.hp = Math.max(0, tgt.hp - dmg);
  att.gauge = Math.min(100, att.gauge + o.dmg * 2.1); tgt.gauge = Math.min(100, tgt.gauge + o.dmg * 1.2); if (tgt.id === 'aoi') tgt.glitch = 8;
  tgt.face = -fromDir; tgt.flip = false; tgt.whiteT = 6; tgt.t = 0; tgt.move = null;
  tgt.vx = fromDir * (o.kb || 5);
  const launch = o.launch || (!onGround(tgt) ? -5 : 0);
  if (launch || tgt.hp <= 0) { tgt.vy = launch || -12; tgt.state = 'air'; tgt.y = Math.min(tgt.y, GROUND - 1); }
  else { tgt.state = 'hit'; tgt.stun = o.stun || 16; }
  const pw = o.power || 1;
  fxCore(hx, hy, att.col.rgb, 70 + 50 * pw, 12 + 4 * pw); fxSpark(hx, hy, att.col.rgb, 10 + 10 * pw, .8 + .5 * pw, fromDir);
  fxRing(hx, hy, att.col.rgb, 10, 60 + 60 * pw, 14 + 6 * pw, 5 + 3 * pw);
  if (att.id === 'suzune') fxPetals(hx, hy, 3 + 4 * pw, pw); else if (att.id === 'mio') fxPaint(hx, hy, 6 + 6 * pw, .8 + .3 * pw, fromDir); else fxHex(hx, hy, att.col.rgb, fromDir);
  G.hitstop = Math.max(G.hitstop, o.hitstop || (4 + 4 * pw)); shake(4 + 7 * pw);
  if (pw >= 1.4 || o.launch) { quake(3 + 5 * pw, .28 + .12 * pw, pw >= 2 ? 60 : 25); fxBig(hx, hy, auraRgb(att), auraHot(att), Math.max(1.4, pw), fromDir); }
  if (pw >= 2) flash(.35 * pw / 2, '255,230,200');
  sfx.hit(pw);
  if (tgt.id === 'arca') playS('arca_armor', .55, rnd(.9, 1.1));         // the ARSENAL's armour rings when struck
  else if (att.id === 'arca' && pw >= .9) playS('arca_armor', .3, 1.3);   // steel-on-body crunch for its blade hits
  if (tgt.combo >= 2) fxText(att.x, att.y - 340, `${tgt.combo} HITS`, att.col.rgb, 30, 40);
  if (tgt.hp <= 0) { voice(tgt, 'ko'); onKO(att, tgt); }
  else if (launch) voice(tgt, 'hitBig', { cd: 30 });
  else voice(tgt, 'hit', { p: .7, cd: 25 });
  return true;
}

function tryHit(att, tgt, bx, o, maxHits = 1, every = 99) {
  const k = 'm';
  if (!overlap(bx, hurt(tgt))) return false;
  att._hits = att._hits || 0;
  if (att.hitIds.has(k) && (att._hits >= maxHits || att.t - att._lastHitT < every)) return false;
  if (!att.hitIds.has(k)) att._hits = 0;
  att.hitIds.add(k); att._hits++; att._lastHitT = att.t;
  return hitTarget(att, tgt, o);
}

function updateMove(f, o, dt) {
  const m = f.move, t = f.t, k = m.key, act = t >= m.st && t < m.st + m.act, at = t - m.st;
  const first = (n) => at >= n && at - dt < n;
  if (f.id === 'suzune') {
    if (k === 'a') {
      const fin = f.chain >= 2;
      if (first(0)) { f.vx = f.face * (fin ? 12 : 7); f.trail.push(1); fxArc(f.x + f.face * 90, f.y - 175, fin ? 95 : 70, fin ? -1.9 : -0.5, fin ? .9 : .5, f.col.rgb, f.face, 12, fin ? 34 : 18); }
      if (act) tryHit(f, o, box(f, 30, fin ? 215 : 190, -240, -110), { dmg: fin ? 7 : 4, kb: fin ? 10 : 3, stun: fin ? 20 : 15, power: fin ? 1.4 : .7, launch: fin ? -9 : 0 });
    } else if (k === 'b') {
      if (t < m.st) { f.vx *= .7; }
      if (first(0)) { f.vx = f.face * 15; fxArc(f.x + f.face * 60, f.y - 130, 150, 2.2, -1.2, f.col.rgb, f.face, 20, 54); fxRing(f.x + f.face * 60, f.y - 4, f.col.rgb, 20, 170, 22, 5, .22); fxDust(f.x, f.y, 6, .8); }
      if (act) { f.vx *= Math.pow(.9, dt); tryHit(f, o, box(f, 10, 225, -240, -30), { dmg: 10, kb: 13, launch: -10, power: 1.6, stun: 24 }); }
    } else if (k === 'ex') {
      if (t < m.st) { f.vx = 0; if ((t | 0) % 3 === 0) fxSpark(f.x, f.y - 20, f.col.rgb2, 2, .4); }
      if (first(0)) { sfx.dash(); f.vx = f.face * 24; flash(.25, f.col.rgb); G.speedlines = 26; fxRing(f.x, f.y - 4, f.col.rgb, 10, 200, 20, 8, .25); }
      if (act) {
        f.vx = f.face * 24; f.rail.push({ x: f.x - f.face * 20, y: f.y - 10, t: G.frame });
        if ((at | 0) % 2 === 0) f.trail.push(1);
        if (tryHit(f, o, box(f, -40, 160, -270, 0), { dmg: 4.5, kb: 2, stun: 22, power: 1.1, hy: rnd(80, 220) }, 4, 6)) { o.vx = f.face * 2; fxPetals(o.x, o.y - 150, 6, 1.4); }
      }
      if (first(m.act)) { fxArc(f.x, f.y - 140, 170, -Math.PI, Math.PI, f.col.rgb, f.face, 26, 26); fxRing(f.x, f.y - 140, f.col.rgb, 60, 220, 26, 8); }
      if (t >= m.st + m.act) f.vx *= Math.pow(.8, dt);
    } else if (k === 'ult') updateSuzuneUlt(f, o, at, dt, first);
  } else if (f.id === 'arca') updateArcaMove(f, o, m, t, k, act, at, dt, first);
  else if (f.id === 'sakura') updateSakuraMove(f, o, m, t, k, act, at, dt, first);
  else if (f.id === 'mio') updateMioMove(f, o, m, t, k, act, at, dt, first);
  else {
    const dx = f.droneX, dy = f.droneY;
    if (k === 'a') {
      if (t < m.st) f.charge = t / m.st;
      if (first(0)) { const ty = o.y - 150, ang = clamp(Math.atan2(ty - dy, Math.abs(o.x - dx) + 1), -.2, .75); spawnBolt(f, dx, dy, f.face * 22 * Math.cos(ang), 22 * Math.sin(ang), 4, 'bolt'); sfx.laser(); fxRing(dx + f.face * 30, dy, f.col.rgb, 4, 40, 10, 4); fxCore(dx + f.face * 20, dy, f.col.rgb, 40, 8); f.charge = 0; }
    } else if (k === 'b') {
      if (first(0)) { f.vx = f.face * 6; fxHex(f.x + f.face * 110, f.y - 150, f.col.rgb, f.face); fxRing(f.x + f.face * 130, f.y - 150, f.col.rgb, 20, 150, 16, 7); fxSpark(f.x + f.face * 120, f.y - 150, f.col.rgb2, 12, 1, f.face); }
      if (act) tryHit(f, o, box(f, 20, 215, -250, -50), { dmg: 8.5, kb: 16, launch: -8, power: 1.5, stun: 22 });
    } else if (k === 'ex') {
      if (t < m.st) { f.charge = t / m.st; if ((t | 0) % 2 === 0) fxSpark(dx, dy, f.col.rgb2, 2, .35); }
      if (first(0) || first(4) || first(8)) {
        const i = at < 2 ? 0 : at < 6 ? 1 : 2; i === 0 ? sfx.homing() : playS('laser_shot', .35, 1.2) || sfx.laser();
        spawnBolt(f, dx, dy, f.face * rnd(6, 10), [-16, -6, 8][i], 5, 'homing');
        fxRing(dx, dy, f.col.rgb2, 5, 60, 12, 5); f.charge = 0;
      }
    } else if (k === 'ult') updateAoiUlt(f, o, at, dt, first);
  }
}

// ARCA-07 / MAGITEK ARSENAL: crushing blade legs, rune railgun, rune missiles, magic-circle nova beam
function arcaMuzzle(f) { return { x: f.x + f.face * 320, y: f.y - 440 }; }
function updateArcaMove(f, o, m, t, k, act, at, dt, first) {
  const rgb = f.col.rgb, mz = arcaMuzzle(f);
  if (k === 'a') {
    const fin = f.chain >= 2;
    if (t < m.st) f.vx *= .8;
    if (first(0)) {
      f.vx = f.face * (fin ? 9 : 5); shake(fin ? 8 : 4); fxDust(f.x + f.face * 150, f.y, 6, 1);
      fxArc(f.x + f.face * 300, f.y - 230, fin ? 330 : 290, fin ? -2.2 : -1.2, fin ? 1.2 : .9, rgb, f.face, 14, fin ? 44 : 30);
      fxRing(f.x + f.face * 380, f.y - 4, rgb, 10, fin ? 300 : 200, 16, 6, .22); for (let q = 0; q < 8; q++) addFx({ k: 'streak', x: f.x + f.face * rnd(150, 620), y: f.y - rnd(80, 380), vx: f.face * rnd(16, 30), vy: rnd(-3, 3), life: rnd(8, 14), t: 0, rgb, w: rnd(2, 4) });
    }
    if (act) tryHit(f, o, box(f, 30, 660, -475, -20), { dmg: fin ? 8 : 5, kb: fin ? 13 : 5, stun: fin ? 22 : 17, power: fin ? 1.6 : .9, launch: fin ? -10 : 0, hy: 150 });
  } else if (k === 'b') {
    if (t < m.st) { f.vx *= .7; f.charge = t / m.st; if ((t | 0) % 2 === 0) fxSpark(mz.x, mz.y, rgb, 2, .4); }
    if (first(0)) {
      const ang = Math.atan2((o.y - 150) - mz.y, Math.max(200, Math.abs(o.x - mz.x))); G.proj.push({ owner: f, x: mz.x, y: mz.y, vx: f.face * 30 * Math.cos(ang), vy: 30 * Math.sin(ang), dmg: 8, type: 'rail', pw: 1.3, kb: 11, life: 70, t: 0, trail: [], rgb });
      f.vx = -f.face * 8; f.charge = 0; shake(7); quake(5, .2);
      fxCore(mz.x, mz.y, rgb, 110, 12); for (let i = 0; i < 3; i++) fxRing(mz.x + f.face * i * 26, mz.y, i ? rgb : '255,255,255', 6, 50 + i * 16, 14, 5, 2.4);
      fxSpark(mz.x, mz.y, rgb, 12, 1, f.face);
    }
  } else if (k === 'ex') {
    if (t < m.st) { f.vx = 0; f.charge = t / m.st; if ((t | 0) % 2 === 0) fxSpark(f.x - f.face * 150, f.y - 330, f.col.rgb2, 2, .4); }
    if (first(0) || first(4) || first(8) || first(12) || first(16) || first(20)) {
      const i = Math.round(at / 4), px = f.x - f.face * (238 + (i % 2) * 60), py = f.y - 530 - (i % 3) * 24;
      G.proj.push({ owner: f, x: px, y: py, vx: f.face * rnd(3, 7), vy: rnd(-17, -11), dmg: 4.2, type: 'homing', life: 120, t: 0, trail: [], rgb: i % 2 ? rgb : f.col.rgb2 });
      playS('arca_missile', .55, rnd(.9, 1.1)); if (i === 0) sfx.homing(); fxRing(px, py, rgb, 5, 60, 12, 5); fxCore(px, py, rgb, 50, 8); shake(3);
    }
    if (t >= m.st + m.act) f.charge = 0;
  } else if (k === 'ult') updateAoiUlt(f, o, at, dt, first);   // same beam logic, fired from the ARSENAL's railgun
}
// SAKURA: drafting-compass strikes, a thrown blueprint disc, and the IDEA DRAGON she draws into being
function sakuraTip(f) { return { x: f.x + f.face * 155, y: f.y - 270 }; }
// ULT: her blueprint beam and the dragon's breath converge here, then fire as one braided beam
function sakuraFocus(f) { return { x: f.x + f.face * 440, y: f.y - 245 }; }
function updateSakuraMove(f, o, m, t, k, act, at, dt, first) {
  const rgb = f.col.rgb, gold = f.col.rgb2, tip = sakuraTip(f);
  if (k === 'a') {
    const c = Math.min(2, f.chain);
    if (t < m.st) f.vx *= .75;
    if (first(0)) {
      f.vx = f.face * [4, 6, 9][c];
      if (c === 1) fxArc(f.x + f.face * 106, f.y - 245, 122, -1.6, 1.1, rgb, f.face, 18, 34);
      else { fxRing(tip.x, tip.y, gold, 4, 46, 10, 4); fxCore(tip.x, tip.y, rgb, 40, 8); }
      if (c === 2) { spawnBolt(f, tip.x, tip.y, f.face * 24, 0, 5, 'bolt'); sfx.laser(); fxRing(tip.x + f.face * 30, tip.y, rgb, 6, 70, 12, 5, 2.4); }
      else sfx.swing();
    }
    if (act) tryHit(f, o, box(f, 25, c === 1 ? 260 : 230, -325, -122), { dmg: [4, 4.5, 5][c], kb: [3, 4, 9][c], stun: [15, 16, 20][c], power: [.7, .8, 1.2][c], launch: c === 2 ? -8 : 0 });
  } else if (k === 'b') {
    if (t < m.st) { f.vx *= .7; f.charge = t / m.st; if ((t | 0) % 2 === 0) fxSpark(tip.x, tip.y, gold, 2, .4); }
    if (first(0)) {   // blueprint compass-rose disc flung forward
      G.proj.push({ owner: f, x: tip.x, y: tip.y, vx: f.face * 17, vy: 0, dmg: 8, type: 'rail', pw: 1.3, kb: 11, life: 90, t: 0, trail: [], rgb: gold });
      f.vx = -f.face * 4; f.charge = 0; shake(4);
      for (let i = 0; i < 3; i++) fxRing(tip.x, tip.y, i ? rgb : '255,255,255', 6, 60 + i * 26, 14, 5, 2.4);
      sfx.heavySwing();
    }
  } else if (k === 'ex') {
    if (t < m.st) { f.vx = 0; f.charge = t / m.st; if ((t | 0) % 2 === 0) fxSpark(f.x, f.y - 457, gold, 3, .5); if ((t | 0) % 6 === 0) fxRing(f.x - f.face * 49, f.y - 522, rgb, 20, 163, 16, 3, .3); }
    if (first(0)) { summonDragon(f, o, 'swoop'); f.charge = 0; }
  } else if (k === 'ult') {
    if (first(0)) summonDragon(f, o, 'ult');
    updateAoiUlt(f, o, at, dt, first);   // shared beam logic; the beam starts where her line and the dragon's breath meet
    if (f.move && f.move.beam && (at | 0) % 3 === 0) { const c = sakuraFocus(f); fxRing(c.x, c.y, (at | 0) % 2 ? f.col.rgb2 : f.col.rgb, 20, 160, 12, 6, .5); }
  }
}
const DRAGON = { mx: 300, my: -24 };   // jaw position relative to the dragon's body centre in source sprite px (facing right)
const dragonScale = f => { const AN = ANIMS[f.id]; return AN ? AN.k * AN.dragonK : .9; };
function summonDragon(f, o, mode) {
  const back = -f.face;
  f.dragon = mode === 'swoop'
    ? { mode, t: 0, face: f.face, x: f.x + back * 700, y: f.y - 571, x0: f.x + back * 700, x1: o.x + f.face * 1000, hits: 0, next: 0 }
    : { mode, t: 0, face: f.face, x: f.x + back * 900, y: f.y - 735, hits: 0, next: 0 };
  fxRing(f.x, f.y - 522, f.col.rgb2, 30, 320, 24, 8, .3); fxCore(f.x, f.y - 522, f.col.rgb, 200, 18); flash(.35, f.col.rgb);
  playS('special_start', .5, 1.3); shake(6);
}
function updateDragon(f, o, dt) {
  const d = f.dragon; if (!d) return;
  d.t += dt;
  if (d.mode === 'swoop') {
    const L = 46, q = Math.min(1, d.t / L);
    const px = d.x, py = d.y;
    d.x = lerp(d.x0, d.x1, q); d.y = f.y - 571 + Math.sin(q * Math.PI) * 490;   // arc dives through the opponent and climbs away
    if (d.t > dt) d.rot = lerp(d.rot || 0, Math.atan2(d.y - py, Math.abs(d.x - px) + .01), .35);
    if (q < .9 && d.hits < 4 && d.t >= d.next && G.phase === 'fight') {   // wide body + wing + claw hitbox
      const hb = { x0: d.x - 277, x1: d.x + 277, y0: d.y - 245, y1: d.y + 245 };
      if (overlap(hb, hurt(o))) { d.hits++; d.next = d.t + 7; const fin = d.hits === 4; hitTarget(f, o, { dmg: fin ? 7 : 4, kb: fin ? 14 : 4, stun: 22, power: fin ? 1.9 : 1.1, launch: fin ? -13 : 0, hy: clamp(o.y - d.y, 60, 260) }); fxArc(d.x, d.y + 40, 220, -1.8, 1.4, f.col.rgb, d.face, 18, 34); }
    }
    if ((d.t | 0) % 2 === 0) addFx({ k: 'streak', x: d.x - d.face * 160, y: d.y + rnd(-60, 60), vx: -d.face * 14, vy: 0, life: 14, t: 0, rgb: f.col.rgb, w: 4 });
    if (d.t > L + 10) f.dragon = null;
  } else if (d.mode === 'ult') {
    const tx = f.x + f.face * 139, ty = f.y - 351;   // hovers over her outstretched arm, both facing the foe
    d.x = lerp(d.x, tx, .14); d.y = lerp(d.y, ty + Math.sin(d.t * .08) * 14, .14); d.face = f.face;
    d.rot = lerp(d.rot || 0, f.move && f.move.beam ? .32 : .12, .1);   // dips its head to breathe down onto the focus point
    const c = sakuraFocus(f); f.droneX = c.x; f.droneY = c.y;
    { const K = dragonScale(f), cs = Math.cos(d.rot), sn = Math.sin(d.rot), mx = DRAGON.mx * K, my = DRAGON.my * K;   // jaw position after the head dip
      d.mouthX = d.x + d.face * (mx * cs - my * sn); d.mouthY = d.y + (mx * sn + my * cs); }
    if (!(f.state === 'atk' && f.move && f.move.key === 'ult')) { d.mode = 'leave'; d.t = 0; }
  } else if (d.mode === 'leave' || d.mode === 'win') {
    if (d.mode === 'leave') { d.x -= d.face * 22 * dt; d.y -= 9 * dt; if (d.t > 50) f.dragon = null; }
    else { d.x = lerp(d.x, f.x - f.face * 260, .05); d.y = lerp(d.y, f.y - 520 + Math.sin(d.t * .05) * 20, .05); d.face = f.face; }
  }
}
function dragonFrame(f) {
  const AN = ANIMS[f.id], d = f.dragon; if (!AN || !d) return null;
  const a = AN.a, pick = (n, i) => { const arr = a[n] || a.dFly; if (!arr) return null; return arr[clamp(Math.floor(i), 0, arr.length - 1)]; };
  const loop = n => { const arr = a[n] || a.dFly; return arr && arr[Math.floor(G.frame * (AN.fps[n] || 12) / 60) % arr.length]; };
  if (d.mode === 'ult' && f.move && f.move.beam) return loop('dBreath');
  return loop('dFly');
}
function drawDragon(f, front) {
  const d = f.dragon; if (!d || f.hidden) return;
  if ((d.mode === 'swoop' || d.mode === 'ult') !== front) return;
  const fr = dragonFrame(f), AN = ANIMS[f.id];
  ctx.save(); ctx.translate(d.x, d.y); ctx.scale(d.face, 1); if (d.rot) ctx.rotate(d.rot);
  if (d.mode === 'leave') ctx.globalAlpha = Math.max(0, 1 - d.t / 50);
  if (fr) { const K = dragonScale(f), src = frameSrc(fr, f); ctx.drawImage(src, fr.sx, fr.sy, fr.w, fr.h, fr.ox * K, fr.oy * K, fr.w * K, fr.h * K); }
  else {   // atlas not loaded: a glowing blueprint silhouette so the move still reads
    ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = `rgba(${f.col.rgb},.9)`; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(0, 0, 200, 60, 0, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-60, -20); ctx.lineTo(-180, -220); ctx.lineTo(60, -40); ctx.stroke();
  }
  ctx.restore();
}
// MIO-07: giant-brush sweeps that leave paint arcs, a flicked paint shot, a paint stripe racing along the floor (EX),
// and the CANVAS HOUND — a giant wolf-dog made of wet blue paint that she paints into being (ULT)
const PAINT = { blue: '120,190,255', deep: '40,110,230', pink: '255,104,138', gold: '218,175,55', ink: '30,40,60' };
function mioTip(f) { return { x: f.x + f.face * 170, y: f.y - 150 }; }
// wet paint: droplets fly, fall and become puddles on the floor
function fxPaint(x, y, n = 12, pw = 1, dir = 0, cols) {
  cols = cols || [PAINT.blue, PAINT.blue, PAINT.deep, PAINT.pink];
  for (let i = 0; i < n; i++) {
    const a = dir ? (dir > 0 ? 0 : Math.PI) + rnd(-1.0, .7) * (dir > 0 ? 1 : -1) : rnd(0, TAU), sp = rnd(4, 16) * pw;
    addFx({ k: 'paint', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rnd(2, 7) * pw, r: rnd(2, 5.5) * Math.min(1.5, pw), rgb: cols[i % cols.length], life: rnd(40, 70), t: 0 });
  }
}
function fxPuddle(x, rgb, r = 60, life = 200) { G.paintFloor = G.paintFloor || []; G.paintFloor.push({ x, rgb, r: r * .6, life, t: 0, sx: rnd(.8, 1.2) }); if (G.paintFloor.length > 40) G.paintFloor.shift(); }
function fxPaintArc(f, x, y, r, a0, a1, w, life = 18) { fxArc(x, y, r, a0, a1, PAINT.blue, f.face, life, w); fxArc(x, y + 6, r * .92, a0 + .15, a1 - .1, PAINT.pink, f.face, life - 4, w * .35); }
function drawPaintFloor() {
  const arr = G.paintFloor; if (!arr || !arr.length) return;
  for (let i = arr.length - 1; i >= 0; i--) { const p = arr[i]; p.t += G.slow; if (p.t >= p.life) arr.splice(i, 1); }
  ctx.save();
  for (const p of arr) {
    const grow = Math.min(1, p.t / 10), a = Math.min(1, (p.life - p.t) / 50) * .55, r = p.r * (.5 + .5 * grow);
    ctx.fillStyle = `rgba(${p.rgb},${a})`; ctx.beginPath(); ctx.ellipse(p.x, GROUND + 3, r * p.sx, r * .16, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${a * .35})`; ctx.beginPath(); ctx.ellipse(p.x - r * .25, GROUND + 1, r * .35, r * .04, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function updateMioMove(f, o, m, t, k, act, at, dt, first) {
  const tip = mioTip(f);
  if (k === 'a') {
    const c = Math.min(2, f.chain);
    if (t < m.st) f.vx *= .75;
    if (first(0)) {
      f.vx = f.face * [4, 6, 10][c];
      if (c === 0) fxPaintArc(f, f.x + f.face * 95, f.y - 175, 120, -1.0, .9, 30);
      else if (c === 1) fxPaintArc(f, f.x + f.face * 95, f.y - 210, 135, 1.3, -1.5, 34);
      else { fxPaintArc(f, f.x + f.face * 110, f.y - 210, 160, -2.1, 1.2, 46, 22); }
      fxPaint(tip.x, tip.y, c === 2 ? 14 : 6, c === 2 ? 1.1 : .7, f.face);
      c === 2 ? sfx.heavySwing() : sfx.swing();
    }
    if (c === 2 && first(3)) { shake(6); fxPuddle(f.x + f.face * 200, PAINT.blue, 90); fxPaint(f.x + f.face * 200, GROUND - 10, 16, 1.2); fxDust(f.x + f.face * 200, f.y, 6, .9); }
    if (act) { const h = tryHit(f, o, box(f, 25, c === 2 ? 270 : 245, -300, c === 2 ? 0 : -90), { dmg: [4, 4.5, 6][c], kb: [3, 4, 10][c], stun: [15, 16, 21][c], power: [.7, .85, 1.4][c], launch: c === 2 ? -9 : 0 }); if (h) fxPaint(o.x, o.y - 160, 8, .9, f.face); }
  } else if (k === 'b') {
    if (t < m.st) { f.vx *= .7; if ((t | 0) % 3 === 0) fxPaint(tip.x, tip.y - 40, 1, .3); }
    if (first(0)) {   // flicks a big blob of paint at the foe
      G.proj.push({ owner: f, x: tip.x, y: tip.y - 30, vx: f.face * 19, vy: -3, grav: .18, dmg: 8, type: 'paint', pw: 1.3, kb: 10, life: 90, t: 0, trail: [], rgb: PAINT.blue });
      f.vx = -f.face * 3; shake(4); fxPaint(tip.x, tip.y - 30, 10, .9, f.face); fxPaintArc(f, f.x + f.face * 80, f.y - 190, 120, -1.6, .6, 26, 14);
      sfx.heavySwing();
    }
  } else if (k === 'ex') {   // BLUE STROKE: drags the brush along the floor; a paint stripe races forward and splashes up under the foe
    if (t < m.st) { f.vx = 0; if ((t | 0) % 2 === 0) fxPaint(f.x + f.face * 150, GROUND - 6, 1, .4); }
    if (first(0)) {
      f.vx = f.face * 14; G.speedlines = 18; flash(.2, PAINT.blue);
      G.proj.push({ owner: f, x: f.x + f.face * 160, y: GROUND - 70, vx: f.face * 21, vy: 0, dmg: 3.2, type: 'stroke', pw: 1, kb: 2, life: 60, t: 0, trail: [], rgb: PAINT.blue, multi: 4, every: 6, hits: 0, next: 0 });
      playS('dash', .6, 1.2);
    }
    if (act) { f.vx *= Math.pow(.9, dt); if ((at | 0) % 3 === 0) fxPuddle(f.x + f.face * 150, (at | 0) % 2 ? PAINT.blue : PAINT.deep, 50, 150); }
  } else if (k === 'ult') updateMioUlt(f, o, at, dt, first);
}
// ULT timeline (frames after the movie): she sweeps a huge circle of paint, the hound bursts out of it behind her and charges through the foe
const MIO_ULT = { summon: 40, run: 30, bite: 34 };
function updateMioUlt(f, o, at, dt, first) {
  const m = f.move;
  if (first(0)) { sfx.charge(); f.vx = 0; }
  if (at < MIO_ULT.summon) {
    f.charge = at / MIO_ULT.summon;
    if ((at | 0) % 2 === 0) { const a = at / MIO_ULT.summon * TAU * 1.2; fxPaint(f.x - f.face * 60 + Math.cos(a) * 170, f.y - 330 + Math.sin(a) * 170, 2, .5, 0, [PAINT.blue, PAINT.pink]); }
    if ((at | 0) % 8 === 0) fxRing(f.x - f.face * 60, f.y - 330, PAINT.blue, 40, 200, 16, 8, 1);
  }
  if (first(MIO_ULT.summon)) { summonDog(f, o); f.charge = 0; }
  if (f.dog && f.dog.mode === 'ult') { /* the hound carries the damage */ }
  else if (at > MIO_ULT.summon + 10 && !m.done) { m.done = true; f.t = Math.max(f.t, m.st + m.act - 1); f.inv = 0; G.tintA = 0; }
}
const DOG = { mouth: 330, ground: 0 };   // muzzle offset (source px, facing right) from the hound's anchor
const dogScale = f => { const AN = ANIMS[f.id]; return AN ? AN.k * AN.dragonK : .9; };
function summonDog(f, o) {
  const back = -f.face, x0 = f.x + back * 520;
  f.dog = { mode: 'ult', t: 0, face: f.face, x: x0, y: GROUND, x0, hits: 0, next: 0, a: 0 };
  fxPuddle(x0, PAINT.blue, 260, 260); fxPuddle(x0 + 80, PAINT.deep, 160, 240);
  fxPaint(x0, GROUND - 120, 40, 2.2, 0, [PAINT.blue, PAINT.deep, PAINT.ink, PAINT.blue]);
  fxRing(x0, GROUND - 6, PAINT.blue, 30, 420, 28, 12, .22); flash(.35, PAINT.blue); shake(12); quake(10, .5, 60);
  playS('special_start', .7, .8); playS('impact_big', .5, .8);
}
function updateDog(f, o, dt) {
  const d = f.dog; if (!d) return;
  d.t += dt;
  if (d.mode === 'ult') {
    const runT = MIO_ULT.run, biteT = MIO_ULT.bite;
    if (d.t < runT) {   // full sprint: low, huge strides, paint splashing from every paw
      d.x += d.face * 26 * dt;
      if ((d.t | 0) % 4 === 0) { fxPuddle(d.x - d.face * 60, (d.t | 0) % 8 ? PAINT.blue : PAINT.deep, 70, 220); fxPaint(d.x - d.face * 40, GROUND - 10, 4, 1.1, -d.face); shake(5); }
      if ((d.t | 0) % 2 === 0) addFx({ k: 'streak', x: d.x - d.face * 200, y: GROUND - rnd(60, 320), vx: -d.face * 18, vy: 0, life: 12, t: 0, rgb: PAINT.blue, w: 5 });
      const hb = { x0: d.x - 200, x1: d.x + 260, y0: GROUND - 380, y1: GROUND };
      if (d.hits < 3 && d.t >= d.next && G.phase === 'fight' && overlap(hb, hurt(o))) { d.hits++; d.next = d.t + 6; hitTarget(f, o, { noScale: true, dmg: 4, kb: 3, stun: 30, power: 1.2, ult: true, hy: 160 }); fxPaint(o.x, o.y - 150, 12, 1.4, d.face); o.vx = d.face * 6; }
      if (d.hits > 0 && Math.abs(o.x - d.x) < 300) o.x = lerp(o.x, d.x + d.face * 180, .3);   // drag the foe along
    } else if (d.t < runT + biteT) {
      if (!d.bit) {   // pounce and bite
        d.bit = true; d.mode2 = 'bite'; shake(16); sfx.boom(); zoomKick(.08); playS('hit_heavy', .8, .7);
      }
      const q = (d.t - runT) / biteT; d.x += d.face * (12 - q * 10) * dt;
      if (!d.chomp && q > .35) {
        d.chomp = true; const mx = d.x + d.face * 230;
        if (G.phase === 'fight' && Math.abs(o.x - mx) < 330) hitTarget(f, o, { noScale: true, dmg: 14, kb: 18, launch: -19, power: 3, hitstop: 14, ult: true, hy: 200 });
        flash(.8, '230,245,255'); quake(26, 1, [120, 40, 100]); slowmo(.35, 30);
        fxPaint(mx, GROUND - 200, 50, 2.4, 0, [PAINT.blue, PAINT.deep, PAINT.ink, PAINT.pink]); fxPuddle(mx, PAINT.blue, 320, 280);
        fxBig(mx, GROUND - 200, PAINT.blue, '232,246,255', 3, d.face);
      }
    } else {   // the hound melts back into the floor
      d.mode = 'melt'; d.t = 0; fxPaint(d.x, GROUND - 150, 30, 1.6, 0, [PAINT.blue, PAINT.deep, PAINT.ink]); fxPuddle(d.x, PAINT.deep, 300, 300);
      f.inv = 0; G.tintA = 0; if (f.move && f.move.key === 'ult') f.t = Math.max(f.t, f.move.st + f.move.act - 1);
    }
  } else if (d.mode === 'melt') {
    d.x += d.face * 4 * dt; if (d.t > 30) f.dog = null;
  } else if (d.mode === 'win') {
    d.face = f.face; d.x = lerp(d.x, f.x - f.face * 330, .08); d.a = Math.min(1, d.a + .03 * dt);
  }
}
function dogFrame(f) {
  const AN = ANIMS[f.id], d = f.dog; if (!AN || !d) return null;
  const a = AN.a, loop = (n, fps) => { const arr = a[n] || a.dRun; return arr && arr[Math.floor(G.frame * (fps || AN.fps[n] || 12) / 60) % arr.length]; };
  if (d.mode === 'win') return loop('dIdle');
  if (d.mode2 === 'bite' || d.mode === 'melt') { const arr = a.dBite || a.dRun; if (!arr) return null; const q = d.mode === 'melt' ? 1 : (d.t - MIO_ULT.run) / MIO_ULT.bite; return arr[clamp(Math.floor(q * (arr.length - 1)), 0, arr.length - 1)]; }
  return loop('dRun');
}
function drawDog(f, front) {
  const d = f.dog; if (!d || f.hidden) return;
  if ((d.mode !== 'win') !== front) return;   // the victory hound sits behind her; the charging hound runs in front
  const fr = dogFrame(f);
  ctx.save(); ctx.translate(d.x, d.y); ctx.scale(d.face, 1);
  let al = 1;
  if (d.mode === 'ult' && d.t < 8) al = d.t / 8;
  if (d.mode === 'melt') al = Math.max(0, 1 - d.t / 30);
  if (d.mode === 'win') al = d.a;
  ctx.globalAlpha = al;
  if (fr) { const K = dogScale(f), src = frameSrc(fr, f), AN = ANIMS[f.id], ref = AN.a.dRun && AN.a.dRun[0], foot = ref ? (ref.oy + ref.h) * K : 0; if (d.mode === 'melt') ctx.scale(1, 1 - d.t / 60); ctx.drawImage(src, fr.sx, fr.sy, fr.w, fr.h, fr.ox * K, fr.oy * K - foot, fr.w * K, fr.h * K); }
  else {   // atlas not loaded: a paint silhouette so the move still reads
    ctx.fillStyle = `rgba(${PAINT.blue},.9)`; ctx.beginPath(); ctx.ellipse(0, -170, 260, 110, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(230, -260, 90, 70, 0, 0, TAU); ctx.fill();
  }
  ctx.restore(); ctx.globalAlpha = 1;
}
function updateSuzuneUlt(f, o, at, dt, first) {
  const m = f.move;
  if (first(0)) { sfx.jump(); f.vy = -34; f.vx = 0; fxRing(f.x, f.y - 4, f.col.rgb, 20, 260, 26, 10, .25); fxDust(f.x, f.y, 14, 1.4); fxPetals(f.x, f.y - 60, 16, 1.6); shake(10); }
  if (at < 16) { f.vy = -34; }
  if (first(16)) { f.hidden = true; f.vy = 0; m.tx = o.x; addFx({ k: 'comet', x: 0, y: 0, life: 40, t: 0, rgb: f.col.rgb, face: f.face }); }
  if (at >= 16 && at < 56) { f.y = -900; f.vy = 0; m.tx = lerp(m.tx, o.x, .1); }
  if (first(56)) {
    f.hidden = false; f.x = clamp(m.tx - f.face * 520, 80, STAGE_W - 80); f.y = GROUND - 760; sfx.dash(); sfx.heavyKick(); G.speedlines = 30;
    const dx = m.tx - f.x, dy = GROUND - f.y, L = Math.hypot(dx, dy); f.vx = dx / L * 48; f.vy = dy / L * 48; f.face = Math.sign(dx) || f.face;
  }
  if (at >= 56 && at < 90 && !m.landed) {
    f.trail.push(1);
    for (let i = 0; i < 3; i++) addFx({ k: 'streak', x: f.x + rnd(-20, 20), y: f.y - 120 + rnd(-30, 30), vx: -f.vx * .35, vy: -f.vy * .35, life: 18, t: 0, rgb: f.col.rgb, w: 5 });
    if (f.y >= GROUND - 1) {
      m.landed = true; f.y = GROUND; f.vx = 0; f.vy = 0; f.t = m.st + m.act - 16; m.landT = f.t;
      const X = f.x;
      sfx.boom(); flash(1, '255,236,200'); shake(26); zoomKick(.12); slowmo(.3, 42); G.hitstop = 10; quake(28, 1.1, [140, 50, 90]);
      fxCore(X, GROUND - 60, '255,140,50', 360, 34); fxCore(X, GROUND - 40, f.col.rgb, 220, 24);
      for (let i = 0; i < 3; i++) fxRing(X, GROUND - 6, i ? '255,150,60' : '255,255,255', 30, 320 + i * 170, 30 + i * 10, 14 - i * 3, .24);
      fxRing(X, GROUND - 150, f.col.rgb, 40, 300, 28, 10);
      fxSpark(X, GROUND - 40, '255,170,70', 60, 1.8); fxPetals(X, GROUND - 80, 30, 2.2); fxDust(X, GROUND, 24, 2.2);
      for (let i = 0; i < 40; i++) addFx({ k: 'ember', x: X + rnd(-300, 300), y: GROUND - rnd(0, 200), vx: rnd(-1, 1), vy: rnd(-3, -.5), life: rnd(60, 120), t: 0, rgb: '255,160,70' });
      if (Math.abs(o.x - X) < 250) hitTarget(f, o, { noScale: true, dmg: 30, kb: 17, launch: -19, power: 3, hitstop: 14, ult: true });
      f.inv = 0; G.tintA = 0;
    }
  }
  if (at >= 90 && !m.landed) { f.hidden = false; if (f.y < -200) { f.y = GROUND - 400; } }
}

function updateAoiUlt(f, o, at, dt, first) {
  const m = f.move, dx = f.droneX, dy = f.droneY;
  if (at < 45) { f.charge = at / 45; if ((at | 0) % 2 === 0) for (let i = 0; i < 3; i++) { const a = rnd(0, TAU), r = rnd(120, 220); addFx({ k: 'streak', x: dx + Math.cos(a) * r, y: dy + Math.sin(a) * r, vx: -Math.cos(a) * 9, vy: -Math.sin(a) * 9, life: 14, t: 0, rgb: f.col.rgb, w: 2.5 }); } }
  if (first(0)) sfx.charge();
  if (first(45)) { sfx.beam(); flash(.9, f.col.rgb); shake(18); quake(20, .7, 120); zoomKick(.08); m.beam = true; G.speedlines = 40; f.charge = 1; }
  if (at >= 45 && at < 105) {
    shake(9); G.tintA = .35; if (((at | 0) % 5) === 0) quake(7, .25);
    const bx = f.id === 'sakura' ? f.x : dx, b = { x0: f.face > 0 ? bx : -500, x1: f.face > 0 ? STAGE_W + 500 : bx, y0: dy - 70, y1: dy + 70 };   // SAKURA's feeds sweep the space in front of her too
    const hb = hurt(o);
    if (m.nextHit === undefined) m.nextHit = 45;
    if (at >= m.nextHit && overlap(b, hb)) {
      m.nextHit += 6;
      const last = at >= 99;
      hitTarget(f, o, { noScale: true, dmg: last ? 6 : 2.6, kb: last ? 16 : 3, stun: 20, power: last ? 2.4 : 1, launch: last ? -14 : 0, ult: true, hy: o.y - dy });
    }
    if ((at | 0) % 2 === 0) fxSpark(f.face > 0 ? Math.min(STAGE_W, o.x) : Math.max(0, o.x), dy, f.col.rgb, 3, 1.2, -f.face);
  }
  if (first(105)) { m.beam = false; f.charge = 0; G.tintA = 0; f.inv = 0; fxRing(dx, dy, f.col.rgb, 20, 260, 24, 10); fxCore(dx, dy, f.col.rgb, 200, 20); }
  if (at >= 108 && at < 110) f.t = m.st + m.act;
}

function spawnBolt(f, x, y, vx, vy, dmg, type) {
  G.proj.push({ owner: f, x, y, vx, vy, dmg, type, life: type === 'homing' ? 110 : 80, t: 0, trail: [], rgb: type === 'homing' ? f.col.rgb2 : f.col.rgb });
}
function updateProj(dt) {
  for (let i = G.proj.length - 1; i >= 0; i--) {
    const p = G.proj[i], o = G.fighters[1 - p.owner.side];
    p.t += dt;
    if (p.type === 'homing' && p.t > 10) {
      const tx = o.x, ty = o.y - 160, a = Math.atan2(ty - p.y, tx - p.x), cur = Math.atan2(p.vy, p.vx);
      let d = a - cur; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU;
      const na = cur + clamp(d, -.09 * dt, .09 * dt), sp = Math.min(21, Math.hypot(p.vx, p.vy) + .5 * dt);
      p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
    }
    if (p.grav) p.vy += p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.trail.push({ x: p.x, y: p.y }); if (p.trail.length > (p.type === 'homing' ? 16 : p.type === 'rail' ? 10 : p.type === 'stroke' ? 14 : 7)) p.trail.shift();
    if (p.type === 'paint' && (p.t | 0) % 3 === 0) addFx({ k: 'paint', x: p.x, y: p.y, vx: -p.vx * .1, vy: rnd(-1, 1), r: rnd(3, 6), rgb: PAINT.deep, life: 30, t: 0 });
    if (p.type === 'stroke') {   // MIO's EX: a wave of paint skimming the floor, hitting several times
      if ((p.t | 0) % 2 === 0) { fxPuddle(p.x, (p.t | 0) % 4 ? PAINT.blue : PAINT.deep, 70, 170); fxPaint(p.x, GROUND - 20, 3, 1, Math.sign(p.vx)); }
      const hb = { x0: p.x - 90, x1: p.x + 90, y0: GROUND - 240, y1: GROUND };
      if (p.hits < p.multi && p.t >= p.next && overlap(hb, hurt(o)) && o.inv <= 0 && o.state !== 'down') {
        const f = p.owner, saveX = f.x; f.x = p.x - Math.sign(p.vx) * 40; p.hits++; p.next = p.t + p.every; const fin = p.hits === p.multi;
        hitTarget(f, o, { dmg: fin ? 5 : p.dmg, kb: fin ? 12 : 2, stun: 22, power: fin ? 1.6 : .9, launch: fin ? -12 : 0, hy: 120 }); f.x = saveX;
        fxPaint(o.x, GROUND - 60, 18, 1.6, 0); p.vx *= .55;
      }
      if (p.t > p.life || p.x < -100 || p.x > STAGE_W + 100 || p.hits >= p.multi) { fxPaint(p.x, GROUND - 40, 20, 1.4); G.proj.splice(i, 1); }
      continue;
    }
    let dead = p.t > p.life || p.x < -100 || p.x > STAGE_W + 100 || p.y > GROUND + 20;
    if (!dead && overlap({ x0: p.x - 16, x1: p.x + 16, y0: p.y - 16, y1: p.y + 16 }, hurt(o)) && o.inv <= 0 && o.state !== 'down' && o.state !== 'ko') {
      const f = p.owner, saveX = f.x; f.x = p.x - Math.sign(p.vx) * 40;
      hitTarget(f, o, { dmg: p.dmg, kb: p.kb || 5, stun: 16, power: p.pw || (p.type === 'homing' ? 1.1 : .8), hy: o.y - p.y }); f.x = saveX; dead = true;
    }
    if (dead) { if (p.type === 'paint') { fxPaint(p.x, p.y, 18, 1.3); if (p.y > GROUND - 40) fxPuddle(p.x, PAINT.blue, 110); } else fxCore(p.x, p.y, p.rgb, 50, 8); G.proj.splice(i, 1); }
  }
}
function drawProj() {
  for (const p of G.proj) {
    const tr = p.trail; if (tr.length < 2) continue;
    if (p.type === 'paint' || p.type === 'stroke') { drawPaintProj(p); continue; }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath(); tr.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y));
      ctx.strokeStyle = pass ? 'rgba(255,255,255,.95)' : `rgba(${p.rgb},.8)`; ctx.lineWidth = pass ? (p.type === 'rail' ? 8 : 4) : (p.type === 'homing' ? 14 : p.type === 'rail' ? 28 : 16); ctx.stroke();
    }
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 34); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.3, `rgba(${p.rgb},.8)`); g.addColorStop(1, `rgba(${p.rgb},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 34, 0, TAU); ctx.fill();
  }
}

// paint projectiles are drawn as wet paint (normal blending), not light
function drawPaintProj(p) {
  ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const tr = p.trail;
  if (p.type === 'stroke') {   // a thick wave of paint rolling along the floor
    for (let pass = 0; pass < 3; pass++) {
      ctx.beginPath(); tr.forEach((q, i) => { const k = i / (tr.length - 1), yy = GROUND - 8 - Math.sin(k * Math.PI) * (pass ? 40 : 70) * k; i ? ctx.lineTo(q.x, yy) : ctx.moveTo(q.x, yy); });
      ctx.strokeStyle = pass === 0 ? `rgba(${PAINT.deep},.9)` : pass === 1 ? `rgba(${PAINT.blue},.95)` : 'rgba(255,255,255,.6)'; ctx.lineWidth = pass === 0 ? 46 : pass === 1 ? 30 : 6; ctx.stroke();
    }
    ctx.fillStyle = `rgb(${PAINT.blue})`; ctx.beginPath(); ctx.ellipse(p.x, GROUND - 60, 40, 70, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.ellipse(p.x - Math.sign(p.vx) * 10, GROUND - 95, 10, 22, 0, 0, TAU); ctx.fill();
  } else {
    ctx.beginPath(); tr.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y));
    ctx.strokeStyle = `rgba(${PAINT.blue},.85)`; ctx.lineWidth = 18; ctx.stroke();
    const ang = Math.atan2(p.vy, p.vx);
    ctx.translate(p.x, p.y); ctx.rotate(ang);
    ctx.fillStyle = `rgb(${PAINT.deep})`; ctx.beginPath(); ctx.ellipse(0, 0, 34, 24, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgb(${PAINT.blue})`; ctx.beginPath(); ctx.ellipse(4, -2, 28, 19, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgb(${PAINT.pink})`; ctx.beginPath(); ctx.ellipse(-12, 6, 10, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.ellipse(10, -9, 9, 5, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function onKO(att, tgt) {
  tgt.state = 'air'; tgt.vy = Math.min(tgt.vy, -15); tgt.vx = Math.sign(tgt.x - att.x) * 11; tgt.ko = true;
  const pt = partnerOf(tgt);
  if (pt && pt.hp > 0) {   // one member down: partner jumps in, the round continues
    fxBig(tgt.x, tgt.y - 170, auraRgb(att), auraHot(att), 2.4, Math.sign(tgt.x - att.x) || 1);
    slowmo(.3, 40); flash(.7); shake(18); zoomKick(.1); sfx.ko(); quake(22, .9, [90, 40, 120]);
    G.banner = { txt: `${tgt.ch.name} DOWN`, t: 0, rgb: tgt.col.rgb };
    G.pendingTag = { side: tgt.side, t: 0 };
    return;
  }
  fxBig(tgt.x, tgt.y - 170, auraRgb(att), auraHot(att), 3.2, Math.sign(tgt.x - att.x) || 1);
  G.phase = 'ko'; G.phaseT = 0; slowmo(.22, 80); flash(1); shake(24); zoomKick(.14); sfx.ko(); quake(34, 1.4, [120, 60, 220]);
  G.banner = { txt: 'K.O.', t: 0, big: true }; voice('sys', 'ko', { delay: .45 });
  G.wins[att.side]++; for (const f of G.teams[att.side]) f.wins = G.wins[att.side];
}

/* SUZUNE's short step-dash: brief invulnerability (slips through AOI's shots), short cooldown */
const CAN_DASH = { suzune: 1, arca: 1 };
const TAG_CD = 150;
function doTag(side, forced) {
  const out = G.fighters[side], inn = partnerOf(out);
  if (!inn || inn.hp <= 0) return false;
  if (!forced && (G.tagCd[side] > 0 || G.phase !== 'fight')) return false;
  const x = clamp(out.x, 120, STAGE_W - 120), face = out.face, opp = G.fighters[1 - side];
  // incoming member leaps in from off-screen behind, landing next to where the outgoing one stood
  const half = W / 2 / (G.cam.z || 1), offX = face > 0 ? G.cam.x - half - 260 : G.cam.x + half + 260;
  const land = forced ? clamp(out.x - face * 140, 120, STAGE_W - 120) : x;
  inn.x = offX; inn.y = GROUND - 620; inn.vy = 0; inn.vx = 0; inn.face = Math.sign(opp.x - land) || face; inn.t = 0; inn.move = null;
  inn.state = 'tagin'; inn.tg = { x0: offX, x1: land, y0: GROUND - 620, L: inn.id === 'arca' ? 34 : 30 };
  inn.inv = 55; inn.hidden = false; inn.ko = false; inn.gauge = Math.max(inn.gauge, out.gauge); out.gauge = inn.gauge; inn.wins = out.wins;
  inn.ghosts = []; inn.rail = []; inn.trail = []; inn.buf = {}; inn.prev = { ...out.prev }; inn.dashCd = 0;
  G.benched = G.benched || [];
  if (forced) {   // the fallen member stays lying where they went down
    out.state = 'down'; out.t = 99; out.vx = 0; out.vy = 0; out.move = null; out.y = GROUND; out.dragon = null; out.dog = null;
    G.benched.push({ f: out, mode: 'corpse' });
  } else {        // leaps up and back out of the screen
    out.move = null; out.dragon = null; out.dog = null; out.charge = 0; out.t = 0;
    if (out.id === 'arca') { out.state = 'walk'; out.vx = -face * 26; out.vy = 0; }
    else { out.state = 'jump'; out.vx = -face * 15; out.vy = -27; out.flip = false; out.rot = 0; }
    G.benched.push({ f: out, mode: 'exit', t: 0 });
    fxDust(out.x, GROUND, 10, 1.1); fxRing(out.x, out.y - 150, auraRgb(out), 20, 200, 18, 8); sfx.jump();
  }
  G.fighters[side] = inn; G.tagCd[side] = TAG_CD;
  const rgb = auraRgb(inn);
  fxText(land, GROUND - 420, 'CHANGE!', rgb, 34, 40);
  sfx.dash(); playS('special_start', .6, 1.2); voice(inn, 'a2', { delay: .05 }); shake(6);
  refreshTouchFor(side);
  return true;
}
function updateTeams(dt) {
  if (!G.teams) return;
  for (let side = 0; side < 2; side++) {
    if (G.tagCd[side] > 0) G.tagCd[side] -= dt;
    for (const f of G.teams[side]) if (f !== G.fighters[side] && f.hp > 0 && f.hp < 100 && G.phase === 'fight') f.hp = Math.min(100, f.hp + .012 * dt);   // resting partner recovers slowly
  }
  if (G.benched) {
    for (const b of G.benched) {
      if (b.mode !== 'exit') continue;
      const f = b.f; b.t += dt; f.t += dt;
      if (f.state === 'jump') f.vy += GRAV * dt;
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (G.frame % 2 === 0) f.trail.push(1);
      const half = W / 2 / (G.cam.z || 1);
      if (f.y < GROUND - 1300 || f.x < G.cam.x - half - 400 || f.x > G.cam.x + half + 400 || b.t > 90) b.gone = true;
    }
    G.benched = G.benched.filter(b => !b.gone && G.fighters.indexOf(b.f) < 0);
  }
  const pt = G.pendingTag;
  if (pt) { pt.t += dt; const down = G.fighters[pt.side]; if (pt.t > 75 && (down.state === 'down' || pt.t > 140)) { G.pendingTag = null; doTag(pt.side, true); } }
}
const DASH = { len: 30, speed: 52, inv: 30, cd: 62, cancel: 16 };
function startDash(f, d) {
  f.state = 'dash'; f.t = 0; f.move = null; f.dashDir = d; f.vx = d * DASH.speed; f.inv = DASH.inv; f.dashCd = DASH.cd;
  f.sx = 1.14; f.sy = .9; sfx.dash(); playS('whoosh_punch2', .7, 1.2);
  const rgb = auraRgb(f), fwd = d === (Math.sign(G.fighters[1 - f.side].x - f.x) || f.face);
  fxRing(f.x, f.y - 4, rgb, 10, 150, 16, 6, .22); fxDust(f.x, f.y, 6, 1);
  fxArc(f.x + d * 30, f.y - 150, 120, fwd ? -.6 : 2.5, fwd ? .6 : 3.7, rgb, f.face, 12, 12);
  for (let i = 0; i < 6; i++) addFx({ k: 'streak', x: f.x + rnd(-30, 30), y: f.y - rnd(20, 260), vx: -d * rnd(14, 26), vy: 0, life: rnd(8, 14), t: 0, rgb, w: rnd(1.5, 3) });
}
const canUlt = f => f.gauge >= 100 && f.hp <= 50;   // ULT unlocks only at half health or below
const spPick = f => canUlt(f) ? 'ult' : f.gauge >= 50 ? 'ex' : 'b';
function stepFighter(f, o, inp, dt) {
  const pr = k => inp[k] && !f.prev[k];
  for (const k of ['a', 'b', 'ex', 'ult', 'u', 's', 'dh']) if (pr(k)) f.buf[k] = 9; else if (f.buf[k] > 0) f.buf[k] -= dt;
  if (pr('tg') && G.phase === 'fight' && ['idle', 'walk', 'guard', 'jump', 'dash'].includes(f.state) && G.fighters[f.side] === f) { f.prev = { ...inp }; if (doTag(f.side, false)) return; }
  // SUZUNE step-dash: dash button, or double-tap left/right
  if (CAN_DASH[f.id]) {
    for (const [k, d] of [['l', -1], ['r', 1]]) if (pr(k)) { if (f.tapD === d && G.frame - f.tapF < 14) { f.buf.dh = 9; f.dashReq = d; f.tapD = 0; } else { f.tapD = d; f.tapF = G.frame; } }
    if (f.dashCd > 0) f.dashCd -= dt;
  } else f.buf.dh = 0;
  f.prev = { ...inp };
  if (f.inv > 0 && f.inv < 900) f.inv -= dt;
  if (f.whiteT > 0) f.whiteT -= dt;
  if (f.land > 0) f.land -= dt;
  if (f.glitch > 0) f.glitch -= dt;
  f.t += dt;
  const canAct = G.phase === 'fight';
  const grounded = onGround(f);
  if (canAct && f.gauge < 100) f.gauge = Math.min(100, f.gauge + .035 * dt);
  const away = Math.sign(f.x - o.x) || -f.face, dirIn = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
  f.holdBack = grounded && dirIn !== 0 && dirIn === away;
  if (f.state === 'idle' || f.state === 'walk' || f.state === 'guard') {
    if (grounded) f.face = Math.sign(o.x - f.x) || f.face;
    if (canAct) {
      const want = k => f.buf[k] > 0;
      if (want('dh') && grounded && CAN_DASH[f.id] && !(f.dashCd > 0)) { f.buf.dh = 0; startDash(f, f.dashReq || dirIn || (Math.sign(o.x - f.x) || f.face)); f.dashReq = 0; }
      else if (want('s')) { f.buf.s = 0; startMove(f, spPick(f)); }
      else if (want('ult') && canUlt(f)) { f.buf.ult = 0; startMove(f, 'ult'); }
      else if (want('ex') && f.gauge >= 50) { f.buf.ex = 0; startMove(f, 'ex'); }
      else if (want('b')) { f.buf.b = 0; startMove(f, 'b'); }
      else if (want('a')) { f.buf.a = 0; startMove(f, 'a'); }
      else if (inp.d && grounded) { f.state = 'guard'; f.vx *= .6; }
      else if (want('u') && grounded && f.id !== 'arca') {
        f.buf.u = 0; f.vy = f.ch.jump; f.state = 'jump'; f.vx = dirIn * f.ch.speed * 1.15; sfx.jump(); voice(f, 'jump', { p: .45, cd: 90 }); fxDust(f.x, f.y, 5, .7);
        f.flip = f.id !== 'arca' && dirIn !== 0 && dirIn !== away; f.flipT = 0; f.sy = .8; f.sx = 1.1;
        if (f.flip) fxArc(f.x, f.y - 160, 150, 2.4, -.4, f.col.rgb, f.face, 16, 16);
      }
      else if (dirIn) { if (f.state !== 'walk' && Math.sign(f.vx) !== dirIn) { f.sx = 1.06; f.sy = .94; } f.state = f.holdBack ? 'guard' : 'walk'; f.vx = dirIn * f.ch.speed * (f.holdBack ? .6 : 1); if (!f.holdBack && G.frame % 14 === 0) fxDust(f.x - dirIn * 30, f.y, 1, .5); }
      else { f.state = 'idle'; f.vx *= Math.pow(.7, dt); }
    } else { f.state = 'idle'; f.vx *= Math.pow(.7, dt); }
  } else if (f.state === 'jump') {
    if (f.flip) { f.flipT += dt; if (f.flipT >= 30) { f.flip = false; f.rot = 0; } }
    if (canAct) {
      if (f.buf.s > 0) { f.buf.s = 0; f.flip = false; f.rot = 0; startMove(f, f.gauge >= 50 ? 'ex' : 'b'); }
      else if (f.buf.b > 0) { f.buf.b = 0; f.flip = false; f.rot = 0; startMove(f, 'b'); }
      else if (f.buf.a > 0) { f.buf.a = 0; f.flip = false; f.rot = 0; startMove(f, 'a'); }
      else if (f.buf.ex > 0 && f.gauge >= 50) { f.buf.ex = 0; f.flip = false; f.rot = 0; startMove(f, 'ex'); }
      f.vx = lerp(f.vx, dirIn * f.ch.speed * 1.15, .04);
    }
  } else if (f.state === 'dash') {
    f.vx *= Math.pow(.91, dt);
    f.trail.push(1); f.rail.push({ x: f.x - f.dashDir * 20, y: f.y - 10, t: G.frame });
    if (G.frame % 3 === 0) fxDust(f.x - f.dashDir * 40, f.y, 1, .6);
    // dash-cancel: attacks come out of the back half of the dash so it leads straight into close range
    if (canAct && f.t >= DASH.cancel) {
      f.face = Math.sign(o.x - f.x) || f.face;
      if (f.buf.s > 0) { f.buf.s = 0; startMove(f, spPick(f)); }
      else if (f.buf.a > 0) { f.buf.a = 0; startMove(f, 'a'); }
      else if (f.buf.u > 0 && f.id !== 'arca') { f.buf.u = 0; f.state = 'jump'; f.vy = f.ch.jump; f.vx = f.dashDir * f.ch.speed * 1.4; sfx.jump(); }
    }
    if (f.state === 'dash' && f.t >= DASH.len) { f.state = 'idle'; f.land = 6; f.vx *= .3; fxDust(f.x, f.y, 4, .7); }
  } else if (f.state === 'tagin') {   // arcing leap in from off-screen
    const g = f.tg, q = Math.min(1, f.t / g.L), e = 1 - Math.pow(1 - q, 2);
    f.x = lerp(g.x0, g.x1, e); f.y = g.y0 + (GROUND - g.y0) * q * q - Math.sin(q * Math.PI) * 160; f.vx = 0; f.vy = 0;
    if (G.frame % 2 === 0) { f.trail.push(1); f.rail.push({ x: f.x, y: f.y - 10, t: G.frame }); }
    if (q >= 1) {
      f.y = GROUND; f.state = 'idle'; f.land = 12; f.tg = null;
      fxDust(f.x, f.y, 14, 1.4); fxRing(f.x, f.y - 4, auraRgb(f), 20, 260, 22, 9, .22); shake(f.id === 'arca' ? 14 : 8); sfx.land();
      addFx({ k: 'pillar', x: f.x, y: GROUND, rgb: auraRgb(f), hot: auraHot(f), life: 26, t: 0, w: 110 });
      if (f.id === 'arca') playS('arca_stomp', .8, 1);
    }
  } else if (f.state === 'dashin') {
    f.vx *= Math.pow(.93, dt); if (G.frame % 2 === 0) { f.trail.push(1); f.rail.push({ x: f.x - f.face * 20, y: f.y - 10, t: G.frame }); }
    if (Math.abs(f.vx) < 2.5) { f.state = 'idle'; f.land = 10; fxDust(f.x, f.y, 10, 1.1); fxRing(f.x, f.y - 4, f.col.rgb, 10, 180, 20, 6, .25); }
  } else if (f.state === 'atk') {
    const m = f.move;
    updateMove(f, o, dt);
    if (f.state === 'atk' && f.move === m) {
      const after = f.t >= m.st + m.act;
      if (after && m.key !== 'ult' && canAct) {
        let next = null; const hit = f.hitIds.size > 0;
        if (f.buf.s > 0 && (m.key === 'a' || (m.key === 'b' && spPick(f) !== 'b'))) { next = spPick(f); f.buf.s = 0; }
        else if (f.buf.ult > 0 && canUlt(f) && hit) { next = 'ult'; f.buf.ult = 0; }
        else if (f.buf.ex > 0 && f.gauge >= 50 && hit) { next = 'ex'; f.buf.ex = 0; }
        else if (f.buf.b > 0 && m.key === 'a' && hit) { next = 'b'; f.buf.b = 0; }
        else if (f.buf.a > 0 && m.key === 'a') { next = f.chain < 2 ? 'a' : 'b'; f.buf.a = 0; }
        if (next) startMove(f, next);
      }
      if (f.move === m && f.t >= m.total) { f.state = grounded ? 'idle' : 'jump'; f.move = null; f.hidden = false; if (f.inv > 900) f.inv = 0; }
    }
    if (grounded && m.key !== 'ex' && m.key !== 'ult' && m.key !== 'b') f.vx *= Math.pow(.86, dt);
  } else if (f.state === 'hit') {
    f.stun -= dt; f.vx *= Math.pow(.88, dt);
    if (f.stun <= 0) { f.state = 'idle'; f.combo = 0; }
  } else if (f.state === 'air') {
    f.vx *= Math.pow(.99, dt);
  } else if (f.state === 'down') {
    f.vx *= Math.pow(.8, dt);
    if (f.t > (f.ko ? 1e9 : 40)) { f.state = 'getup'; f.t = 0; f.inv = 30; f.combo = 0; voice(f, 'getup', { p: .6 }); }
  } else if (f.state === 'getup') {
    if (f.t > (ANIMS[f.id] ? 26 : 16)) { f.state = 'idle'; f.land = 8; fxDust(f.x, f.y, 5, .6); }
  } else if (f.state === 'win') {
    f.vx *= .8;
    if (ANIMS[f.id] && ANIMS[f.id].a.winPose) { const m = 250, tx = clamp(f.x, m, STAGE_W - m); f.x += (tx - f.x) * Math.min(1, .16 * dt); }   // keep the whole pose on screen
    if (f.id !== 'arca' && !(ANIMS[f.id] && ANIMS[f.id].a.winPose) && onGround(f) && (f.t | 0) % 48 === 0) { f.vy = -9; f.sy = .82; if (f.id === 'suzune') fxPetals(f.x, f.y - 200, 8, 1); else fxRing(f.x, f.y - 160, f.col.rgb, 30, 180, 20, 5); }
  }

  // physics
  if (f.state !== 'tagin' && !(f.state === 'atk' && f.move && f.move.key === 'ult' && f.id === 'suzune' && f.move && f.t - f.move.st >= 16 && f.t - f.move.st < 56)) {
    const heavyAir = f.state === 'atk' && f.move && f.move.key === 'ex' && f.id === 'suzune';
    if (!onGround(f) || f.vy < 0) { f.vy += (heavyAir ? .3 : GRAV) * dt; }
    f.x += f.vx * dt; f.y += f.vy * dt;
  }
  if (f.y >= GROUND) {
    const wasAir = f.vy > 6;
    f.y = GROUND;
    if (f.vy > 0) {
      if (f.state === 'air') { f.state = 'down'; f.t = 0; f.vy = 0; fxDust(f.x, f.y, 12, 1.3); shake(8); sfx.land(); fxRing(f.x, f.y - 4, '255,255,255', 10, 140, 18, 4, .25); }
      else { if (wasAir) { fxDust(f.x, f.y, 6, .8); sfx.land(); f.land = 9; } if (f.state === 'jump') { f.state = 'idle'; f.flip = false; f.rot = 0; } }
      f.vy = 0;
    }
  }
  const sep = W / G.cam.z - 150;
  if (f.state !== 'tagin') f.x = clamp(f.x, 70, STAGE_W - 70);
  if (Math.abs(f.x - o.x) > sep && !f.hidden && !o.hidden && f.state !== 'dashin' && o.state !== 'dashin' && f.state !== 'tagin' && o.state !== 'tagin' && f.state !== 'dash') f.x = o.x + Math.sign(f.x - o.x) * sep;
  if (f.trail.length) { f.trail.length = 0; f.ghosts = f.ghosts || []; { const pf = pickFrame(f); f.ghosts.push({ x: f.x, y: f.y, face: f.face, rot: f.rot, sx: f.sx, sy: f.sy, top: f.top, bot: f.bot, t: 0, fr: pf && pf.fr }); } }
  if (f.ghosts) { for (const g of f.ghosts) g.t += dt; f.ghosts = f.ghosts.filter(g => g.t < 16); }
  f.rail = f.rail.filter(r => G.frame - r.t < 40);
  if (f.id === 'arca') {   // railgun muzzle is the "drone" point for the shared beam logic
    const mz = arcaMuzzle(f); f.droneX = mz.x; f.droneY = f.y - 250; f.droneA += .05 * dt;
    if (f.state === 'walk' && ((G.frame + f.side * 12) % 22) === 0) { playS('arca_step', .6, rnd(.92, 1.05)); fxDust(f.x + rnd(-120, 120), f.y, 2, .7); shake(1.5); }
  }
  if (f.id === 'sakura') {
    f.droneA += .05 * dt;
    if (f.state === 'win' && !f.dragon && ANIMS.sakura) f.dragon = { mode: 'win', t: 0, face: f.face, x: f.x - f.face * 900, y: f.y - 571, hits: 0, next: 0 };
    if (!f.dragon) { f.droneX = sakuraTip(f).x; f.droneY = sakuraTip(f).y; }
    updateDragon(f, G.fighters[1 - f.side], dt);
  }
  if (f.id === 'mio') {
    if (f.state === 'win' && !f.dog && ANIMS.mio && ANIMS.mio.a.dIdle) f.dog = { mode: 'win', t: 0, face: f.face, x: f.x - f.face * 330, y: GROUND, hits: 0, next: 0, a: 0 };
    updateDog(f, G.fighters[1 - f.side], dt);
  }
  // drone follows
  if (f.id === 'aoi') {
    f.droneA += .05 * dt;
    let tx = f.x + f.face * 70, ty = f.y - 330 + Math.sin(f.droneA) * 10;
    if (f.move && f.move.key === 'ult') { tx = f.x + f.face * 140; ty = f.y - 200; }
    if (f.state === 'win') { f.droneA += .06 * dt; tx = f.x + Math.cos(f.droneA * 1.5) * 150; ty = f.y - 250 + Math.sin(f.droneA * 1.5) * 40; }
    if (f.state === 'atk' && f.move && f.move.key === 'a' && f.t >= f.move.st && f.t < f.move.st + 4) tx -= f.face * 26;
    f.droneX = lerp(f.droneX || tx, tx, .18); f.droneY = lerp(f.droneY || ty, ty, .18);
  }
  // pose (squash / bend / cloth wave)
  const P = poseOf(f), k = f.state === 'atk' || f.state === 'hit' ? .45 : .22;
  f.sx = lerp(f.sx, P.sx, k); f.sy = lerp(f.sy, P.sy, k); f.ox = lerp(f.ox, P.ox, .5);
  f.top = lerp(f.top, P.top, k); f.bot = lerp(f.bot, P.bot, k); f.wave = lerp(f.wave, P.wave, .15);
  if (f.flip) { const q = Math.min(1, f.flipT / 30), e = q < .5 ? 2 * q * q : 1 - Math.pow(-2 * q + 2, 2) / 2; f.rot = TAU * e; }
  else f.rot = lerp(f.rot, P.rot, k);
}
function poseOf(f) {
  const P = { sx: 1, sy: 1, rot: 0, ox: 0, top: 0, bot: 0, wave: 4 };
  const br = Math.sin(G.frame * .07 + f.side * 2), S = f.id === 'suzune';
  switch (f.state) {
    case 'idle': P.sy = 1 + br * .014; P.sx = 1 - br * .007; P.top = br * 4; P.wave = 5; break;
    case 'walk': { const c = Math.sin(G.frame * .32); P.sy = 1 + Math.abs(c) * .035; P.top = 12; P.bot = c * 16; P.wave = 9; P.rot = .03; break; }
    case 'guard': P.top = -18; P.bot = 4; P.sx = .95; P.sy = .96; P.wave = 3; break;
    case 'jump': if (f.vy < -4) { P.sy = 1.08; P.sx = .93; P.bot = -24; P.top = 6; } else { P.sy = .98; P.bot = 14; P.top = -6; } P.wave = 14; break;
    case 'tagin': P.sy = 1.05; P.sx = .95; P.bot = -18; P.wave = 14; break;
    case 'dashin': P.top = 40; P.sx = 1.18; P.sy = .9; P.wave = 16; P.rot = .08; break;
    case 'dash': if (f.dashDir === f.face) { P.top = 44; P.sx = 1.2; P.sy = .9; P.rot = .1; } else { P.top = -24; P.sx = .94; P.rot = -.06; } P.wave = 16; break;
    case 'hit': P.top = -30; P.bot = 6; P.sx = .95; P.rot = -.1; P.ox = Math.sin(f.t * 2.2) * 4; P.wave = 12; break;
    case 'air': P.rot = -.4 - Math.min(1, f.t / 28) * .9; P.top = -20; P.bot = 20; P.wave = 18; break;
    case 'down': P.rot = -1.38; P.sy = .92; P.wave = 2; break;
    case 'getup': { const q = Math.min(1, f.t / 16); P.rot = -1.38 * (1 - q) * (1 - q); P.sy = 1 + Math.sin(q * Math.PI) * .08; P.top = -10 * (1 - q); break; }
    case 'win': if (f.id === 'arca' || (ANIMS[f.id] && ANIMS[f.id].a.winPose)) { P.wave = 3; break; } P.sy = 1.03 + br * .015; P.top = -6 + br * 3; P.wave = 8; break;
    case 'atk': {
      const m = f.move, wind = f.t < m.st, act = f.t >= m.st && f.t < m.st + m.act, key = m.key;
      P.wave = 10;
      if (S) {
        if (key === 'a') {
          if (wind) { P.top = -12; P.sx = .97; }
          else if (act) { if (f.chain === 0) { P.top = 36; P.sx = 1.06; } else if (f.chain === 1) { P.top = 30; P.bot = 14; P.rot = .05; P.sx = 1.08; } else { P.bot = 58; P.top = -20; P.rot = -.06; P.sx = 1.1; P.sy = 1.04; } }
          else { P.top = 10; }
        } else if (key === 'b') {
          if (wind) { P.sy = .88; P.sx = 1.05; P.top = -20; P.bot = -10; }
          else if (act) { P.bot = 72; P.top = -26; P.sx = 1.12; P.rot = -.08; P.wave = 20; }
          else { P.bot = 16; P.top = -6; }
        } else if (key === 'ex') {
          if (wind) { P.sy = .86; P.sx = 1.06; P.top = -14; P.ox = Math.sin(f.t * 3) * 2; }
          else if (act) { P.top = 56; P.sx = 1.3; P.sy = .86; P.rot = .1; P.wave = 22; }
          else { P.top = 18; P.sy = .95; }
        } else if (key === 'ult') {
          const at = f.t - m.st;
          if (at < 16) { P.sy = 1.22; P.sx = .86; P.bot = -20; P.wave = 20; }
          else if (!m.landed) { P.rot = .85; P.sx = 1.3; P.sy = .9; P.top = 24; P.wave = 24; }
          else { P.sy = .82; P.sx = 1.1; P.top = 14; }
        }
      } else {
        if (key === 'a') { if (wind) { P.top = -6; } else if (act) { P.top = 20; P.sx = 1.04; } else P.top = 6; }
        else if (key === 'b') { if (wind) { P.top = -18; P.sy = .95; } else if (act) { P.top = 46; P.bot = -10; P.sx = 1.12; P.wave = 18; } else P.top = 10; }
        else if (key === 'ex') { P.sy = 1.06; P.top = -8; P.wave = 14; if (act) P.top = 16; }
        else if (key === 'ult') { const at = f.t - m.st; if (at < 45) { P.sy = 1.04; P.top = -12; P.wave = 16; P.ox = Math.sin(f.t * 2) * at / 20; } else if (at < 105) { P.top = -22; P.bot = 6; P.wave = 24; P.ox = Math.sin(f.t * 3) * 3; } else P.top = 0; }
      }
      break;
    }
  }
  if (f.land > 0) { const q = f.land / 9; P.sy -= .14 * q; P.sx += .08 * q; }
  if (ANIMS[f.id]) {
    if (f.state === 'air' || f.state === 'down' || f.state === 'getup') { P.rot = 0; P.sy = 1; }
    else if (!(f.state === 'atk' && f.move && f.move.key === 'ult')) P.rot *= .25;
    P.top *= .22; P.bot *= .22; P.wave *= .3;
  }
  if (f.id === 'arca' && ANIMS.arca) { P.rot = f.state === 'hit' ? P.rot * .3 : 0; P.sx = 1 + (P.sx - 1) * .35; P.sy = 1 + (P.sy - 1) * .35; P.top *= .3; P.bot *= .3; }
  return P;
}

function pushApart(a, b) {
  if (a.hidden || b.hidden) return;
  const passing = x => x.state === 'atk' && x.move && (x.move.key === 'ex' || x.move.key === 'ult') && x.id === 'suzune';
  if (passing(a) || passing(b)) return;
  const dx = b.x - a.x, d = Math.abs(dx), min = 100;
  if (d < min && Math.abs(a.y - b.y) < 200) { const push = (min - d) / 2, s = Math.sign(dx) || 1; a.x -= s * push; b.x += s * push; }
}

/* ---------- AI ---------- */
const DIFF = [{ think: 26, guard: .12, agg: .45, combo: .1 }, { think: 14, guard: .38, agg: .65, combo: .45 }, { think: 7, guard: .68, agg: .85, combo: .85 }];
function aiInput(f, o) {
  const D = DIFF[G.diff], ai = f.ai || (f.ai = { cd: 0, hold: {}, holdT: 0, press: null });
  const out = { l: false, r: false, u: false, d: false, a: false, b: false, ex: false, ult: false };
  if (ai.holdT > 0) { ai.holdT--; Object.assign(out, ai.hold); }
  if (ai.press) { out[ai.press] = true; ai.press = null; }
  if (G.phase !== 'fight') return out;
  if (f.state === 'atk' && f.hitIds.size && f.move.key === 'a' && Math.random() < D.combo * .3) ai.press = f.chain < 2 ? 'a' : (f.gauge >= 50 && Math.random() < .5 ? 'ex' : 'b');
  if (--ai.cd > 0) return out;
  ai.cd = D.think + (Math.random() * D.think) | 0;
  const d = o.x - f.x, ad = Math.abs(d), dir = Math.sign(d) || 1, toward = dir > 0 ? 'r' : 'l', away = dir > 0 ? 'l' : 'r';
  const threatened = (o.state === 'atk' && ad < 320) || G.proj.some(p => p.owner === o && Math.abs(p.x - f.x) < 360);
  const set = (h, n) => { ai.hold = h; ai.holdT = n; };
  { const pt = partnerOf(f); if (pt && pt.hp > f.hp + 25 && f.hp < 40 && !(G.tagCd[f.side] > 0) && Math.random() < .25) { ai.press = 'tg'; return out; } }
  if (CAN_DASH[f.id] && !(f.dashCd > 0) && onGround(f)) {   // slip through AOI's shots / close the gap
    const shot = G.proj.some(p => p.owner === o && Math.abs(p.x - f.x) < 300 && Math.sign(p.vx) === -dir);
    if ((shot && Math.random() < .35 + D.guard * .5) || (ad > 520 && Math.random() < .22)) { set({ [toward]: true }, 6); ai.press = 'dh'; return out; }
  }
  if (threatened && Math.random() < D.guard) { set({ d: true }, 14 + (Math.random() * 10 | 0)); return out; }
  if (canUlt(f) && Math.random() < .5 && (f.id !== 'suzune' || ad < 700)) { ai.press = 'ult'; return out; }
  if (f.id === 'arca') {
    if (f.gauge >= 50 && Math.random() < .3) { ai.press = 'ex'; return out; }
    if (ad < 290) { if (Math.random() < D.agg) ai.press = Math.random() < .25 ? 'b' : 'a'; else set({ [away]: true }, 12); }
    else if (ad > 760) set({ [toward]: true }, 16);
    else if (Math.random() < D.agg * .9) ai.press = 'b';
    else set({ [Math.random() < .6 ? toward : away]: true }, 12);
    return out;
  }
  if (f.id === 'suzune') {
    if (f.gauge >= 50 && ad < 460 && Math.random() < .3) { ai.press = 'ex'; return out; }
    if (ad > 190) { if (Math.random() < .18) { set({ [toward]: true, u: true }, 6); } else set({ [toward]: true }, 10 + (Math.random() * 12 | 0)); }
    else if (Math.random() < D.agg) ai.press = Math.random() < .35 ? 'b' : 'a';
    else set({ [away]: true }, 8);
  } else {
    if (f.gauge >= 50 && Math.random() < .3) { ai.press = 'ex'; return out; }
    if (ad < 200) { if (Math.random() < D.agg * .8) ai.press = 'b'; else set({ [away]: true, u: Math.random() < .4 }, 12); }
    else if (ad > 720) set({ [toward]: true }, 14);
    else if (Math.random() < D.agg) ai.press = 'a';
    else set({ [Math.random() < .5 ? away : toward]: true }, 10);
  }
  return out;
}

/* ---------- round flow ---------- */
/* 2-on-2 tag team (KOF style): each side picks two fighters and can switch any time */
function makeTeams() {
  const [t0, t1] = G.picks;
  G.teams = [t0.map(id => makeFighter(id, 0, false)), t1.map(id => makeFighter(id, 1, t0.includes(id)))];
  for (const t of G.teams) for (const f of t) f.wins = G.wins[f.side];
  G.fighters = [G.teams[0][0], G.teams[1][0]];
}
const partnerOf = f => G.teams && G.teams[f.side].find(x => x !== f);
async function startMatch() {
  if (!Array.isArray(G.picks[0])) G.picks = [[G.picks[0], G.picks[0] === 'suzune' ? 'aoi' : 'suzune'], [G.picks[1], G.picks[1] === 'arca' ? 'suzune' : 'arca']];
  const need = [...new Set(G.picks.flat())];
  if (need.some(id => !ANIMS[id])) {
    const ov = $('#matchLoad'), pc = $('#matchPct'); ov.hidden = false; pc.textContent = '0%';
    await ensureAnims(need, v => pc.textContent = v + '%');
    ov.hidden = true;
  } else ensureAnims(need);
  G.wins = [0, 0];
  G.round = 1; G.matchOver = false; G.winMovie = false; G.rwMovie = false;
  makeTeams();
  setStage({ arca: 'aoi' }[G.picks[0][0]] || G.picks[0][0]);
  G.teams.flat().forEach(f => { if (f.alt) prepareAlt(f.id); });
  startRound();
  G.scene = 'game'; showScreen(null); setTouch(true); bgmTrack('battle', .5);
}
function startRound() {
  makeTeams(); G.tagCd = [0, 0]; G.pendingTag = null; G.benched = [];
  G.resultShown = false; G.victory = null; G.fx = []; G.proj = []; G.paintFloor = []; G.timer = 99; G.timerF = 0; G.phase = 'intro'; G.phaseT = 0; G.cutin = null; G.rwCut = null; G.freeze = 0; G.tintA = 0; G.slow = 1;
  G.cam.x = STAGE_W / 2;
  for (const f of G.fighters) {
    if (f.id === 'arca') { f.boarding = G.round === 1; f._boardFx = f._boardFx2 = f._bootSnd = false; f.state = 'idle'; continue; }
    f.x -= f.face * 400; f.vx = f.face * 28; f.state = 'dashin';
  }
  G.banner = null;
  const sp = G.fighters[(G.round + 1) % 2];
  const talk = G.round === 1 && VOICE_MAP[sp.id] && VOICE_MAP[sp.id].round.some(v => VOICE.buf[v]) && SND.on;
  G.introA = talk ? 170 : 8;
  if (G.round === 1 && G.fighters.some(f => f.id === 'arca')) G.introA = Math.max(G.introA, BOARD.lit + 10);             // frame where "ROUND n" is announced
  G.introF = G.introA + 95;              // frame where "FIGHT!" is called
  G.introDone = false; G.fightCalled = false;
  if (talk) voice(sp, 'round', { delay: .25 });
}
function updateFlow(dt) {
  G.phaseT += dt;
  if (G.phase === 'intro') {
    if (G.phaseT > G.introA && !G.introDone) {
      G.introDone = true; G.banner = { txt: G.fighters.every(f => f.wins === 1) ? 'FINAL ROUND' : `ROUND ${G.round}`, t: 0 }; sfx.announce();
      voice('sys', G.fighters.every(f => f.wins === 1) || G.round >= 3 ? 'final' : G.round === 2 ? 'r2' : 'r1');
    }
    if (G.phaseT > G.introF && !G.fightCalled) { G.fightCalled = true; voice('sys', 'fight'); G.banner = { txt: 'FIGHT!', t: 0, big: true }; flash(.7); shake(10); quake(6, .35); sfx.boom(); for (const f of G.fighters) fxRing(f.x, f.y - 4, f.col.rgb, 20, 220, 26, 8, .25); }
    if (G.phaseT > G.introF + 35) { G.phase = 'fight'; }
  } else if (G.phase === 'fight') {
    G.timerF += dt; if (G.timerF >= 60) { G.timerF -= 60; G.timer--; if (G.timer <= 0) { G.timer = 0; timeUp(); } }
  } else if (G.phase === 'ko' || G.phase === 'timeup') {
    if (G.phaseT > 130 && !G.resultShown) {
      G.resultShown = true;
      const [a, b] = G.fighters, th = side => G.teams[side].reduce((s, f) => s + Math.max(0, f.hp), 0), winner = th(0) > th(1) ? a : th(1) > th(0) ? b : null;
      if (winner && winner.wins >= 2 && winMovieStart(winner)) { G.winMovie = true; }
      else if (winner && winner.wins < 2 && ANIMS[winner.id] && ANIMS[winner.id].a.cutin) { const AN = ANIMS[winner.id], t0 = -Math.round((AN.a.winPose ? AN.a.winPose.length / (AN.fps.winPose || 24) * 60 : 105) + 6); G.rwCut = { f: winner, t: t0, t0, len: 100 }; }
      else if (winner && winner.wins >= 2 && VICT[winner.id]) { const V = VICT[winner.id]; G.victory = { f: winner, t: 0, len: V.frames.length / V.fps * 60 }; sfx.cutin(); }
      if (winner && !G.winMovie) voice(winner, 'win', { delay: .2 });
      if (winner) { winner.state = 'win'; winner.t = 0; winner.move = null; winner.hidden = false; G.banner = { txt: `${winner.ch.name} WINS`, t: 0, rgb: winner.col.rgb }; }
      else G.banner = { txt: 'DRAW', t: 0 };
    }
    if (G.winMovie || G.rwMovie) return;
    if (G.rwCut) { const c = G.rwCut; c.t += dt; if (c.t >= 0 && !c.go) { c.go = true; sfx.cutin(); quake(5, .25); } }
    if (G.phaseT > (G.victory ? 130 + G.victory.len + 70 : G.rwCut ? (G.rwCut.t >= G.rwCut.len + 10 ? 0 : 1e9) : 250)) {
      G.resultShown = false; G.victory = null; G.rwCut = null;
      const [a, b] = G.fighters;
      if (a.wins >= 2 || b.wins >= 2) endMatch(a.wins >= 2 ? a : b);
      else { G.round++; startRound(); }
    }
  }
}
function timeUp() {
  G.phase = 'timeup'; G.phaseT = 0; G.banner = { txt: 'TIME UP', t: 0, big: true }; sfx.boom(); voice('sys', 'timeup');
  const hpOf = side => G.teams[side].reduce((s, f) => s + Math.max(0, f.hp), 0), ha = hpOf(0), hb = hpOf(1);
  const ws = ha > hb ? 0 : hb > ha ? 1 : -1; if (ws >= 0) { G.wins[ws]++; for (const f of G.teams[ws]) f.wins = G.wins[ws]; }
}
function endMatch(w) {
  { const l = G.fighters.find(x => x !== w); if (l) voice(l.id, 'lose', { delay: .5 }); }
  G.matchOver = true; G.phase = 'over'; setTouch(false);
  const [a, b] = G.fighters, label = G.mode === 'pvp' ? `${w.side ? '2P' : '1P'} WIN` : G.mode === 'watch' ? `${w.ch.name} WIN` : (w.side === 0 ? 'YOU WIN' : 'YOU LOSE');
  $('#resTitle').textContent = label; $('#resScore').textContent = `${a.wins} — ${b.wins}`;
  $('#resName').textContent = w.ch.name; $('#resImg').src = w.gfx.ci.toDataURL ? w.gfx.ci.toDataURL('image/webp', .8) : w.gfx.ci.src;
  showScreen('result');
}

/* ---------- camera + drawing ---------- */
let rays = null, skyline = null;
function buildBg() {
  skyline = [];
  for (let L = 0; L < 3; L++) {
    const c = mk(2600, 420), x = c.getContext('2d'), n = 60 + L * 10;
    const base = [[70, 40, 90], [48, 28, 70], [28, 18, 48]][L];
    for (let i = 0; i < n; i++) {
      const w = rnd(40, 130) * (1 + L * .3), h = rnd(80, 360) * (1 - L * .18), X = rnd(0, 2600);
      x.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; x.fillRect(X, 420 - h, w, h);
      if (L > 0) for (let wy = 420 - h + 12; wy < 410; wy += 14) for (let wx = X + 6; wx < X + w - 6; wx += 12) if (Math.random() < .22) { x.fillStyle = Math.random() < .5 ? 'rgba(255,190,120,.7)' : 'rgba(140,200,255,.55)'; x.fillRect(wx, wy, 4, 6); }
      if (Math.random() < .12) { x.fillStyle = 'rgba(255,60,80,.9)'; x.fillRect(X + w / 2 - 2, 420 - h - 10, 4, 10); }
    }
    skyline.push(c);
  }
}
function drawBackground(camX, z) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#120f2e'); sky.addColorStop(.38, '#4a2358'); sky.addColorStop(.62, '#d8645a'); sky.addColorStop(.72, '#ffc07a'); sky.addColorStop(1, '#2a1633');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  // backlight sun + rays
  const sx = W / 2 - (camX - STAGE_W / 2) * .08, sy = 400;
  ctx.globalCompositeOperation = 'lighter';
  const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 520); sg.addColorStop(0, 'rgba(255,240,210,.95)'); sg.addColorStop(.08, 'rgba(255,200,140,.7)'); sg.addColorStop(.35, 'rgba(255,120,90,.22)'); sg.addColorStop(1, 'rgba(255,90,90,0)');
  ctx.fillStyle = sg; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(G.frame * .0012);
  for (let i = 0; i < 14; i++) { ctx.rotate(TAU / 14); ctx.fillStyle = `rgba(255,210,170,${.05 + .03 * Math.sin(G.frame * .02 + i * 2)})`; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1400, -60); ctx.lineTo(1400, 60); ctx.closePath(); ctx.fill(); }
  ctx.restore(); ctx.globalCompositeOperation = 'source-over';
  // skylines parallax
  const hz = GY - 150;
  [.15, .35, .6].forEach((par, L) => {
    const img = skyline[L], off = ((camX - STAGE_W / 2) * par) % 1300, s = 1 + L * .06;
    ctx.globalAlpha = .95; ctx.drawImage(img, -650 - off, hz + 150 - 420 * s + L * 10, 2600, 420 * s); ctx.globalAlpha = 1;
  });
  // haze
  const hg = ctx.createLinearGradient(0, hz - 60, 0, GY + 10); hg.addColorStop(0, 'rgba(255,150,120,0)'); hg.addColorStop(1, 'rgba(255,170,130,.35)');
  ctx.fillStyle = hg; ctx.fillRect(0, hz - 60, W, GY - hz + 70);
}
function worldTransform() {
  const c = G.cam, sh = c.shake;
  const ox = sh ? rnd(-sh, sh) : 0, oy = sh ? rnd(-sh, sh) * .7 : 0, z = c.z + c.kick;
  ctx.translate(W / 2 + ox, GY + oy + (c.y || 0)); ctx.scale(z, z); ctx.translate(-c.x, -GROUND);
}
/* ---------- video stages: chosen by 1P's character ---------- */
const STAGE = { v: null, id: null };
function setStage(id) {
  const v = document.getElementById('stage-' + id);
  document.querySelectorAll('.stage-vid').forEach(x => { if (x !== v) { try { x.pause(); } catch (e) { } } });
  STAGE.v = v; STAGE.id = id;
  if (v) { try { const p = v.play(); if (p && p.catch) p.catch(() => { }); } catch (e) { } }
}
function stageReady() { const v = STAGE.v; return v && v.readyState >= 2 && v.videoWidth > 0; }
// the video fills the screen with a little margin so the camera can pan across it (parallax) and zoom/shake with the fight
function drawStage(camX) {
  const v = STAGE.v, c = G.cam, sh = c.shake, z = c.z + c.kick;
  const base = 1.1 * z, w = W * base, h = H * base;
  const px = -(camX - STAGE_W / 2) * .09 + (sh ? rnd(-sh, sh) * .6 : 0), py = sh ? rnd(-sh, sh) * .4 : 0;
  ctx.drawImage(v, (W - w) / 2 + px, (H - h) * .62 + py, w, h);
  ctx.fillStyle = 'rgba(8,6,20,.12)'; ctx.fillRect(0, 0, W, H);                   // slight grade so fighters pop
  const fg = ctx.createLinearGradient(0, H * .82, 0, H); fg.addColorStop(0, 'rgba(8,6,20,0)'); fg.addColorStop(1, 'rgba(8,6,20,.45)');
  ctx.fillStyle = fg; ctx.fillRect(0, H * .8, W, H * .2);
}
function drawFloor() {
  if (G.scene === 'game' && stageReady()) return;          // the stage video has its own floor
  const c = G.cam, z = c.z + c.kick, left = c.x - W / 2 / z - 50, right = c.x + W / 2 / z + 50, bottom = GROUND + (H - GY) / z + 60;
  const g = ctx.createLinearGradient(0, GROUND, 0, bottom); g.addColorStop(0, '#6b3b58'); g.addColorStop(.08, '#2b1a3a'); g.addColorStop(1, '#120c1f');
  ctx.fillStyle = g; ctx.fillRect(left, GROUND, right - left, bottom - GROUND);
  // sun reflection streak
  ctx.globalCompositeOperation = 'lighter';
  const rg = ctx.createRadialGradient(c.x, GROUND, 0, c.x, GROUND, 700); rg.addColorStop(0, 'rgba(255,170,120,.35)'); rg.addColorStop(1, 'rgba(255,120,120,0)');
  ctx.save(); ctx.translate(0, GROUND); ctx.scale(1, .18); ctx.fillStyle = rg; ctx.fillRect(c.x - 700, -700, 1400, 1400); ctx.restore();
  // perspective lines
  ctx.strokeStyle = 'rgba(255,180,200,.12)'; ctx.lineWidth = 1.5;
  for (let X = 0; X <= STAGE_W; X += 100) { ctx.beginPath(); ctx.moveTo(X, GROUND); ctx.lineTo(X + (X - c.x) * 1.6, bottom); ctx.stroke(); }
  for (let i = 1; i < 6; i++) { const y = GROUND + Math.pow(i / 6, 1.8) * (bottom - GROUND); ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,220,200,.5)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(left, GROUND); ctx.lineTo(right, GROUND); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
}
function setT(x, y, face, rot, sx, sy) { ctx.translate(x, y); ctx.scale(face, 1); ctx.translate(0, -DH * .5); ctx.rotate(rot); ctx.translate(0, DH * .5); ctx.scale(sx, sy); }
function drawDeform(img, f, w, top, bot, wave, glitch) {
  const N = 20, ih = img.height, iw = img.width, sh = ih / N, dh = DH / N, x0 = -w * f.ch.anchor, ph = G.frame * .22 + f.side * 3;
  for (let i = 0; i < N; i++) {
    const v = (i + .5) / N;
    let dx = top * (1 - v) * (1 - v) + bot * v * v + wave * Math.sin(v * 5.5 - ph) * v * v * .8;
    if (glitch && Math.random() < .25) dx += rnd(-18, 18);
    const srcH = Math.min(sh + 1, ih - i * sh);
    ctx.drawImage(img, 0, i * sh, iw, srcH, x0 + dx, -DH + i * dh, w, dh * srcH / sh + .6);
  }
}
function drawDeformBox(img, x, y, w, h, top, bot, wave, glitch, side) {
  const N = 16, ih = img.height, iw = img.width, sh = ih / N, dh = h / N, ph = G.frame * .22 + side * 3;
  for (let i = 0; i < N; i++) {
    const v = clamp((y + (i + .5) * dh + DH) / DH, 0, 1);
    let dx = top * (1 - v) * (1 - v) + bot * v * v + wave * Math.sin(v * 5.5 - ph) * v * v * .8;
    if (glitch && Math.random() < .25) dx += rnd(-18, 18);
    const srcH = Math.min(sh + 1, ih - i * sh);
    ctx.drawImage(img, 0, i * sh, iw, srcH, x + dx, y + i * dh, w, dh * srcH / sh + .6);
  }
}
const GS = mk(220, 220), GSX = GS.getContext('2d');   // small buffer for the rim-glow
const WS = mk(640, 640), WSX = WS.getContext('2d');   // half-res buffer for white flash / tinted after-images
function drawFrame(src, fr, x, y, w, h, glitch) {
  if (!glitch) { ctx.drawImage(src, fr.sx, fr.sy, fr.w, fr.h, x, y, w, h); return; }
  const N = 12, sh = fr.h / N, dh = h / N;
  for (let i = 0; i < N; i++) ctx.drawImage(src, fr.sx, fr.sy + i * sh, fr.w, sh, x + (Math.random() < .3 ? rnd(-18, 18) : 0), y + i * dh, w, dh + .5);
}
function drawGlow(src, fr, x, y, w, h, rgb) {
  const q = 1 / 8, m = 8, sw = Math.max(2, Math.ceil(fr.w * q)), shh = Math.max(2, Math.ceil(fr.h * q));
  if (sw + m * 2 > GS.width || shh + m * 2 > GS.height) return;
  GSX.clearRect(0, 0, sw + m * 2, shh + m * 2);
  GSX.shadowColor = `rgb(${rgb})`; GSX.shadowBlur = 5; GSX.shadowOffsetX = 2000;
  GSX.drawImage(src, fr.sx, fr.sy, fr.w, fr.h, m - 2000, m, sw, shh);
  GSX.shadowBlur = 0; GSX.shadowOffsetX = 0; GSX.shadowColor = 'transparent';
  const kx = w / sw, ky = h / shh;
  ctx.drawImage(GS, 0, 0, sw + m * 2, shh + m * 2, x - m * kx, y - m * ky, w + m * 2 * kx, h + m * 2 * ky);
}
function drawSolid(src, fr, x, y, w, h, color) {
  const hw = Math.max(1, Math.ceil(fr.w / 2)), hh = Math.max(1, Math.ceil(fr.h / 2));
  if (hw > WS.width || hh > WS.height) return;
  WSX.globalCompositeOperation = 'source-over'; WSX.clearRect(0, 0, hw + 2, hh + 2);
  WSX.drawImage(src, fr.sx, fr.sy, fr.w, fr.h, 0, 0, hw, hh);
  WSX.globalCompositeOperation = 'source-in'; WSX.fillStyle = color; WSX.fillRect(0, 0, hw, hh);
  WSX.globalCompositeOperation = 'source-over';
  ctx.drawImage(WS, 0, 0, hw, hh, x, y, w, h);
}
function drawFighter(f, reflect) {
  if (f.hidden) return;
  const g = f.gfx, pf = pickFrame(f), fr = pf && pf.fr, K = fr ? ANIMS[f.id].k : 0;
  if (!fr) return drawFighterStill(f, reflect);
  const src = frameSrc(fr, f); if (!src) return;
  const bx = fr.ox * K, by = fr.oy * K, bw = fr.w * K, bh = fr.h * K;
  if (reflect) {
    ctx.save(); ctx.globalAlpha = .22; ctx.translate(f.x, GROUND); ctx.scale(1, -.55); ctx.translate(-f.x, -GROUND);
    setT(f.x, f.y, f.face, f.rot, f.sx, f.sy);
    drawFrame(src, fr, bx, by, bw, bh, false); ctx.restore(); ctx.globalAlpha = 1; return;
  }
  const air = Math.max(0, GROUND - f.y);
  ctx.fillStyle = `rgba(10,5,20,${.45 * Math.max(.2, 1 - air / 400)})`; ctx.beginPath(); ctx.ellipse(f.x, GROUND + 2, 120 * Math.max(.4, 1 - air / 600), 16, 0, 0, TAU); ctx.fill();
  if (f.ghosts) for (const gh of f.ghosts) {
    if (!gh.fr) continue;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .42 * (1 - gh.t / 16);
    setT(gh.x, gh.y, gh.face, gh.rot, gh.sx, gh.sy);
    drawSolid(frameSrc(gh.fr, f), gh.fr, gh.fr.ox * K, gh.fr.oy * K, gh.fr.w * K, gh.fr.h * K, `rgb(${auraRgb(f)})`);
    ctx.restore();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const arg = auraRgb(f), ahot = auraHot(f), hotA = f.gauge >= 100 || f.state === 'win' || (f.state === 'atk' && f.move && (f.move.key === 'ult' || f.move.key === 'ex'));
  const bd = boardState(f), pwr = bd ? bd.power : 1;
  if (pwr > .5) drawHoloBase(f, arg, ahot, hotA);
  if (bd) drawBoarding(f, bd, false);
  ctx.save(); setT(f.x + f.ox, f.y, f.face, f.rot, f.sx, f.sy);
  const beat = .5 + .5 * Math.sin(G.frame * .09 + f.side * 2);
  const pulse = f.gauge >= 100 ? .85 + .15 * Math.sin(G.frame * .2) : f.state === 'atk' ? .75 : .45 + .15 * beat;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = pulse * pwr;
  if (pwr > 0) drawGlow(src, fr, bx, by, bw, bh, arg);
  if (hotA) { ctx.globalAlpha = .35 + .2 * beat; drawGlow(src, fr, bx - 6, by - 6, bw + 12, bh + 12, ahot); }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = f.inv > 0 && f.inv < 900 && f.state !== 'atk' && f.state !== 'getup' && f.state !== 'dash' ? (G.frame % 6 < 3 ? .5 : 1) : 1;
  if (pwr < 1) ctx.filter = `brightness(${(.3 + .7 * pwr).toFixed(2)}) saturate(${(.5 + .5 * pwr).toFixed(2)})`;
  drawFrame(src, fr, bx, by, bw, bh, f.glitch > 0);
  if (pf.fr2 !== pf.fr && pf.mix > .04) {
    const f2 = pf.fr2, a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * pf.mix;
    drawFrame(frameSrc(f2, f), f2, f2.ox * K, f2.oy * K, f2.w * K, f2.h * K, false); ctx.globalAlpha = a0;
  }
  ctx.filter = 'none';
  if (f.whiteT > 0) { ctx.globalAlpha = Math.min(1, f.whiteT / 4); drawSolid(src, fr, bx, by, bw, bh, '#fff'); }
  ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  if (bd) drawBoarding(f, bd, true);
  drawGuardShield(f);
}
// holographic emitter rings at the fighter's feet
function drawHoloBase(f, rgb, hot, hotA) {
  const air = Math.max(0, GROUND - f.y), k = Math.max(0, 1 - air / 260); if (k <= 0) return;
  const x = f.x, y = GROUND + 2, R0 = 120, a0 = (hotA ? .95 : .6) * k, rot = G.frame * .02 * (f.side ? -1 : 1);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(x, y); ctx.scale(1, .2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R0 * 1.15); g.addColorStop(0, `rgba(${rgb},${.3 * a0})`); g.addColorStop(.7, `rgba(${rgb},${.1 * a0})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R0 * 1.15, 0, TAU); ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = `rgba(${rgb},${.75 * a0})`;
  for (let i = 0; i < 3; i++) { const s0 = rot + i * TAU / 3; ctx.beginPath(); ctx.arc(0, 0, R0, s0, s0 + 1.5); ctx.stroke(); }
  ctx.lineWidth = 2.5; ctx.strokeStyle = `rgba(${hot},${.8 * a0})`;
  for (let i = 0; i < 4; i++) { const s0 = -rot * 1.6 + i * TAU / 4; ctx.beginPath(); ctx.arc(0, 0, R0 * .72, s0, s0 + .9); ctx.stroke(); }
  for (let i = 0; i < 24; i++) { const an = rot * .5 + i * TAU / 24, r1 = R0 * 1.06, r2 = R0 * (i % 3 ? 1.12 : 1.2);
    ctx.beginPath(); ctx.moveTo(Math.cos(an) * r1, Math.sin(an) * r1); ctx.lineTo(Math.cos(an) * r2, Math.sin(an) * r2); ctx.strokeStyle = `rgba(${rgb},${.6 * a0})`; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.restore();
}
function drawGuardShield(f) {
  if (f.state !== 'guard') return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(f.x + f.face * 70, f.y - 150); ctx.scale(f.face, 1);
  ctx.strokeStyle = `rgba(${f.col.rgb},${.5 + .2 * Math.sin(G.frame * .3)})`; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(0, 0, 30, 130, 0, -Math.PI / 2, Math.PI / 2); ctx.stroke();
  ctx.fillStyle = `rgba(${f.col.rgb},.12)`; ctx.fill(); ctx.restore();
}
// fallback for characters without video frames (single still image)
function drawFighterStill(f, reflect) {
  const g = f.gfx, Hd = f.ch.h || DH, k = Hd / g.img.height, bw = g.img.width * k, bh = Hd, bx = -bw * f.ch.anchor, by = -Hd;
  const bd = boardState(f), pw = bd ? bd.power : 1;
  if (!reflect && AURA[f.id]) {
    const hotA = f.gauge >= 100 || f.state === 'win' || (f.state === 'atk' && f.move && (f.move.key === 'ult' || f.move.key === 'ex'));
    if (pw > .5) drawHoloBase(f, auraRgb(f), auraHot(f), hotA);
    if (bd) drawBoarding(f, bd, false);
  }
  ctx.save();
  if (reflect) { ctx.globalAlpha = .22; ctx.translate(f.x, GROUND); ctx.scale(1, -.55); ctx.translate(-f.x, -GROUND); }
  const bob = f.state === 'idle' ? Math.sin(G.frame * .06 + f.side) * 3 : f.state === 'walk' ? -Math.abs(Math.sin(G.frame * .14)) * 6 : 0;
  setT(f.x + f.ox, f.y + bob, f.face, f.rot, f.sx, f.sy);
  if (!reflect && g.glow && pw > 0) {
    const beat = .5 + .5 * Math.sin(G.frame * .09 + f.side * 2), gk = k * (g.img.width + 96) / g.img.width;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = pw * (f.gauge >= 100 ? .9 : f.state === 'atk' ? .75 : .4 + .15 * beat);
    ctx.drawImage(g.glow, bx - 48 * k, by - 48 * k, (g.img.width + 96) * k, (g.img.height + 96) * k);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  if (!reflect && pw < 1) { ctx.filter = `brightness(${(.3 + .7 * pw).toFixed(2)}) saturate(${(.5 + .5 * pw).toFixed(2)})`; }
  ctx.drawImage(g.img, bx, by, bw, bh); ctx.filter = 'none';
  if (!reflect && f.whiteT > 0) { ctx.globalAlpha = Math.min(1, f.whiteT / 4); ctx.drawImage(g.white, bx, by, bw, bh); }
  ctx.restore(); ctx.globalAlpha = 1;
  if (!reflect && bd) drawBoarding(f, bd, true);
  if (!reflect) drawGuardShield(f);
}
/* ARCA-07 boards the ARSENAL at the start of the match: pilot leaps into the cockpit, the machine powers up */
const BOARD = { jump: 34, arrive: 70, lit: 118 };
function boardState(f) {
  if (f.id !== 'arca' || !f.boarding || G.phase !== 'intro') return null;
  const t = G.phaseT; if (t > BOARD.lit + 30) return null;
  return { t, power: t < BOARD.arrive ? .0 : Math.min(1, (t - BOARD.arrive) / (BOARD.lit - BOARD.arrive)) };
}
function drawBoarding(f, bd, front) {
  const t = bd.t, img = GFX.arcaPilot; if (!img) return;
  const seatX = f.x + f.face * 92, seatY = f.y - 382, startX = f.x + f.face * 330, ph = 170, pw = img.width * ph / img.height;
  if (front && t < BOARD.arrive) {
    let x = startX, y = f.y, s = 1;
    if (t >= BOARD.jump) { const u = (t - BOARD.jump) / (BOARD.arrive - BOARD.jump), e = u * u * (3 - 2 * u); x = lerp(startX, seatX, e); y = lerp(f.y, seatY + 70, e) - Math.sin(u * Math.PI) * 260; s = 1 - .35 * u; }
    else { y = f.y + Math.sin(t * .2) * 2; }
    ctx.save(); ctx.translate(x, y); ctx.scale(f.face * s, s);
    ctx.drawImage(img, -pw / 2, -ph, pw, ph); ctx.restore();
    if (t >= BOARD.jump && t < BOARD.jump + 2 && !f._bootSnd) { f._bootSnd = true; fxDust(startX, f.y, 5, .6); playS('jump', .5); playS('arca_boot', .9); }
  }
  if (!front && t < BOARD.arrive) {   // dormant core pulses while waiting for its pilot
    const a = .25 + .2 * Math.sin(t * .3);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gr = ctx.createRadialGradient(seatX, seatY, 0, seatX, seatY, 90);
    gr.addColorStop(0, `rgba(${f.col.rgb},${a})`); gr.addColorStop(1, `rgba(${f.col.rgb},0)`); ctx.fillStyle = gr; ctx.fillRect(seatX - 90, seatY - 90, 180, 180); ctx.restore();
  }
  if (front && t >= BOARD.arrive && !f._boardFx) {
    f._boardFx = true; const rgb = auraRgb(f), hot = auraHot(f);
    flash(.7, rgb); shake(14); quake(12, .5, 60); playS('ult_start', .6, 1.1);
    fxCore(seatX, seatY, rgb, 180, 20); fxRing(seatX, seatY, hot, 10, 220, 22, 8); fxRing(f.x, GROUND - 4, rgb, 20, 320, 30, 10, .22);
    addFx({ k: 'pillar', x: f.x, y: GROUND, rgb, hot, life: 40, t: 0, w: 150 });
    for (let i = 0; i < 4; i++) fxBolt(seatX, seatY, seatX + rnd(-260, 260), seatY + rnd(-120, 220), rgb, 12);
  }
  if (front && t >= BOARD.lit && !f._boardFx2) { f._boardFx2 = true; fxRing(f.x, f.y - 200, auraHot(f), 20, 300, 24, 8); playS('charge', .5, 1.4); }
}
function drawDrone(f) {
  if ((f.id !== 'aoi' && f.id !== 'arca' && f.id !== 'sakura') || f.hidden) return;
  const arca = f.id === 'arca' || f.id === 'sakura';
  if (arca && !(f.move && f.move.key === 'ult' && f.state === 'atk')) return;
  const img = f.alt ? GFX.droneAltLazy() : GFX.drone, x = f.droneX, y = f.droneY, s = 92;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  if (arca) drawMagicCircle(x + f.face * 60, y, f, f.charge);
  if (f.id === 'sakura' && f.dragon && f.dragon.mouthX !== undefined) drawSakuraFeeds(f, x, y);
  const r = 80 + 60 * f.charge, g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${f.col.rgb},${.55 + f.charge * .4})`); g.addColorStop(1, `rgba(${f.col.rgb},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = `rgba(${f.col.rgb},.7)`; ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(x, y, 62 + i * 8, 20 + i * 6, f.droneA * (i % 2 ? -1.3 : 1) + i, 0, TAU * .7); ctx.stroke(); }
  if (f.move && f.move.key === 'ult') {
    const c = f.charge;
    for (let i = 0; i < 4; i++) { ctx.strokeStyle = `rgba(${i % 2 ? f.col.rgb2 : f.col.rgb},${.3 + c * .6})`; ctx.lineWidth = 3 + i; ctx.beginPath(); ctx.ellipse(x + f.face * (30 + i * 30), y, 30 + i * 22 * c + 10, 80 + i * 36 * c, 0, 0, TAU); ctx.stroke(); }
    if (f.move.beam) {
      const x0 = x + f.face * 40, x1 = f.face > 0 ? STAGE_W + 600 : -600, h = 70 + Math.sin(G.frame * 1.3) * 12;
      const bg = ctx.createLinearGradient(0, y - h, 0, y + h); bg.addColorStop(0, `rgba(${f.col.rgb},0)`); bg.addColorStop(.3, `rgba(${f.col.rgb},.8)`); bg.addColorStop(.5, 'rgba(255,255,255,1)'); bg.addColorStop(.7, `rgba(${f.col.rgb2},.8)`); bg.addColorStop(1, `rgba(${f.col.rgb2},0)`);
      ctx.fillStyle = bg; ctx.fillRect(Math.min(x0, x1), y - h, Math.abs(x1 - x0), h * 2);
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillRect(Math.min(x0, x1), y - h * .18, Math.abs(x1 - x0), h * .36);
      for (let i = 0; i < 6; i++) { const yy = y + rnd(-h, h); ctx.fillStyle = `rgba(255,255,255,${rnd(.2, .6)})`; ctx.fillRect(Math.min(x0, x1), yy, Math.abs(x1 - x0), 2); }
    }
  }
  ctx.restore();
  if (!arca) { ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(f.droneA) * .1); ctx.drawImage(img, -s / 2, -s / 2, s, s); ctx.restore(); }
}
// ULT feeds: SAKURA's blueprint line and the dragon's breath both pour into the focus point
function drawSakuraFeeds(f, cx, cy) {
  const d = f.dragon, tip = sakuraTip(f), beam = f.move && f.move.beam, c = f.charge, w0 = beam ? 1 : c * .35;
  if (w0 <= .02) return;
  const feed = (x0, y0, wA, rgb) => {
    const a = Math.atan2(cy - y0, cx - x0), nx = -Math.sin(a), ny = Math.cos(a), wob = beam ? Math.sin(G.frame * 1.1 + x0) * 4 : 0;
    for (let pass = 0; pass < 2; pass++) {
      const wa = (pass ? wA * .3 : wA) * w0 + wob, wb = (pass ? 22 : 64) * w0;
      ctx.beginPath(); ctx.moveTo(x0 + nx * wa, y0 + ny * wa); ctx.lineTo(cx + nx * wb, cy + ny * wb); ctx.lineTo(cx - nx * wb, cy - ny * wb); ctx.lineTo(x0 - nx * wa, y0 - ny * wa); ctx.closePath();
      ctx.fillStyle = pass ? `rgba(255,255,255,${beam ? .95 : .6})` : `rgba(${rgb},${beam ? .8 : .45})`; ctx.fill();
    }
  };
  feed(d.mouthX, d.mouthY, 46, f.col.rgb);      // dragon's breath, angled down from above
  feed(tip.x, tip.y, 22, f.col.rgb2);           // her compass line, gold
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 150 * w0); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, `rgba(${f.col.rgb},.8)`); g.addColorStop(1, `rgba(${f.col.rgb},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 150 * w0, 0, TAU); ctx.fill();
}
// rune magic circle seen side-on in front of the railgun (three counter-rotating rings)
function drawMagicCircle(x, y, f, c) {
  const rgb = f.col.rgb, hot = auraHot(f);
  for (let j = 0; j < 3; j++) {
    const cx = x + f.face * j * 46, R0 = (70 + j * 40) * (.4 + .6 * c), rot = G.frame * .05 * (j % 2 ? -1 : 1);
    ctx.save(); ctx.translate(cx, y); ctx.scale(.3, 1);
    ctx.strokeStyle = `rgba(${j === 1 ? hot : rgb},${.35 + .55 * c})`; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, R0, 0, TAU); ctx.stroke();
    ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, R0 * .78, 0, TAU); ctx.stroke();
    for (let i = 0; i < 6; i++) { const a = rot + i * TAU / 6; ctx.beginPath(); ctx.moveTo(Math.cos(a) * R0 * .78, Math.sin(a) * R0 * .78); ctx.lineTo(Math.cos(a + TAU / 3) * R0 * .78, Math.sin(a + TAU / 3) * R0 * .78); ctx.stroke(); }
    for (let i = 0; i < 12; i++) { const a = -rot + i * TAU / 12; ctx.fillStyle = `rgba(${hot},${.5 + .5 * c})`; ctx.fillRect(Math.cos(a) * R0 * .89 - 3, Math.sin(a) * R0 * .89 - 3, 6, 6); }
    ctx.restore();
  }
}
function drawRail(f) {
  if (f.rail.length < 2) return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < f.rail.length; i++) {
      const a = f.rail[i - 1], b = f.rail[i], age = 1 - (G.frame - b.t) / 40;
      ctx.strokeStyle = pass ? `rgba(255,255,255,${age})` : `rgba(${f.col.rgb2},${age * .8})`; ctx.lineWidth = pass ? 4 : 16 * age + 2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y + Math.sin(i * .6) * 6); ctx.lineTo(b.x, b.y + Math.sin((i + 1) * .6) * 6); ctx.stroke();
    }
  }
  ctx.restore();
}
function drawCometFx() {
  for (const f of G.fx) if (f.k === 'comet') {
    const p = f.t / f.life, c = G.cam;
    const cx = c.x + f.face * (-200 + Math.cos(p * TAU * 1.1) * 260), cy = GROUND - 620 + Math.sin(p * TAU * 1.1) * 150;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 70); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, `rgba(${f.rgb},.8)`); g.addColorStop(1, `rgba(${f.rgb},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 70, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(${f.rgb},.7)`; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = 0; i < 20; i++) { const q = Math.max(0, p - i * .02); ctx.lineTo(c.x + f.face * (-200 + Math.cos(q * TAU * 1.1) * 260), GROUND - 620 + Math.sin(q * TAU * 1.1) * 150); }
    ctx.stroke(); ctx.restore();
  }
}
function drawSpeedLines(n) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 40; i++) {
    const a = rnd(0, TAU), r0 = rnd(260, 420), r1 = r0 + rnd(200, 500);
    ctx.strokeStyle = `rgba(255,255,255,${rnd(.05, .25) * Math.min(1, n / 10)})`; ctx.lineWidth = rnd(1, 4);
    ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0); ctx.lineTo(W / 2 + Math.cos(a) * r1, H / 2 + Math.sin(a) * r1); ctx.stroke();
  }
  ctx.restore();
}
/* round-win cut-in: keyed bust-up clip inside a slanted band (screen space) */
function drawRwCut() {
  const c = G.rwCut; if (!c || c.t < 0) return;
  const f = c.f, AN = ANIMS[f.id], fr = AN && AN.a.cutin; if (!fr) return;
  const t = c.t, T = c.len, inE = Math.min(1, t / 9), out = t > T - 12 ? (t - (T - 12)) / 12 : 0;
  const dir = f.side === 0 ? 1 : -1, rgb = f.col.rgb, bandH = 420;
  const slide = 1 - Math.pow(1 - inE, 3) - out * 1.3;
  ctx.save();
  ctx.fillStyle = `rgba(6,4,14,${.45 * Math.min(1, t / 8) * (1 - out)})`; ctx.fillRect(0, 0, W, H);
  ctx.translate(W / 2 - dir * (1 - slide) * W, H / 2 - 10); ctx.rotate(-.09 * dir);
  ctx.beginPath(); ctx.rect(-W, -bandH / 2, W * 2, bandH); ctx.clip();
  const bg = ctx.createLinearGradient(0, -bandH / 2, 0, bandH / 2);
  bg.addColorStop(0, 'rgba(10,6,22,.96)'); bg.addColorStop(.5, `rgba(${rgb},.55)`); bg.addColorStop(1, 'rgba(10,6,22,.96)');
  ctx.fillStyle = bg; ctx.fillRect(-W, -bandH / 2, W * 2, bandH);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 22; i++) { const y = ((i * 53) % bandH) - bandH / 2, x = ((i * 131 + t * 38 * dir) % (W * 2) + W * 2) % (W * 2) - W; ctx.fillStyle = `rgba(${rgb},${.12 + (i % 4) * .06})`; ctx.fillRect(x, y, 140 + (i % 5) * 70, 2 + (i % 3)); }
  ctx.globalCompositeOperation = 'source-over';
  // the clip itself (24fps, holds on its last frame)
  const i = Math.min(fr.length - 1, Math.floor(t * (AN.fps.cutin || 24) / 60)), q = fr[i], box = AN.cutBox;
  const sc = (bandH + 60) / box[1], bw = box[0] * sc, bh = box[1] * sc, drift = t * .5 * dir;
  const bx = dir * 170 - bw / 2 + drift, by = -bh / 2 + 20;
  ctx.drawImage(frameSrc(q, f), q.sx, q.sy, q.w, q.h, bx + q.ox * sc, by + q.oy * sc, q.w * sc, q.h * sc);
  const lg = ctx.createLinearGradient(-W / 2, 0, W / 2, 0);
  if (dir > 0) { lg.addColorStop(0, 'rgba(10,6,22,.92)'); lg.addColorStop(.38, 'rgba(10,6,22,0)'); } else { lg.addColorStop(.62, 'rgba(10,6,22,0)'); lg.addColorStop(1, 'rgba(10,6,22,.92)'); }
  ctx.fillStyle = lg; ctx.fillRect(-W, -bandH / 2, W * 2, bandH);
  ctx.fillStyle = `rgb(${rgb})`; ctx.fillRect(-W, -bandH / 2, W * 2, 5); ctx.fillRect(-W, bandH / 2 - 5, W * 2, 5);
  ctx.globalAlpha = .5; ctx.fillStyle = '#fff'; ctx.fillRect(-W, -bandH / 2 + 9, W * 2, 1.5); ctx.fillRect(-W, bandH / 2 - 10, W * 2, 1.5); ctx.globalAlpha = 1;
  ctx.restore();
  if (t > 10) {
    const tt = Math.min(1, (t - 10) / 8), s = 1.6 - tt * .6, x = dir > 0 ? W * .25 : W * .75;
    ctx.save(); ctx.translate(x, H / 2 + 40); ctx.rotate(-.09 * dir); ctx.scale(s, s); ctx.globalAlpha = tt * (1 - out); ctx.textAlign = 'center';
    ctx.font = `700 26px 'Chakra Petch', sans-serif`; ctx.fillStyle = `rgb(${rgb})`; ctx.fillText(`ROUND ${G.round} WIN`, 0, -64);
    ctx.font = `800 84px 'Shippori Mincho B1', serif`; ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(12,6,22,.9)'; ctx.strokeText(f.ch.name, 0, 10);
    ctx.fillStyle = '#fff'; ctx.shadowColor = `rgb(${rgb})`; ctx.shadowBlur = 24; ctx.fillText(f.ch.name, 0, 10);
    ctx.restore();
  }
}
function drawCutin() {
  const ci = G.cutin; if (!ci) return;
  const f = ci.f, t = ci.t, T = 78, img = f.gfx.ci;
  const inE = Math.min(1, t / 10), out = t > T - 12 ? (t - (T - 12)) / 12 : 0;
  ctx.save();
  ctx.fillStyle = `rgba(6,4,14,${.6 * (1 - out)})`; ctx.fillRect(0, 0, W, H);
  const bandH = 300, cy = H / 2, dir = f.side === 0 ? 1 : -1;
  const slide = (1 - Math.pow(1 - inE, 3)) * 1 - out * 1.2;
  ctx.translate(W / 2 + dir * (1 - slide) * -W, cy); ctx.rotate(-.12 * dir);
  ctx.beginPath(); ctx.rect(-W, -bandH / 2, W * 2, bandH); ctx.clip();
  ctx.fillStyle = `rgba(${f.col.rgb},1)`; ctx.fillRect(-W, -bandH / 2, W * 2, bandH);
  const iw = 760, ih = iw * img.height / img.width, drift = t * 1.2 * dir;
  ctx.drawImage(img, -iw / 2 + dir * 140 + drift, -ih / 2, iw, ih);
  const lg = ctx.createLinearGradient(-W / 2, 0, W / 2, 0);
  if (dir > 0) { lg.addColorStop(0, `rgba(${f.col.rgb},.95)`); lg.addColorStop(.35, `rgba(${f.col.rgb},0)`); } else { lg.addColorStop(.65, `rgba(${f.col.rgb},0)`); lg.addColorStop(1, `rgba(${f.col.rgb},.95)`); }
  ctx.fillStyle = lg; ctx.fillRect(-W, -bandH / 2, W * 2, bandH);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 26; i++) { const y = rnd(-bandH / 2, bandH / 2), x = ((i * 97 + t * 60 * dir) % (W * 2)) - W; ctx.fillStyle = `rgba(255,255,255,${rnd(.08, .35)})`; ctx.fillRect(x, y, rnd(80, 300), rnd(1, 3)); }
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-W, -bandH / 2 + 3); ctx.lineTo(W, -bandH / 2 + 3); ctx.moveTo(-W, bandH / 2 - 3); ctx.lineTo(W, bandH / 2 - 3); ctx.stroke();
  ctx.restore();
  // move name
  if (t > 14) {
    const tt = Math.min(1, (t - 14) / 8), s = 1.8 - tt * .8;
    ctx.save(); ctx.translate(dir > 0 ? W * .27 : W * .73, H / 2 + 110); ctx.rotate(-.12 * dir); ctx.scale(s, s); ctx.globalAlpha = tt * (1 - out);
    ctx.textAlign = 'center'; ctx.font = `800 76px 'Shippori Mincho B1', serif`;
    ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(15,8,25,.9)'; ctx.strokeText(f.ch.ultName, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillText(f.ch.ultName, 0, 0);
    ctx.font = `700 22px 'Chakra Petch', sans-serif`; ctx.fillStyle = `rgb(${f.col.rgb})`; ctx.fillText(`${f.ch.name}  ULTIMATE`, 0, 36);
    ctx.restore();
  }
}
function drawBanner() {
  const b = G.banner; if (!b || (G.rwCut && G.rwCut.t > 0)) return;
  const t = b.t, life = b.big ? 70 : 64; if (t > life) { G.banner = null; return; }
  const inT = Math.min(1, t / 7), s = (b.big ? 2.6 : 1.8) - inT * (b.big ? 1.6 : .8), a = t > life - 12 ? (life - t) / 12 : 1;
  ctx.save(); ctx.translate(W / 2, H / 2 - 20); ctx.scale(s, s); ctx.globalAlpha = a * inT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `900 ${b.big ? 132 : 88}px 'Chakra Petch', 'Shippori Mincho B1', sans-serif`;
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,60,90,.6)'; ctx.fillText(b.txt, -6, 0); ctx.fillStyle = 'rgba(60,200,255,.6)'; ctx.fillText(b.txt, 6, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(15,8,25,.92)'; ctx.strokeText(b.txt, 0, 0);
  const g = ctx.createLinearGradient(0, -60, 0, 60); g.addColorStop(0, '#fff'); g.addColorStop(.55, b.rgb ? `rgb(${b.rgb})` : '#ffe2a8'); g.addColorStop(1, '#ff8a5a');
  ctx.fillStyle = g; ctx.fillText(b.txt, 0, 0); ctx.restore();
}
function drawHUD2() {
  const [a, b] = G.fighters, barW = 470, top = 34;
  // each team shows BOTH members' health in fixed order; the one on the field is highlighted
  const memberBar = (m, f, dir, y, h) => {
    const active = m === f, x0 = dir < 0 ? W / 2 - 66 - barW : W / 2 + 66;
    m.dispHp = m.dispHp > m.hp ? Math.max(m.hp, m.dispHp - .35) : m.hp;
    const ko = m.hp <= 0, wd = barW * Math.max(0, m.dispHp) / 100, wh = barW * Math.max(0, m.hp) / 100;
    ctx.globalAlpha = active ? 1 : .82;
    ctx.fillStyle = 'rgba(10,6,20,.78)'; ctx.fillRect(x0, y, barW, h);
    if (!ko) {
      ctx.fillStyle = '#ff4a5e'; ctx.fillRect(dir < 0 ? x0 + barW - wd : x0, y, wd, h);
      const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#fff'); g.addColorStop(.35, m.col.c1); g.addColorStop(1, m.col.c2);
      ctx.fillStyle = g; ctx.fillRect(dir < 0 ? x0 + barW - wh : x0, y, wh, h);
      if (active && m.hp < 30) { ctx.fillStyle = `rgba(255,255,255,${.25 + .25 * Math.sin(G.frame * .3)})`; ctx.fillRect(dir < 0 ? x0 + barW - wh : x0, y, wh, h); }
    }
    ctx.strokeStyle = active ? '#fff' : 'rgba(255,255,255,.45)'; ctx.lineWidth = active ? 2.5 : 1.5; ctx.strokeRect(x0, y, barW, h);
    // name tag inside the bar, at the outer end
    ctx.font = `700 ${active ? 14 : 13}px 'Chakra Petch', sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = dir < 0 ? 'left' : 'right';
    const tx = dir < 0 ? x0 + 8 : x0 + barW - 8, ty = y + h / 2 + 1;
    const ready = !active && !ko && !(G.tagCd[f.side] > 0);
    const label = (active ? '▶ ' : '') + m.ch.name + (ko ? '  K.O.' : ready ? '  ⇄' : '') + `  ${Math.max(0, Math.ceil(m.hp))}`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,6,20,.85)'; ctx.strokeText(label, tx, ty);
    ctx.fillStyle = ko ? '#aaa' : '#fff'; ctx.fillText(label, tx, ty);
    ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
  };
  const bar = (f, dir) => {
    const x0 = dir < 0 ? W / 2 - 66 - barW : W / 2 + 66, team = (G.teams && G.teams[f.side]) || [f];
    team.forEach((m, i) => memberBar(m, f, dir, top - 22 + i * 26, 22));
    const by = top + 30;
    ctx.font = `700 22px 'Chakra Petch', sans-serif`; ctx.fillStyle = '#fff'; ctx.textAlign = dir < 0 ? 'left' : 'right';
    const lab = G.mode === 'pvp' ? (f.side ? '2P' : '1P') : G.mode === 'watch' ? 'CPU' : (f.side ? 'CPU' : 'YOU');
    const nx = dir < 0 ? x0 : x0 + barW; ctx.fillText(f.ch.name, nx, by + 24);
    const nw = ctx.measureText(f.ch.name).width;
    ctx.font = `600 15px 'Chakra Petch', sans-serif`; ctx.fillStyle = f.col.c1; ctx.fillText(lab, dir < 0 ? nx + nw + 12 : nx - nw - 12, by + 23);
    for (let i = 0; i < 2; i++) { const px = dir < 0 ? x0 + barW - 12 - i * 24 : x0 + 12 + i * 24; ctx.fillStyle = i < f.wins ? f.col.c1 : 'rgba(255,255,255,.2)'; ctx.beginPath(); ctx.arc(px, by + 16, 7, 0, TAU); ctx.fill(); }
    // gauge
    const gw = 290, gy = 34 + 70, gx0 = dir < 0 ? W / 2 - 66 - barW : W / 2 + 66 + barW - gw, full = f.gauge >= 100, gv = gw * f.gauge / 100;
    ctx.fillStyle = 'rgba(10,6,20,.7)'; ctx.fillRect(gx0, gy, gw, 12);
    ctx.fillStyle = full ? `hsl(${(G.frame * 6) % 360},95%,68%)` : f.gauge >= 50 ? f.col.c1 : f.col.c2;
    ctx.fillRect(dir < 0 ? gx0 : gx0 + gw - gv, gy, gv, 12);
    ctx.fillStyle = '#fff'; ctx.fillRect(gx0 + gw / 2 - 1, gy - 3, 2, 18);
    ctx.font = `700 15px 'Chakra Petch', sans-serif`; ctx.textAlign = dir < 0 ? 'left' : 'right';
    ctx.fillStyle = full ? '#fff' : 'rgba(255,255,255,.8)'; ctx.fillText(full ? (f.hp <= 50 ? 'ULT READY' : 'ULT LOCK (HP≤50%)') : f.gauge >= 50 ? 'EX READY' : `DRIVE ${f.gauge | 0}%`, dir < 0 ? gx0 + gw + 10 : gx0 - 10, gy + 11);
  };
  bar(a, -1); bar(b, 1);
  // timer
  ctx.save(); ctx.translate(W / 2, top + 14);
  ctx.fillStyle = 'rgba(10,6,20,.8)'; ctx.beginPath(); for (let i = 0; i < 6; i++) { const an = i * TAU / 6; ctx.lineTo(Math.cos(an) * 46, Math.sin(an) * 40); } ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,180,.8)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.font = `700 40px 'Chakra Petch', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = G.timer <= 10 ? '#ff6a7a' : '#fff'; ctx.fillText(String(G.timer).padStart(2, '0'), 0, 2);
  ctx.restore();
  ctx.font = `600 13px 'Chakra Petch', sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText(`ROUND ${G.round}`, W / 2, top + 74);
}

function render() {
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const c = G.cam;
  if (G.scene === 'game' && stageReady()) drawStage(c.x); else drawBackground(c.x, c.z);
  if (G.scene !== 'game' || !G.fighters.length) { drawIdleFx(); return; }
  ctx.save(); worldTransform();
  drawFloor();
  ctx.save(); ctx.beginPath(); ctx.rect(-5000, GROUND, 10000 + STAGE_W, 2000); ctx.clip();
  for (const b of G.benched || []) drawFighter(b.f, true);
  for (const f of G.fighters) drawFighter(f, true);
  ctx.restore();
  drawCometFx();
  ctx.globalCompositeOperation = 'lighter'; for (const f of G.fighters) drawRail(f); ctx.globalCompositeOperation = 'source-over';
  const order = [...G.fighters].sort((p, q) => (p.state === 'atk') - (q.state === 'atk'));
  drawPaintFloor();
  for (const f of G.fighters) { drawDragon(f, false); drawDog(f, false); }
  for (const b of G.benched || []) drawFighter(b.f, false);
  for (const f of order) drawFighter(f, false);
  for (const f of G.fighters) { drawDrone(f); drawDragon(f, true); drawDog(f, true); }
  drawFx('norm');
  ctx.globalCompositeOperation = 'lighter'; drawProj(); drawFx('add'); ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
  if (G.tintA > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(${G.tintC},${G.tintA * .25})`; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
  if (G.speedlines > 0) drawSpeedLines(G.speedlines);
  // vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * .95); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(8,4,18,.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  if (G.victory) drawVictory(); else { drawHUD2(); drawCutin(); drawBanner(); drawRwCut(); }
  if (G.flash > 0) { ctx.fillStyle = `rgba(${G.flashCol},${Math.min(1, G.flash)})`; ctx.fillRect(0, 0, W, H); }
  ctx.font = `600 12px 'Chakra Petch', sans-serif`; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fillText('© SZOU', W - 14, H - 8);
}
function drawVictory() {
  const v = G.victory, V = VICT[v.f.id], f = v.f, t = v.t;
  const k = Math.min(1, t / 20);
  ctx.fillStyle = `rgba(8,5,18,${.72 * k})`; ctx.fillRect(0, 0, W, H);
  const bg = ctx.createRadialGradient(W * .45, H * .45, 40, W * .45, H * .45, W * .7);
  bg.addColorStop(0, `rgba(${f.col.rgb},${.35 * k})`); bg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over';
  const n = V.frames.length, x = clamp(t / 60 * V.fps, 0, n - 1), i0 = Math.floor(x), i1 = Math.min(n - 1, i0 + 1), mix = x - i0;
  const vh = H, vw = vh * 1344 / 768, ox = (W - vw) / 2;
  const put = (fr, a) => { if (!fr.img) return; ctx.globalAlpha = a * k; ctx.drawImage(fr.img, ox + fr.x * vw, fr.y * vh, fr.w * vw, fr.h * vh); };
  if (f.alt) ctx.filter = 'hue-rotate(150deg)';
  put(V.frames[i0], 1); if (mix > .04 && i1 !== i0) put(V.frames[i1], mix);
  ctx.filter = 'none'; ctx.globalAlpha = 1;
  // floating light motes
  ctx.globalCompositeOperation = 'lighter';
  for (let j = 0; j < 26; j++) { const px = (j * 173 + t * (1 + j % 3)) % W, py = H - ((j * 97 + t * (1.5 + j % 4)) % (H + 40)); ctx.fillStyle = `rgba(${f.col.rgb},${.5 * k})`; ctx.fillRect(px, py, 3, 3); }
  ctx.globalCompositeOperation = 'source-over';
  // name plate
  const a = Math.min(1, Math.max(0, (t - 40) / 20));
  if (a > 0) {
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W - 60, H - 70); ctx.textAlign = 'right';
    ctx.font = `600 22px 'Chakra Petch', sans-serif`; ctx.fillStyle = `rgb(${f.col.rgb})`; ctx.fillText('WINNER', 0, -64);
    ctx.font = `800 88px 'Shippori Mincho B1', serif`; ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(10,6,20,.85)'; ctx.strokeText(f.ch.name, 0, 0);
    const g = ctx.createLinearGradient(0, -70, 0, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, f.col.c1); ctx.fillStyle = g; ctx.fillText(f.ch.name, 0, 0);
    ctx.restore();
  }
}
const idle = [];
function drawIdleFx() {
  ctx.globalCompositeOperation = 'lighter';
  if (idle.length < 60) idle.push({ x: rnd(0, W), y: H + 10, vy: rnd(-1.6, -.4), s: rnd(1, 3), c: Math.random() < .5 ? '255,190,90' : '110,195,255' });
  for (const p of idle) { p.y += p.vy; p.x += Math.sin(p.y * .01) * .4; ctx.fillStyle = `rgba(${p.c},.7)`; ctx.fillRect(p.x, p.y, p.s, p.s); if (p.y < -10) { p.y = H + 10; p.x = rnd(0, W); } }
  ctx.globalCompositeOperation = 'source-over';
  const vg = ctx.createLinearGradient(0, 0, 0, H); vg.addColorStop(0, 'rgba(8,5,18,.35)'); vg.addColorStop(1, 'rgba(8,5,18,.65)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

/* ---------- main loop ---------- */
let last = 0, acc = 0;
function simStep(dt) {
  G.frame++;
  if (G.cutin) { G.cutin.t += 1; }
  if (G.freeze > 0) { G.freeze -= 1; if (G.freeze <= 0) G.cutin = null; updateFx(dt * .3); return; }
  if (G.hitstop > 0) { G.hitstop -= 1; G.cam.shake *= .9; return; }
  const sdt = dt * G.slow;
  if (G.slowT > 0) { G.slowT -= 1; if (G.slowT <= 0) G.slow = 1; }
  const [a, b] = G.fighters;
  const ia = G.mode === 'watch' ? aiInput(a, b) : readHuman(0);
  const ib = G.mode === 'pvp' ? readHuman(1) : aiInput(b, a);
  stepFighter(a, b, ia, sdt); stepFighter(b, a, ib, sdt); pushApart(a, b);
  updateProj(sdt); updateFx(sdt); updateFlow(sdt); updateTeams(sdt);
}
function updateCamera() {
  const c = G.cam, [a, b] = G.fighters;
  if (a && b) {
    const vis = [a, b].filter(f => !f.hidden); const cx = f => f.state === 'tagin' && f.tg ? f.tg.x1 : f.x;
    let mid = vis.length ? vis.reduce((s, f) => s + cx(f), 0) / vis.length : c.x;
    const wf = vis.find(f => f.state === 'win'); if (wf) mid = wf.x;
    const d = vis.length === 2 ? Math.abs(a.x - b.x) : 300;
    c.z = 1;
    const half = W / 2 / c.z;
    c.x = lerp(c.x, clamp(mid, half, STAGE_W - half), .12);
    const hi = Math.max(...vis.map(f => f.state === 'tagin' ? 0 : GROUND - f.y), 0); c.y = lerp(c.y || 0, Math.max(0, hi - 140) * .7, .14);   // tilt up for big jumps
  }
  c.shake *= .86; if (c.shake < .3) c.shake = 0;
  c.kick *= .8;
  G.flash *= .86; if (G.flash < .01) G.flash = 0;
  if (G.speedlines > 0) G.speedlines -= 1;
  if (G.banner) G.banner.t += 1;
  if (G.victory) G.victory.t += 1;
}
const SPL = [null, null];
function updateTouchLabels() {
  document.querySelectorAll('#touch .tb.sp').forEach(b => {
    const side = +b.closest('[data-side]').dataset.side, f = G.fighters[side]; if (!f) return;
    const lv = canUlt(f) ? 'ULT' : f.gauge >= 50 ? 'EX' : '必殺';
    if (b.dataset.lv !== lv) { b.dataset.lv = lv; b.querySelector('b').textContent = lv; }
    b.style.setProperty('--g', (f.gauge | 0) + '%');
  });
  document.querySelectorAll('#touch .tb.tg').forEach(b => { const side = +b.closest('[data-side]').dataset.side, f = G.fighters[side], pt = f && partnerOf(f); const ok = pt && pt.hp > 0 && !(G.tagCd && G.tagCd[side] > 0); b.classList.toggle('cool', !ok); b.style.setProperty('--g', ((G.tagCd ? 1 - Math.max(0, G.tagCd[side]) / TAG_CD : 1) * 100 | 0) + '%'); });
  document.querySelectorAll('#touch .tb.dh').forEach(b => {
    const f = G.fighters[+b.closest('[data-side]').dataset.side]; if (!f || b.hidden) return;
    const r = f.dashCd > 0 ? 1 - f.dashCd / DASH.cd : 1; b.style.setProperty('--g', (r * 100 | 0) + '%'); b.classList.toggle('cool', r < 1);
  });
}
function loop(ts) {
  applyQuake();
  const dt = Math.min(100, ts - (last || ts)); last = ts;
  if (G.scene === 'game' && !G.paused && !G.exPause) {
    acc += dt; let n = 0;
    while (acc >= 1000 / 60 && n < 4) { simStep(1); acc -= 1000 / 60; n++; }
    if (n === 4) acc = 0;
    updateCamera(); if (G.frame % 4 === 0) updateTouchLabels();
  } else if (G.scene !== 'game') { G.frame++; }
  render();
  requestAnimationFrame(loop);
}

/* ---------- UI ---------- */
const OP = { stage: 'idle', timer: null };
function runOpening() {
  const el = $('#opening'), v = $('#opVideo');
  el.classList.remove('logo', 'out'); $('#opStart').hidden = false; $('#opSkip').hidden = true; OP.stage = 'wait';
  try { v.pause(); v.currentTime = 0; } catch (e) { }
  G.scene = 'title'; showScreen('opening');
}
function goFull() {
  const d = document.documentElement;
  if (document.fullscreenElement || !d.requestFullscreen) return;
  d.requestFullscreen({ navigationUI: 'hide' }).then(() => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => { }); } catch (e) { } }).catch(() => { });
}
function opStart() {
  goFull();
  if (OP.stage !== 'wait') return;
  OP.stage = 'video'; audioInit();
  document.querySelectorAll('#exMovie video, .card video, #winMovie video, #rwMovie video, .stage-vid').forEach(x => { try { x.load(); } catch (e) { } });   // warm up clips inside the user gesture
  const v = $('#opVideo'); $('#opStart').hidden = true; $('#opSkip').hidden = false;
  BGM.cur = 'title'; bgmVolume(.8, .01); bgmPlay(0);
  const p = v.play(); if (p && p.catch) p.catch(() => opLogo(true));
}
function opLogo(skip) {
  if (OP.stage === 'logo' || OP.stage === 'done') return;
  const v = $('#opVideo');
  if (OP.stage === 'wait') { audioInit(); bgmVolume(.8, .01); }
  if (skip || OP.stage !== 'video' || !BGM.src) { BGM.cur = 'title'; bgmPlay(BGM.loopStart); }          // skipped: jump the music to the drop
  OP.stage = 'logo'; $('#opStart').hidden = true;
  try { v.pause(); if (v.duration) v.currentTime = Math.max(0, v.duration - .05); } catch (e) { }
  $('#opening').classList.add('logo'); sfx.boom();
  clearTimeout(OP.timer); OP.timer = setTimeout(opEnd, 3200);
}
function opEnd() {
  if (OP.stage === 'done') return;
  OP.stage = 'done'; clearTimeout(OP.timer);
  const el = $('#opening'); el.classList.add('out');
  setTimeout(() => { el.classList.remove('logo', 'out'); showScreen('title'); }, 650);
}
/* ---------- EX movie: freeze the fight and play the skill clip ---------- */
const EXM = { f: null, timer: null };
function exMovieStart(f) {
  const box = $('#exMovie'), fr = box.querySelector(`.ex-frame[data-char="${f.id}"]`);
  if (!fr) return false;
  const v = fr.querySelector('video');
  if (!v || v.readyState < 2) return false;                     // clip not ready: skip the movie, keep the fight flowing
  EXM.f = f; G.exPause = true; TOUCH[0] = {}; TOUCH[1] = {};
  box.dataset.char = f.id; box.querySelectorAll('.ex-frame').forEach(x => x.classList.toggle('on', x === fr));
  fr.classList.toggle('alt', !!f.alt);
  box.querySelector('.ex-name b').textContent = f.ch.ultName;
  box.classList.add('on');
  try { v.currentTime = 0; const p = v.play(); if (p && p.catch) p.catch(() => exMovieEnd()); } catch (e) { exMovieEnd(); }
  if (!movieAudio('ex_' + f.id) && f.id === 'arca') playS('arca_nova', 1);   // scored cutscene audio; ARCA keeps its nova sting as a fallback
  clearTimeout(EXM.timer); EXM.timer = setTimeout(exMovieEnd, (v.duration || 3.2) * 1000 + 600);
  return true;
}
function exMovieEnd() {
  if (!G.exPause) return;
  clearTimeout(EXM.timer);
  const box = $('#exMovie'); box.classList.remove('on');
  box.querySelectorAll('video').forEach(v => { try { v.pause(); } catch (e) { } });
  { const v = stopMovieAudio(); if (v !== null) bgmVolume(v, .4); }
  G.exPause = false; acc = 0; flash(.9, EXM.f ? EXM.f.col.rgb : '255,255,255'); shake(12); sfx.boom(); quake(16, .6, 80);
  EXM.f = null;
}
/* ---------- match victory movie + telop ---------- */
const WINQ = { suzune: 'まだまだ、こんなもんじゃないッス！', aoi: '解析完了。――この勝負、わたしの勝ち。', arca: '観測、完了です。……え、もう終わりですか？', sakura: 'わたしの設計に、狂いはないの。', mio: 'ほら、世界がちょっとキレイになった！' };
const WM = { w: null, timers: [], typing: null, ready: false };
function winMovieStart(w) {
  const box = $('#winMovie'), v = box.querySelector(`video[data-char="${w.id}"]`);
  if (!v) return false;
  const [a, b] = G.fighters, col = w.col;
  WM.w = w; WM.ready = false; WM.timers.forEach(clearTimeout); WM.timers = []; clearInterval(WM.typing);
  box.style.setProperty('--wm1', col.c1); box.style.setProperty('--wm2', col.c2);
  box.querySelectorAll('video').forEach(x => x.classList.toggle('on', x === v));
  v.style.filter = w.alt ? 'hue-rotate(150deg)' : '';
  box.querySelector('.wm-name').innerHTML = [...w.ch.name].map((c, i) => `<span style="animation-delay:${i * .05}s">${c}</span>`).join('');
  const q = box.querySelector('.wm-quote'); q.textContent = '';
  box.querySelector('.wm-score').textContent = `${a.wins} — ${b.wins}`;
  box.querySelector('.wm-grade').textContent = w.hp >= 99 ? 'PERFECT' : w.hp >= 60 ? 'GREAT' : w.hp >= 25 ? 'CLEAR' : 'CLUTCH';
  box.classList.remove('plate', 'tap'); void box.offsetWidth; box.classList.add('on');
  setTouch(false); bgmVolume(.7); sfx.boom(); movieAudio('win_' + w.id);
  try { v.currentTime = 0; const p = v.play(); if (p && p.catch) p.catch(() => { }); } catch (e) { }
  const T = (ms, fn) => WM.timers.push(setTimeout(fn, ms));
  T(2300, () => { voice(w, 'winMovie');
    box.classList.add('plate'); sfx.cutin();
    const text = WINQ[w.id] || ''; let i = 0;
    WM.typing = setInterval(() => { q.textContent = text.slice(0, ++i); if (i >= text.length) clearInterval(WM.typing); else if (i % 2) tone(.03, 1400, 1400, .03, 'square'); }, 55);
  });
  T(1200, () => { WM.ready = true; });
  T(5200, () => box.classList.add('tap'));
  T(((v.duration || 6) + 2.2) * 1000, winMovieEnd);
  return true;
}
function winMovieEnd() {
  if (!WM.w) return;
  const w = WM.w; WM.w = null; WM.timers.forEach(clearTimeout); WM.timers = []; clearInterval(WM.typing);
  const box = $('#winMovie'); box.classList.remove('on', 'plate', 'tap');
  box.querySelectorAll('video').forEach(x => { try { x.pause(); } catch (e) { } });
  stopMovieAudio(.5); G.winMovie = false; bgmVolume(.6); endMatch(w);
}
/* round-win cinematic (AOI): keyed bust-up clip over the stage, then on to the next round */
const RW = { w: null, timer: null };
function rwStart(w) {
  const box = $('#rwMovie'), v = box.querySelector(`video[data-char="${w.id}"]`);
  if (!v || v.readyState < 2) return false;
  RW.w = w; box.querySelectorAll('video').forEach(x => x.style.display = x === v ? 'block' : 'none');
  v.style.filter = w.alt ? 'hue-rotate(150deg)' : '';
  box.style.setProperty('--rw', w.col.c1);
  box.querySelector('.rw-kicker').textContent = `ROUND ${G.round} WIN`;
  box.querySelector('.rw-name').textContent = w.ch.name;
  box.classList.remove('out'); void box.offsetWidth; box.classList.add('on'); setTouch(false);
  try { v.currentTime = 0; const p = v.play(); if (p && p.catch) p.catch(() => rwEnd()); } catch (e) { rwEnd(); }
  clearTimeout(RW.timer); RW.timer = setTimeout(rwEnd, ((v.duration || 3.4) + .8) * 1000);
  return true;
}
function rwEnd() {
  if (!RW.w) return;
  RW.w = null; clearTimeout(RW.timer);
  const box = $('#rwMovie'); box.classList.add('out');
  setTimeout(() => { box.classList.remove('on', 'out'); box.querySelectorAll('video').forEach(x => { try { x.pause(); } catch (e) { } }); }, 450);
  G.rwMovie = false; G.phaseT = Math.max(G.phaseT, 225); setTouch(true);
}
function stopStage() { document.querySelectorAll('.stage-vid').forEach(x => { try { x.pause(); } catch (e) { } }); }
function showScreen(id) { document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id)); }
function togglePause(force) {
  if (G.scene !== 'game' || G.matchOver) return;
  G.paused = force !== undefined ? force : !G.paused;
  showScreen(G.paused ? 'pause' : null); setTouch(!G.paused);
  if (STAGE.v) { try { G.paused ? STAGE.v.pause() : STAGE.v.play().catch(() => { }); } catch (e) { } }
}
const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
function refreshTouchFor(side) {
  const f = G.fighters[side]; if (!f) return;
  document.querySelectorAll(`#touch [data-side="${side}"] .tb.dh`).forEach(b => b.hidden = !CAN_DASH[f.id]);
  document.querySelectorAll(`#touch [data-side="${side}"] .tb.jp`).forEach(b => b.hidden = f.id === 'arca');
}
function setTouch(on) {
  const t = $('#touch'); t.classList.toggle('on', on && isTouch() && G.mode !== 'watch');
  t.dataset.mode = G.mode;
  $('#pauseBtn').classList.toggle('on', on);
  TOUCH[0] = {}; TOUCH[1] = {};
  document.querySelectorAll('#touch .tb.dh').forEach(b => { const f = G.fighters[+b.closest('[data-side]').dataset.side]; b.hidden = !(f && CAN_DASH[f.id]); });
  document.querySelectorAll('#touch .tb.jp').forEach(b => { const f = G.fighters[+b.closest('[data-side]').dataset.side]; b.hidden = !!(f && f.id === 'arca'); });
}
function bindTouch() {
  const t = $('#touch');
  ['touchstart', 'touchmove', 'touchend'].forEach(ev => t.addEventListener(ev, e => { if (e.cancelable) e.preventDefault(); }, { passive: false }));
  document.addEventListener('focusin', e => { const el = e.target; if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || (el && el.isContentEditable)) el.blur(); });
  document.addEventListener('contextmenu', e => { if (G.scene === 'game') e.preventDefault(); });
  document.querySelectorAll('#touch [data-k]').forEach(btn => {
    const side = +btn.closest('[data-side]').dataset.side, k = btn.dataset.k;
    const down = e => { e.preventDefault(); audioInit(); TOUCH[side][k] = true; btn.classList.add('press'); btn.setPointerCapture && btn.setPointerCapture(e.pointerId); };
    const up = e => { e.preventDefault(); TOUCH[side][k] = false; btn.classList.remove('press'); };
    btn.addEventListener('pointerdown', down); btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
  });
}
function setupUI() {
  let pickStep = 0;
  const title = $('#title');
  document.querySelectorAll('.mbtn[data-mode]').forEach(b => b.addEventListener('click', () => {
    goFull(); audioInit(); G.mode = b.dataset.mode; pickStep = 0; G.sel = []; updateSelect(); showScreen('select'); selReset(); bgmVolume(.6);
  }));
  document.querySelectorAll('[data-diff]').forEach(b => b.addEventListener('click', () => { G.diff = +b.dataset.diff; document.querySelectorAll('[data-diff]').forEach(x => x.setAttribute('aria-pressed', x === b)); }));
  // team select: 4 picks — side A member 1/2, then side B member 1/2
  G.sel = [];
  const SLOT = () => {
    const team = pickStep < 2 ? 0 : 1, n = pickStep % 2 + 1;
    const who = G.mode === 'pvp' ? (team ? '2P' : '1P') : G.mode === 'watch' ? (team ? '右チーム' : '左チーム') : (team ? '相手チーム' : 'あなたのチーム');
    return { team, n, who };
  };
  function updateSelect() {
    const sl = SLOT();
    $('#selPrompt').textContent = `${sl.who}：${sl.n}人目を選んでください`;
    $('#diffRow').hidden = G.mode === 'pvp';
    document.querySelectorAll('.card').forEach(c => {
      const tags = []; G.sel.forEach((id, i) => { if (id === c.dataset.char) tags.push(`${i < 2 ? (G.mode === 'pvp' ? '1P' : G.mode === 'watch' ? 'L' : 'YOU') : (G.mode === 'pvp' ? '2P' : G.mode === 'watch' ? 'R' : 'CPU')}${'①②'[i % 2]}`); });
      if (tags.length) c.dataset.tag = tags.join(' '); else delete c.dataset.tag;
      c.classList.remove('p1');
    });
    $('#selNote').textContent = sl.n === 2 ? '同じチームに同じキャラは選べません。試合中は「交代」でいつでも入れ替え！' : '2人1組のチームバトル。1人目が先鋒で出撃します';
  }
  // --- select-screen video: intro plays when the screen opens, confirm plays on pick ---
  let selBusy = false, selTimer = null, selNext = null;
  const vplay = v => { if (!v) return; try { v.currentTime = 0; const p = v.play(); if (p && p.catch) p.catch(() => { }); } catch (e) { } };
  function selReset() {
    selBusy = false; clearTimeout(selTimer);
    document.querySelectorAll('.card').forEach(c => { c.classList.remove('confirm', 'dim'); if (c.dataset.vis !== '0') vplay(c.querySelector('.sv-intro')); });
  }
  // with a big roster only the cards on screen play their intro video (phones can't decode 10+ at once)
  if (window.IntersectionObserver) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      const c = e.target, v = c.querySelector('.sv-intro'); c.dataset.vis = e.isIntersecting ? '1' : '0';
      if (!v || c.classList.contains('confirm')) return;
      if (e.isIntersecting) { if (v.paused) vplay(v); } else v.pause();
    }), { root: document.querySelector('.cards'), threshold: .25 });
    document.querySelectorAll('.card').forEach(c => io.observe(c));
  }
  window.selReset = selReset;
  function selProceed() {
    if (!selNext) return; const go = selNext; selNext = null; clearTimeout(selTimer); go();
  }
  document.querySelectorAll('.card').forEach(c => {
    const cv2 = c.querySelector('.sv-confirm'); if (cv2) cv2.addEventListener('ended', () => { selTimer = setTimeout(selProceed, 250); });
    c.addEventListener('click', () => {
      audioInit();
      if (selBusy) { selProceed(); return; }                // tap again to skip the confirm animation
      const sl = SLOT();
      if (sl.n === 2 && G.sel[pickStep - 1] === c.dataset.char) { tone(.1, 300, 200, .1, 'square'); $('#selNote').textContent = '同じチームに同じキャラは選べません'; return; }
      selBusy = true;
      tone(.12, 880, 1200, .1, 'triangle'); sfx.cutin(); voice(c.dataset.char, 'select', { delay: .15 });
      G.sel[pickStep] = c.dataset.char; preloadAnim(c.dataset.char);
      document.querySelectorAll('.card').forEach(o => o.classList.toggle('dim', o !== c));
      c.classList.remove('confirm'); void c.offsetWidth; c.classList.add('confirm');
      vplay(c.querySelector('.sv-confirm'));
      setTimeout(() => sfx.hit(1.2), 1150);
      selNext = () => {
        pickStep++;
        if (pickStep < 4) { updateSelect(); selReset(); }
        else { G.picks = [[G.sel[0], G.sel[1]], [G.sel[2], G.sel[3]]]; startMatch(); }
      };
      selTimer = setTimeout(selProceed, c.querySelector('.sv-confirm') ? 3600 : 1500);             // safety if 'ended' never fires
    });
  });
  $('#selBack').addEventListener('click', () => { if (pickStep > 0) { pickStep--; G.sel.length = pickStep; updateSelect(); selReset(); } else { showScreen('title'); bgmVolume(.8); } });
  $('#pauseBtn').addEventListener('click', () => togglePause(true));
  $('#resume').addEventListener('click', () => togglePause(false));
  $('#quit').addEventListener('click', () => { stopStage(); G.paused = false; G.scene = 'title'; setTouch(false); showScreen('title'); bgmTrack('title', .8); });
  $('#again').addEventListener('click', () => { startMatch(); });
  $('#toSelect').addEventListener('click', () => { stopStage(); bgmTrack('title', .6); G.scene = 'title'; pickStep = 0; G.sel = []; updateSelect(); showScreen('select'); selReset(); });
  $('#toTitle').addEventListener('click', () => { stopStage(); bgmTrack('title', .8); G.scene = 'title'; showScreen('title'); });
  $('#snd').addEventListener('click', e => { SND.on = !SND.on; e.currentTarget.textContent = SND.on ? '効果音 オン' : '効果音 オフ'; e.currentTarget.setAttribute('aria-pressed', SND.on); audioInit(); });
  $('#opStart').addEventListener('click', opStart);
  $('#winMovie').addEventListener('click', () => { if (WM.ready) winMovieEnd(); });
  $('#rwMovie').addEventListener('click', rwEnd);
  document.querySelectorAll('#rwMovie video').forEach(v => v.addEventListener('ended', () => setTimeout(rwEnd, 350)));
  document.querySelectorAll('#exMovie video').forEach(v => v.addEventListener('ended', exMovieEnd));
  $('#exMovie').addEventListener('click', exMovieEnd);                 // tap to skip
  $('#opSkip').addEventListener('click', e => { e.stopPropagation(); if (OP.stage === 'logo') opEnd(); else opLogo(true); });
  $('#opVideo').addEventListener('ended', () => opLogo(false));
  $('#opening').addEventListener('click', () => { if (OP.stage === 'logo') opEnd(); });
  $('#opReplay').addEventListener('click', () => { runOpening(); opStart(); });
  $('#bgmBtn').addEventListener('click', e => { BGM.on = !BGM.on; e.currentTarget.textContent = BGM.on ? 'BGM オン' : 'BGM オフ'; e.currentTarget.setAttribute('aria-pressed', BGM.on); audioInit(); if (BGM.on && !BGM.src) bgmPlay(BGM.loopStart); bgmVolume(G.scene === 'game' ? .5 : .8, .3); });
  $('#rotateOk').addEventListener('click', () => document.body.classList.add('rotate-dismissed'));
  const fs = $('#fsBtn');
  if (!document.documentElement.requestFullscreen) fs.hidden = true;
  fs.addEventListener('click', () => { audioInit(); if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => { })).catch(() => { }); });
  bindTouch();
}

async function boot() {
  resize();
  buildBg();
  await Promise.all([buildAssets(), buildAnims(), loadBGM().then(() => Promise.all([loadVoices(), loadSfx()]))]);
  document.querySelectorAll('[data-src]').forEach(i => i.src = window.ASSETS[i.dataset.src]);
  document.querySelectorAll('.card img').forEach(i => { const id = i.closest('.card').dataset.char; i.src = window.ASSETS[{ suzune: 'suci', aoi: 'aoci', arca: 'arcard', sakura: 'sacard', mio: 'micard' }[id]]; });
  {   // more cards than fit: fade the right edge so it reads as a swipeable row
    const cs = $('.cards'), upd = () => cs.classList.toggle('more', cs.scrollWidth - cs.clientWidth - cs.scrollLeft > 24);
    cs.addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd); new ResizeObserver(upd).observe(cs); upd();
  }
  setupUI(); loadMovieAudio();
  try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]); } catch (e) { }
  $('#loading').remove();
  runOpening();
  requestAnimationFrame(loop);
}
boot();
