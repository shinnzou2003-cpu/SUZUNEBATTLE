#!/usr/bin/env python3
"""SAKURA sprite pipeline: green-screen video -> keyed frames -> packed WebP atlases + anim JSON.

Usage:
  sprite_tool.py sheet  VIDEO OUT.jpg [--fps 4]          contact sheet with timestamps (to pick segments)
  sprite_tool.py pack   CONFIG.json                       build anim/<id>.json + anim/<id>_<anim>_0.webp
CONFIG = { "id": "sakura", "video": "...", "out": "anim", "ground": null|y, "anchorX": null|x,
           "storeH": null|h, "anims": { "idle": {"t0":0.2,"t1":1.9,"fps":8,"pingpong":true}, ... } }
"""
import json, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageDraw

KEY = np.array([0, 177, 64], np.float32)  # #00B140


def frames(video, t0, t1, fps):
    d = tempfile.mkdtemp()
    subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{t0}', '-to', f'{t1}', '-i', video,
                    '-vf', f'fps={fps}', f'{d}/f%04d.png'], check=True)
    return [Image.open(os.path.join(d, n)).convert('RGB') for n in sorted(os.listdir(d))]


def key(img):
    a = np.asarray(img).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # greenness: how much green dominates the other channels
    gd = g - np.maximum(r, b)
    alpha = np.clip(1.0 - (gd - 25.0) / 45.0, 0, 1)          # gd<=25 opaque, gd>=70 transparent
    # despill: clamp green to max(r,b) where it dominates
    spill = np.maximum(r, b)
    g2 = np.where(g > spill, spill + (g - spill) * 0.15, g)
    out = np.dstack([r, g2, b, alpha * 255]).clip(0, 255).astype(np.uint8)
    im = Image.fromarray(out, 'RGBA')
    # drop tiny specks: zero alpha below 0.1
    arr = np.asarray(im).copy(); arr[..., 3][arr[..., 3] < 26] = 0
    return Image.fromarray(arr, 'RGBA')


def bbox(im):
    al = np.asarray(im)[..., 3]
    ys, xs = np.where(al > 40)
    if not len(xs):
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def sheet(video, out, fps=4):
    dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                         '-of', 'csv=p=0', video]).decode().strip())
    fr = frames(video, 0, dur, fps)
    tw, th = 214, 120
    cols = 10
    rows = (len(fr) + cols - 1) // cols
    S = Image.new('RGB', (cols * tw, rows * (th + 14)), 'black')
    dr = ImageDraw.Draw(S)
    for i, f in enumerate(fr):
        x, y = (i % cols) * tw, (i // cols) * (th + 14)
        S.paste(f.resize((tw, th)), (x, y + 14))
        dr.text((x + 3, y + 1), f'{i / fps:.2f}s', fill='yellow')
    S.save(out, quality=85)
    print(out, len(fr), 'frames', f'{dur:.2f}s')


def pack(cfg):
    cid, video, outdir = cfg['id'], cfg['video'], cfg['out']
    os.makedirs(outdir, exist_ok=True)
    keyed = {}
    for name, a in cfg['anims'].items():
        src = a.get('video', video)
        if a.get('times'):
            fl = [key(frames(src, t, t + .06, 24)[0]) for t in a['times']]
        else:
            fl = [key(f) for f in frames(src, a['t0'], a['t1'], a['fps'])]
        if a.get('take'):
            fl = [fl[i] for i in a['take'] if i < len(fl)]
        if a.get('reverse'):
            fl = fl[::-1]
        if a.get('pingpong') and len(fl) > 2:
            fl = fl + fl[-2:0:-1]
        keyed[name] = fl
    # anchor: feet line + body centre measured on the first idle frame (camera is locked)
    ref = keyed.get('idle', next(iter(keyed.values())))[0]
    x0, y0, x1, y1 = bbox(ref)
    ground = cfg.get('ground') or y1
    anchorX = cfg.get('anchorX') or (x0 + x1) / 2
    storeH = cfg.get('storeH') or (y1 - y0)
    meta = {'storeH': round(float(storeH), 1), 'anims': {}}
    gref = {}
    for name, a in cfg['anims'].items():
        g = a.get('group')
        if g and g not in gref:
            bx = bbox(keyed[name][0]); gref[g] = ((bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2)
    pad, maxW = 4, 3990
    for name, fl in keyed.items():
        crops = []
        for im in fl:
            bb = bbox(im)
            if not bb:
                continue
            bx0, by0, bx1, by1 = bb
            bx0, by0 = max(0, bx0 - 2), max(0, by0 - 2)
            bx1, by1 = min(im.width, bx1 + 2), min(im.height, by1 + 2)
            g = cfg['anims'][name].get('group')
            ax, ay = gref[g] if g else (anchorX, ground)
            crops.append((im.crop((bx0, by0, bx1, by1)), bx0 - ax, by0 - ay))
        # shelf packing into one atlas
        x = y = pad; rowH = 0; place = []
        for c, ox, oy in crops:
            w, h = c.size
            if x + w + pad > maxW:
                x = pad; y += rowH + pad; rowH = 0
            place.append((c, x, y, ox, oy)); x += w + pad; rowH = max(rowH, h)
        AW = max(p[1] + p[0].width for p in place) + pad
        AH = y + rowH + pad
        at = Image.new('RGBA', (AW, AH), (0, 0, 0, 0))
        fr = []
        for c, px, py, ox, oy in place:
            at.paste(c, (px, py))
            fr.append({'a': 0, 'x': px, 'y': py, 'w': c.width, 'h': c.height,
                       'ox': round(float(ox), 1), 'oy': round(float(oy), 1)})
        path = f'{outdir}/{cid}_{name}_0.webp'
        at.save(path, 'WEBP', quality=cfg.get('quality', 82), method=6)
        meta['anims'][name] = {'fps': cfg['anims'][name].get('play', cfg['anims'][name].get('fps', 24)),
                               'atlases': [f'anim/{cid}_{name}_0.webp'], 'frames': fr}
        print(f'{name:10s} {len(fr):3d} frames  atlas {AW}x{AH}  {os.path.getsize(path) // 1024}KB')
    if cfg.get('dragonK'):
        meta['dragonK'] = cfg['dragonK']
    if cfg.get('cutinBox'):
        meta['cutinBox'] = cfg['cutinBox']
    json.dump(meta, open(f'{outdir}/{cid}.json', 'w'), separators=(',', ':'))
    print('storeH', storeH, 'anchorX', anchorX, 'ground', ground)


if __name__ == '__main__':
    if sys.argv[1] == 'sheet':
        sheet(sys.argv[2], sys.argv[3], float(sys.argv[5]) if len(sys.argv) > 5 else 4)
    elif sys.argv[1] == 'key':   # preview one keyed frame: key VIDEO T OUT.png
        f = frames(sys.argv[2], float(sys.argv[3]), float(sys.argv[3]) + .05, 20)[0]
        bg = Image.new('RGBA', f.size, (40, 40, 60, 255)); k = key(f); bg.alpha_composite(k); bg.save(sys.argv[4])
    else:
        pack(json.load(open(sys.argv[2])))
