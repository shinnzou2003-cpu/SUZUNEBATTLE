'use strict';
/* CHRONO FIGHT — SUZUNE × AOI  © SZOU */
const W = 1280, H = 720, STAGE_W = 2000, GROUND = 600, GY = 612, DH = 318, GRAV = 0.85;
const $ = s => document.querySelector(s);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

const cv = $('#game'); let ctx = cv.getContext('2d');
let scale = 1, dpr = 1;
function resize() {
  const vw = innerWidth, vh = innerHeight;
  scale = Math.min(vw / W, vh / H);
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(W * scale * dpr); cv.height = Math.round(H * scale * dpr);
  cv.style.width = (W * scale) + 'px'; cv.style.height = (H * scale) + 'px';
  const portrait = vh > vw * 1.05;
  document.body.classList.toggle('portrait', portrait);
  if (PFX.on) pfxResize();
}
addEventListener('resize', resize);
/* ---------- WebGL post-processing: the 2D world is drawn off-screen, then bloomed / distorted / graded on the GPU ----------
   layers (bottom → top): #fxgl (world after post-fx) · #game (HUD, transparent).  No WebGL → everything stays on #game as before. */
const PFX = { on: false, gl: null, q: 2, waves: [], ca: 0, radial: 0, rcx: .5, rcy: .5, impact: 0, impRgb: [1, .25, .3], bloomBoost: 0, ms: [], last: 0 };
const wcv = document.createElement('canvas'), wctx = wcv.getContext('2d');
const hudctx = ctx;
function pfxInit() {
  if (/[?&]fx=0/.test(location.search)) return;
  const c = document.createElement('canvas'); c.id = 'fxgl'; c.setAttribute('aria-hidden', 'true');
  const gl = c.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  if (!gl) return;
  const VS = 'attribute vec2 p;varying vec2 v;void main(){v=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
  const BRIGHT = `precision mediump float;varying vec2 v;uniform sampler2D t;uniform float th;
    void main(){vec3 c=texture2D(t,v).rgb;float l=max(c.r,max(c.g,c.b));float k=smoothstep(th,th+.25,l);gl_FragColor=vec4(c*k,1.);}`;
  const BLUR = `precision mediump float;varying vec2 v;uniform sampler2D t;uniform vec2 d;
    void main(){vec3 c=texture2D(t,v).rgb*.227;c+=(texture2D(t,v+d*1.385).rgb+texture2D(t,v-d*1.385).rgb)*.316;c+=(texture2D(t,v+d*3.231).rgb+texture2D(t,v-d*3.231).rgb)*.07;gl_FragColor=vec4(c,1.);}`;
  const FINAL = `precision mediump float;varying vec2 v;uniform sampler2D t,b;uniform float asp,ca,rad,bloom,imp,q;uniform vec2 rc;uniform vec4 wv[6];uniform vec3 irgb;
    vec3 S(vec2 u){return texture2D(t,clamp(u,0.,1.)).rgb;}
    void main(){vec2 u=v;
      for(int i=0;i<6;i++){vec4 w=wv[i];if(w.w>0.){vec2 dd=u-w.xy;dd.x*=asp;float r=length(dd);float x=(r-w.z)/(.045+w.z*.18);float s=w.w*exp(-x*x)*x;u-=normalize(dd+1e-5)*s*.035*vec2(1./asp,1.);}}
      vec3 col;vec2 dc=u-.5;
      if(rad>.001){vec3 acc=vec3(0.);vec2 dr=(u-rc)*min(rad,2.)*.035;for(int i=0;i<10;i++){acc+=S(u-dr*float(i));}col=acc*.1;}
      else col=S(u);
      if(ca>.001){vec2 o=dc*min(ca,2.5)*.0032;col.r=mix(col.r,S(u+o).r,.7);col.b=mix(col.b,S(u-o).b,.7);}
      if(q>.5){vec3 bl=texture2D(b,u).rgb;col+=bl*bloom;}
      col=(col-.5)*1.06+.5;float L=dot(col,vec3(.299,.587,.114));col=mix(vec3(L),col,1.08);
      float vg=smoothstep(.95,.32,length(dc*vec2(1.,.82)));col*=mix(.6,1.,vg);
      if(imp>.001){float m=smoothstep(.40,.52,L);col=imp>.5?mix(vec3(1.,.97,.94),irgb*.25,m):mix(vec3(.03,.02,.05),mix(irgb,vec3(1.),.55),m);}
      gl_FragColor=vec4(col,1.);}`;
  const mkS = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; } return s; };
  const mkP = fs => { const vs = mkS(gl.VERTEX_SHADER, VS), f = mkS(gl.FRAGMENT_SHADER, fs); if (!vs || !f) return null; const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, f); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) return null; const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i), nm = a.name.replace(/\[0\]$/, ''); u[nm] = gl.getUniformLocation(p, a.name); } return { p, u }; };
  const P = { bright: mkP(BRIGHT), blur: mkP(BLUR), fin: mkP(FINAL) };
  if (!P.bright || !P.blur || !P.fin) return;
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const tex = () => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v); return t; };
  const fbo = () => { const t = tex(), f = gl.createFramebuffer(); return { t, f, w: 0, h: 0 }; };
  Object.assign(PFX, { gl, c, P, scene: tex(), A: fbo(), B: fbo(), on: true });
  cv.parentNode.insertBefore(c, cv);
  document.body.classList.add('pfx');
  pfxResize();
}
function pfxResize() {
  if (!PFX.on) return;
  const gl = PFX.gl;
  PFX.c.width = wcv.width = cv.width; PFX.c.height = wcv.height = cv.height;
  PFX.c.style.width = cv.style.width; PFX.c.style.height = cv.style.height;
  const bw = Math.max(64, cv.width >> 2), bh = Math.max(36, cv.height >> 2);
  for (const F of [PFX.A, PFX.B]) { gl.bindTexture(gl.TEXTURE_2D, F.t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, bw, bh, 0, gl.RGB, gl.UNSIGNED_BYTE, null); gl.bindFramebuffer(gl.FRAMEBUFFER, F.f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, F.t, 0); F.w = bw; F.h = bh; }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
function pfxOff() {   // runtime fallback: go back to plain 2D on the visible canvas
  if (!PFX.on) return; PFX.on = false; ctx = hudctx; PFX.c.remove(); document.body.classList.remove('pfx');
}
// world-space shockwave (x,y in stage px); amp ≈ .5 small hit … 2 ULT blast
function pfxWave(x, y, amp = 1, life = 34) {
  if (!PFX.on) return; if (PFX.waves.length >= 6) PFX.waves.shift();
  PFX.waves.push({ x, y, amp, life, t: 0 });
}
function pfxKick(o) {   // { ca, radial, x, y (world), impact(ms), bloom }
  if (o.ca) PFX.ca = Math.max(PFX.ca, o.ca);
  if (o.radial) { PFX.radial = Math.max(PFX.radial, o.radial); if (o.x !== undefined) { const s = w2s(o.x, o.y); PFX.rcx = s[0] / W; PFX.rcy = s[1] / H; } else { PFX.rcx = .5; PFX.rcy = .5; } }
  if (o.impact) PFX.impact = Math.max(PFX.impact, o.impact);
  if (o.bloom) PFX.bloomBoost = Math.max(PFX.bloomBoost, o.bloom);
  if (o.rgb) PFX.impRgb = o.rgb.split(',').map(n => +n / 255);
}
function w2s(x, y) { const c = G.cam, z = c.z + c.kick; return [W / 2 + (x - c.x - (c.push || 0)) * z, GY + (c.y || 0) + (y - GROUND) * z]; }
function pfxDraw(dtMs) {
  const gl = PFX.gl, P = PFX.P, cw = PFX.c.width, ch = PFX.c.height, k = dtMs / 16.67;
  // adaptive quality: a slow device first loses bloom, then the whole GL layer
  PFX.ms.push(dtMs); if (PFX.ms.length > 90) PFX.ms.shift();
  if (PFX.ms.length === 90 && G.scene === 'game' && !G.paused && !/[?&]fx=1/.test(location.search)) { const avg = PFX.ms.reduce((a, b) => a + b, 0) / 90; if (avg > 26) { PFX.ms.length = 0; if (PFX.q > 1) PFX.q = 1; else if (PFX.q === 1) PFX.q = 0; else { pfxOff(); return; } } }
  gl.bindTexture(gl.TEXTURE_2D, PFX.scene); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, wcv);
  const ultOn = G.ultMono > 0 || G.fighters.some(f => f.state === 'atk' && f.move && (f.move.key === 'ult' || f.move.key === 'ex'));
  const bloomAmt = (G.scene === 'game' ? .42 : .3) + (ultOn ? .3 : 0) + PFX.bloomBoost;
  if (PFX.q >= 1) {   // bright pass + 2× separable blur at quarter res
    const A = PFX.A, B = PFX.B; gl.viewport(0, 0, A.w, A.h);
    gl.useProgram(P.bright.p); gl.bindFramebuffer(gl.FRAMEBUFFER, A.f); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, PFX.scene); gl.uniform1i(P.bright.u.t, 0); gl.uniform1f(P.bright.u.th, ultOn ? .6 : .74); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.useProgram(P.blur.p); gl.uniform1i(P.blur.u.t, 0);
    const its = PFX.q >= 2 ? 2 : 1;
    for (let i = 0; i < its; i++) {
      const s = 1 + i * 1.6;
      gl.bindFramebuffer(gl.FRAMEBUFFER, B.f); gl.bindTexture(gl.TEXTURE_2D, A.t); gl.uniform2f(P.blur.u.d, s / A.w, 0); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, A.f); gl.bindTexture(gl.TEXTURE_2D, B.t); gl.uniform2f(P.blur.u.d, 0, s / A.h); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cw, ch);
  const F = P.fin; gl.useProgram(F.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, PFX.scene); gl.uniform1i(F.u.t, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, PFX.A.t); gl.uniform1i(F.u.b, 1); gl.activeTexture(gl.TEXTURE0);
  gl.uniform1f(F.u.asp, W / H); gl.uniform1f(F.u.q, PFX.q >= 1 ? 1 : 0); gl.uniform1f(F.u.bloom, bloomAmt);
  gl.uniform1f(F.u.ca, PFX.ca); gl.uniform1f(F.u.rad, PFX.radial); gl.uniform2f(F.u.rc, PFX.rcx, 1 - PFX.rcy);
  gl.uniform1f(F.u.imp, PFX.impact > 0 ? (PFX.impact > 45 ? 1 : .4) : 0); gl.uniform3f(F.u.irgb, PFX.impRgb[0], PFX.impRgb[1], PFX.impRgb[2]);
  const wv = new Float32Array(24);
  PFX.waves.forEach((w, i) => { const s = w2s(w.x, w.y), u = w.t / w.life; wv.set([s[0] / W, 1 - s[1] / H, u * (.25 + .25 * w.amp), w.amp * (1 - u) * (1 - u)], i * 4); });
  gl.uniform4fv(F.u.wv, wv);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  // decay (real time, so hitstop/slow-mo freezes still read)
  for (const w of PFX.waves) w.t += k * (G.hitstop > 0 ? .35 : 1); PFX.waves = PFX.waves.filter(w => w.t < w.life);
  PFX.ca *= Math.pow(.8, k); if (PFX.ca < .01) PFX.ca = 0;
  PFX.radial *= Math.pow(.84, k); if (PFX.radial < .01) PFX.radial = 0;
  PFX.bloomBoost *= Math.pow(.9, k);
  PFX.impact = Math.max(0, PFX.impact - dtMs);
}

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
  sakura: { id: 'sakura', name: 'SAKURA', role: '設計図・竜召喚', c1: '#ff9ec4', c2: '#e8c25a', rgb: '255,158,200', rgb2: '232,194,90', speed: 5.0, jump: -24.5, anchor: .55, hurtW: 47, hurtH: 279, exName: 'アイディア・ドラゴン', ultName: 'ドラフト・ノヴァ' },
  // MIO-07: android painter of IF TOKYO 2099. Fights with the giant brush "Kibou-fude" and paint; her ULT paints a giant blue paint hound into being
  mio: { id: 'mio', name: 'MIO-07', role: '巨大筆・絵具', c1: '#9acfff', c2: '#ff688a', rgb: '120,190,255', rgb2: '255,104,138', speed: 5.3, jump: -24.8, anchor: .55, hurtW: 54, hurtH: 300, exName: 'ブルー・ストローク', ultName: 'キャンバス・ハウンド' },
  // ARIA ÉCLUSE (GRAVITY TOKYO): 17-year-old sky-runner mechanic. Wrench + boot-thruster kicks, wire launcher, gravity-control choker
  aria: { id: 'aria', name: 'ARIA', role: 'ワイヤー・重力制御', c1: '#e8a85a', c2: '#3fd0e0', rgb: '240,170,90', rgb2: '70,210,225', speed: 6.0, jump: -26.0, anchor: .55, hurtW: 52, hurtH: 270, exName: 'グラビティ・スリング', ultName: 'ルナ・サテライト・レイ' },
  // ENJO 煙女 (UKIYO): the gambling house's mistress. Elegant and slow herself — her smoke, her floating brass skull and her
  // summoned beasts (GASHIRA the skull-scaled lion, RINDO the black mechanical dragon) do the violent work
  enjo: { id: 'enjo', name: 'ENJO', role: '煙管・召喚の胴元', c1: '#5fd3bc', c2: '#c9a24a', rgb: '95,211,188', rgb2: '201,162,74', speed: 4.6, jump: -23.5, anchor: .55, hurtW: 50, hurtH: 285, exName: '骸獅子・ガシラ', ultName: '浮世斬・リンドウ' },
  // REI 月白 零 "THE LAST TEAR" (UKIYO): half-cyborg swordswoman with KOKUSHOKU-HIGAN, a 3m mechanical odachi that is really
  // the coffin of an ink dragon. Every full deployment costs her one tear of blood
  rei: { id: 'rei', name: 'REI', role: '大太刀・墨龍', c1: '#e8463c', c2: '#e9e4d8', rgb: '232,70,60', rgb2: '233,228,216', speed: 5.0, jump: -24.0, anchor: .55, hurtW: 50, hurtH: 280, exName: '顎門・砲哮', ultName: '墨龍・彼岸' }
};
const ALT = {
  suzune: { c1: '#7fd8ff', c2: '#4f7bff', rgb: '130,215,255', rgb2: '90,120,255', test: (h, s, l) => (h > 33 && h < 64 && s > .3) || ((h < 12 || h > 340) && s > .55), shift: 175 },
  aoi: { c1: '#ff7aa8', c2: '#ffb347', rgb: '255,120,170', rgb2: '255,180,80', test: (h, s, l) => h > 175 && h < 300 && s > .25, shift: 150 },
  arca: { c1: '#ffb347', c2: '#5a8cff', rgb: '255,180,70', rgb2: '90,140,255', test: (h, s, l) => (h < 16 || h > 335) && s > .35 && l > .12, shift: 215 },
  sakura: { c1: '#7fe0d0', c2: '#9aa8ff', rgb: '120,225,210', rgb2: '150,170,255', test: (h, s, l) => (h > 300 || h < 20) && s > .2, shift: 170 },
  mio: { c1: '#ffb15a', c2: '#7ad7a0', rgb: '255,170,80', rgb2: '110,215,160', test: (h, s, l) => h > 185 && h < 250 && s > .22, shift: 190 },
  aria: { c1: '#7fd0ff', c2: '#ff7a9a', rgb: '130,200,255', rgb2: '255,120,150', test: (h, s, l) => h > 15 && h < 50 && s > .25, shift: 180 },
  enjo: { c1: '#c99aff', c2: '#e0e0e8', rgb: '200,150,255', rgb2: '224,224,232', test: (h, s, l) => h > 145 && h < 200 && s > .18, shift: 120 },
  rei: { c1: '#5ab8ff', c2: '#e9e4d8', rgb: '90,184,255', rgb2: '233,228,216', test: (h, s, l) => (h < 20 || h > 340) && s > .3, shift: 205 }
};
const GFX = {};
async function buildAssets() {
  const A = window.ASSETS;
  const [su, ao, drone, suci, aoci, ar, arci, arp, sa, saci, mi, mici, ari, arici, en, enci, ensk, re, reci] = await Promise.all([A.su, A.ao, A.drone, A.suci, A.aoci, A.ar, A.arci, A.arp, A.sa, A.saci, A.mi, A.mici, A.ar2, A.ar2ci, A.en, A.enci, A.enskull, A.re, A.reci].map(p => track(loadImg(p))));
  const base = { suzune: { img: su, ci: suci }, aoi: { img: ao, ci: aoci }, arca: { img: ar, ci: arci }, sakura: { img: sa, ci: saci }, mio: { img: mi, ci: mici }, aria: { img: ari, ci: arici }, enjo: { img: en, ci: enci }, rei: { img: re, ci: reci } };
  GFX.arcaPilot = arp; GFX.skull = ensk; GFX.skullAlt = null;
  GFX.skullAltLazy = () => GFX.skullAlt || (GFX.skullAlt = recolor(ensk, ALT.enjo.test, ALT.enjo.shift));
  for (const id of ['suzune', 'aoi', 'arca', 'sakura', 'mio', 'aria', 'enjo', 'rei']) {
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
const RESIZE = { suzune: .9, aoi: .9, sakura: .9, enjo: 1.15, rei: 1.15 };   // ENJO / REI enlarged 2026-10-05; their summoned beasts keep their size   // 2026-10-04: these three trimmed to sit with the rest of the roster (sprite + hit/hurt boxes + attach points)
const RS = f => RESIZE[f.id] || 1;
const CHAR_SCALE = { suzune: .92, aoi: 1.07, arca: 625 / 318, sakura: 1.2, mio: 1.22, aria: .95, enjo: 1.0, rei: 1.0 };   // AOI stands taller; SUZUNE fights from a low crouch
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
  const AN = { k: DH / meta.storeH * (CHAR_SCALE[id] || 1) * (RESIZE[id] || 1), a: {}, fps: {}, atlases: [], alt: [], altBusy: false, cutBox: meta.cutinBox || [564, 420], dragonK: meta.dragonK || 1 };
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
      if (f.id === 'mio') return f.dashDir === f.face ? loop('walk', 26) : at('guard', 0);
      if (f.id === 'enjo') return loop('idle', AN.fps.idle || 8);   // she dissolves into smoke and re-forms (drawn faint)
      if (a.dash) return f.dashDir === f.face ? prog('dash', t / DASH.len) : at('guard', 0);
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
      if (f.id === 'aria') {
        if (m.key === 'a') { const n = ['a1', 'a2', 'a3'][Math.min(2, f.chain)]; return prog(a[n] ? n : 'a', p); }
        if (m.key === 'b' || m.key === 'ex') { const z = m.zip; if (!z || z.phase === 'wind') return prog('b', Math.min(.55, t / Math.max(1, m.st) * .55)); if (z.phase === 'fire') return prog('b', .55 + .45 * Math.min(1, z.ft / 6)); if (z.phase === 'zip') return loop('ex', AN.fps.ex || 18); if (z.phase === 'turn') return at('b', 99); return at('jump', 2); }
        if (m.key === 'ult') { const u = t - m.st, U = ARIA_ULT; if (u < U.fire) return loop('ultCharge', AN.fps.ultCharge || 10); return prog('ultFire', Math.min(1, (u - U.fire) / 30)); }
      }
      if (f.id === 'enjo') {
        if (m.key === 'a') { const n = ['a1', 'a2', 'a3'][Math.min(2, f.chain)]; return prog(a[n] ? n : 'a', p); }
        if (m.key === 'b') return prog('b', p);
        if (m.key === 'ex') { const L = m.st + 22; return t < L ? prog('ex', t / L) : loop('idle', AN.fps.idle || 8); }   // exhale, then she just watches GASHIRA work
        if (m.key === 'ult') { const u = t - m.st; if (u < ENJO_ULT.rise) return loop('ultCharge', AN.fps.ultCharge || 10); return prog('ultFire', Math.min(1, (u - ENJO_ULT.rise) / 30)); }
      }
      if (f.id === 'rei') {
        if (m.key === 'a') { const n = ['a1', 'a2', 'a3'][Math.min(2, f.chain)]; return prog(a[n] ? n : 'a', p); }
        if (m.key === 'b') return prog('b', p);
        if (m.key === 'ex') return prog('ex', p);   // blade opens into the cannon, fires, recoils, folds back
        if (m.key === 'ult') { const u = t - m.st; if (u < ENJO_ULT.rise) return loop('ultCharge', AN.fps.ultCharge || 10); return prog('ultFire', Math.min(1, (u - ENJO_ULT.rise) / 30)); }
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
    getup: ['mi_10'], ko: ['mi_11'], ex: ['mi_12'], ult: ['mi_13'], select: ['mi_14'], round: ['mi_15'], winMovie: ['mi_16'], win: ['mi_17'], lose: ['mi_18'] },
  aria: { a0: ['ai_01', 'ai_03'], a1: ['ai_02'], a2: ['ai_04'], b: ['ai_05'], jump: ['ai_06'], guard: ['ai_07'], hit: ['ai_08'], hitBig: ['ai_09'],
    getup: ['ai_10'], ko: ['ai_11'], ex: ['ai_12'], ult: ['ai_13'], select: ['ai_14'], round: ['ai_15'], winMovie: ['ai_16'], win: ['ai_17'], lose: ['ai_18'] },
  enjo: { a0: ['en_01', 'en_03'], a1: ['en_02'], a2: ['en_04'], b: ['en_05'], jump: ['en_06'], guard: ['en_07'], hit: ['en_08'], hitBig: ['en_09'],
    getup: ['en_10'], ko: ['en_11'], ex: ['en_12'], ult: ['en_13'], select: ['en_14'], round: ['en_15'], winMovie: ['en_16'], win: ['en_17'], lose: ['en_18'] },
  rei: { a0: ['re_01', 're_03'], a1: ['re_02'], a2: ['re_04'], b: ['re_05'], jump: ['re_06'], guard: ['re_07'], hit: ['re_08'], hitBig: ['re_09'],
    getup: ['re_10'], ko: ['re_11'], ex: ['re_12'], ult: ['re_13'], select: ['re_14'], round: ['re_15'], winMovie: ['re_16'], win: ['re_17'], lose: ['re_18'] }
};
const VOICE = { buf: {}, gain: null, last: {} };
// BGM ducking bus: music dips while a character is speaking so lines cut through
function duckNode(ac) { if (!SND.duck) { SND.duck = ac.createGain(); SND.duck.connect(ac.destination); } return SND.duck; }
function duckFor(t0, dur) {
  const ac = SND.ac, g = duckNode(ac).gain;
  if (MOVIE_AUDIO.src && MOVIE_AUDIO.gain) {   // the ULT score steps back while a line is spoken over it
    const mg = MOVIE_AUDIO.gain.gain; mg.cancelScheduledValues(t0); mg.setValueAtTime(mg.value, t0);
    mg.linearRampToValueAtTime(MOVIE_GAIN * .45, t0 + .06); mg.setValueAtTime(MOVIE_GAIN * .45, t0 + dur); mg.linearRampToValueAtTime(MOVIE_GAIN, t0 + dur + .3);
  } g.cancelScheduledValues(t0); g.setValueAtTime(g.value, t0);
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
    VOICE.gain = ac.createGain(); VOICE.gain.gain.value = 3.1;
    const c = ac.createDynamicsCompressor(); c.threshold.value = -9; c.knee.value = 4; c.ratio.value = 14; c.attack.value = .002; c.release.value = .16;
    const mk = ac.createGain(); mk.gain.value = 1.3; VOICE.gain.connect(c); c.connect(mk); mk.connect(ac.destination);
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
// rising rumble under the ULT cutscene: low growl + noise sweeping up, cut dead at the end
function ultRiser(dur) {
  const ac = SND.ac, bus = loudBus(); if (!ac || !SND.on || !bus) return;
  const t = ac.currentTime;
  if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const n = ac.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
  const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6; f.frequency.setValueAtTime(70, t); f.frequency.exponentialRampToValueAtTime(2400, t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.55, t + dur * .85); g.gain.setValueAtTime(.55, t + dur - .03); g.gain.linearRampToValueAtTime(0, t + dur);
  n.connect(f); f.connect(g); g.connect(bus); n.start(t); n.stop(t + dur + .05);
  const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(38, t); o.frequency.exponentialRampToValueAtTime(96, t + dur);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
  const g2 = ac.createGain(); g2.gain.setValueAtTime(.0001, t); g2.gain.exponentialRampToValueAtTime(.45, t + dur * .9); g2.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(lp); lp.connect(g2); g2.connect(bus); o.start(t); o.stop(t + dur + .05);
  SND.riser = [n, o];
}
function killRiser() { (SND.riser || []).forEach(x => { try { x.stop(); } catch (e) { } }); SND.riser = null; }
// the release: sub thump + blast + ringing ears
function ultBlast(big = 1) {
  const ac = SND.ac, bus = loudBus(); if (!ac || !SND.on || !bus) return;
  const t = ac.currentTime;
  const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(28, t + .9);
  const g = ac.createGain(); g.gain.setValueAtTime(1.1 * big, t); g.gain.exponentialRampToValueAtTime(.001, t + 1.1); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 1.2);
  const r = ac.createOscillator(); r.type = 'sine'; r.frequency.setValueAtTime(3300, t); r.frequency.linearRampToValueAtTime(3000, t + 1.6);
  const rg = ac.createGain(); rg.gain.setValueAtTime(.0001, t); rg.gain.linearRampToValueAtTime(.06 * big, t + .05); rg.gain.exponentialRampToValueAtTime(.0005, t + 1.8); r.connect(rg); rg.connect(bus); r.start(t); r.stop(t + 1.9);
  playLoud('impact_big', 1.2 * big, .78); playLoud('impact_big', .8 * big, 1.15, .06); playLoud('beam', .7 * big, .8);
}
function playLoud(name, vol = 1, rate = 1, delay = 0) {
  const ac = SND.ac, b = SFXB.buf[name], bus = loudBus(); if (!ac || !b || !bus || !SND.on) return false;
  const s = ac.createBufferSource(), g = ac.createGain(); s.buffer = b; s.playbackRate.value = rate; g.gain.value = vol;
  s.connect(g); g.connect(bus); s.start(ac.currentTime + delay); return true;
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
// LOUD bus: cutscene scores and ULT impacts, boosted then limited so they hit hard without clipping
function loudBus() {
  const ac = SND.ac; if (!ac) return null;
  if (!SND.loud) {
    SND.loud = ac.createGain(); SND.loud.gain.value = 1;
    const c = ac.createDynamicsCompressor(); c.threshold.value = -6; c.knee.value = 3; c.ratio.value = 16; c.attack.value = .002; c.release.value = .2;
    SND.loud.connect(c); c.connect(ac.destination);
  }
  return SND.loud;
}
const MOVIE_GAIN = 2.1;   // ~+6.5 dB over the old level
function movieAudio(name) {
  const ac = SND.ac, b = MOVIE_AUDIO.buf[name]; stopMovieAudio(); if (!ac || !b || !SND.on) return !!b;
  if (!MOVIE_AUDIO.gain) { MOVIE_AUDIO.gain = ac.createGain(); MOVIE_AUDIO.gain.connect(loudBus()); }
  { const g = MOVIE_AUDIO.gain.gain, t = ac.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(MOVIE_GAIN, t); }
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
  cam: { x: STAGE_W / 2, z: 1, shake: 0, kick: 0, tilt: 0, push: 0 }, hitstop: 0, slow: 1, slowT: 0, flash: 0, flashCol: '255,255,255', freeze: 0, cutin: null,
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
function fxRing(x, y, rgb, r0, r1, life = 20, w = 6, sy = 1) { addFx({ k: 'ring', x, y, rgb, r0, r1, life, t: 0, w, sy }); if (r1 >= 450 && G.frame - (PFX.ringF || -99) > 10) { PFX.ringF = G.frame; pfxWave(x, y, Math.min(2, r1 / 400), 40); } }
function fxArc(x, y, r, a0, a1, rgb, face, life = 18, w = 40) { addFx({ k: 'arc', x, y, r, a0, a1, rgb, face, life, t: 0, w }); }
function fxPetals(x, y, n = 10, pw = 1, red = false) { for (let i = 0; i < n; i++) addFx({ k: 'petal', x, y, vx: rnd(-6, 6) * pw, vy: rnd(-9, -1) * pw, rot: rnd(0, TAU), vr: rnd(-.3, .3), life: rnd(50, 90), t: 0, s: rnd(5, 9) * (red ? 1.25 : 1), red }); }
// ENJO's smoke: soft puffs that swell, drift up and thin out (normal blend, so it reads as smoke rather than light)
function fxSmoke(x, y, n = 6, pw = 1, dir = 0, rgb = JADE.rgb) {
  for (let i = 0; i < n; i++) { const a = dir ? (dir > 0 ? 0 : Math.PI) + rnd(-.9, .9) : rnd(0, TAU), sp = rnd(1, 5) * pw;
    addFx({ k: 'smoke', x: x + rnd(-10, 10), y: y + rnd(-10, 10), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rnd(.5, 1.5), r: rnd(14, 30) * Math.min(1.8, pw), grow: rnd(.8, 1.6), rgb, life: rnd(34, 60), t: 0 }); }
}
function fxDust(x, y, n = 8, pw = 1) { for (let i = 0; i < n; i++) addFx({ k: 'dust', x: x + rnd(-30, 30), y: y - 4, vx: rnd(-5, 5) * pw, vy: rnd(-2.5, -.2) * pw, life: rnd(22, 40), t: 0, r: rnd(10, 26) * pw }); }
function fxText(x, y, txt, rgb, size = 40, life = 50) { addFx({ k: 'text', x, y, txt, rgb, size, life, t: 0 }); }
function fxHex(x, y, rgb, face) { addFx({ k: 'hex', x, y, rgb, face, life: 18, t: 0 }); }
/* SF-mecha energy colours: SUZUNE gold / AOI blue (mirror-match colour swaps keep their own palette) */
const AURA = { suzune: { rgb: '255,196,64', hot: '255,244,200' }, aoi: { rgb: '64,168,255', hot: '205,240,255' }, arca: { rgb: '46,230,200', hot: '215,255,245' }, sakura: { rgb: '255,150,200', hot: '255,236,246' }, mio: { rgb: '110,180,255', hot: '232,246,255' }, aria: { rgb: '245,165,70', hot: '255,240,205' }, enjo: { rgb: '95,211,188', hot: '225,255,246' }, rei: { rgb: '232,70,60', hot: '255,214,200' } };
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
  if (a < .3) { if (cv.style.transform) { cv.style.transform = ''; if (PFX.c) PFX.c.style.transform = ''; } return; }
  const dx = rnd(-a, a), dy = rnd(-a, a) * .8, r = rnd(-a, a) * .045, sc = 1 + a / 300;
  cv.style.transform = `translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px) rotate(${r.toFixed(2)}deg) scale(${sc.toFixed(3)})`; if (PFX.on) PFX.c.style.transform = cv.style.transform;
}
function flash(a, rgb = '255,255,255') { if (a >= G.flash) { G.flash = a; G.flashCol = rgb; } }
function slowmo(s, frames) { G.slow = s; G.slowT = frames; }
function zoomKick(v) { G.cam.kick = Math.max(G.cam.kick, v); PFX.radial = Math.max(PFX.radial, v * 4); }

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
    else if (f.k === 'smoke') { f.x += f.vx * dt; f.y += f.vy * dt; f.vx *= Math.pow(.94, dt); f.vy = f.vy * Math.pow(.95, dt) - .03 * dt; f.r += f.grow * dt; }
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
      else if (f.k === 'wire') {
        ctx.lineCap = 'round'; ctx.strokeStyle = `rgba(${BRASS.teal},${a * .6})`; ctx.lineWidth = 9 * a; ctx.beginPath(); ctx.moveTo(f.x0, f.y0); ctx.lineTo(f.x1, f.y1); ctx.stroke();
        ctx.strokeStyle = `rgba(255,240,210,${a})`; ctx.lineWidth = 2.4; ctx.stroke();
      }
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
        ctx.fillStyle = f.red ? '#c8202a' : '#ffd3e0'; ctx.beginPath(); ctx.ellipse(0, 0, f.s, f.s * (f.red ? .32 : .55), 0, 0, TAU); ctx.fill();   // spider-lily petals are long and thin
        ctx.fillStyle = f.red ? '#ff5a4a' : '#ff9ab8'; ctx.beginPath(); ctx.ellipse(f.s * .3, 0, f.s * .35, f.s * .2, 0, 0, TAU); ctx.fill();
        ctx.restore(); ctx.globalAlpha = 1;
      } else if (f.k === 'smoke') {
        const al = Math.min(1, f.t / 5) * a * a, g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
        g.addColorStop(0, `rgba(${f.rgb},${al * .42})`); g.addColorStop(.6, `rgba(${f.rgb},${al * .18})`); g.addColorStop(1, `rgba(${f.rgb},0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
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
function hurt(f) { const r = RS(f), w = (f.ch.hurtW || 58) * r, h = (f.ch.hurtH || 280) * r; return { x0: f.x - w, x1: f.x + w, y0: f.y - h, y1: f.y }; }
function overlap(a, b) { return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0; }
function box(f, x0, x1, y0, y1) { const r = RS(f); x0 *= r; x1 *= r; y0 *= r; y1 *= r; const a = f.x + f.face * x0, b = f.x + f.face * x1; return { x0: Math.min(a, b), x1: Math.max(a, b), y0: f.y + y0, y1: f.y + y1 }; }

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
  rei: {
    a: { st: 6, act: 5, rec: 13, cost: 0 },
    b: { st: 14, act: 6, rec: 22, cost: 0 },
    ex: { st: 20, act: 10, rec: 26, cost: 50 },
    ult: { st: 0, act: 230, rec: 30, cost: 100 }
  },
  enjo: {
    a: { st: 5, act: 4, rec: 12, cost: 0 },
    b: { st: 12, act: 4, rec: 20, cost: 0 },
    ex: { st: 14, act: 120, rec: 14, cost: 50 },
    ult: { st: 0, act: 230, rec: 30, cost: 100 }
  },
  aria: {
    a: { st: 4, act: 4, rec: 11, cost: 0 },
    b: { st: 8, act: 200, rec: 14, cost: 0 },
    ex: { st: 9, act: 200, rec: 14, cost: 50 },
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
  if (key === 'ult') { startUlt(f); voice(f, 'ult', { delay: .15 }); }
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
  if (!exMovieStart(f)) { G.freeze = 78; G.cutin = { f, t: 0 }; flash(.6, f.col.rgb); G.ultMono = 150; ultRiser(1.3); }   // fallback: in-canvas cut-in
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
    G.hitstop = Math.max(G.hitstop, 4); shake(4); sfx.guard(); pfxKick({ ca: o.ult ? 1.2 : .45 }); voice(tgt, 'guard', { p: .5, cd: 240 });
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
  if (att.id === 'suzune') fxPetals(hx, hy, 3 + 4 * pw, pw); else if (att.id === 'mio') fxPaint(hx, hy, 6 + 6 * pw, .8 + .3 * pw, fromDir); else if (att.id === 'aria') fxGears(hx, hy, 4 + 4 * pw, pw, fromDir); else if (att.id === 'enjo') fxSmoke(hx, hy, 3 + 3 * pw, pw, fromDir, att.col.rgb); else if (att.id === 'rei') { fxSmoke(hx, hy, 2 + 2 * pw, pw, fromDir, JADE.ink); fxPetals(hx, hy, 1 + 2 * pw, pw, !att.alt); } else fxHex(hx, hy, att.col.rgb, fromDir);
  G.hitstop = Math.max(G.hitstop, o.hitstop || (4 + 4 * pw)); shake(4 + 7 * pw);
  if (pw >= 1.4 || o.launch) { quake(3 + 5 * pw, .28 + .12 * pw, pw >= 2 ? 60 : 25); fxBig(hx, hy, auraRgb(att), auraHot(att), Math.max(1.4, pw), fromDir); }
  if (pw >= 2) flash(.35 * pw / 2, '255,230,200');
  pfxKick({ ca: Math.min(2.6, .35 + pw * .55) });                                    // colour split on every clean hit
  if (pw >= 1.3 || o.launch) { pfxWave(hx, hy, Math.min(2, .45 + pw * .4), 26 + 6 * pw); G.cam.push += fromDir * Math.min(40, 10 + 10 * pw); }
  if (pw >= 2.2 && !o.ult) pfxKick({ impact: 70, rgb: auraHot(att) });
  sfx.hit(pw);
  if (o.ult) {
    playLoud('impact_big', .55 + .25 * Math.min(2, pw), rnd(.85, 1.05));
    if (pw >= 2.3 || tgt.hp <= 0) {   // ULT finisher
      ultBlast(1.15); flash(1, auraHot(att)); G.speedlines = 60; zoomKick(.14); G.ultMono = 0;
      pfxWave(tgt.x, tgt.y - 150, 2.2, 46); pfxKick({ radial: 1.7, x: tgt.x, y: tgt.y - 150, impact: 95, rgb: auraHot(att), bloom: .8, ca: 3.4 });
      addFx({ k: 'pillar', x: tgt.x, y: GROUND, rgb: auraRgb(att), hot: auraHot(att), life: 50, t: 0, w: 260 });
      fxRing(tgt.x, GROUND - 4, auraRgb(att), 30, 620, 40, 14, .25); fxText(tgt.x, tgt.y - 420, 'FINISH!', auraHot(att), 60, 60);
    }
  }
  if (tgt.id === 'arca') playS('arca_armor', .55, rnd(.9, 1.1));         // the ARSENAL's armour rings when struck
  else if (att.id === 'arca' && pw >= .9) playS('arca_armor', .3, 1.3);   // steel-on-body crunch for its blade hits
  if (tgt.combo >= 2) comboHit(att, tgt);
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
  else if (f.id === 'aria') updateAriaMove(f, o, m, t, k, act, at, dt, first);
  else if (f.id === 'enjo') updateEnjoMove(f, o, m, t, k, act, at, dt, first);
  else if (f.id === 'rei') updateReiMove(f, o, m, t, k, act, at, dt, first);
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
function sakuraTip(f) { const r = RS(f); return { x: f.x + f.face * 140 * r, y: f.y - 243 * r }; }
// ULT: her blueprint beam and the dragon's breath converge here, then fire as one braided beam
function sakuraFocus(f) { const r = RS(f); return { x: f.x + f.face * 396 * r, y: f.y - 220 * r }; }
function updateSakuraMove(f, o, m, t, k, act, at, dt, first) {
  const rgb = f.col.rgb, gold = f.col.rgb2, tip = sakuraTip(f);
  if (k === 'a') {
    const c = Math.min(2, f.chain);
    if (t < m.st) f.vx *= .75;
    if (first(0)) {
      f.vx = f.face * [4, 6, 9][c];
      if (c === 1) fxArc(f.x + f.face * 95, f.y - 220, 110, -1.6, 1.1, rgb, f.face, 18, 34);
      else { fxRing(tip.x, tip.y, gold, 4, 46, 10, 4); fxCore(tip.x, tip.y, rgb, 40, 8); }
      if (c === 2) { spawnBolt(f, tip.x, tip.y, f.face * 24, 0, 5, 'bolt'); sfx.laser(); fxRing(tip.x + f.face * 30, tip.y, rgb, 6, 70, 12, 5, 2.4); }
      else sfx.swing();
    }
    if (act) tryHit(f, o, box(f, 23, c === 1 ? 234 : 207, -293, -110), { dmg: [4, 4.5, 5][c], kb: [3, 4, 9][c], stun: [15, 16, 20][c], power: [.7, .8, 1.2][c], launch: c === 2 ? -8 : 0 });
  } else if (k === 'b') {
    if (t < m.st) { f.vx *= .7; f.charge = t / m.st; if ((t | 0) % 2 === 0) fxSpark(tip.x, tip.y, gold, 2, .4); }
    if (first(0)) {   // blueprint compass-rose disc flung forward
      G.proj.push({ owner: f, x: tip.x, y: tip.y, vx: f.face * 17, vy: 0, dmg: 8, type: 'rail', pw: 1.3, kb: 11, life: 90, t: 0, trail: [], rgb: gold });
      f.vx = -f.face * 4; f.charge = 0; shake(4);
      for (let i = 0; i < 3; i++) fxRing(tip.x, tip.y, i ? rgb : '255,255,255', 6, 60 + i * 26, 14, 5, 2.4);
      sfx.heavySwing();
    }
  } else if (k === 'ex') {
    if (t < m.st) { f.vx = 0; f.charge = t / m.st; if ((t | 0) % 2 === 0) fxSpark(f.x, f.y - 411 * RS(f), gold, 3, .5); if ((t | 0) % 6 === 0) fxRing(f.x - f.face * 44, f.y - 470 * RS(f), rgb, 20, 147, 16, 3, .3); }
    if (first(0)) { summonDragon(f, o, 'swoop'); f.charge = 0; }
  } else if (k === 'ult') {
    if (first(0)) summonDragon(f, o, 'ult');
    updateAoiUlt(f, o, at, dt, first);   // shared beam logic; the beam starts where her line and the dragon's breath meet
    if (f.move && f.move.beam && (at | 0) % 3 === 0) { const c = sakuraFocus(f); fxRing(c.x, c.y, (at | 0) % 2 ? f.col.rgb2 : f.col.rgb, 20, 160, 12, 6, .5); }
  }
}
const DRAGON = { mx: 300, my: -24 };   // jaw position relative to the dragon's body centre in source sprite px (facing right)
const dragonScale = f => { const AN = ANIMS[f.id]; return AN ? AN.k * AN.dragonK / RS(f) : .9; };   // the dragon keeps its size
function summonDragon(f, o, mode) {
  const back = -f.face;
  f.dragon = mode === 'swoop'
    ? { mode, t: 0, face: f.face, x: f.x + back * 700, y: f.y - 514, x0: f.x + back * 700, x1: o.x + f.face * 1000, hits: 0, next: 0 }
    : { mode, t: 0, face: f.face, x: f.x + back * 900, y: f.y - 662, hits: 0, next: 0 };
  fxRing(f.x, f.y - 470, f.col.rgb2, 30, 320, 24, 8, .3); fxCore(f.x, f.y - 470, f.col.rgb, 200, 18); flash(.35, f.col.rgb);
  playS('special_start', .5, 1.3); shake(6);
}
function updateDragon(f, o, dt) {
  const d = f.dragon; if (!d) return;
  d.t += dt;
  if (d.mode === 'swoop') {
    const L = 46, q = Math.min(1, d.t / L);
    const px = d.x, py = d.y;
    d.x = lerp(d.x0, d.x1, q); d.y = f.y - 514 + Math.sin(q * Math.PI) * 441;   // arc dives through the opponent and climbs away
    if (d.t > dt) d.rot = lerp(d.rot || 0, Math.atan2(d.y - py, Math.abs(d.x - px) + .01), .35);
    if (q < .9 && d.hits < 4 && d.t >= d.next && G.phase === 'fight') {   // wide body + wing + claw hitbox
      const hb = { x0: d.x - 249, x1: d.x + 249, y0: d.y - 220, y1: d.y + 220 };
      if (overlap(hb, hurt(o))) { d.hits++; d.next = d.t + 7; const fin = d.hits === 4; hitTarget(f, o, { dmg: fin ? 7 : 4, kb: fin ? 14 : 4, stun: 22, power: fin ? 1.9 : 1.1, launch: fin ? -13 : 0, hy: clamp(o.y - d.y, 60, 260) }); fxArc(d.x, d.y + 40, 220, -1.8, 1.4, f.col.rgb, d.face, 18, 34); }
    }
    if ((d.t | 0) % 2 === 0) addFx({ k: 'streak', x: d.x - d.face * 160, y: d.y + rnd(-60, 60), vx: -d.face * 14, vy: 0, life: 14, t: 0, rgb: f.col.rgb, w: 4 });
    if (d.t > L + 10) f.dragon = null;
  } else if (d.mode === 'ult') {
    const tx = f.x + f.face * 125, ty = f.y - 316;   // hovers over her outstretched arm, both facing the foe
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
// ARIA ÉCLUSE: wrench strikes and boot-thruster kicks, a grappling wire that reels the foe in,
// GRAVITY SLING (EX: wire-slung low flying kick) and ZERO-GRAVITY DRIVE (ULT: the choker cuts gravity, she zips around the
// floating foe on her wire, then gravity comes back tenfold and slams them into the floor)
const BRASS = { hot: '255,200,120', glow: '245,165,70', teal: '70,210,225', wire: '210,190,150' };
function ariaHand(f) { return { x: f.x + f.face * 95, y: f.y - 170 }; }
function fxGears(x, y, n = 6, pw = 1, dir = 0) {   // brass sparks + tiny gear flecks
  fxSpark(x, y, BRASS.hot, n * 2, .7 + .3 * pw, dir);
  for (let i = 0; i < n; i++) { const a = dir ? (dir > 0 ? 0 : Math.PI) + rnd(-1.2, 1.2) : rnd(0, TAU), sp = rnd(5, 14) * pw;
    addFx({ k: 'shard', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rnd(2, 6), rot: rnd(0, TAU), vr: rnd(-.5, .5), s: rnd(4, 9), rgb: BRASS.glow, hot: BRASS.hot, life: rnd(22, 40), t: 0 }); }
}
function fxThrust(f, x, y, dir, n = 4) {   // boot thruster exhaust: hot core + teal streaks pushed behind her
  for (let i = 0; i < n; i++) addFx({ k: 'streak', x: x + rnd(-8, 8), y: y + rnd(-10, 10), vx: -dir * rnd(10, 22), vy: rnd(-2, 2), life: rnd(8, 14), t: 0, rgb: i % 2 ? BRASS.teal : BRASS.hot, w: rnd(2.5, 5) });
}
function fxWire(x0, y0, x1, y1, life = 10) { addFx({ k: 'wire', x0, y0, x1, y1, life, t: 0 }); }
function updateAriaMove(f, o, m, t, k, act, at, dt, first) {
  const hand = ariaHand(f);
  if (k === 'a') {
    const c = Math.min(2, f.chain);
    if (t < m.st) f.vx *= .75;
    if (first(0)) {
      f.vx = f.face * [6, 7, 13][c];
      if (c === 0) fxArc(f.x + f.face * 85, f.y - 150, 95, -.8, .8, f.col.rgb, f.face, 12, 22);
      else if (c === 1) fxArc(f.x + f.face * 80, f.y - 180, 110, 1.4, -1.5, f.col.rgb, f.face, 14, 26);
      else { fxArc(f.x + f.face * 100, f.y - 120, 150, 2.0, -1.0, f.col.rgb2, f.face, 16, 40); fxThrust(f, f.x - f.face * 20, f.y - 30, f.face, 10); playS('dash', .5, 1.4); }
      c === 2 ? sfx.kick() : sfx.swing();
    }
    if (c === 2 && act) fxThrust(f, f.x - f.face * 10, f.y - 40, f.face, 2);
    if (act) { const h = tryHit(f, o, box(f, 20, c === 2 ? 230 : 205, c === 1 ? -280 : -230, c === 2 ? -20 : -80), { dmg: [4, 4.5, 6.5][c], kb: [3, 4, 11][c], stun: [15, 16, 22][c], power: [.7, .85, 1.4][c], launch: c === 1 ? -6 : c === 2 ? -10 : 0 }); if (h) fxGears(o.x - f.face * 30, o.y - 150, 3, .8, f.face); }
  } else if (k === 'b' || k === 'ex') ariaWireDash(f, o, m, t, k, at, dt, first);
  else if (k === 'ult') updateAriaUlt(f, o, at, dt, first);
}
// WIRE DASH (special) / GRAVITY SLING (EX): fires her wire to the edge of the screen and rockets there, hitting everything on
// the way; on arrival she fires again at the opposite edge and crosses the whole screen a second time. The EX version
// hits several times per pass and drags the foe along in her gravity wake.
const ARIA_LINE = 70;   // height of the straight wire dash above the floor
const ARIA_SKY = 360;   // EX: how high the sky corner sits above the floor
function screenEdge(dir) { const half = W / 2 / (G.cam.z || 1); return clamp(G.cam.x + dir * (half - 95), 90, STAGE_W - 90); }
// WIRE DASH (special): one wire to the screen edge and a dead-straight, low dash there — then it ends.
// SKY SLING (EX "GRAVITY SLING"): a visibly different move — she shoots the wire up to the far sky corner and flies a straight
// diagonal up into the air, then fires again at the opposite edge and dives back down across the screen in a straight
// diagonal, wrapped in a gold/teal comet with sonic-boom rings, a burning trail and a landing blast.
function ariaWireDash(f, o, m, t, k, at, dt, first) {
  const EX = k === 'ex', z = m.zip || (m.zip = { pass: 0, phase: 'wind', ft: 0, hit: 0, multi: EX ? 3 : 1, next: 0 });
  const startPass = () => {
    z.dir = z.pass === 0 ? f.face : -z.dir; z.tx = screenEdge(z.dir);
    z.by = EX ? (z.pass === 0 ? GROUND - ARIA_SKY : GROUND) : GROUND - ARIA_LINE;   // where her feet arrive
    z.ty = z.by - 150; z.phase = 'fire'; z.ft = 0; z.hit = 0; z.next = 0; z.x0 = f.x; z.y0 = f.y;
    f.face = z.dir; const h = ariaHand(f); fxWire(h.x, h.y, z.tx + z.dir * 60, z.ty, 14); fxGears(z.tx + z.dir * 60, z.ty, 6, .9, -z.dir);
    playS('laser_shot', .55, EX ? .55 : .7); sfx.dash();
    if (EX) { flash(.35, BRASS.teal); fxRing(f.x, f.y - 140, BRASS.hot, 20, 260, 18, 8); fxThrust(f, f.x - z.dir * 20, f.y - 30, z.dir, 12); }
  };
  if (z.phase === 'wind') { f.vx *= .6; if (EX && (t | 0) % 2 === 0) fxRing(f.x, f.y - 140, BRASS.teal, 120, 20, 10, 4, 1); if (at >= 0) startPass(); return; }
  if (z.phase === 'land') { f.rot = 0; return; }   // drops back to the floor under normal gravity
  z.ft += dt; f.vx = 0; f.vy = -GRAV * dt;   // hangs on the wire: no gravity
  if (z.phase === 'fire') { if (z.ft >= (EX ? 5 : 4)) { z.phase = 'zip'; z.ft = 0; if (!EX) { f.y = z.by; z.y0 = z.by; }   // normal dash: snaps onto a flat line
    flash(EX ? .45 : .15, EX ? BRASS.hot : BRASS.teal); G.speedlines = EX ? 44 : 30; shake(EX ? 10 : 5); if (EX) { quake(10, .4, 40); playS('ult_start', .35, 1.6); } } return; }
  if (z.phase === 'zip') {
    const sp = EX ? 52 : 46, px = f.x, py = f.y, dx = z.tx - f.x, dy = z.by - f.y, L = Math.hypot(dx, dy), stp = Math.min(L, sp * dt);
    if (L > .01) { f.x += dx / L * stp; f.y += dy / L * stp; }   // dead-straight line to the target
    const ang = Math.atan2(z.by - z.y0, Math.abs(z.tx - z.x0) + .01); z.rot = EX ? ang : 0;
    const h = ariaHand(f); fxWire(h.x, h.y, z.tx + z.dir * 60, z.ty, 3);
    f.trail.push(1); f.rail.push({ x: f.x - z.dir * 30, y: f.y - 60, t: G.frame }); fxThrust(f, f.x - z.dir * 30, f.y - 50, z.dir, EX ? 5 : 3);
    const ux = (f.x - px) / (stp || 1), uy = (f.y - py) / (stp || 1);   // travel direction
    for (let i = 0; i < (EX ? 4 : 2); i++) addFx({ k: 'streak', x: f.x + rnd(-40, 40), y: f.y - rnd(20, 280), vx: -ux * rnd(20, 34), vy: -uy * rnd(20, 34), life: rnd(8, 14), t: 0, rgb: i % 2 ? BRASS.teal : f.col.rgb, w: rnd(1.5, 3.5) });
    if (EX) {   // comet: hot core, burning ribbon, sonic-boom rings, embers
      fxCore(f.x, f.y - 140, BRASS.hot, 120, 8);
      addFx({ k: 'wire', x0: px - ux * 60, y0: py - 140 - uy * 60, x1: f.x, y1: f.y - 140, life: 22, t: 0 });
      if (G.frame % 3 === 0) fxRing(f.x - ux * 40, f.y - 140 - uy * 40, (G.frame % 6) ? BRASS.teal : BRASS.hot, 30, 170, 12, 5, .45);
      for (let i = 0; i < 3; i++) addFx({ k: 'ember', x: f.x + rnd(-50, 50), y: f.y - rnd(60, 220), vx: -ux * rnd(2, 6), vy: -uy * rnd(2, 6) + rnd(-1, 1), life: rnd(30, 60), t: 0, rgb: i % 2 ? BRASS.hot : BRASS.teal });
      G.tintA = Math.max(G.tintA, .2); G.tintC = BRASS.glow;
    }
    G.speedlines = Math.max(G.speedlines, EX ? 18 : 10);
    // hitbox travels with her (swept so a fast pass never skips over the foe)
    const hb = { x0: Math.min(px, f.x) - 80, x1: Math.max(px, f.x) + 80, y0: Math.min(py, f.y) - 280, y1: Math.max(py, f.y) + 20 };
    if (z.hit < z.multi && z.ft >= z.next && G.phase === 'fight' && overlap(hb, hurt(o))) {
      z.hit++; z.next = z.ft + 4; const fin = (EX ? z.pass === 1 : true) && z.hit === z.multi;
      hitTarget(f, o, { dmg: EX ? 3.8 : 6, kb: fin ? 13 : 4, stun: 26, power: fin ? (EX ? 2.2 : 1.5) : 1.1, launch: fin ? -11 : 0, hy: clamp(o.y - f.y + 150, 60, 240), unblock: EX && z.hit > 1 });
      fxGears(o.x, o.y - 150, EX ? 10 : 6, 1.2, z.dir); fxArc(o.x, o.y - 150, 120, -1.2, 1.2, BRASS.teal, z.dir, 12, 30);
      if (EX) { fxBig(o.x, o.y - 150, BRASS.glow, BRASS.hot, 1.6, z.dir); if (!fin) { o.vx = z.dir * 20; o.vy = Math.min(o.vy, -6); } }   // gravity wake drags the foe along
    }
    if (L < 2) {   // arrived: anchor burst
      fxRing(f.x + z.dir * 50, f.y - 160, f.col.rgb, 20, 200, 18, 8); fxGears(f.x + z.dir * 60, f.y - 160, 8, 1.2, -z.dir); shake(7); quake(5, .25); playS('arca_armor', .4, 1.4);
      if (EX && z.pass === 0) { z.pass = 1; z.phase = 'turn'; z.ft = 0; f.face = -z.dir; fxBig(f.x, f.y - 160, BRASS.teal, BRASS.hot, 1.6, -z.dir); }
      else {
        z.phase = 'land'; z.ft = 0; f.vy = 4; f.t = m.st + m.act; z.rot = 0;
        if (EX) {   // dives into the floor: landing blast
          sfx.boom(); flash(.5, BRASS.hot); shake(16); quake(14, .6, 70);
          for (let r = 0; r < 3; r++) fxRing(f.x, GROUND - 6, r % 2 ? BRASS.teal : BRASS.hot, 30, 260 + r * 150, 24 + r * 6, 12 - r * 2, .22);
          fxDust(f.x, GROUND, 18, 1.8); fxGears(f.x, GROUND - 40, 14, 1.6); G.tintA = 0;
        }
      }
    }
    return;
  }
  if (z.phase === 'turn') { if (z.ft >= 3) startPass(); return; }   // fires the next wire at once
}
// ULT LUNA SATELLITE RAY: she calls the lunar satellite; the moon rises over the arena, a target lock follows the foe,
// then a colossal beam comes straight down from orbit and burns the floor before a final detonation.
const ARIA_ULT = { lock: 8, fire: 46, every: 6, last: 108, end: 126 };
const LUNA = { core: '235,250,255', blue: '120,200,255', violet: '170,150,255' };
function updateAriaUlt(f, o, at, dt, first) {
  const m = f.move, U = ARIA_ULT, live = o && !o.ko && o.hp > 0;
  if (first(0)) { f.vx = 0; sfx.charge(); G.luna = { t: 0, x: clamp(o.x, 120, STAGE_W - 120), on: false, f }; playS('special_start', .6, .6); }
  const L = G.luna; if (!L) return;
  L.t += dt; f.vx *= .7;
  if (live) L.x = lerp(L.x, o.x, L.on ? .05 : .12);   // the lock trails the foe; once firing it can barely keep up
  if (at < U.fire) {
    f.charge = at / U.fire;
    if ((at | 0) % 6 === 0) fxRing(L.x, GROUND - 4, LUNA.blue, 160, 30, 14, 4, .25);
    if ((at | 0) % 3 === 0) addFx({ k: 'bit', x: f.x + rnd(-40, 40), y: f.y - rnd(200, 320), vy: -rnd(6, 11), len: rnd(20, 40), w: 2, sq: false, ph: 0, rgb: LUNA.blue, life: 40, t: 0 });
    if (first(U.lock)) playS('laser_homing', .5, .8);
  }
  if (first(U.fire)) {
    L.on = true; f.charge = 1; sfx.beam(); playS('impact_big', .9, .7); flash(1, LUNA.core); shake(24); quake(26, 1, [140, 50, 140]); zoomKick(.1); G.speedlines = 50;
    fxRing(L.x, GROUND - 6, LUNA.core, 40, 520, 30, 16, .22); fxCore(L.x, GROUND - 80, LUNA.blue, 360, 26);
  }
  if (L.on && at < U.last) {
    shake(8); if ((at | 0) % 5 === 0) quake(8, .25);
    if ((at | 0) % 2 === 0) { for (let i = 0; i < 3; i++) { const a = rnd(Math.PI * 1.05, Math.PI * 1.95); addFx({ k: 'streak', x: L.x + rnd(-60, 60), y: GROUND - 10, vx: Math.cos(a) * rnd(8, 20), vy: Math.sin(a) * rnd(10, 26), life: rnd(16, 28), t: 0, rgb: i ? LUNA.blue : LUNA.core, w: rnd(2, 4) }); } fxDust(L.x + rnd(-120, 120), GROUND, 1, 1.2); }
    if ((at | 0) % 8 === 0) fxRing(L.x, GROUND - 6, LUNA.blue, 60, 300, 16, 6, .22);
    const hb = { x0: L.x - 120, x1: L.x + 120, y0: -2000, y1: GROUND + 10 };
    if (m.nextHit === undefined) m.nextHit = U.fire;
    if (at >= m.nextHit && live && overlap(hb, hurt(o))) { m.nextHit += U.every; hitTarget(f, o, { noScale: true, dmg: 2.4, kb: 0, stun: 24, power: 1, ult: true, hy: 160 }); o.vx *= .2; }
  }
  if (first(U.last)) {   // final detonation at the impact point
    const X = L.x; L.on = false; L.boom = 0;
    if (live && Math.abs(o.x - X) < 260) hitTarget(f, o, { noScale: true, dmg: 9, kb: 14 * (Math.sign(o.x - f.x) || f.face), launch: -18, power: 3.2, hitstop: 14, ult: true, hy: 160 });
    sfx.boom(); flash(1, '255,255,255'); shake(28); zoomKick(.14); slowmo(.3, 40); quake(30, 1.2, [160, 60, 120]);
    for (let r = 0; r < 4; r++) fxRing(X, GROUND - 6, r % 2 ? LUNA.violet : LUNA.core, 30, 320 + r * 180, 30 + r * 8, 14 - r * 2, .22);
    fxBig(X, GROUND - 160, LUNA.blue, LUNA.core, 3.2, 1); addFx({ k: 'pillar', x: X, y: GROUND, rgb: LUNA.blue, hot: LUNA.core, life: 50, t: 0, w: 260 });
    for (let i = 0; i < 50; i++) addFx({ k: 'ember', x: X + rnd(-300, 300), y: GROUND - rnd(0, 260), vx: rnd(-1, 1), vy: rnd(-3, -.5), life: rnd(60, 120), t: 0, rgb: LUNA.blue });
  }
  if (first(U.end)) { f.inv = 0; G.tintA = 0; f.charge = 0; G.luna = null; f.t = Math.max(f.t, m.st + m.act - 1); }
}
// lunar beam (world space, additive) — a column from orbit with a white-hot core, wobbling rings and a scorched footprint
const lunaLive = () => { const L = G.luna; if (L && !(L.f.state === 'atk' && L.f.move && L.f.move.key === 'ult')) G.luna = null; return G.luna; };
function drawLunaBeam() {
  const L = lunaLive(); if (!L) return;
  const X = L.x, top = GROUND - 1400;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  // lock-on reticle + guide laser
  if (!L.on && L.t < ARIA_ULT.fire + 2) {
    const k = Math.min(1, L.t / 20), r = 150 - 60 * k, rot = L.t * .08;
    ctx.save(); ctx.translate(X, GROUND - 6); ctx.scale(1, .28); ctx.rotate(rot);
    ctx.strokeStyle = `rgba(${LUNA.blue},${.5 + .5 * k})`; ctx.lineWidth = 5;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(0, 0, r, i * TAU / 4 + .2, i * TAU / 4 + 1.2); ctx.stroke(); }
    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, r * .55, 0, TAU); ctx.stroke();
    ctx.restore();
    const thin = (L.t % 8) < 4 ? .6 : .25; ctx.fillStyle = `rgba(${LUNA.blue},${thin * k})`; ctx.fillRect(X - 2, top, 4, GROUND - top);
  }
  if (L.on) {
    const w = 120 + Math.sin(G.frame * 1.3) * 14, g = ctx.createLinearGradient(X - w, 0, X + w, 0);
    g.addColorStop(0, `rgba(${LUNA.violet},0)`); g.addColorStop(.25, `rgba(${LUNA.blue},.7)`); g.addColorStop(.45, `rgba(${LUNA.core},1)`); g.addColorStop(.55, `rgba(${LUNA.core},1)`); g.addColorStop(.75, `rgba(${LUNA.blue},.7)`); g.addColorStop(1, `rgba(${LUNA.violet},0)`);
    ctx.fillStyle = g; ctx.fillRect(X - w, top, w * 2, GROUND - top);
    ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fillRect(X - w * .14, top, w * .28, GROUND - top);
    for (let i = 0; i < 7; i++) { const y = GROUND - ((G.frame * 38 + i * 160) % (GROUND - top)); ctx.strokeStyle = `rgba(${LUNA.core},.6)`; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(X, y, w * 1.05, 16, 0, 0, TAU); ctx.stroke(); }
    const fg = ctx.createRadialGradient(X, GROUND - 20, 0, X, GROUND - 20, 300); fg.addColorStop(0, `rgba(255,255,255,.95)`); fg.addColorStop(.3, `rgba(${LUNA.blue},.7)`); fg.addColorStop(1, `rgba(${LUNA.violet},0)`);
    ctx.save(); ctx.translate(X, GROUND - 10); ctx.scale(1, .35); ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(0, 0, 300, 0, TAU); ctx.fill(); ctx.restore();
  }
  ctx.restore();
}
// screen-space sky: the moon swells over the arena and the satellite glints in orbit while the ULT is live
function drawLunaSky() {
  const L = lunaLive(); if (!L) return;
  const k = Math.min(1, L.t / 30), mx = W * .72, my = 96 - (1 - k) * 160, R = 120;
  ctx.save();
  ctx.fillStyle = `rgba(4,8,30,${.45 * k})`; ctx.fillRect(0, 0, W, H * .7);
  ctx.globalCompositeOperation = 'lighter';
  const halo = ctx.createRadialGradient(mx, my, R * .8, mx, my, R * 3); halo.addColorStop(0, `rgba(${LUNA.blue},${.45 * k})`); halo.addColorStop(1, `rgba(${LUNA.violet},0)`);
  ctx.fillStyle = halo; ctx.fillRect(mx - R * 3, my - R * 3, R * 6, R * 6);
  ctx.globalCompositeOperation = 'source-over';
  const mg = ctx.createRadialGradient(mx - R * .3, my - R * .3, R * .1, mx, my, R); mg.addColorStop(0, `rgba(250,252,255,${k})`); mg.addColorStop(.7, `rgba(200,215,240,${k})`); mg.addColorStop(1, `rgba(150,170,220,${k})`);
  ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, R, 0, TAU); ctx.fill();
  ctx.fillStyle = `rgba(120,135,180,${.35 * k})`; [[-.3, .1, .22], [.25, -.25, .14], [.1, .35, .18], [-.45, -.35, .1]].forEach(([dx, dy, r]) => { ctx.beginPath(); ctx.arc(mx + dx * R, my + dy * R, r * R, 0, TAU); ctx.fill(); });
  // satellite in orbit with a lens glint; when firing, its muzzle flares
  const sx = mx - R * 1.6 + Math.sin(L.t * .03) * 20, sy = my + R * .9;
  ctx.fillStyle = `rgba(210,190,140,${k})`; ctx.fillRect(sx - 10, sy - 6, 20, 12); ctx.fillStyle = `rgba(80,140,220,${k})`; ctx.fillRect(sx - 44, sy - 4, 30, 8); ctx.fillRect(sx + 14, sy - 4, 30, 8);
  ctx.globalCompositeOperation = 'lighter';
  const fl = L.on ? 1 : .35 + .35 * Math.sin(L.t * .4), gl = ctx.createRadialGradient(sx, sy + 8, 0, sx, sy + 8, 70 * fl + 20); gl.addColorStop(0, `rgba(255,255,255,${k})`); gl.addColorStop(.3, `rgba(${LUNA.blue},${.7 * k})`); gl.addColorStop(1, `rgba(${LUNA.blue},0)`);
  ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(sx, sy + 8, 70 * fl + 20, 0, TAU); ctx.fill();
  if (L.on) { ctx.fillStyle = `rgba(${LUNA.core},.8)`; ctx.fillRect(0, sy + 6, W, 2); ctx.fillRect(sx - 1, 0, 2, H * .7); }
  ctx.restore();
}
// ENJO 煙女: kiseru strikes trailing jade smoke, a floating brass skull that spits smoke shots (special),
// GASHIRA the skull-scaled lion that her smoke assembles out of scrap (EX) and RINDO, the black mechanical dragon
// that rises out of a pool of ink under the foe (ULT). She has no red of her own: red belongs to RINDO alone.
const JADE = { rgb: '95,211,188', deep: '31,138,122', hot: '225,255,246', gold: '201,162,74', ink: '14,11,10', red: '200,32,42', redHot: '255,120,100' };
const SHISHI_K = 1.3, RINDO_K = 1.9;   // creature size relative to ENJO's sprite scale
function enjoPipe(f) { const r = RS(f); return { x: f.x + f.face * 150 * r, y: f.y - 230 * r }; }
function updateEnjoMove(f, o, m, t, k, act, at, dt, first) {
  const tip = enjoPipe(f);
  if (k === 'a') {
    const c = Math.min(2, f.chain);
    if (t < m.st) f.vx *= .7;
    if (first(0)) {
      f.vx = f.face * [3, 4, 7][c];
      if (c === 0) fxSmoke(tip.x, tip.y, 4, .8, f.face);
      else if (c === 1) { fxArc(f.x + f.face * 90, f.y - 210, 115, 1.3, -1.4, JADE.rgb, f.face, 16, 26); fxSmoke(tip.x - f.face * 20, tip.y + 20, 5, .9, f.face); }
      else {   // the kiseru stretches into a crescent scythe of smoke for one sweep
        fxArc(f.x + f.face * 60, f.y - 160, 190, -2.2, .9, JADE.rgb, f.face, 20, 48); fxArc(f.x + f.face * 60, f.y - 150, 175, -2.0, .7, JADE.gold, f.face, 16, 12);
        fxSmoke(f.x + f.face * 200, f.y - 160, 10, 1.4, f.face);
      }
      c === 2 ? sfx.heavySwing() : sfx.swing();
    }
    if (act) { const h = tryHit(f, o, box(f, 20, c === 2 ? 300 : c === 1 ? 230 : 240, c === 2 ? -310 : -280, c === 2 ? -20 : -150), { dmg: [4, 4.5, 6.5][c], kb: [3, 4, 10][c], stun: [15, 16, 22][c], power: [.7, .85, 1.4][c], launch: c === 2 ? -10 : 0 }); if (h) fxSmoke(o.x, o.y - 160, 5, 1, f.face); }
  } else if (k === 'b') {   // 骸の吐息: the skull swings forward and spits a jade smoke shot (cancelled by a normal attack like any shot)
    if (t < m.st) { f.vx *= .7; f.charge = t / m.st; if ((t | 0) % 3 === 0) fxSmoke(f.skX, f.skY, 1, .4); }
    if (first(0)) {
      const mx = f.skX + f.face * 30, my = f.skY + 20;
      G.proj.push({ owner: f, x: mx, y: my, vx: f.face * 15, vy: 0, dmg: 8, type: 'smoke', pw: 1.2, kb: 9, life: 80, t: 0, trail: [], rgb: f.col.rgb });
      f.charge = 0; f.skX -= f.face * 34; fxSmoke(mx, my, 8, 1.2, f.face); fxRing(mx, my, f.col.rgb, 6, 70, 12, 5, 1); playS('laser_shot', .4, .6);
    }
  } else if (k === 'ex') {
    if (t < m.st) { f.vx = 0; if ((t | 0) % 2 === 0) fxSmoke(tip.x, tip.y - 30, 2, .7, f.face); }
    if (first(0)) summonShishi(f, o);
    if (act && !f.shishi && at > 10) f.t = Math.max(f.t, m.st + m.act - 1);
  } else if (k === 'ult') updateEnjoUlt(f, o, at, dt, first);
}
// the skull hovers behind her shoulder; for the special it swings out in front of her to fire
function updateSkull(f, dt) {
  f.skA = (f.skA || 0) + .05 * dt;
  const r = RS(f), m = f.state === 'atk' && f.move;
  let tx = f.x - f.face * 70 * r, ty = f.y - 330 * r + Math.sin(f.skA) * 10;
  if (m && m.key === 'b') { const q = clamp(f.t / m.st, 0, 1); tx = f.x + f.face * (60 + 60 * q) * r; ty = f.y - 250 * r; }
  if (f.state === 'win') { tx = f.x + f.face * 80; ty = f.y - 300 + Math.sin(f.skA * 1.2) * 8; }
  f.skX = f.skX === undefined ? tx : lerp(f.skX, tx, .14); f.skY = f.skY === undefined ? ty : lerp(f.skY, ty, .14);
}
function drawSkull(f) {
  if (f.id !== 'enjo' || f.hidden || f.skX === undefined) return;
  const img = f.alt ? GFX.skullAltLazy() : GFX.skull; if (!img) return;
  const w = 62 * RS(f), h = w * img.height / img.width, glow = .35 + .5 * (f.charge || 0);
  ctx.save(); ctx.translate(f.skX, f.skY); ctx.rotate(Math.sin(f.skA * .7) * .08);
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 1.1); g.addColorStop(0, `rgba(${f.col.rgb},${glow})`); g.addColorStop(1, `rgba(${f.col.rgb},0)`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, w * 1.1, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.scale(f.face > 0 ? -1 : 1, 1);   // the source skull looks to the left
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}
// EX 骸獅子・ガシラ: smoke swallows scrap and golden skull masks, GASHIRA assembles behind her, charges across and pounces
const ENJO_EX = { form: 18, run: 34, pounce: 34 };
function summonShishi(f, o) {
  const x0 = f.x - f.face * 60;
  f.shishi = { mode: 'ex', t: 0, face: f.face, x: x0, y: GROUND, hits: 0, next: 0, a: 0 };
  fxSmoke(x0, GROUND - 130, 22, 2.2, 0, f.col.rgb);
  for (let i = 0; i < 16; i++) { const a = rnd(0, TAU), r = rnd(160, 320);   // gold skull masks flying in to build the body
    addFx({ k: 'shard', x: x0 + Math.cos(a) * r, y: GROUND - 140 + Math.sin(a) * r * .6, vx: -Math.cos(a) * 11, vy: -Math.sin(a) * 7, rot: rnd(0, TAU), vr: rnd(-.4, .4), s: rnd(7, 13), rgb: JADE.gold, hot: '255,235,170', life: rnd(16, 24), t: 0 }); }
  fxRing(x0, GROUND - 6, f.col.rgb, 30, 360, 26, 10, .22); flash(.3, f.col.rgb); shake(10); quake(8, .4, 50);
  playS('special_start', .6, .9); playS('impact_big', .4, 1.2);
}
function updateShishi(f, o, dt) {
  const d = f.shishi; if (!d) return;
  d.t += dt; const E = ENJO_EX;
  if (d.mode === 'ex') {
    if (d.t < E.form) { d.a = d.t / E.form; if ((d.t | 0) % 2 === 0) fxSmoke(d.x + rnd(-200, 200), GROUND - rnd(40, 260), 2, 1.2, 0, f.col.rgb); return; }
    d.a = 1;
    if (!d.pounce) {   // gallop: dust and smoke off every stride, drags the foe on contact
      d.x += d.face * 24 * dt;
      if ((d.t | 0) % 3 === 0) { fxDust(d.x - d.face * 120, GROUND, 2, 1); fxSmoke(d.x - d.face * 180, GROUND - rnd(120, 240), 1, 1, -d.face, f.col.rgb); shake(3); }
      if ((d.t | 0) % 2 === 0) addFx({ k: 'streak', x: d.x - d.face * 220, y: GROUND - rnd(60, 280), vx: -d.face * 18, vy: 0, life: 12, t: 0, rgb: JADE.gold, w: 4 });
      const hb = { x0: d.x - 220, x1: d.x + 260, y0: GROUND - 300, y1: GROUND };
      if (d.hits < 2 && d.t >= d.next && G.phase === 'fight' && overlap(hb, hurt(o))) { d.hits++; d.next = d.t + 7; hitTarget(f, o, { dmg: 3.5, kb: 3, stun: 28, power: 1.1, hy: 140 }); o.vx = d.face * 6; }
      const ahead = d.face * (o.x - d.x);
      if (d.t > E.form + E.run || (ahead > 0 && ahead < 330) || d.x < 60 || d.x > STAGE_W - 60) { d.pounce = d.t; shake(8); playS('hit_heavy', .6, .8); }
    } else {
      const q = (d.t - d.pounce) / E.pounce; d.x += d.face * (14 - q * 12) * dt;
      if (!d.bit && q > .5) {   // jaws close: bite + a gout of jade breath
        d.bit = true; const mx = d.x + d.face * 200;
        if (G.phase === 'fight' && Math.abs(o.x - mx) < 300) hitTarget(f, o, { dmg: 9, kb: 15, launch: -14, power: 2, hitstop: 12, hy: 180 });
        fxSmoke(mx, GROUND - 200, 18, 2.4, d.face, f.col.rgb); fxRing(mx, GROUND - 200, f.col.rgb, 20, 260, 22, 10, .5); fxCore(mx, GROUND - 200, f.col.rgb, 220, 16);
        sfx.boom(); shake(16); quake(14, .6, 70); zoomKick(.06);
      }
      if (q >= 1) { d.mode = 'leave'; d.t = 0; fxSmoke(d.x, GROUND - 150, 20, 2, 0, f.col.rgb); if (f.move && f.move.key === 'ex') f.t = Math.max(f.t, f.move.st + f.move.act - 1); }
    }
  } else if (d.mode === 'leave') {   // dissolves back into smoke
    d.a = Math.max(0, 1 - d.t / 24); if ((d.t | 0) % 3 === 0) fxSmoke(d.x + rnd(-160, 160), GROUND - rnd(40, 240), 2, 1, 0, f.col.rgb);
    if (d.t > 24) f.shishi = null;
  } else if (d.mode === 'win') { d.face = f.face; d.x = lerp(d.x, f.x - f.face * 300, .08); d.a = Math.min(1, d.a + .03 * dt); }
}
function shishiFrame(f) {
  const AN = ANIMS[f.id], d = f.shishi; if (!AN || !d) return null;
  const a = AN.a, loop = n => { const arr = a[n]; return arr && arr[Math.floor(G.frame * (AN.fps[n] || 12) / 60) % arr.length]; };
  if (d.mode === 'win' || (d.mode === 'ex' && d.t < ENJO_EX.form)) return loop('gIdle');
  if (d.pounce) { const arr = a.gPounce; if (!arr) return null; const q = d.mode === 'leave' ? 1 : (d.t - d.pounce) / ENJO_EX.pounce; return arr[clamp(Math.floor(q * (arr.length - 1)), 0, arr.length - 1)]; }
  return loop('gRun');
}
function drawShishi(f, front) {
  const d = f.shishi; if (!d || f.hidden) return;
  if ((d.mode !== 'win') !== front) return;   // the victory lion sits behind her; the charging lion runs in front
  const fr = shishiFrame(f), AN = ANIMS[f.id];
  ctx.save(); ctx.translate(d.x, d.y); ctx.scale(d.face, 1); ctx.globalAlpha = d.a;
  if (fr) { const K = AN.k * SHISHI_K / RS(f), ref = AN.a.gRun[0], foot = (ref.oy + ref.h) * K; ctx.drawImage(frameSrc(fr, f), fr.sx, fr.sy, fr.w, fr.h, fr.ox * K, fr.oy * K - foot, fr.w * K, fr.h * K); }
  else { ctx.fillStyle = `rgba(${JADE.gold},.9)`; ctx.beginPath(); ctx.ellipse(0, -150, 230, 100, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(210, -230, 80, 70, 0, 0, TAU); ctx.fill(); }
  ctx.restore(); ctx.globalAlpha = 1;
}
// ULT 浮世斬・リンドウ: "切り札はまだ、水の底" — ink spreads under the foe, RINDO rises out of it and coils around them,
// roars, then dives and bites down. Red spider-lily petals are the one drop of red in her jade world.
const ENJO_ULT = { rise: 40, coil: 72, roar: 128, dive: 150, sink: 172, end: 200 };
function updateEnjoUlt(f, o, at, dt, first) {
  const m = f.move, U = ENJO_ULT, live = o && !o.ko && o.hp > 0;
  if (first(0)) { f.vx = 0; sfx.charge(); m.px = clamp(o.x, 160, STAGE_W - 160); G.ink = { x: m.px, r: 0, f }; f.rindo = { t: 0, t0: 0, x: m.px, face: f.face, mode: 'wait' }; playS('special_start', .6, .7); }
  const I = G.ink, R = f.rindo; if (!I || !R) return;
  R.t += dt;
  const setMode = md => { R.mode = md; R.t0 = R.t; };
  if (at < U.rise) {   // the pool widens and creeps after the foe
    f.charge = at / U.rise; I.r = lerp(I.r, 280, .06);
    if (live) I.x = clamp(lerp(I.x, o.x, .04), 160, STAGE_W - 160); R.x = I.x;
    if ((at | 0) % 4 === 0) { fxSmoke(I.x + rnd(-I.r, I.r) * .8, GROUND - 10, 1, .6, 0, JADE.ink); if (Math.random() < .5) fxPetals(I.x + rnd(-I.r, I.r) * .6, GROUND - 10, 1, .5, true); }
    if ((at | 0) % 10 === 0) fxRing(I.x, GROUND - 2, JADE.red, I.r * .5, I.r * 1.1, 18, 3, .16);
  }
  if (first(U.rise)) {
    setMode('rise'); shake(16); quake(18, .8, 90); flash(.5, JADE.red); playS('impact_big', .8, .6); sfx.boom();
    fxPetals(R.x, GROUND - 60, 24, 2, true); fxRing(R.x, GROUND - 4, JADE.red, 30, 420, 30, 12, .22); fxSmoke(R.x, GROUND - 40, 14, 2, 0, JADE.ink);
    if (live && Math.abs(o.x - R.x) < 260) { hitTarget(f, o, { noScale: true, dmg: 6, kb: 0, launch: -20, power: 1.8, stun: 40, ult: true, hy: 120 }); m.bound = o.state === 'air' && !o.ko; }
  }
  if (first(U.coil)) setMode('coil');
  if (m.bound && at >= U.rise && at < U.dive) {   // coiled: the foe hangs inside RINDO's loop and is squeezed
    if (o.ko || o.hp <= 0) m.bound = false;
    else {
      o.x = lerp(o.x, R.x + f.face * 20, .2); o.y = lerp(o.y, GROUND - 190, .15); o.vy = 0; o.vx = 0; o.state = 'air'; o.t = 4;
      if (m.nextHit === undefined) m.nextHit = U.coil;
      if (at >= m.nextHit && at < U.roar) { m.nextHit += 12; hitTarget(f, o, { noScale: true, dmg: 2.4, kb: 0, stun: 30, power: .9, ult: true, hy: 150 }); o.vy = 0; fxPetals(o.x, o.y - 150, 3, .9, true); shake(6); }
    }
  }
  if (at >= U.rise && at < U.dive && (at | 0) % 4 === 0) fxPetals(R.x + rnd(-200, 200), GROUND - rnd(100, 520), 2, .8, true);
  if (first(U.roar)) { setMode('roar'); shake(12); quake(14, .7, 80); flash(.3, JADE.red); playS('ult_start', .6, .7); fxRing(R.x + f.face * 120, GROUND - 520, JADE.red, 30, 380, 26, 10, .6); }
  if (first(U.dive)) {   // dive and bite: red impact frame
    setMode('dive'); const X = R.x + f.face * 60;
    if (live && (m.bound || Math.abs(o.x - X) < 300)) hitTarget(f, o, { noScale: true, dmg: m.bound ? 12 : 9, kb: 16, launch: -16, power: 3.2, hitstop: 14, ult: true, hy: 160 });
    m.bound = false;
    pfxKick({ impact: 110, rgb: JADE.red, radial: 1.6, x: X, y: GROUND - 200, ca: 3.4 }); flash(1, '255,90,80'); shake(26); zoomKick(.14); slowmo(.3, 36); quake(28, 1.1, [140, 50, 120]); sfx.boom();
    fxPetals(X, GROUND - 200, 40, 2.6, true); fxBig(X, GROUND - 180, JADE.red, JADE.redHot, 3, f.face); fxSmoke(X, GROUND - 80, 24, 2.6, 0, JADE.ink);
    for (let r = 0; r < 3; r++) fxRing(X, GROUND - 6, r % 2 ? JADE.red : JADE.rgb, 30, 360 + r * 170, 30 + r * 8, 14 - r * 3, .22);
  }
  if (first(U.sink)) setMode('sink');
  if (at >= U.sink) I.r = lerp(I.r, 0, .08);
  if (first(U.end)) { f.inv = 0; G.tintA = 0; f.charge = 0; f.rindo = null; G.ink = null; f.t = Math.max(f.t, m.st + m.act - 1); }
}
const enjoUltLive = f => f.rindo && f.state === 'atk' && f.move && f.move.key === 'ult';
function drawInk() {   // the pool of ink under the foe (floor layer)
  const I = G.ink; if (!I) return;
  if (!enjoUltLive(I.f)) { G.ink = null; I.f.rindo = null; return; }
  const r = I.r; if (r < 2) return;
  ctx.save();
  ctx.fillStyle = 'rgba(6,5,5,.92)'; ctx.beginPath(); ctx.ellipse(I.x, GROUND + 2, r, r * .16, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = `rgba(${JADE.rgb},.35)`; ctx.lineWidth = 2; ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(I.x, GROUND, 0, I.x, GROUND, r); g.addColorStop(0, `rgba(${JADE.red},.28)`); g.addColorStop(1, `rgba(${JADE.red},0)`);
  ctx.save(); ctx.translate(I.x, GROUND); ctx.scale(1, .16); ctx.translate(-I.x, -GROUND); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(I.x, GROUND, r, 0, TAU); ctx.fill(); ctx.restore();
  ctx.restore();
}
function rindoFrame(f) {
  const AN = ANIMS[f.id], R = f.rindo; if (!AN || !R) return null;
  const a = AN.a, u = R.t - R.t0;
  const prog = (n, L) => { const arr = a[n]; return arr && arr[clamp(Math.floor(u / L * (arr.length - 1)), 0, arr.length - 1)]; };
  const loop = n => { const arr = a[n]; return arr && arr[Math.floor(u * (AN.fps[n] || 10) / 60) % arr.length]; };
  if (R.mode === 'rise') return prog('rRise', 32);
  if (R.mode === 'coil') return loop('rCoil');
  if (R.mode === 'roar') return prog('rRoar', 22);
  if (R.mode === 'dive') { const arr = a.rRoar; return arr && arr[arr.length - 1]; }
  if (R.mode === 'sink') return prog('rSink', 28);
  return null;
}
function drawRindo(f) {
  const R = f.rindo; if (!R || !enjoUltLive(f) || R.mode === 'wait') return;
  const fr = rindoFrame(f), AN = ANIMS[f.id], u = R.t - R.t0;
  ctx.save();
  ctx.beginPath(); ctx.rect(R.x - 3000, GROUND - 4000, 6000, 4000 + 4); ctx.clip();   // nothing of it shows below the ink
  ctx.translate(R.x, GROUND); ctx.scale(R.face, 1);
  if (R.mode === 'dive') { const q = Math.min(1, u / 10); ctx.translate(140 * q, 60 * q); ctx.rotate(.3 * q); }
  ctx.globalAlpha = R.mode === 'rise' ? Math.min(1, u / 6) : R.mode === 'sink' ? Math.max(0, 1 - u / 28) : 1;
  if (fr) { const K = AN.k * RINDO_K / RS(f); ctx.drawImage(frameSrc(fr, f), fr.sx, fr.sy, fr.w, fr.h, fr.ox * K, fr.oy * K, fr.w * K, fr.h * K); }
  else { ctx.strokeStyle = 'rgba(20,16,16,.95)'; ctx.lineWidth = 70; ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-200, -300, 200, -500, 60, -760); ctx.stroke(); }
  ctx.restore(); ctx.globalAlpha = 1;
}
// REI 月白 零: fights from a low ready stance, whirling the 3m greatsword with its weight (the third swing is a full spin and its
// pistons fire a second, delayed shock); 二の太刀 is a leaping slam whose shock races along the floor as ink;
// EX turns the blade into a cannon (the blade splits into three prongs around a barrel) and fires a shell; the ULT frees
// the ink dragon sealed in the blade (shares ENJO's dragon timeline). Each full deployment sheds one tear of blood.
const SHU = { rgb: '232,70,60', hot: '255,214,200', moon: '233,228,216', brass: '201,162,74' };
function reiTip(f) { const r = RS(f); return { x: f.x + f.face * 230 * r, y: f.y - 150 * r }; }
function fxTear(f) {   // one drop of blood from the red mechanical eye
  const r = RS(f); addFx({ k: 'paint', x: f.x + f.face * 16 * r, y: f.y - 262 * r, vx: f.face * .2, vy: .6, r: 2.6, rgb: '200,20,30', life: 70, t: 0 });
}
function reiShock(f, o, x, y, big) {   // the pistons inside the blade fire a beat after the cut
  fxRing(x, y, SHU.rgb, 10, big ? 220 : 150, 16, 8, .7); fxCore(x, y, SHU.hot, big ? 160 : 110, 12); fxSmoke(x, y, big ? 10 : 6, 1.4, 0, JADE.ink);
  shake(big ? 10 : 7); playS('hit_heavy', .5, 1.3);
  if (G.phase === 'fight' && Math.abs(o.x - x) < 170 && Math.abs((o.y - 150) - y) < 220) hitTarget(f, o, { dmg: big ? 5 : 4, kb: 7, launch: -9, power: 1.6, hy: 150 });
}
function updateReiMove(f, o, m, t, k, act, at, dt, first) {
  const r = RS(f);
  if (k === 'a') {
    const c = Math.min(2, f.chain);
    if (t < m.st) f.vx *= .7;
    if (first(0)) {
      f.vx = f.face * [5, 6, 7][c];
      if (c === 0) { fxArc(f.x + f.face * 60 * r, f.y - 150 * r, 250 * r, -1.6, 1.2, f.col.rgb, f.face, 16, 44); fxArc(f.x + f.face * 60 * r, f.y - 150 * r, 235 * r, -1.4, 1.0, SHU.moon, f.face, 12, 10); }
      else if (c === 1) { fxArc(f.x + f.face * 70 * r, f.y - 170 * r, 250 * r, 1.6, -1.7, f.col.rgb, f.face, 16, 46); }
      else {   // full spin: a ring of steel all the way round her
        fxArc(f.x, f.y - 150 * r, 300 * r, -Math.PI, Math.PI, f.col.rgb, f.face, 22, 50); fxArc(f.x, f.y - 150 * r, 285 * r, -Math.PI, Math.PI, SHU.moon, f.face, 18, 12);
        fxRing(f.x, f.y - 6, f.col.rgb, 30, 320 * r, 22, 8, .22); fxDust(f.x, f.y, 10, 1.2); G.speedlines = 14;
      }
      c === 0 ? sfx.swing() : sfx.heavySwing();
    }
    if (act) {
      const hb = c === 2 ? box(f, -300, 330, -320, 0) : c === 1 ? box(f, 0, 320, -340, -20) : box(f, -40, 330, -300, -30);
      const h = tryHit(f, o, hb, { dmg: [4.5, 5, 3.5][c], kb: [3, 4, 6][c], stun: [16, 17, 22][c], power: [.8, .95, 1.2][c], launch: c === 1 ? -6 : 0 }, c === 2 ? 2 : 1, 3);
      if (h && c === 2 && !m.shock) m.shock = { at: at + 12, x: o.x, y: o.y - 150 };
    }
    if (m.shock && !m.shock.done && at >= m.shock.at) { m.shock.done = true; reiShock(f, o, m.shock.x, m.shock.y, true); }
  } else if (k === 'b') {   // 二の太刀: hop and slam the blade into the floor; the delayed shock races on as a wave of ink
    if (t < m.st) { f.vx = f.face * 5; f.charge = t / m.st; }
    if (first(0)) { f.vx = f.face * 6; f.charge = 0; fxArc(f.x + f.face * 120 * r, f.y - 200 * r, 230 * r, -2.4, .6, f.col.rgb, f.face, 18, 56); sfx.heavySwing(); }
    if (first(3)) { const X = f.x + f.face * 230 * r; fxDust(X, f.y, 14, 1.5); fxRing(X, GROUND - 6, f.col.rgb, 20, 260, 20, 10, .22); fxSmoke(X, GROUND - 40, 10, 1.6, 0, JADE.ink); shake(12); quake(8, .4, 50); }
    if (act) { f.vx *= Math.pow(.8, dt); tryHit(f, o, box(f, 40, 340, -320, 0), { dmg: 6, kb: 5, stun: 24, power: 1.3, launch: -7 }); }
    if (first(12)) {
      G.proj.push({ owner: f, x: f.x + f.face * 260 * r, y: GROUND - 70, vx: f.face * 16, vy: 0, dmg: 5, type: 'inkwave', pw: 1.3, kb: 9, life: 30, t: 0, trail: [], rgb: f.col.rgb });
      playS('hit_heavy', .5, .9);
    }
  } else if (k === 'ex') {   // 顎門・砲哮: the blade opens into a cannon and fires one heavy shell
    if (t < m.st) { f.vx *= .6; if ((t | 0) % 3 === 0) fxSpark(f.x + f.face * 200 * r, f.y - 150 * r, SHU.rgb, 3, .5); }
    if (first(0)) {
      fxTear(f);
      const mx = f.x + f.face * 300 * r, my = f.y - 160 * r;
      G.proj.push({ owner: f, x: mx, y: my, vx: f.face * 24, vy: 0, dmg: 12, type: 'shell', pw: 2.2, kb: 14, launch: -12, life: 70, t: 0, trail: [], rgb: f.col.rgb });
      f.vx = -f.face * 16;   // recoil
      fxCore(mx, my, SHU.hot, 220, 14); fxRing(mx, my, f.col.rgb, 10, 220, 16, 10, 1); fxSmoke(mx, my, 14, 2.2, f.face, JADE.ink); fxSpark(mx, my, SHU.rgb, 24, 1.6, f.face);
      sfx.boom(); playS('impact_big', .7, .9); shake(16); quake(14, .5, 70); zoomKick(.06); flash(.35, SHU.rgb);
    }
    if (act) f.vx *= Math.pow(.85, dt);
  } else if (k === 'ult') {
    if (first(0)) fxTear(f);
    updateEnjoUlt(f, o, at, dt, first);   // the blade unseals the ink dragon: same pool → rise → coil → dive timeline as ENJO's RINDO
    if (first(ENJO_ULT.dive)) G.inkWash = { t: 0, life: 46 };   // the world is swallowed by ink for a moment
  }
}
function shellBurst(p) {   // the cannon shell detonates
  fxBig(p.x, p.y, SHU.rgb, SHU.hot, 2.4, Math.sign(p.vx) || 1); fxSmoke(p.x, p.y, 16, 2.4, 0, JADE.ink); fxPetals(p.x, p.y, 10, 1.6, !p.owner.alt);
  sfx.boom(); shake(18); quake(16, .6, 80);
}
function drawInkWash() {   // screen space: the dragon's swallow floods the screen with ink, then drains
  const w = G.inkWash; if (!w) return;
  w.t += G.slow || 1; if (w.t >= w.life) { G.inkWash = null; return; }
  const p = w.t / w.life, a = p < .2 ? p / .2 : 1 - (p - .2) / .8;
  ctx.save(); ctx.fillStyle = `rgba(6,5,5,${.88 * a})`; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(${SHU.rgb},${.25 * a})`; ctx.fillRect(0, H * .5 - 2, W, 4); ctx.restore();
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
    const cb = clashBox(o);
    if (at >= m.nextHit && cb && overlap(b, cb)) {   // a normal attack swung into the beam cancels it out
      m.nextHit += 6; o.vx = f.face * 3; o.beamGuard = G.frame + 22; clashFx(o.x + o.face * 150, dy, o, f);
    } else if (at >= m.nextHit && o.beamGuard > G.frame && overlap(b, hb)) {   // still pushing through the cancelled beam
      m.nextHit += 6; o.vx = f.face * 2; fxSpark(o.x + o.face * 120, dy, '255,255,255', 6, 1.1, -f.face); fxCore(o.x + o.face * 120, dy, f.col.rgb, 60, 6);
    } else if (at >= m.nextHit && overlap(b, hb)) {
      m.nextHit += 6;
      const last = at >= 99;
      hitTarget(f, o, { noScale: true, dmg: last ? 6 : 2.6, kb: last ? 16 : 3, stun: 20, power: last ? 2.4 : 1, launch: last ? -14 : 0, ult: true, hy: o.y - dy });
    }
    if ((at | 0) % 2 === 0) fxSpark(f.face > 0 ? Math.min(STAGE_W, o.x) : Math.max(0, o.x), dy, f.col.rgb, 3, 1.2, -f.face);
  }
  if (first(105)) { m.beam = false; f.charge = 0; G.tintA = 0; f.inv = 0; fxRing(dx, dy, f.col.rgb, 20, 260, 24, 10); fxCore(dx, dy, f.col.rgb, 200, 20); }
  if (at >= 108 && at < 110) f.t = m.st + m.act;
}

// beams and shots can be cancelled by a normal attack swung into them
function clashBox(f) {
  if (!f || f.state !== 'atk' || !f.move || f.move.key !== 'a') return null;
  const m = f.move; if (f.t < m.st - 3) return null;   // from just before the swing lands until it recovers
  return box(f, -30, 300, -430, 10);
}
function clashFx(x, y, a, b) {
  fxCore(x, y, '255,255,255', 110, 12); fxRing(x, y, '255,255,255', 10, 190, 16, 7, .3);
  fxSpark(x, y, a.col.rgb, 10, 1.5); fxSpark(x, y, b.col.rgb, 10, 1.5);
  fxText(x, y - 90, 'CLASH!', '255,255,255', 28, 26); G.freeze = Math.max(G.freeze || 0, 5); shake(8); sfx.hit(1.3);
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
    if (p.type === 'smoke' && (p.t | 0) % 2 === 0) fxSmoke(p.x, p.y, 1, .6, -Math.sign(p.vx), p.rgb);
    if (p.type === 'inkwave') { fxSmoke(p.x, GROUND - rnd(10, 120), 2, 1, -Math.sign(p.vx), JADE.ink); if ((p.t | 0) % 3 === 0) fxDust(p.x, GROUND, 1, .8); }
    if (p.type === 'hook') {   // ARIA's grapple: flies out, bites, reels the foe in, then retracts
      const f = p.owner, h = ariaHand(f);
      if (p.back) { p.x = lerp(p.x, h.x, .35); p.y = lerp(p.y, h.y, .35); if (Math.abs(p.x - h.x) < 30) { G.proj.splice(i, 1); } continue; }
      if (overlap({ x0: p.x - 24, x1: p.x + 24, y0: p.y - 30, y1: p.y + 30 }, hurt(o)) && o.inv <= 0 && o.state !== 'down') {
        const saveX = f.x; f.x = p.x - Math.sign(p.vx) * 40; hitTarget(f, o, { dmg: p.dmg, kb: p.kb, stun: 26, power: 1.1, hy: o.y - p.y }); f.x = saveX;
        fxGears(p.x, p.y, 6, 1, Math.sign(p.vx)); playS('arca_armor', .35, 1.5); p.back = true; continue;
      }
      if (p.t > p.life) p.back = true;
      continue;
    }
    if (p.type === 'stroke') {   // MIO's EX: a wave of paint skimming the floor, hitting several times
      const sd = Math.sign(p.vx);
      if ((p.t | 0) % 2 === 0) { fxPuddle(p.x - sd * 40, (p.t | 0) % 4 ? PAINT.blue : PAINT.deep, 80, 150); }
      fxPaint(p.x + sd * 10, GROUND - 150 - rnd(0, 30), 3, 1.25, sd, [PAINT.blue, '220,240,255', PAINT.deep, PAINT.pink]);   // spray off the crest
      if ((p.t | 0) % 2 === 0) addFx({ k: 'streak', x: p.x - sd * rnd(40, 200), y: GROUND - rnd(20, 150), vx: sd * 26, vy: 0, life: 10, t: 0, rgb: '200,230,255', w: 3 });
      if ((p.t | 0) % 6 === 0) { fxRing(p.x, GROUND - 4, PAINT.blue, 10, 150, 14, 5, .22); shake(2); }
      const hb = { x0: p.x - 90, x1: p.x + 90, y0: GROUND - 240, y1: GROUND };
      { const cb = clashBox(o); if (cb && overlap(hb, cb)) { clashFx(p.x, GROUND - 110, o, p.owner); fxPaint(p.x, GROUND - 60, 24, 1.6); G.proj.splice(i, 1); continue; } }
      if (p.hits < p.multi && p.t >= p.next && overlap(hb, hurt(o)) && o.inv <= 0 && o.state !== 'down') {
        const f = p.owner, saveX = f.x; f.x = p.x - Math.sign(p.vx) * 40; p.hits++; p.next = p.t + p.every; const fin = p.hits === p.multi;
        hitTarget(f, o, { dmg: fin ? 5 : p.dmg, kb: fin ? 12 : 2, stun: 22, power: fin ? 1.6 : .9, launch: fin ? -12 : 0, hy: 120 }); f.x = saveX;
        fxPaint(o.x, GROUND - 60, 18, 1.6, 0); p.vx *= .55;
      }
      if (p.t > p.life || p.x < -100 || p.x > STAGE_W + 100 || p.hits >= p.multi) { fxPaint(p.x, GROUND - 40, 20, 1.4); G.proj.splice(i, 1); }
      continue;
    }
    let dead = p.t > p.life || p.x < -100 || p.x > STAGE_W + 100 || p.y > GROUND + 20;
    if (!dead && p.type !== 'shell') { const cb = clashBox(o); if (cb && overlap({ x0: p.x - 24, x1: p.x + 24, y0: p.y - 24, y1: p.y + 24 }, cb)) { clashFx(p.x, p.y, o, p.owner); if (p.type === 'paint') fxPaint(p.x, p.y, 18, 1.3); G.proj.splice(i, 1); continue; } }
    if (!dead && overlap({ x0: p.x - 16, x1: p.x + 16, y0: p.y - 16, y1: p.y + 16 }, hurt(o)) && o.inv <= 0 && o.state !== 'down' && o.state !== 'ko') {
      const f = p.owner, saveX = f.x; f.x = p.x - Math.sign(p.vx) * 40;
      hitTarget(f, o, { dmg: p.dmg, kb: p.kb || 5, stun: 16, power: p.pw || (p.type === 'homing' ? 1.1 : .8), launch: p.launch || 0, hy: o.y - p.y }); f.x = saveX; dead = true;
    }
    if (dead && p.type === 'shell') { shellBurst(p); G.proj.splice(i, 1); continue; }
    if (dead) { if (p.type === 'paint') { fxPaint(p.x, p.y, 18, 1.3); if (p.y > GROUND - 40) fxPuddle(p.x, PAINT.blue, 110); } else fxCore(p.x, p.y, p.rgb, 50, 8); G.proj.splice(i, 1); }
  }
}
function drawProj() {
  for (const p of G.proj) {
    const tr = p.trail; if (tr.length < 2) continue;
    if (p.type === 'paint' || p.type === 'stroke') { drawPaintProj(p); continue; }
    if (p.type === 'hook') { drawHook(p); continue; }
    if (p.type === 'shell') {   // REI's cannon shell: a black slug in a red corona with a long trail
      ctx.lineCap = 'round'; ctx.beginPath(); tr.forEach((q, i) => i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y));
      ctx.strokeStyle = `rgba(${p.rgb},.75)`; ctx.lineWidth = 34; ctx.stroke(); ctx.strokeStyle = 'rgba(255,230,220,.9)'; ctx.lineWidth = 8; ctx.stroke();
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 70); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.35, `rgba(${p.rgb},.9)`); g.addColorStop(1, `rgba(${p.rgb},0)`);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 70, 0, TAU); ctx.fill();
      continue;
    }
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
  if (p.type === 'stroke') {   // a curling tidal wave of wet paint racing along the floor
    const d = Math.sign(p.vx) || 1, hx = p.x, t = p.t, L = 420, H = 170 * Math.min(1, t / 6);
    const wob = k => Math.sin(t * .5 + k * 14) * 6 * k;
    const topY = k => GROUND - (12 + (H - 12) * Math.pow(k, 1.7)) - wob(k);
    // light behind the wave (additive) so it reads against any stage
    ctx.globalCompositeOperation = 'lighter';
    const gl = ctx.createRadialGradient(hx, GROUND - 90, 0, hx, GROUND - 90, 240); gl.addColorStop(0, 'rgba(150,210,255,.55)'); gl.addColorStop(1, 'rgba(60,130,255,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(hx, GROUND - 90, 240, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // body: thick wave tapering back toward MIO
    const body = new Path2D(); body.moveTo(hx - d * L, GROUND + 4);
    for (let i = 0; i <= 24; i++) { const k = i / 24; body.lineTo(hx - d * L * (1 - k), topY(k)); }
    // curl: the crest folds forward over the front face
    body.bezierCurveTo(hx + d * 40, GROUND - H - 40, hx + d * 120, GROUND - H + 10, hx + d * 92, GROUND - H * .55);
    body.bezierCurveTo(hx + d * 70, GROUND - H * .7, hx + d * 50, GROUND - H * .45, hx + d * 70, GROUND + 4);
    body.closePath();
    const g = ctx.createLinearGradient(0, GROUND - H - 30, 0, GROUND);
    g.addColorStop(0, 'rgb(225,242,255)'); g.addColorStop(.18, `rgb(${PAINT.blue})`); g.addColorStop(.7, `rgb(${PAINT.deep})`); g.addColorStop(1, 'rgb(20,50,120)');
    ctx.fillStyle = g; ctx.fill(body);
    // pink vein and ink streaks dragged through the paint
    ctx.lineCap = 'round';
    for (let r = 0; r < 3; r++) {
      ctx.beginPath();
      for (let i = 0; i <= 16; i++) { const k = .15 + .8 * i / 16, y = topY(k) + (GROUND - topY(k)) * (.3 + r * .22) + Math.sin(t * .7 + i + r) * 3; i ? ctx.lineTo(hx - d * L * (1 - k), y) : ctx.moveTo(hx - d * L * (1 - k), y); }
      ctx.strokeStyle = r === 1 ? `rgba(${PAINT.pink},.75)` : r === 0 ? 'rgba(255,255,255,.35)' : `rgba(${PAINT.ink},.35)`; ctx.lineWidth = r === 1 ? 5 : 3; ctx.stroke();
    }
    // bright rim along the crest
    ctx.beginPath(); for (let i = 0; i <= 24; i++) { const k = i / 24; i ? ctx.lineTo(hx - d * L * (1 - k), topY(k) + 3) : ctx.moveTo(hx - d * L * (1 - k), topY(k) + 3); }
    ctx.bezierCurveTo(hx + d * 40, GROUND - H - 37, hx + d * 116, GROUND - H + 12, hx + d * 90, GROUND - H * .55);
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 4; ctx.stroke();
    // foam lip and leading splash
    for (let i = 0; i < 6; i++) { const a = t * .4 + i; ctx.fillStyle = `rgba(235,246,255,${.6 + .3 * Math.sin(a)})`; ctx.beginPath(); ctx.arc(hx + d * (60 + i * 8), GROUND - H * (.55 + .06 * Math.sin(a * 1.3)) - i * 4, 8 - i, 0, TAU); ctx.fill(); }
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(180,225,255,.5)'; ctx.beginPath(); ctx.ellipse(hx + d * 60, GROUND - 6, 120, 16, 0, 0, TAU); ctx.fill();
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

function drawHook(p) {
  const h = ariaHand(p.owner);
  ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(40,30,20,.9)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(h.x, h.y); ctx.lineTo(p.x, p.y); ctx.stroke();
  ctx.strokeStyle = `rgba(${BRASS.wire},.95)`; ctx.lineWidth = 2.2; ctx.stroke();
  const d = Math.sign(p.vx) || 1; ctx.translate(p.x, p.y); ctx.scale(d, 1);
  ctx.fillStyle = '#b8823a'; ctx.strokeStyle = '#ffd99a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-6, -12); ctx.lineTo(-2, 0); ctx.lineTo(-6, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 22); g.addColorStop(0, `rgba(${BRASS.teal},.8)`); g.addColorStop(1, `rgba(${BRASS.teal},0)`); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 22, 0, TAU); ctx.fill();
  ctx.restore();
}

function onKO(att, tgt) {
  tgt.state = 'air'; tgt.vy = Math.min(tgt.vy, -15); tgt.vx = Math.sign(tgt.x - att.x) * 11; tgt.ko = true;
  const pt = partnerOf(tgt);
  if (pt && pt.hp > 0) {   // one member down: partner jumps in, the round continues
    fxBig(tgt.x, tgt.y - 170, auraRgb(att), auraHot(att), 2.4, Math.sign(tgt.x - att.x) || 1);
    slowmo(.3, 40); flash(.7); shake(18); zoomKick(.1); sfx.ko(); quake(22, .9, [90, 40, 120]);
    pfxWave(tgt.x, tgt.y - 170, 1.8, 40); pfxKick({ radial: 1.2, x: tgt.x, y: tgt.y - 170, impact: 80, rgb: auraHot(att), ca: 2.6 });
    G.banner = { txt: `${tgt.ch.name} DOWN`, t: 0, rgb: tgt.col.rgb };
    G.pendingTag = { side: tgt.side, t: 0 };
    return;
  }
  fxBig(tgt.x, tgt.y - 170, auraRgb(att), auraHot(att), 3.2, Math.sign(tgt.x - att.x) || 1);
  G.phase = 'ko'; G.phaseT = 0; slowmo(.22, 80); flash(1); shake(24); zoomKick(.14); sfx.ko(); quake(34, 1.4, [120, 60, 220]);
  pfxWave(tgt.x, tgt.y - 170, 2.4, 52); pfxKick({ radial: 2, x: tgt.x, y: tgt.y - 170, impact: 110, rgb: auraHot(att), bloom: 1, ca: 4 }); G.koCam = { f: tgt, t: 0 };
  G.banner = { txt: 'K.O.', t: 0, big: true }; voice('sys', 'ko', { delay: .45 });
  G.wins[att.side]++; for (const f of G.teams[att.side]) f.wins = G.wins[att.side];
}

/* SUZUNE's short step-dash: brief invulnerability (slips through AOI's shots), short cooldown */
const CAN_DASH = { suzune: 1, arca: 1, mio: 1, aria: 1, enjo: 1, rei: 1 };
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
    if (f.id === 'enjo') {   // smoke warp: no after-images, a jade smoke trail instead
      fxSmoke(f.x - f.dashDir * rnd(0, 60), f.y - rnd(40, 300), 2, 1, -f.dashDir, f.col.rgb);
      if (f.t < 1) { fxSmoke(f.x, f.y - 160, 10, 1.6, 0, f.col.rgb); playS('dash', .5, .7); }
    } else {
      f.trail.push(1); f.rail.push({ x: f.x - f.dashDir * 20, y: f.y - 10, t: G.frame });
      if (G.frame % 3 === 0) fxDust(f.x - f.dashDir * 40, f.y, 1, .6);
    }
    if (f.id === 'mio' && G.frame % 2 === 0) { fxPaint(f.x - f.dashDir * 50, GROUND - 14, 2, .7, -f.dashDir); if (G.frame % 4 === 0) fxPuddle(f.x - f.dashDir * 30, PAINT.blue, 46, 90); }
    // dash-cancel: attacks come out of the back half of the dash so it leads straight into close range
    if (canAct && f.t >= DASH.cancel) {
      f.face = Math.sign(o.x - f.x) || f.face;
      if (f.buf.s > 0) { f.buf.s = 0; startMove(f, spPick(f)); }
      else if (f.buf.a > 0) { f.buf.a = 0; startMove(f, 'a'); }
      else if (f.buf.u > 0 && f.id !== 'arca') { f.buf.u = 0; f.state = 'jump'; f.vy = f.ch.jump; f.vx = f.dashDir * f.ch.speed * 1.4; sfx.jump(); }
    }
    if (f.state === 'dash' && f.t >= DASH.len) { f.state = 'idle'; f.land = 6; f.vx *= .3; if (f.id === 'enjo') fxSmoke(f.x, f.y - 160, 10, 1.4, 0, f.col.rgb); else fxDust(f.x, f.y, 4, .7); }
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
  const sep = W / G.cam.z - 320;   // keep both fighters inside the (zoomed) frame
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
    if (f.state === 'win' && !f.dragon && ANIMS.sakura) f.dragon = { mode: 'win', t: 0, face: f.face, x: f.x - f.face * 900, y: f.y - 514, hits: 0, next: 0 };
    if (!f.dragon) { f.droneX = sakuraTip(f).x; f.droneY = sakuraTip(f).y; }
    updateDragon(f, G.fighters[1 - f.side], dt);
  }
  if (f.id === 'mio') {
    if (f.state === 'win' && !f.dog && ANIMS.mio && ANIMS.mio.a.dIdle) f.dog = { mode: 'win', t: 0, face: f.face, x: f.x - f.face * 330, y: GROUND, hits: 0, next: 0, a: 0 };
    updateDog(f, G.fighters[1 - f.side], dt);
  }
  if (f.id === 'enjo') {
    updateSkull(f, dt);
    if (f.state === 'win' && !f.shishi && ANIMS.enjo && ANIMS.enjo.a.gIdle) f.shishi = { mode: 'win', t: 0, face: f.face, x: f.x - f.face * 300, y: GROUND, a: 0 };
    updateShishi(f, G.fighters[1 - f.side], dt);
  }
  // drone follows
  if (f.id === 'aoi') {
    f.droneA += .05 * dt;
    const r = RS(f); let tx = f.x + f.face * 70 * r, ty = f.y - 330 * r + Math.sin(f.droneA) * 10;
    if (f.move && f.move.key === 'ult') { tx = f.x + f.face * 140 * r; ty = f.y - 200 * r; }
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
  if (f.id === 'aria' && f.state === 'atk' && f.move && f.move.zip && f.move.zip.phase === 'zip' && f.move.key === 'ex') { P.rot = f.move.zip.rot || 0; P.sx = 1; P.sy = 1; }   // flies nose-first along the diagonal
  if (f.id === 'arca' && ANIMS.arca) { P.rot = f.state === 'hit' ? P.rot * .3 : 0; P.sx = 1 + (P.sx - 1) * .35; P.sy = 1 + (P.sy - 1) * .35; P.top *= .3; P.bot *= .3; }
  return P;
}

function pushApart(a, b) {
  if (a.hidden || b.hidden) return;
  const passing = x => x.state === 'atk' && x.move && (((x.move.key === 'ex' || x.move.key === 'ult') && x.id === 'suzune') || (x.id === 'aria' && x.move.zip));
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
  if (f.id === 'suzune' || f.id === 'aria' || f.id === 'rei') {
    if (f.gauge >= 50 && ad < 460 && Math.random() < .3) { ai.press = 'ex'; return out; }
    if (ad > 190) { if (Math.random() < .18) { set({ [toward]: true, u: true }, 6); } else set({ [toward]: true }, 10 + (Math.random() * 12 | 0)); }
    else if (Math.random() < D.agg) ai.press = Math.random() < .35 ? 'b' : 'a';
    else set({ [away]: true }, 8);
  } else if (f.id === 'enjo') {   // keeps her distance: skull shots at range, the kiseru up close, GASHIRA whenever it can
    if (f.gauge >= 50 && ad < 760 && Math.random() < .3) { ai.press = 'ex'; return out; }
    if (ad > 380) { if (Math.random() < D.agg * .7) ai.press = 'b'; else set({ [toward]: true }, 12); }
    else if (ad < 240) { if (Math.random() < D.agg) ai.press = 'a'; else set({ [away]: true }, 10); }
    else if (Math.random() < .5) ai.press = 'b'; else set({ [toward]: true }, 8);
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
  G.resultShown = false; G.victory = null; G.fx = []; G.proj = []; G.paintFloor = []; G.luna = null; G.ink = null; G.inkWash = null; G.timer = 99; G.timerF = 0; G.phase = 'intro'; G.phaseT = 0; G.cutin = null; G.rwCut = null; G.freeze = 0; G.tintA = 0; G.slow = 1;
  G.cam.x = STAGE_W / 2; G.cam.z = 1; G.comboHud = [null, null]; G.cam.tilt = 0; G.cam.push = 0; G.koCam = null;
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
  ctx.translate(W / 2 + ox, GY + oy + (c.y || 0));
  if (c.tilt) { ctx.translate(0, -H * .35); ctx.rotate(c.tilt); ctx.translate(0, H * .35); }
  ctx.scale(z, z); ctx.translate(-c.x - (c.push || 0), -GROUND);
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
  const base = Math.max(1.04, 1.1 * (1 + (z - 1) * .75)) * (1 + Math.abs(c.tilt || 0) * 1.9), w = W * base, h = H * base;
  if (c.tilt) { ctx.save(); ctx.translate(W / 2, GY - H * .35); ctx.rotate(c.tilt * .8); ctx.translate(-W / 2, -(GY - H * .35)); }   // the backdrop zooms a bit less than the fighters (depth), never below full-screen
  const px = -(camX - STAGE_W / 2) * .09 + (sh ? rnd(-sh, sh) * .6 : 0), py = sh ? rnd(-sh, sh) * .4 : 0;
  ctx.drawImage(v, (W - w) / 2 + px, (H - h) * .62 + py, w, h);
  if (c.tilt) ctx.restore();
  ctx.fillStyle = 'rgba(8,6,20,.12)'; ctx.fillRect(0, 0, W, H);                   // slight grade so fighters pop
  if (G.ultMono > 0) {   // ULT: the world drains to grey and darkens, only the fighters and the move keep their colour
    const a = Math.min(1, G.ultMono / 20);
    ctx.save(); ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = `rgba(128,128,128,${a})`; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = `rgba(6,4,14,${.45 * a})`; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
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
// procedural secondary motion at full frame rate on top of the sprite animation: breathing, lean into movement, hit recoil, speed stretch
function secMotion(f) {
  let r = 0, sx = 1, sy = 1;
  const fwd = f.vx * f.face, sp = Math.abs(f.vx);
  if (f.state === 'idle' || f.state === 'guard') sy = 1 + .007 * Math.sin(G.frame * .065 + f.side * 2);
  if (f.state === 'walk' || f.state === 'dash' || f.state === 'dashin') r += clamp(fwd / 260, -.03, .045);
  if (f.state === 'hit') r -= .085 * Math.max(0, 1 - f.t / 16);
  if (sp > 12 && f.state !== 'hit' && f.state !== 'air') { const k = Math.min(.08, (sp - 12) / 180); sx *= 1 + k; sy *= 1 - k * .45; }
  if (f.state === 'air' && f.ko) r -= .06;
  return { r, sx, sy };
}
function drawFighter(f, reflect) {
  if (f.hidden) return;
  const g = f.gfx, pf = pickFrame(f), fr = pf && pf.fr, K = fr ? ANIMS[f.id].k : 0;
  if (!fr) return drawFighterStill(f, reflect);
  const src = frameSrc(fr, f); if (!src) return;
  const bx = fr.ox * K, by = fr.oy * K, bw = fr.w * K, bh = fr.h * K;
  if (reflect) {
    ctx.save(); ctx.globalAlpha = .22; ctx.translate(f.x, GROUND); ctx.scale(1, -.55); ctx.translate(-f.x, -GROUND);
    const sm = secMotion(f); setT(f.x, f.y, f.face, f.rot + sm.r, f.sx * sm.sx, f.sy * sm.sy);
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
  const sm = secMotion(f);
  ctx.save(); setT(f.x + f.ox, f.y, f.face, f.rot + sm.r, f.sx * sm.sx, f.sy * sm.sy);
  const beat = .5 + .5 * Math.sin(G.frame * .09 + f.side * 2);
  const pulse = f.gauge >= 100 ? .85 + .15 * Math.sin(G.frame * .2) : f.state === 'atk' ? .75 : .45 + .15 * beat;
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = pulse * pwr;
  if (pwr > 0) drawGlow(src, fr, bx, by, bw, bh, arg);
  if (hotA) { ctx.globalAlpha = .35 + .2 * beat; drawGlow(src, fr, bx - 6, by - 6, bw + 12, bh + 12, ahot); }
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = f.inv > 0 && f.inv < 900 && f.state !== 'atk' && f.state !== 'getup' && f.state !== 'dash' ? (G.frame % 6 < 3 ? .5 : 1) : 1;
  if (f.id === 'enjo' && f.state === 'dash') { const q = f.t / DASH.len; ctx.globalAlpha = .12 + .88 * Math.abs(q * 2 - 1); }   // smoke warp: fades out, then re-forms
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
/* ---------- big COMBO counter (PV style): attacker's side of the screen, white → red at 10 → blazing red/gold at 30 ---------- */
const COMBO_MS = [10, 30, 50, 100];
function comboHit(att, tgt) {
  G.comboHud = G.comboHud || [null, null];
  const n = tgt.combo, c = G.comboHud[att.side] = Object.assign(G.comboHud[att.side] || {}, { n, f: G.frame, tgt, att, endF: 0 });
  if (COMBO_MS.includes(n)) {
    c.burst = { n, f: G.frame };
    playLoud('impact_big', n >= 30 ? .9 : .6, n >= 30 ? .8 : 1.05); shake(n >= 30 ? 14 : 8);
    pfxKick({ ca: n >= 30 ? 2.2 : 1.2, bloom: n >= 30 ? .5 : .25 }); if (n >= 30) flash(.35, '255,70,60');
  }
}
function drawComboHud() {
  const hud = G.comboHud; if (!hud || G.phase === 'intro') return;
  for (let side = 0; side < 2; side++) {
    const c = hud[side]; if (!c) continue;
    const live = c.tgt && (c.tgt.state === 'hit' || c.tgt.state === 'air') && c.tgt.combo === c.n;
    if (!live && !c.endF) c.endF = G.frame;
    const gone = c.endF ? G.frame - c.endF : 0;
    if (gone > 70) { hud[side] = null; continue; }
    const alpha = gone > 50 ? 1 - (gone - 50) / 20 : 1;
    const age = G.frame - c.f, punch = 1 + .5 * Math.exp(-age / 4);
    const n = c.n, tier = n >= 30 ? 2 : n >= 10 ? 1 : 0;
    const dir = side ? -1 : 1, x0 = side ? W - 64 : 64, y0 = 318;
    const shake = tier === 2 ? 3 : tier === 1 ? 1.2 : 0, jx = shake ? (Math.random() - .5) * shake * 2 : 0, jy = shake ? (Math.random() - .5) * shake * 2 : 0;
    ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x0 + jx, y0 + jy); ctx.transform(1, 0, -.12, 1, 0, 0);
    ctx.textAlign = side ? 'right' : 'left'; ctx.textBaseline = 'alphabetic';
    // radiating burst behind the number at 10+ / 30+
    if (tier) {
      const R = (tier === 2 ? 150 : 110) * (1 + .08 * Math.sin(G.frame * .5)), cx = dir * 95, cy = -40;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(cx, cy); ctx.rotate(G.frame * .02 * dir);
      for (let i = 0; i < 16; i++) { const a = i * TAU / 16, r1 = R * (i % 2 ? .55 : 1);
        ctx.fillStyle = tier === 2 ? (i % 2 ? 'rgba(255,190,60,.35)' : 'rgba(255,40,40,.4)') : 'rgba(255,50,60,.28)';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a - .09) * r1, Math.sin(a - .09) * r1); ctx.lineTo(Math.cos(a + .09) * r1, Math.sin(a + .09) * r1); ctx.fill(); }
      ctx.restore();
    }
    // "COMBO" label
    ctx.font = `700 22px 'Chakra Petch', sans-serif`; ctx.fillStyle = tier ? '#ffd0c8' : '#fff';
    const lbl = 'C O M B O'; ctx.fillText(lbl, 0, -112);
    // the number: extruded shadow, then fill, scale-punched on every hit
    ctx.save(); ctx.scale(punch, punch);
    const size = tier === 2 ? 138 : tier === 1 ? 126 : 112;
    ctx.font = `700 ${size}px 'Chakra Petch', sans-serif`;
    const ext = tier === 2 ? '120,10,10' : tier === 1 ? '110,0,20' : (c.att ? c.att.col.rgb : '40,200,190');
    for (let k = 7; k >= 1; k--) { ctx.fillStyle = `rgba(${ext},${tier ? .9 : .75})`; ctx.fillText(n, dir * k * 1.2, k * 1.4); }
    if (tier) { ctx.shadowColor = tier === 2 ? 'rgba(255,120,30,.95)' : 'rgba(255,40,50,.85)'; ctx.shadowBlur = tier === 2 ? 34 : 22; }
    if (tier === 2) { const g = ctx.createLinearGradient(0, -size, 0, 0); g.addColorStop(0, '#fff6c8'); g.addColorStop(.35, '#ffcc40'); g.addColorStop(.6, '#ff3a2a'); g.addColorStop(1, '#b0001a'); ctx.fillStyle = g; }
    else if (tier === 1) { const g = ctx.createLinearGradient(0, -size, 0, 0); g.addColorStop(0, '#ffd2d2'); g.addColorStop(.5, '#ff3048'); g.addColorStop(1, '#c00024'); ctx.fillStyle = g; }
    else ctx.fillStyle = '#fff';
    ctx.fillText(n, 0, 0);
    ctx.shadowBlur = 0;
    if (tier) { ctx.lineWidth = tier === 2 ? 3 : 2; ctx.strokeStyle = tier === 2 ? '#fff3c0' : 'rgba(255,255,255,.85)'; ctx.strokeText(n, 0, 0); }
    ctx.restore();
    // HITS tag
    const tw = 92, tx = side ? -tw : 0;
    ctx.fillStyle = tier === 2 ? '#ffcc40' : tier === 1 ? '#ff3048' : '#fff'; ctx.fillRect(tx, 14, tw, 30);
    ctx.font = `700 22px 'Chakra Petch', sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = tier ? '#1a0306' : '#0c0814'; ctx.fillText('HITS', tx + tw / 2, 37);
    ctx.restore();
    // milestone call-out: "10 COMBO!" / "30 COMBO!!"
    const b = c.burst;
    if (b && G.frame - b.f < 50) {
      const u = (G.frame - b.f) / 50, k = Math.min(1, (G.frame - b.f) / 6), big = b.n >= 30;
      ctx.save(); ctx.globalAlpha = Math.min(1, (1 - u) * 2.5); ctx.translate(side ? W - 80 : 80, 420); ctx.transform(1, 0, -.18, 1, 0, 0);
      const s = (big ? 1.25 : 1) * (1.8 - .8 * k); ctx.scale(s, s);
      ctx.textAlign = side ? 'right' : 'left'; ctx.font = `700 ${big ? 54 : 44}px 'Chakra Petch', sans-serif`;
      const txt = `${b.n} COMBO${'!'.repeat(Math.min(4, COMBO_MS.indexOf(b.n) + 1))}`;
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(20,0,4,.9)'; ctx.strokeText(txt, 0, 0);
      ctx.shadowColor = big ? 'rgba(255,140,40,.9)' : 'rgba(255,40,60,.8)'; ctx.shadowBlur = 20;
      ctx.fillStyle = big ? '#ffd040' : '#ff4058'; ctx.fillText(txt, 0, 0);
      ctx.restore();
    }
  }
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
  if (PFX.on) ctx = wctx;
  const game = renderWorld();
  if (PFX.on) {
    pfxDraw(PFX.dt || 16.67); ctx = hudctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  }
  if (game) renderHUD();
}
function renderWorld() {
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const c = G.cam;
  if (G.scene === 'game' && stageReady()) drawStage(c.x); else drawBackground(c.x, c.z);
  if (G.scene === 'game') drawLunaSky();
  if (G.scene !== 'game' || !G.fighters.length) { drawIdleFx(); return false; }
  const lerpBack = interpBegin();
  ctx.save(); worldTransform();
  drawFloor();
  ctx.save(); ctx.beginPath(); ctx.rect(-5000, GROUND, 10000 + STAGE_W, 2000); ctx.clip();
  for (const b of G.benched || []) drawFighter(b.f, true);
  for (const f of G.fighters) drawFighter(f, true);
  ctx.restore();
  drawCometFx();
  ctx.globalCompositeOperation = 'lighter'; for (const f of G.fighters) drawRail(f); ctx.globalCompositeOperation = 'source-over';
  const order = [...G.fighters].sort((p, q) => (p.state === 'atk') - (q.state === 'atk'));
  drawPaintFloor(); drawInk();
  for (const f of G.fighters) { drawDragon(f, false); drawDog(f, false); drawShishi(f, false); }
  for (const b of G.benched || []) drawFighter(b.f, false);
  for (const f of order) drawFighter(f, false);
  for (const f of G.fighters) { drawDrone(f); drawSkull(f); drawDragon(f, true); drawDog(f, true); drawShishi(f, true); drawRindo(f); }
  drawFx('norm');
  ctx.globalCompositeOperation = 'lighter'; drawProj(); drawFx('add'); ctx.globalCompositeOperation = 'source-over';
  drawLunaBeam();
  ctx.restore();
  if (G.tintA > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(${G.tintC},${G.tintA * .25})`; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }
  drawInkWash();
  if (G.speedlines > 0) drawSpeedLines(G.speedlines);
  if (!PFX.on) {   // vignette (the GL layer does its own)
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * .95); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(8,4,18,.55)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
  lerpBack();
  return true;
}
// draw fighters between the last two 60 Hz sim steps, so 90/120/144 Hz screens get genuinely smooth motion
function interpBegin() {
  if (G.paused || G.exPause || G.hitstop > 0 || G.freeze > 0) return () => { };
  const a = clamp(acc / (1000 / 60), 0, 1), saved = [];
  for (const f of [...G.fighters, ...(G.benched || []).map(b => b.f)]) {
    if (f.px === undefined || Math.abs(f.x - f.px) > 160 || Math.abs(f.y - f.py) > 160) continue;   // teleports snap
    saved.push([f, f.x, f.y]); f.x = lerp(f.px, f.x, a); f.y = lerp(f.py, f.y, a);
  }
  return () => { for (const [f, x, y] of saved) { f.x = x; f.y = y; } };
}
function renderHUD() {
  if (G.victory) drawVictory(); else { drawHUD2(); drawComboHud(); drawCutin(); drawBanner(); drawRwCut(); }
  if (G.flash > 0 && !(PFX.on && PFX.impact > 0)) { ctx.fillStyle = `rgba(${G.flashCol},${Math.min(1, G.flash)})`; ctx.fillRect(0, 0, W, H); }   // the impact frame replaces the white-out
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
  for (const f of G.fighters) { f.px = f.x; f.py = f.y; }
  for (const b of G.benched || []) { b.f.px = b.f.x; b.f.py = b.f.y; }
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
const CAM = { zMax: 1.3, zMin: .76, zWin: 1.22, near: 360, far: 1250, in: .035, out: .09 };
function smooth01(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
function updateCamera() {
  const c = G.cam, [a, b] = G.fighters;
  if (a && b) {
    const vis = [a, b].filter(f => !f.hidden); const cx = f => f.state === 'tagin' && f.tg ? f.tg.x1 : f.x;
    let mid = vis.length ? vis.reduce((s, f) => s + cx(f), 0) / vis.length : c.x;
    const wf = vis.find(f => f.state === 'win'); if (wf) mid = wf.x;
    const d = vis.length === 2 ? Math.abs(cx(a) - cx(b)) : 600;
    // Art-of-Fighting style camera: close in when the fighters are near, pull back when they spread out
    const big = G.fighters.some(f => f.state === 'atk' && f.move && (f.move.key === 'ult' || f.move.key === 'ex')) || G.luna || G.phase === 'intro' || vis.some(f => f.state === 'tagin' || f.state === 'dashin');
    let zt = CAM.zMax - (CAM.zMax - CAM.zMin) * smooth01((d - CAM.near) / (CAM.far - CAM.near));
    if (big) zt = Math.min(zt, 1);                                   // big moves and entrances need the wide shot
    if (wf) zt = CAM.zWin;                                           // victory pose: push in on the winner
    const kc = G.koCam; if (kc) { kc.t++; if (G.phase === 'ko' && kc.t < 90) { zt = 1.45; mid = kc.f.x; } else G.koCam = null; }   // final KO: crash in on the loser
    if (!c.z) c.z = 1;
    c.z = lerp(c.z, zt, zt < c.z ? CAM.out : CAM.in);                // pull back quickly so nobody leaves the frame, push in slowly
    if (Math.abs(c.z - zt) < .001) c.z = zt;
    const half = W / 2 / c.z;
    c.x = lerp(c.x, clamp(mid, half, STAGE_W - half), G.koCam ? .2 : .12);
    const ua = G.fighters.find(f => f.state === 'atk' && f.move && f.move.key === 'ult');   // dutch angle while a ULT plays
    c.tilt = lerp(c.tilt || 0, ua ? -ua.face * .045 : 0, .06);
    const hi = Math.max(...vis.map(f => f.state === 'tagin' ? 0 : GROUND - f.y), 0); c.y = lerp(c.y || 0, Math.max(0, hi - 120 / c.z) * .7 * c.z, .14);   // tilt up for big jumps
  }
  c.shake *= .86; if (c.shake < .3) c.shake = 0;
  c.kick *= .8; c.push = (c.push || 0) * .84; if (Math.abs(c.push) < .3) c.push = 0;
  G.flash *= .86; if (G.flash < .01) G.flash = 0;
  if (G.ultMono > 0) { G.ultMono -= 1; if (!G.fighters.some(f => f.state === 'atk' && f.move && f.move.key === 'ult')) G.ultMono = Math.min(G.ultMono, 20); }
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
  const dt = Math.min(100, ts - (last || ts)); last = ts; PFX.dt = dt || 16.67;
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
  ultRiser(Math.max(1.5, (v.duration || 3.2) - .1));
  clearTimeout(EXM.timer); EXM.timer = setTimeout(exMovieEnd, (v.duration || 3.2) * 1000 + 600);
  return true;
}
function exMovieEnd() {
  if (!G.exPause || EXM.hold) return;
  clearTimeout(EXM.timer);
  const box = $('#exMovie'); box.classList.remove('on');
  box.querySelectorAll('video').forEach(v => { try { v.pause(); } catch (e) { } });
  const bv = stopMovieAudio(.04); killRiser();
  if (BGM.gain && SND.ac) { const t = SND.ac.currentTime; BGM.gain.gain.cancelScheduledValues(t); BGM.gain.gain.setValueAtTime(0, t); }   // total silence
  G.flash = 1; G.flashCol = '255,255,255'; EXM.hold = true;
  setTimeout(() => {   // ...then the blast
    EXM.hold = false; const f = EXM.f;
    G.exPause = false; acc = 0; flash(1, f ? auraHot(f) : '255,255,255'); shake(22); quake(26, 1, 140); zoomKick(.12); G.speedlines = 50;
    ultBlast(1); bgmVolume(bv !== null ? bv : .5, .9);
    if (f) { fxText(f.x, f.y - 470, f.ch.ultName, auraRgb(f), 54, 70); G.ultMono = 150; pfxWave(f.x, f.y - 160, 2, 44); pfxKick({ radial: 1.4, x: f.x, y: f.y - 160, bloom: .9, ca: 2.5 }); }
    EXM.f = null;
  }, 320);
}
/* ---------- match victory movie + telop ---------- */
const WINQ = { suzune: 'まだまだ、こんなもんじゃないッス！', aoi: '解析完了。――この勝負、わたしの勝ち。', arca: '観測、完了です。……え、もう終わりですか？', sakura: 'わたしの設計に、狂いはないの。', mio: 'ほら、世界がちょっとキレイになった！', aria: 'へへっ、空はあたしの整備場っす！', enjo: '浮世は煙。掴めたと思った？', rei: 'この涙は、私が人間だった最後の証。' };
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
  try { pfxInit(); } catch (e) { console.warn('postfx off', e); PFX.on = false; }
  resize();
  buildBg();
  await Promise.all([buildAssets(), buildAnims(), loadBGM().then(() => Promise.all([loadVoices(), loadSfx()]))]);
  document.querySelectorAll('[data-src]').forEach(i => i.src = window.ASSETS[i.dataset.src]);
  document.querySelectorAll('.card img').forEach(i => { const id = i.closest('.card').dataset.char; i.src = window.ASSETS[{ suzune: 'suci', aoi: 'aoci', arca: 'arcard', sakura: 'sacard', mio: 'micard', aria: 'ar2card', enjo: 'encard', rei: 'recard' }[id]]; });
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
