#!/usr/bin/env python3
"""MIO pack post-step: cut-in frames use raw video-frame coordinates inside cutinBox (same convention as SAKURA)."""
import json, sys
cfg = json.load(open(sys.argv[1])); meta = json.load(open('anim/mio.json'))
ax, gy = cfg['anchorX'], cfg['ground']
bx0, by0, bw, bh = cfg.get('cutinRect', [0, 0, 854, 480])
for fr in meta['anims']['cutin']['frames']:
    fr['ox'] = round(fr['ox'] + ax - bx0, 1); fr['oy'] = round(fr['oy'] + gy - by0, 1)
meta['cutinBox'] = [bw, bh]
json.dump(meta, open('anim/mio.json', 'w'), separators=(',', ':'))
print('cutin fixed', meta['cutinBox'])
