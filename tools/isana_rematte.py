import sys, numpy as np
from PIL import Image
from scipy import ndimage
def rematte(path, out):
    a = np.array(Image.open(path).convert('RGBA')).astype(np.float32)
    rgb, al = a[..., :3], a[..., 3]
    solid = al > 110
    dist = ndimage.distance_transform_edt(~solid)
    far = (dist > 25) & (dist < 60) & (al == 0) & (rgb.max(-1) > 20)
    bgc = np.median(rgb[far], 0) if far.sum() > 100 else np.array([85, 104, 104.])
    lum = rgb.mean(-1)
    m = ndimage.uniform_filter(lum, 5); sd = np.sqrt(np.maximum(ndimage.uniform_filter(lum * lum, 5) - m * m, 0))
    cd = np.sqrt(((rgb - bgc) ** 2).sum(-1))
    bglike = (sd < 5.5) & (cd < 26) & ~solid
    black = (rgb.max(-1) < 12) & ~solid                  # untouched background outside the frames
    filled = ndimage.binary_fill_holes(solid)
    cand = filled & ~solid
    # large smooth background-coloured pockets inside the outline are real gaps (between limbs, inside the anchor curve)
    lab, n = ndimage.label(cand & bglike)
    if n:
        sizes = ndimage.sum(np.ones_like(lab), lab, range(1, n + 1))
        gaps = np.isin(lab, 1 + np.where(sizes > 350)[0])
    else: gaps = np.zeros_like(solid)
    gaps = ndimage.binary_dilation(gaps, iterations=1) & cand
    mask = solid | (cand & ~gaps)
    mask = (ndimage.binary_closing(mask, iterations=2) & ~gaps) | mask
    mask = ndimage.binary_fill_holes(mask) & ~gaps | mask
    # notches on the outline: grow outward through textured / non-background pixels
    near = (dist > 0) & (dist < 7)
    ok = near & (cd > 34) & (sd > 4) & ~black
    for _ in range(6):
        add = ndimage.binary_dilation(mask, iterations=1) & ok
        if not (add & ~mask).any(): break
        mask |= add
    mask = ndimage.binary_opening(mask, iterations=1) | solid
    restored = mask & ~solid
    new_al = np.where(restored, 255.0, al)
    edge = mask & ~ndimage.binary_erosion(mask, iterations=1) & restored
    new_al = np.where(edge, 170.0, new_al)
    new_al = np.where(ndimage.binary_erosion(mask, iterations=1), 255.0, new_al)   # old soft hole edges inside the body go solid
    o = np.dstack([rgb, new_al]).clip(0, 255).astype(np.uint8)
    Image.fromarray(o, 'RGBA').save(out, 'WEBP', quality=82, method=6, exact=True)
    return int(restored.sum()), bgc.astype(int).tolist()
if __name__ == '__main__':
    print(rematte(sys.argv[1], sys.argv[2]))
