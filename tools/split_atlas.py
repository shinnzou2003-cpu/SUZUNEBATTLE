#!/usr/bin/env python3
"""Split any anim/hi atlas taller than 4096px into several atlases (phones refuse / downsample >16MP images)."""
import json, glob, os
from PIL import Image
LIM = 4096
for jp in sorted(glob.glob('anim/hi/*.json')):
    meta = json.load(open(jp)); changed = False
    for k, an in meta['anims'].items():
        if len(an['atlases']) != 1: continue
        p = an['atlases'][0].split('?')[0]; im = Image.open(p)
        if im.height <= LIM: continue
        # group frames into bands by their row top, each band <= LIM tall
        bands, cur, top = [], [], None
        for i, f in sorted(enumerate(an['frames']), key=lambda t: t[1]['y']):
            if top is None: top = f['y']
            if f['y'] + f['h'] - top > LIM - 8 and cur: bands.append((top, cur)); cur = []; top = f['y']
            cur.append(i)
        if cur: bands.append((top, cur))
        paths = []
        for bi, (top, idx) in enumerate(bands):
            bot = max(an['frames'][i]['y'] + an['frames'][i]['h'] for i in idx) + 4
            out = p.replace('_0.webp', f'_{bi}.webp')
            im.crop((0, top - 4, im.width, bot)).save(out + '.tmp.webp', 'WEBP', quality=82, method=6, exact=True)
            paths.append(out)
            for i in idx: an['frames'][i]['a'] = bi; an['frames'][i]['y'] -= top - 4
        for out in paths: os.replace(out + '.tmp.webp', out)
        an['atlases'] = paths; changed = True
        print(jp, k, im.size, '->', [Image.open(x).size for x in paths])
    if changed: json.dump(meta, open(jp, 'w'), separators=(',', ':'))
