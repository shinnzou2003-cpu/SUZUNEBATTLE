#!/usr/bin/env python3
"""1VS1 double-frame-rate set by AI frame interpolation (RIFE v4.6 via rife-ncnn-vulkan; CPU works through lavapipe).

  python3 tools/interp_hi.py <id> [clip ...]     -> anim/hi/<id>.json + anim/hi/<id>_<clip>_0.webp

For fighters with no source video config (SUZUNE / AOI / ARCA). Each in-between is made from the two
neighbouring frames laid out in the shared anchor space; the sprite is composited over a key colour chosen
far from the character's palette, interpolated, then re-keyed, so alpha edges follow the same motion.
Same storeH / anchor as the normal set; clips the game indexes by frame number are left alone.
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

SKIP = {'cutin', 'guard', 'jump', 'down'}
LOOPS = {'idle', 'walk', 'win', 'ultCharge', 'idleEmpty'}
_rife = None
IOU_MIN = .5

def rife():
    global _rife
    if _rife is None:
        from rife_ncnn_vulkan_python import Rife
        _rife = Rife(gpuid=0, model='rife-v4.6', num_threads=os.cpu_count() or 2, channels=3)
    return _rife

def frames_of(meta, k, cache):
    out = []
    for fr in meta['anims'][k]['frames']:
        p = meta['anims'][k]['atlases'][fr['a']].split('?')[0]
        if p not in cache: cache[p] = Image.open(p).convert('RGBA')
        out.append((cache[p].crop((fr['x'], fr['y'], fr['x'] + fr['w'], fr['y'] + fr['h'])), fr['ox'], fr['oy']))
    return out

def pick_key(frames):
    px = np.concatenate([np.asarray(im)[..., :3][np.asarray(im)[..., 3] > 200] for im, _, _ in frames[::max(1, len(frames) // 6)]])
    px = px[np.random.default_rng(0).choice(len(px), min(20000, len(px)), replace=False)].astype(np.float32)
    best, bd = None, -1
    for c in [(0, 177, 64), (255, 0, 255), (0, 90, 255), (255, 255, 0), (0, 255, 255), (255, 80, 0)]:
        d = np.percentile(np.sqrt(((px - np.array(c, np.float32)) ** 2).sum(1)), 1)
        if d > bd: best, bd = c, d
    return np.array(best, np.float32), bd

def mid(A, B, key=None):
    """A, B: (img, ox, oy) in the clip's anchor space. Returns the in-between (img, ox, oy).
    Two RIFE passes (sprite over black, sprite over white) give colour and alpha by difference matting,
    so no key colour can leak into the edges."""
    x0 = min(A[1], B[1]); y0 = min(A[2], B[2])
    x1 = max(A[1] + A[0].width, B[1] + B[0].width); y1 = max(A[2] + A[0].height, B[2] + B[0].height)
    pad = 24; W = int(np.ceil(x1 - x0)) + 2 * pad; H = int(np.ceil(y1 - y0)) + 2 * pad
    W += (-W) % 32; H += (-H) % 32
    def lay(F):
        c = Image.new('RGBA', (W, H), (0, 0, 0, 0)); c.paste(F[0], (int(round(F[1] - x0)) + pad, int(round(F[2] - y0)) + pad)); return np.asarray(c).astype(np.float32)
    a, b = lay(A), lay(B)
    sa, sb = a[..., 3] > 128, b[..., 3] > 128
    iou = (sa & sb).sum() / max(1, (sa | sb).sum())
    if iou < IOU_MIN: return None          # too far apart to invent a believable in-between: caller holds the frame
    def over(r, bg): return (r[..., :3] * (r[..., 3:] / 255) + bg * (1 - r[..., 3:] / 255)).clip(0, 255).astype(np.uint8)
    run = lambda bg: np.asarray(rife().process(Image.fromarray(over(a, bg)), Image.fromarray(over(b, bg)))).astype(np.float32)
    cb, cw = run(0.0), run(255.0)
    al = 1 - (cw - cb).mean(-1) / 255
    al = np.clip((al - .04) / .92, 0, 1)
    reach = ndimage.binary_dilation((a[..., 3] > 20) | (b[..., 3] > 20), iterations=3)
    al *= reach
    solid = al > .5
    lab, n = ndimage.label(solid)
    if n > 1:
        sz = ndimage.sum(solid, lab, range(1, n + 1)); keep = np.isin(lab, 1 + np.where(sz >= 40)[0])
        al = np.where(solid & ~keep, 0, al)
    # pin-holes the two passes disagree on: fill small enclosed gaps (real gaps between limbs are large)
    m = al > .5; holes = ndimage.binary_fill_holes(m) & ~m
    hl, hn = ndimage.label(holes)
    if hn:
        hs = ndimage.sum(holes, hl, range(1, hn + 1)); small = np.isin(hl, 1 + np.where(hs < 500)[0])
        al = np.where(small, 1.0, al)
    al = np.where(ndimage.binary_erosion(al > .5, iterations=2), np.maximum(al, .985), al)   # body interior stays solid
    rgb = cb / np.maximum(al[..., None], .03)
    out = np.dstack([rgb.clip(0, 255), al * 255]).astype(np.uint8)
    out[..., 3][out[..., 3] < 14] = 0
    im = Image.fromarray(out, 'RGBA'); bb = im.getbbox()
    if not bb: return A
    return im.crop(bb), x0 - pad + bb[0], y0 - pad + bb[1]

def build(cid, only=None):
    meta = json.load(open(f'anim/{cid}.json')); cache = {}
    os.makedirs('anim/hi', exist_ok=True)
    hp = f'anim/hi/{cid}.json'
    hi = json.load(open(hp)) if os.path.exists(hp) else {'storeH': meta['storeH'], 'anims': {}}
    for k, an in meta['anims'].items():
        if k in SKIP or an.get('fps', 24) >= 24 or len(an['frames']) < 2: continue
        if only and k not in only: continue
        F = frames_of(meta, k, cache); key, kd = None, 0
        out = []
        n = len(F); loop = k in LOOPS; held = 0
        for i in range(n):
            out.append(F[i])
            nb = F[i + 1] if i + 1 < n else F[0] if loop else None
            if nb is None: continue
            m = mid(F[i], nb); out.append(m or F[i]); held += m is None
        # shelf pack
        pad, maxW = 4, 3990; x = y = pad; rowH = 0; place = []
        for im, ox, oy in out:
            if x + im.width + pad > maxW: x = pad; y += rowH + pad; rowH = 0
            place.append((im, x, y, ox, oy)); x += im.width + pad; rowH = max(rowH, im.height)
        AW = max(p[1] + p[0].width for p in place) + pad; AH = y + rowH + pad
        at = Image.new('RGBA', (AW, AH)); fr = []
        for im, px, py, ox, oy in place:
            at.paste(im, (px, py)); fr.append({'a': 0, 'x': px, 'y': py, 'w': im.width, 'h': im.height, 'ox': round(float(ox), 1), 'oy': round(float(oy), 1)})
        path = f'anim/hi/{cid}_{k}_0.webp'; at.save(path, 'WEBP', quality=82, method=6)
        hi['anims'][k] = {'fps': an.get('fps', 24) * 2, 'atlases': [path], 'frames': fr}
        print(f'{cid} {k:10s} {an.get("fps")}fps x{n} -> {an.get("fps")*2}fps x{len(fr)} (held {held})  {os.path.getsize(path)//1024}KB', flush=True)
        json.dump(hi, open(hp, 'w'), separators=(',', ':'))

if __name__ == '__main__':
    build(sys.argv[1], set(sys.argv[2:]) or None)
