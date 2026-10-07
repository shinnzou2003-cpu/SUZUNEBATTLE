"""Remove the floor dust plume baked into NOX×NIX a1 frames (warm light-grey blobs under the feet)."""
import json, sys
import numpy as np
from PIL import Image
from scipy import ndimage

def clean(fr):
    a = np.asarray(fr).astype(np.float32); r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    H, W = al.shape; ys = np.arange(H)[:, None] * np.ones((1, W))
    mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
    low = ys > H * .6
    core = (al > 20) & low & (mx > 120) & (mx < 225) & (mx - mn < 40) & (r >= b + 4) & (g >= b + 2) & (np.abs(r - g) < 16)
    lab, n = ndimage.label(core)
    if n:
        sz = ndimage.sum(core, lab, range(1, n + 1)); core = np.isin(lab, 1 + np.where(sz >= 250)[0])
    if not core.any(): return fr, 0
    rim = ndimage.binary_dilation(core, iterations=5) & low & (mx - mn < 45) & (mx < 225)
    kill = core | rim
    soft = ndimage.gaussian_filter(kill.astype(np.float32), 1.2)
    a[..., 3] = al * (1 - np.clip(soft * 1.4, 0, 1))
    a[..., 3][a[..., 3] < 20] = 0
    # drop specks left behind
    solid = a[..., 3] > 40; lab, n = ndimage.label(solid)
    if n > 1:
        sz = ndimage.sum(solid, lab, range(1, n + 1)); keep = np.isin(lab, 1 + np.where(sz >= 120)[0])
        a[..., 3] = np.where(keep | ~solid, a[..., 3], 0)
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA'), int(kill.sum())

def run(json_path, clip, out_q=80):
    meta = json.load(open(json_path)); an = meta['anims'][clip]; p = an['atlases'][0].split('?')[0]
    at = Image.open(p).convert('RGBA'); total = 0
    for f in an['frames']:
        box = (f['x'], f['y'], f['x'] + f['w'], f['y'] + f['h'])
        c, k = clean(at.crop(box)); total += k
        at.paste(Image.new('RGBA', c.size, (0, 0, 0, 0)), box); at.paste(c, box)
    at.save(p, 'WEBP', quality=out_q, method=6); print(p, 'removed px', total)

if __name__ == '__main__':
    run(sys.argv[1], sys.argv[2])
