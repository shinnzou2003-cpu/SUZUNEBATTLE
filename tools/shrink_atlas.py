#!/usr/bin/env python3
"""Down-scale sprite atlases to save phone memory (decoded RGBA size ~ scale^2).

  python3 tools/shrink_atlas.py 0.75 anim/<id>.json [anim/hi/<id>.json ...]

Frames keep their logical size (w/h/ox/oy unchanged, so hit boxes, anchors and on-screen size stay identical);
the atlas rect is stored as x/y/sw/sh in the smaller image. Cut-in clips are left at full size (face close-ups).
Run it again after re-packing a fighter with sprite_tool / hifps / interp_hi (they write full-size atlases).
Atlases already shrunk (frames carrying sw/sh) are skipped.
"""
import json, sys, math, os
from PIL import Image
SKIP = {'cutin'}

def shrink(jp, s):
    meta = json.load(open(jp)); done = {}
    for k, an in meta['anims'].items():
        if k in SKIP or any('sw' in f for f in an['frames']): continue
        paths = [p.split('?')[0] for p in an['atlases']]
        for ai, p in enumerate(paths):
            if p not in done:
                im = Image.open(p).convert('RGBA'); W, H = im.size
                nw, nh = max(1, round(W * s)), max(1, round(H * s))
                small = im.convert('RGBa').resize((nw, nh), Image.LANCZOS).convert('RGBA')   # premultiplied: no dark fringes
                small.save(p, 'WEBP', quality=84, method=4)
                done[p] = (nw / W, nh / H)
            kx, ky = done[p]
            for f in an['frames']:
                if f['a'] != ai: continue
                x0, y0 = math.floor(f['x'] * kx), math.floor(f['y'] * ky)
                x1, y1 = math.ceil((f['x'] + f['w']) * kx), math.ceil((f['y'] + f['h']) * ky)
                f['x'], f['y'], f['sw'], f['sh'] = x0, y0, x1 - x0, y1 - y0
        an['atlases'] = [a.split('?')[0] + f'?v=s{int(s * 100)}' for a in an['atlases']]
    json.dump(meta, open(jp, 'w'), separators=(',', ':'))
    return len(done)

if __name__ == '__main__':
    s = float(sys.argv[1])
    for jp in sys.argv[2:]:
        print(jp, shrink(jp, s), 'atlases')
