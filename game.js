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
  suzune: { id: 'suzune', name: 'SUZUNE', role: '高速近接・連撃', c1: '#ffc24a', c2: '#ff3350', rgb: '255,190,90', rgb2: '255,70,90', speed: 6.4, jump: -18.5, anchor: .6, exName: '桜閃レール', ultName: '桜花彗星' },
  aoi: { id: 'aoi', name: 'AOI', role: 'ドローン・遠距離', c1: '#5cc8ff', c2: '#a970ff', rgb: '110,195,255', rgb2: '170,110,255', speed: 5.2, jump: -17.5, anchor: .58, exName: 'ホーミング・ビット', ultName: 'オービタル・レイ' }
};
const ALT = {
  suzune: { c1: '#7fd8ff', c2: '#4f7bff', rgb: '130,215,255', rgb2: '90,120,255', test: (h, s, l) => (h > 33 && h < 64 && s > .3) || ((h < 12 || h > 340) && s > .55), shift: 175 },
  aoi: { c1: '#ff7aa8', c2: '#ffb347', rgb: '255,120,170', rgb2: '255,180,80', test: (h, s, l) => h > 175 && h < 300 && s > .25, shift: 150 }
};
const GFX = {};
async function buildAssets() {
  const A = window.ASSETS;
  const [su, ao, drone, suci, aoci] = await Promise.all([A.su, A.ao, A.drone, A.suci, A.aoci].map(p => track(loadImg(p))));
  const base = { suzune: { img: su, ci: suci }, aoi: { img: ao, ci: aoci } };
  for (const id of ['suzune', 'aoi']) {
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
const CHAR_SCALE = { suzune: .92, aoi: 1 };
const LOAD = { done: 0, total: 0 };
function track(p) { LOAD.total++; return p.then(v => { LOAD.done++; const el = document.getElementById('loadPct'); if (el) el.textContent = Math.round(LOAD.done / Math.max(1, LOAD.total) * 100) + '%'; return v; }); }
async function buildAnims() {
  const jobs = [];
  for (const id of ['suzune', 'aoi']) {
    let meta;
    try { meta = await (await fetch('anim/' + id + '.json')).json(); } catch (e) { continue; }
    const AN = { k: DH / meta.storeH * (CHAR_SCALE[id] || 1), a: {}, fps: {}, atlases: [], alt: [], altBusy: false };
    const idx = {};
    for (const k in meta.anims) {
      const an = meta.anims[k];
      AN.fps[k] = an.fps || 24;
      const ais = an.atlases.map(p => { if (!(p in idx)) { idx[p] = AN.atlases.length; AN.atlases.push(null); jobs.push(track(loadImg(p)).then(im => { AN.atlases[idx[p]] = im; })); } return idx[p]; });
      AN.a[k] = an.frames.map(r => ({ ai: ais[r.a], sx: r.x, sy: r.y, w: r.w, h: r.h, ox: r.ox, oy: r.oy }));
    }
    ANIMS[id] = AN;
  }
  await Promise.all(jobs);
}
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
  const LOOPS = { idle: 1, win: 1, ultCharge: 1 };
  const smooth = n => !!LOOPS[n];
  const at = (n, i) => { const arr = a[n] || a.idle, L = arr.length, x = clamp(i, 0, L - 1), i0 = Math.floor(x); return { fr: arr[i0], fr2: arr[Math.min(L - 1, i0 + 1)], mix: smooth(n) ? x - i0 : 0 }; };
  const prog = (n, p) => at(n, clamp(p, 0, 1) * ((a[n] || a.idle).length - 1));
  const loop = (n, fps) => { const arr = a[n] || a.idle, L = arr.length, x = (G.frame * fps / 60) % L, i0 = Math.floor(x); return { fr: arr[i0], fr2: arr[(i0 + 1) % L], mix: smooth(n) ? x - i0 : 0 }; };
  const t = Math.max(0, f.t);
  switch (f.state) {
    case 'idle': return f.land > 0 ? at('jump', 2) : loop('idle', AN.fps.idle || 12);
    case 'walk': return loop('walk', AN.fps.walk || 12);
    case 'guard': return at('guard', 0);
    case 'jump': return f.vy < -8 && f.t < 10 ? at('jump', 0) : at('jump', 1);
    case 'dashin': return f.id === 'aoi' ? loop('walk', (AN.fps.walk || 12) * 1.2) : at('ex', 99);
    case 'hit': return prog('hit', t / (t + Math.max(1, f.stun)));
    case 'air': return prog('air', t / 16);
    case 'down': return at('down', t < 6 ? 0 : 1);
    case 'getup': return prog('getup', t / 26);
    case 'win': return t < 18 ? prog('winIn', t / 18) : loop('win', AN.fps.win || 12);
    case 'atk': {
      const m = f.move, p = t / m.total;
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
  if (!BGM.gain) { BGM.gain = ac.createGain(); BGM.gain.connect(ac.destination); }
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
  sys: { r1: ['sys_01'], r2: ['sys_02'], final: ['sys_03'], fight: ['sys_04'], ko: ['sys_05'], timeup: ['sys_06'] },
  aoi: { a0: ['ao_01', 'ao_03'], a1: ['ao_02'], a2: ['ao_04'], b: ['ao_05'], jump: ['ao_06'], guard: ['ao_07'], hit: ['ao_08'], hitBig: ['ao_09'],
    getup: ['ao_10'], ko: ['ao_11'], ex: ['ao_12'], ult: ['ao_13'], select: ['ao_14'], round: ['ao_15'], winMovie: ['ao_16'], win: ['ao_17'], lose: ['ao_18'] }
};
const VOICE = { buf: {}, gain: null, last: {} };
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
  if (!VOICE.gain) { VOICE.gain = ac.createGain(); VOICE.gain.gain.value = 1.15; VOICE.gain.connect(ac.destination); }
  const prev = VOICE['src_' + slot]; if (prev) { try { prev.stop(); } catch (e) { } }
  const s = ac.createBufferSource(); s.buffer = VOICE.buf[avail[Math.floor(Math.random() * avail.length)]]; s.connect(VOICE.gain);
  s.start(ac.currentTime + (opts.delay || 0)); VOICE['src_' + slot] = s;
  s.onended = () => { if (VOICE['src_' + slot] === s) VOICE['src_' + slot] = null; };
}

/* ---------- sampled sound effects (media/sfx/*.mp3); synth versions below are the fallback ---------- */
const SFXB = { buf: {}, gain: null };
const SFX_FILES = ['whoosh_punch', 'whoosh_punch2', 'whoosh_kick', 'whoosh_kick_heavy', 'hit_light', 'hit_mid', 'hit_heavy', 'guard', 'impact_big',
  'laser_shot', 'laser_homing', 'beam', 'charge', 'special_start', 'ult_start', 'dash', 'jump', 'land'];
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
const MAP1 = { l: ['KeyA'], r: ['KeyD'], u: ['KeyW'], d: ['KeyS'], a: ['KeyJ'], s: ['KeyK', 'KeyL'] };
const MAP1solo = { l: ['KeyA', 'ArrowLeft'], r: ['KeyD', 'ArrowRight'], u: ['KeyW', 'ArrowUp', 'Space'], d: ['KeyS', 'ArrowDown'], a: ['KeyJ', 'KeyZ'], s: ['KeyK', 'KeyX', 'KeyL'] };
const MAP2 = { l: ['ArrowLeft'], r: ['ArrowRight'], u: ['ArrowUp'], d: ['ArrowDown'], a: ['Comma', 'Numpad1'], s: ['Period', 'Numpad2'] };
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
    if (f.t >= f.life) arr.splice(i, 1);
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
      else if (f.k === 'hex') {
        ctx.save(); ctx.translate(f.x, f.y); ctx.scale(f.face, 1);
        const s = 1 + p * .25; ctx.strokeStyle = `rgba(${f.rgb},${a})`; ctx.lineWidth = 3;
        for (let j = -1; j <= 1; j++) for (let k = -2; k <= 2; k++) { hexPath(20 + Math.abs(k) * 2, (j * 44 + (k & 1) * 22) * s * .6 + 30, k * 38 * s, 22); ctx.stroke(); }
        ctx.fillStyle = `rgba(${f.rgb},${a * .15})`; ctx.fillRect(10, -110, 44, 220); ctx.restore();
      }
    } else {
      if (f.k === 'petal') {
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
function hurt(f) { return { x0: f.x - 58, x1: f.x + 58, y0: f.y - 280, y1: f.y }; }
function overlap(a, b) { return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0; }
function box(f, x0, x1, y0, y1) { const a = f.x + f.face * x0, b = f.x + f.face * x1; return { x0: Math.min(a, b), x1: Math.max(a, b), y0: f.y + y0, y1: f.y + y1 }; }

const MOVES = {
  suzune: {
    a: { st: 4, act: 4, rec: 11, cost: 0 },
    b: { st: 8, act: 11, rec: 16, cost: 0 },
    ex: { st: 10, act: 26, rec: 18, cost: 50 },
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
  f.gauge -= m.cost;
  if (key === 'a' && f.state === 'atk' && f.move && f.move.key === 'a') f.chain++; else f.chain = 0;
  f.state = 'atk'; f.t = -1; f.move = { key, ...m, total: m.st + m.act + m.rec, id: Math.random() }; f.hitIds.clear();
  if (key === 'ult') { startUlt(f); voice(f, 'ult'); }
  if (key === 'ex') { sfx.special(); voice(f, 'ex'); f.inv = f.id === 'suzune' ? 30 : 0; sfx.charge(); }
  if (key === 'a') voice(f, 'a' + Math.min(2, f.chain), { p: f.chain === 2 ? 1 : .75 });
  if (key === 'b') voice(f, 'b');
  if (f.id === 'suzune') { if (key === 'b') sfx.heavyKick(); else if (key === 'a') f.chain === 2 ? sfx.kick() : sfx.swing(); }
  else if (key === 'b') sfx.heavySwing();
  return true;
}
function startUlt(f) {
  sfx.ultimate(); f.inv = 999;
  if (!exMovieStart(f)) { G.freeze = 78; G.cutin = { f, t: 0 }; flash(.6, f.col.rgb); }   // fallback: in-canvas cut-in
  G.tintA = .55; G.tintC = f.col.rgb;
}

function hitTarget(att, tgt, o) {
  if (tgt.inv > 0 || tgt.ko || tgt.state === 'down' || G.phase !== 'fight') return false;
  const fromDir = Math.sign(tgt.x - att.x) || att.face;
  const guarding = (tgt.state === 'guard' || (tgt.holdBack && (tgt.state === 'walk' || tgt.state === 'idle'))) && onGround(tgt) && tgt.face === -fromDir;
  const hx = (att.x + tgt.x) / 2 + fromDir * 20, hy = tgt.y - (o.hy || 160);
  if (guarding && !o.unblock) {
    tgt.hp = Math.max(1, tgt.hp - o.dmg * .12); tgt.vx = fromDir * (o.kb || 4) * .6; tgt.stun = 10; tgt.t = 0;
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
  if (att.id === 'suzune') fxPetals(hx, hy, 3 + 4 * pw, pw); else fxHex(hx, hy, att.col.rgb, fromDir);
  G.hitstop = Math.max(G.hitstop, o.hitstop || (4 + 4 * pw)); shake(4 + 7 * pw);
  if (pw >= 1.4 || o.launch) quake(3 + 5 * pw, .28 + .12 * pw, pw >= 2 ? 60 : 25);
  if (pw >= 2) flash(.35 * pw / 2, '255,230,200');
  sfx.hit(pw);
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
  } else {
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
      if (Math.abs(o.x - X) < 250) hitTarget(f, o, { noScale: true, dmg: 30, kb: 17, launch: -19, power: 3, hitstop: 14, unblock: true });
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
    const b = { x0: f.face > 0 ? dx : -500, x1: f.face > 0 ? STAGE_W + 500 : dx, y0: dy - 70, y1: dy + 70 };
    const hb = hurt(o);
    if (m.nextHit === undefined) m.nextHit = 45;
    if (at >= m.nextHit && overlap(b, hb)) {
      m.nextHit += 6;
      const last = at >= 99;
      hitTarget(f, o, { noScale: true, dmg: last ? 6 : 2.6, kb: last ? 16 : 3, stun: 20, power: last ? 2.4 : 1, launch: last ? -14 : 0, unblock: true, hy: o.y - dy });
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
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.trail.push({ x: p.x, y: p.y }); if (p.trail.length > (p.type === 'homing' ? 16 : 7)) p.trail.shift();
    let dead = p.t > p.life || p.x < -100 || p.x > STAGE_W + 100 || p.y > GROUND + 20;
    if (!dead && overlap({ x0: p.x - 16, x1: p.x + 16, y0: p.y - 16, y1: p.y + 16 }, hurt(o)) && o.inv <= 0 && o.state !== 'down' && o.state !== 'ko') {
      const f = p.owner, saveX = f.x; f.x = p.x - Math.sign(p.vx) * 40;
      hitTarget(f, o, { dmg: p.dmg, kb: 5, stun: 16, power: p.type === 'homing' ? 1.1 : .8, hy: o.y - p.y }); f.x = saveX; dead = true;
    }
    if (dead) { fxCore(p.x, p.y, p.rgb, 50, 8); G.proj.splice(i, 1); }
  }
}
function drawProj() {
  for (const p of G.proj) {
    const tr = p.trail; if (tr.length < 2) continue;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath(); tr.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y));
      ctx.strokeStyle = pass ? 'rgba(255,255,255,.95)' : `rgba(${p.rgb},.8)`; ctx.lineWidth = pass ? 4 : (p.type === 'homing' ? 14 : 16); ctx.stroke();
    }
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 34); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.3, `rgba(${p.rgb},.8)`); g.addColorStop(1, `rgba(${p.rgb},0)`);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 34, 0, TAU); ctx.fill();
  }
}

function onKO(att, tgt) {
  tgt.state = 'air'; tgt.vy = Math.min(tgt.vy, -15); tgt.vx = Math.sign(tgt.x - att.x) * 11; tgt.ko = true;
  G.phase = 'ko'; G.phaseT = 0; slowmo(.22, 80); flash(1); shake(24); zoomKick(.14); sfx.ko(); quake(34, 1.4, [120, 60, 220]);
  G.banner = { txt: 'K.O.', t: 0, big: true }; voice('sys', 'ko', { delay: .45 });
  att.wins++;
}

const spPick = f => f.gauge >= 100 ? 'ult' : f.gauge >= 50 ? 'ex' : 'b';
function stepFighter(f, o, inp, dt) {
  const pr = k => inp[k] && !f.prev[k];
  for (const k of ['a', 'b', 'ex', 'ult', 'u', 's']) if (pr(k)) f.buf[k] = 9; else if (f.buf[k] > 0) f.buf[k] -= dt;
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
      if (want('s')) { f.buf.s = 0; startMove(f, spPick(f)); }
      else if (want('ult') && f.gauge >= 100) { f.buf.ult = 0; startMove(f, 'ult'); }
      else if (want('ex') && f.gauge >= 50) { f.buf.ex = 0; startMove(f, 'ex'); }
      else if (want('b')) { f.buf.b = 0; startMove(f, 'b'); }
      else if (want('a')) { f.buf.a = 0; startMove(f, 'a'); }
      else if (inp.d && grounded) { f.state = 'guard'; f.vx *= .6; }
      else if (want('u') && grounded) {
        f.buf.u = 0; f.vy = f.ch.jump; f.state = 'jump'; f.vx = dirIn * f.ch.speed * 1.15; sfx.jump(); voice(f, 'jump', { p: .45, cd: 90 }); fxDust(f.x, f.y, 5, .7);
        f.flip = dirIn !== 0 && dirIn !== away; f.flipT = 0; f.sy = .8; f.sx = 1.1;
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
        else if (f.buf.ult > 0 && f.gauge >= 100 && hit) { next = 'ult'; f.buf.ult = 0; }
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
    if (onGround(f) && (f.t | 0) % 48 === 0) { f.vy = -9; f.sy = .82; if (f.id === 'suzune') fxPetals(f.x, f.y - 200, 8, 1); else fxRing(f.x, f.y - 160, f.col.rgb, 30, 180, 20, 5); }
  }

  // physics
  if (!(f.state === 'atk' && f.move && f.move.key === 'ult' && f.id === 'suzune' && f.move && f.t - f.move.st >= 16 && f.t - f.move.st < 56)) {
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
  f.x = clamp(f.x, 70, STAGE_W - 70);
  if (Math.abs(f.x - o.x) > sep && !f.hidden && !o.hidden && f.state !== 'dashin' && o.state !== 'dashin') f.x = o.x + Math.sign(f.x - o.x) * sep;
  if (f.trail.length) { f.trail.length = 0; f.ghosts = f.ghosts || []; { const pf = pickFrame(f); f.ghosts.push({ x: f.x, y: f.y, face: f.face, rot: f.rot, sx: f.sx, sy: f.sy, top: f.top, bot: f.bot, t: 0, fr: pf && pf.fr }); } }
  if (f.ghosts) { for (const g of f.ghosts) g.t += dt; f.ghosts = f.ghosts.filter(g => g.t < 16); }
  f.rail = f.rail.filter(r => G.frame - r.t < 40);
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
    case 'dashin': P.top = 40; P.sx = 1.18; P.sy = .9; P.wave = 16; P.rot = .08; break;
    case 'hit': P.top = -30; P.bot = 6; P.sx = .95; P.rot = -.1; P.ox = Math.sin(f.t * 2.2) * 4; P.wave = 12; break;
    case 'air': P.rot = -.4 - Math.min(1, f.t / 28) * .9; P.top = -20; P.bot = 20; P.wave = 18; break;
    case 'down': P.rot = -1.38; P.sy = .92; P.wave = 2; break;
    case 'getup': { const q = Math.min(1, f.t / 16); P.rot = -1.38 * (1 - q) * (1 - q); P.sy = 1 + Math.sin(q * Math.PI) * .08; P.top = -10 * (1 - q); break; }
    case 'win': P.sy = 1.03 + br * .015; P.top = -6 + br * 3; P.wave = 8; break;
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
  if (threatened && Math.random() < D.guard) { set({ d: true }, 14 + (Math.random() * 10 | 0)); return out; }
  if (f.gauge >= 100 && Math.random() < .5 && (f.id === 'aoi' || ad < 700)) { ai.press = 'ult'; return out; }
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
function startMatch() {
  const [p1, p2] = G.picks;
  const alt2 = p1 === p2;
  G.fighters = [makeFighter(p1, 0, false), makeFighter(p2, 1, alt2)];
  G.round = 1; G.matchOver = false; G.winMovie = false; G.rwMovie = false;
  setStage(G.picks[0]);
  G.fighters.forEach(f => { if (f.alt) prepareAlt(f.id); });
  startRound();
  G.scene = 'game'; showScreen(null); setTouch(true); bgmTrack('battle', .5);
}
function startRound() {
  for (const f of G.fighters) {
    const w = f.wins; Object.assign(f, makeFighter(f.id, f.side, f.alt)); f.wins = w;
  }
  G.resultShown = false; G.victory = null; G.fx = []; G.proj = []; G.timer = 99; G.timerF = 0; G.phase = 'intro'; G.phaseT = 0; G.cutin = null; G.freeze = 0; G.tintA = 0; G.slow = 1;
  G.cam.x = STAGE_W / 2;
  for (const f of G.fighters) { f.x -= f.face * 400; f.vx = f.face * 28; f.state = 'dashin'; }
  G.banner = null;
  const sp = G.fighters[(G.round + 1) % 2];
  const talk = G.round === 1 && VOICE_MAP[sp.id] && VOICE_MAP[sp.id].round.some(v => VOICE.buf[v]) && SND.on;
  G.introA = talk ? 170 : 8;             // frame where "ROUND n" is announced
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
      const [a, b] = G.fighters, winner = a.hp > b.hp ? a : b.hp > a.hp ? b : null;
      if (winner && winner.wins >= 2 && winMovieStart(winner)) { G.winMovie = true; }
      else if (winner && winner.wins < 2 && rwStart(winner)) { G.rwMovie = true; }
      else if (winner && winner.wins >= 2 && VICT[winner.id]) { const V = VICT[winner.id]; G.victory = { f: winner, t: 0, len: V.frames.length / V.fps * 60 }; sfx.cutin(); }
      if (winner && !G.winMovie) voice(winner, 'win', { delay: .2 });
      if (winner) { winner.state = 'win'; winner.t = 0; winner.move = null; winner.hidden = false; G.banner = { txt: `${winner.ch.name} WINS`, t: 0, rgb: winner.col.rgb }; }
      else G.banner = { txt: 'DRAW', t: 0 };
    }
    if (G.winMovie || G.rwMovie) return;
    if (G.phaseT > (G.victory ? 130 + G.victory.len + 70 : 250)) {
      G.resultShown = false; G.victory = null;
      const [a, b] = G.fighters;
      if (a.wins >= 2 || b.wins >= 2) endMatch(a.wins >= 2 ? a : b);
      else { G.round++; startRound(); }
    }
  }
}
function timeUp() {
  G.phase = 'timeup'; G.phaseT = 0; G.banner = { txt: 'TIME UP', t: 0, big: true }; sfx.boom(); voice('sys', 'timeup');
  const [a, b] = G.fighters; if (a.hp > b.hp) a.wins++; else if (b.hp > a.hp) b.wins++;
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
  ctx.translate(W / 2 + ox, GY + oy); ctx.scale(z, z); ctx.translate(-c.x, -GROUND);
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
    drawSolid(frameSrc(gh.fr, f), gh.fr, gh.fr.ox * K, gh.fr.oy * K, gh.fr.w * K, gh.fr.h * K, f.col.c1);
    ctx.restore();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.save(); setT(f.x + f.ox, f.y, f.face, f.rot, f.sx, f.sy);
  const pulse = f.gauge >= 100 ? .8 + .2 * Math.sin(G.frame * .2) : f.state === 'atk' ? .65 : .38;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = pulse;
  drawGlow(src, fr, bx, by, bw, bh, f.col.rgb);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = f.inv > 0 && f.inv < 900 && f.state !== 'atk' && f.state !== 'getup' ? (G.frame % 6 < 3 ? .5 : 1) : 1;
  drawFrame(src, fr, bx, by, bw, bh, f.glitch > 0);
  if (pf.fr2 !== pf.fr && pf.mix > .04) {
    const f2 = pf.fr2, a0 = ctx.globalAlpha; ctx.globalAlpha = a0 * pf.mix;
    drawFrame(frameSrc(f2, f), f2, f2.ox * K, f2.oy * K, f2.w * K, f2.h * K, false); ctx.globalAlpha = a0;
  }
  if (f.whiteT > 0) { ctx.globalAlpha = Math.min(1, f.whiteT / 4); drawSolid(src, fr, bx, by, bw, bh, '#fff'); }
  ctx.restore(); ctx.globalAlpha = 1;
  drawGuardShield(f);
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
  const g = f.gfx, k = DH / g.img.height, bw = g.img.width * k, bh = DH, bx = -bw * f.ch.anchor, by = -DH;
  ctx.save();
  if (reflect) { ctx.globalAlpha = .22; ctx.translate(f.x, GROUND); ctx.scale(1, -.55); ctx.translate(-f.x, -GROUND); }
  setT(f.x + f.ox, f.y, f.face, f.rot, f.sx, f.sy);
  ctx.drawImage(g.img, bx, by, bw, bh);
  if (!reflect && f.whiteT > 0) { ctx.globalAlpha = Math.min(1, f.whiteT / 4); ctx.drawImage(g.white, bx, by, bw, bh); }
  ctx.restore(); ctx.globalAlpha = 1;
  if (!reflect) drawGuardShield(f);
}
function drawDrone(f) {
  if (f.id !== 'aoi' || f.hidden) return;
  const img = f.alt ? GFX.droneAltLazy() : GFX.drone, x = f.droneX, y = f.droneY, s = 92;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
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
  ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(f.droneA) * .1); ctx.drawImage(img, -s / 2, -s / 2, s, s); ctx.restore();
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
  const b = G.banner; if (!b) return;
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
  const [a, b] = G.fighters, barW = 470, barH = 22, top = 34;
  const bar = (f, dir) => {
    f.dispHp = f.dispHp > f.hp ? Math.max(f.hp, f.dispHp - .35) : f.hp;
    const x0 = dir < 0 ? W / 2 - 66 - barW : W / 2 + 66;
    ctx.save(); ctx.translate(0, top);
    ctx.fillStyle = 'rgba(10,6,20,.75)'; ctx.fillRect(x0, 0, barW, barH);
    const wd = barW * f.dispHp / 100, wh = barW * f.hp / 100;
    ctx.fillStyle = '#ff4a5e'; ctx.fillRect(dir < 0 ? x0 + barW - wd : x0, 0, wd, barH);
    const g = ctx.createLinearGradient(0, 0, 0, barH); g.addColorStop(0, '#fff'); g.addColorStop(.35, f.col.c1); g.addColorStop(1, f.col.c2);
    ctx.fillStyle = g; ctx.fillRect(dir < 0 ? x0 + barW - wh : x0, 0, wh, barH);
    if (f.hp < 30) { ctx.fillStyle = `rgba(255,255,255,${.25 + .25 * Math.sin(G.frame * .3)})`; ctx.fillRect(dir < 0 ? x0 + barW - wh : x0, 0, wh, barH); }
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2; ctx.strokeRect(x0, 0, barW, barH);
    ctx.font = `700 24px 'Chakra Petch', sans-serif`; ctx.fillStyle = '#fff'; ctx.textAlign = dir < 0 ? 'left' : 'right';
    const nx = dir < 0 ? x0 : x0 + barW; ctx.fillText(f.ch.name, nx, barH + 28);
    const lab = G.mode === 'pvp' ? (f.side ? '2P' : '1P') : G.mode === 'watch' ? 'CPU' : (f.side ? 'CPU' : 'YOU');
    const nw = ctx.measureText(f.ch.name).width;
    ctx.font = `600 15px 'Chakra Petch', sans-serif`; ctx.fillStyle = f.col.c1; ctx.fillText(lab, dir < 0 ? nx + nw + 12 : nx - nw - 12, barH + 27);
    for (let i = 0; i < 2; i++) { const px = dir < 0 ? x0 + barW - 12 - i * 24 : x0 + 12 + i * 24; ctx.fillStyle = i < f.wins ? f.col.c1 : 'rgba(255,255,255,.2)'; ctx.beginPath(); ctx.arc(px, barH + 20, 7, 0, TAU); ctx.fill(); }
    ctx.restore();
    // gauge
    const gw = 290, gy = 34 + 70, gx0 = dir < 0 ? W / 2 - 66 - barW : W / 2 + 66 + barW - gw, full = f.gauge >= 100, gv = gw * f.gauge / 100;
    ctx.fillStyle = 'rgba(10,6,20,.7)'; ctx.fillRect(gx0, gy, gw, 12);
    ctx.fillStyle = full ? `hsl(${(G.frame * 6) % 360},95%,68%)` : f.gauge >= 50 ? f.col.c1 : f.col.c2;
    ctx.fillRect(dir < 0 ? gx0 : gx0 + gw - gv, gy, gv, 12);
    ctx.fillStyle = '#fff'; ctx.fillRect(gx0 + gw / 2 - 1, gy - 3, 2, 18);
    ctx.font = `700 15px 'Chakra Petch', sans-serif`; ctx.textAlign = dir < 0 ? 'left' : 'right';
    ctx.fillStyle = full ? '#fff' : 'rgba(255,255,255,.8)'; ctx.fillText(full ? 'ULT READY' : f.gauge >= 50 ? 'EX READY' : `DRIVE ${f.gauge | 0}%`, dir < 0 ? gx0 + gw + 10 : gx0 - 10, gy + 11);
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
  for (const f of G.fighters) drawFighter(f, true);
  ctx.restore();
  drawCometFx();
  ctx.globalCompositeOperation = 'lighter'; for (const f of G.fighters) drawRail(f); ctx.globalCompositeOperation = 'source-over';
  const order = [...G.fighters].sort((p, q) => (p.state === 'atk') - (q.state === 'atk'));
  for (const f of order) drawFighter(f, false);
  for (const f of G.fighters) drawDrone(f);
  drawFx('norm');
  ctx.globalCompositeOperation = 'lighter'; drawProj(); drawFx('add'); ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
  if (G.tintA > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(${G.tintC},${G.tintA * .25})`; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
  if (G.speedlines > 0) drawSpeedLines(G.speedlines);
  // vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * .95); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(8,4,18,.55)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  if (G.victory) drawVictory(); else { drawHUD2(); drawCutin(); drawBanner(); }
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
  updateProj(sdt); updateFx(sdt); updateFlow(sdt);
}
function updateCamera() {
  const c = G.cam, [a, b] = G.fighters;
  if (a && b) {
    const vis = [a, b].filter(f => !f.hidden);
    const mid = vis.length ? vis.reduce((s, f) => s + f.x, 0) / vis.length : c.x;
    const d = vis.length === 2 ? Math.abs(a.x - b.x) : 300;
    c.z = 1;
    const half = W / 2 / c.z;
    c.x = lerp(c.x, clamp(mid, half, STAGE_W - half), .12);
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
    const lv = f.gauge >= 100 ? 'ULT' : f.gauge >= 50 ? 'EX' : '必殺';
    if (b.dataset.lv !== lv) { b.dataset.lv = lv; b.querySelector('b').textContent = lv; }
    b.style.setProperty('--g', (f.gauge | 0) + '%');
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
function opStart() {
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
  clearTimeout(EXM.timer); EXM.timer = setTimeout(exMovieEnd, (v.duration || 3.2) * 1000 + 600);
  return true;
}
function exMovieEnd() {
  if (!G.exPause) return;
  clearTimeout(EXM.timer);
  const box = $('#exMovie'); box.classList.remove('on');
  box.querySelectorAll('video').forEach(v => { try { v.pause(); } catch (e) { } });
  G.exPause = false; acc = 0; flash(.9, EXM.f ? EXM.f.col.rgb : '255,255,255'); shake(12); sfx.boom(); quake(16, .6, 80);
  EXM.f = null;
}
/* ---------- match victory movie + telop ---------- */
const WINQ = { suzune: 'まだまだ、こんなもんじゃないッス！', aoi: '解析完了。――この勝負、わたしの勝ち。' };
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
  setTouch(false); bgmVolume(.7); sfx.boom();
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
  G.winMovie = false; bgmVolume(.6); endMatch(w);
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
function setTouch(on) {
  const t = $('#touch'); t.classList.toggle('on', on && isTouch() && G.mode !== 'watch');
  t.dataset.mode = G.mode;
  $('#pauseBtn').classList.toggle('on', on);
  TOUCH[0] = {}; TOUCH[1] = {};
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
    audioInit(); G.mode = b.dataset.mode; pickStep = 0; G.picks = ['suzune', 'aoi']; updateSelect(); showScreen('select'); selReset(false); bgmVolume(.6);
  }));
  document.querySelectorAll('[data-diff]').forEach(b => b.addEventListener('click', () => { G.diff = +b.dataset.diff; document.querySelectorAll('[data-diff]').forEach(x => x.setAttribute('aria-pressed', x === b)); }));
  function updateSelect() {
    const who = G.mode === 'pvp' ? (pickStep === 0 ? '1Pのキャラを選んでください' : '2Pのキャラを選んでください') : G.mode === 'watch' ? (pickStep === 0 ? '左側のキャラを選んでください' : '右側のキャラを選んでください') : (pickStep === 0 ? '使うキャラを選んでください' : '対戦相手を選んでください');
    $('#selPrompt').textContent = who;
    $('#diffRow').hidden = G.mode === 'pvp';
    document.querySelectorAll('.card').forEach(c => { c.classList.toggle('p1', pickStep === 1 && c.dataset.char === G.picks[0]); });
    $('#selNote').textContent = pickStep === 1 ? '同じキャラを選ぶと、2人目はカラー違いになります' : '';
  }
  // --- select-screen video: intro plays when the screen opens, confirm plays on pick ---
  let selBusy = false, selTimer = null, selNext = null;
  const vplay = v => { try { v.currentTime = 0; const p = v.play(); if (p && p.catch) p.catch(() => { }); } catch (e) { } };
  function selReset(keepP1) {
    selBusy = false; clearTimeout(selTimer);
    document.querySelectorAll('.card').forEach(c => {
      c.classList.remove('confirm', 'dim');
      const keep = keepP1 && c.dataset.char === G.picks[0];
      if (!keep) vplay(c.querySelector('.sv-intro'));
    });
  }
  window.selReset = selReset;
  function selProceed() {
    if (!selNext) return; const go = selNext; selNext = null; clearTimeout(selTimer); go();
  }
  document.querySelectorAll('.card').forEach(c => {
    c.querySelector('.sv-confirm').addEventListener('ended', () => { selTimer = setTimeout(selProceed, 250); });
    c.addEventListener('click', () => {
      audioInit();
      if (selBusy) { selProceed(); return; }                // tap again to skip the confirm animation
      selBusy = true;
      tone(.12, 880, 1200, .1, 'triangle'); sfx.cutin(); voice(c.dataset.char, 'select', { delay: .15 });
      G.picks[pickStep] = c.dataset.char;
      document.querySelectorAll('.card').forEach(o => o.classList.toggle('dim', o !== c));
      c.classList.remove('confirm'); void c.offsetWidth; c.classList.add('confirm');
      vplay(c.querySelector('.sv-confirm'));
      setTimeout(() => sfx.hit(1.2), 1150);
      selNext = () => {
        if (pickStep === 0) { pickStep = 1; updateSelect(); selReset(true); const p1 = document.querySelector(`.card[data-char="${G.picks[0]}"]`); if (p1 && G.picks[0]) { p1.classList.add('confirm'); } document.querySelectorAll('.card').forEach(o => o.classList.remove('dim')); }
        else startMatch();
      };
      selTimer = setTimeout(selProceed, 3600);             // safety if 'ended' never fires
    });
  });
  $('#selBack').addEventListener('click', () => { if (pickStep === 1) { pickStep = 0; updateSelect(); selReset(false); } else { showScreen('title'); bgmVolume(.8); } });
  $('#pauseBtn').addEventListener('click', () => togglePause(true));
  $('#resume').addEventListener('click', () => togglePause(false));
  $('#quit').addEventListener('click', () => { stopStage(); G.paused = false; G.scene = 'title'; setTouch(false); showScreen('title'); bgmTrack('title', .8); });
  $('#again').addEventListener('click', () => { G.fighters.forEach(f => f.wins = 0); startMatch(); });
  $('#toSelect').addEventListener('click', () => { stopStage(); bgmTrack('title', .6); G.scene = 'title'; pickStep = 0; updateSelect(); showScreen('select'); selReset(false); });
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
  document.querySelectorAll('.card img').forEach(i => { const id = i.closest('.card').dataset.char; i.src = window.ASSETS[id === 'suzune' ? 'suci' : 'aoci']; });
  setupUI();
  try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]); } catch (e) { }
  $('#loading').remove();
  runOpening();
  requestAnimationFrame(loop);
}
boot();
