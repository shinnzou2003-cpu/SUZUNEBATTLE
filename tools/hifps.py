#!/usr/bin/env python3
"""1VS1 double-frame-rate sprites: re-cut a fighter's clips at ~2x fps into anim/hi/.

Usage (repo root, on the PC that has the source videos):
  python tools/hifps.py tools/<id>_sprites.json            -> anim/hi/<id>.json + anim/hi/<id>_<clip>_0.webp

Rules (so the game can swap clips 1:1 without changing timing / hitboxes):
  * only continuous clips (t0/t1/fps) with fps < 24 are re-cut; new fps = min(24, fps*2) and 'play' is scaled the same way
  * key-pose clips ('times'), hand-picked clips ('take'), and guard/jump/down/cutin are NOT re-cut (game indexes them by frame number)
  * storeH, ground and anchorX are forced to the values of the normal set so the swapped clips line up pixel-for-pixel
"""
import json, os, sys, copy
sys.path.insert(0, os.path.dirname(__file__))
import sprite_tool as st

SKIP = {'cutin', 'guard', 'jump', 'down'}

def main(cfg_path, only=None):
    cfg = json.load(open(cfg_path)); cid = cfg['id']
    base = json.load(open(f'anim/{cid}.json'))
    hi = copy.deepcopy(cfg); hi['out'] = 'anim/hi'; hi['storeH'] = base['storeH']
    hi.pop('cutinBox', None); hi.pop('dragonK', None)
    picked = {}
    for name, a in cfg['anims'].items():
        if name in SKIP or name not in base['anims'] or a.get('times') or a.get('take'): continue
        if 't0' not in a or a.get('fps', 24) >= 24: continue
        if only and name not in only: continue
        b = dict(a); f0 = a['fps']; f1 = min(24, f0 * 2); b['fps'] = f1
        if 'play' in a: b['play'] = round(a['play'] * f1 / f0, 3)
        picked[name] = b
    # anchor is measured on the first idle frame: keep idle first so ground/anchorX match the normal set
    # group anchors are measured on the first clip of each group (config order): pack the whole group, in order
    groups = {cfg['anims'][k].get('group') for k in picked} - {None}
    anims = {}
    if 'idle' in cfg['anims']: anims['idle'] = picked.get('idle', cfg['anims']['idle'])
    for k, a in cfg['anims'].items():
        if k == 'idle': continue
        if k in picked or a.get('group') in groups: anims[k] = picked.get(k, a)
    hi['anims'] = anims
    st.pack(hi)
    meta = json.load(open(f'anim/hi/{cid}.json'))
    meta['anims'] = {k: v for k, v in meta['anims'].items() if k in picked}
    for k, v in meta['anims'].items():
        v['atlases'] = [p.replace('anim/', 'anim/hi/', 1) for p in v['atlases']]
    for k in anims:
        if k not in picked and os.path.exists(f'anim/hi/{cid}_{k}_0.webp'): os.remove(f'anim/hi/{cid}_{k}_0.webp')
    meta['storeH'] = base['storeH']
    json.dump(meta, open(f'anim/hi/{cid}.json', 'w'), separators=(',', ':'))
    for k, v in meta['anims'].items():
        print(f'{k:10s} {base["anims"][k]["fps"]:>3}fps x{len(base["anims"][k]["frames"]):<3} -> {v["fps"]:>3}fps x{len(v["frames"])}')

if __name__ == '__main__':
    main(sys.argv[1], set(sys.argv[2:]) or None)
