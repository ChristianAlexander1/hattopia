#!/usr/bin/env python3
"""Post-process generated art: chroma-key magenta -> alpha, slice grids, normalize.
Outputs game-ready PNGs into client/img/. Run from repo root.
"""
import os, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'src')
OUT = os.path.join(ROOT, 'client', 'img')
os.makedirs(os.path.join(OUT, 'tiles'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'flora'), exist_ok=True)

def key_color(img):
    # dominant corner color = chroma key
    px = img.convert('RGB')
    return px.getpixel((2, 2))

def is_key(p, key, tol=48):
    return all(abs(a - b) <= tol for a, b in zip(p, key))

def runs(proj):
    """Contiguous True runs -> [(start,end)]"""
    out, s = [], None
    for i, v in enumerate(proj):
        if v and s is None: s = i
        elif not v and s is not None:
            out.append((s, i - 1)); s = None
    if s is not None: out.append((s, len(proj) - 1))
    return [r for r in out if r[1] - r[0] > 4]

def col_row_bands(img, key, min_cols=1, min_rows=1):
    rgb = img.convert('RGB'); w, h = rgb.size
    data = rgb.load()
    col_has = [any(not is_key(data[x, y], key) for y in range(0, h, 2)) for x in range(0, w, 2)]
    row_has = [any(not is_key(data[x, y], key) for x in range(0, w, 2)) for y in range(0, h, 2)]
    cols = [(a * 2, b * 2 + 1) for a, b in runs(col_has)]
    rows = [(a * 2, b * 2 + 1) for a, b in runs(row_has)]
    return cols, rows

def extract(img, key, x0, x1, y0, y1, pad=3):
    rgb = img.convert('RGB'); w, h = rgb.size
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(w - 1, x1 + pad), min(h - 1, y1 + pad)
    crop = img.crop((x0, y0, x1 + 1, y1 + 1)).convert('RGBA')
    data = crop.load(); krgb = rgb.load()
    for y in range(crop.size[1]):
        for x in range(crop.size[0]):
            if is_key(krgb[x0 + x, y0 + y], key):
                r, g, b, a = data[x, y]
                data[x, y] = (r, g, b, 0)
    return crop

def norm_square(sprite, size=64):
    w, h = sprite.size
    s = max(w, h)
    canvas = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    canvas.paste(sprite, ((s - w) // 2, (s - h) // 2), sprite)
    return canvas.resize((size, size), Image.NEAREST)

def find_src(prefix):
    for f in os.listdir(SRC):
        if f.startswith(prefix) and f.endswith('.png'):
            return os.path.join(SRC, f)
    raise FileNotFoundError(prefix)

# ---- foreground tiles: 6 cols x 2 rows ----
fg = Image.open(find_src('media-generation-tiles-fg'))
key = key_color(fg)
cols, rows = col_row_bands(fg, key)
print('fg cols:', len(cols), 'rows:', len(rows), 'size:', fg.size)
names_fg = ['dirt', 'grass', 'stone', 'wood', 'brick', 'glass',
            'bedrock', 'door', 'sign', 'worldlock', 'torch', 'empty']
assert len(cols) == 6 and len(rows) == 2, 'unexpected fg grid'
i = 0
for r, (y0, y1) in enumerate(rows):
    for c, (x0, x1) in enumerate(cols):
        spr = extract(fg, key, x0, x1, y0, y1)
        spr = norm_square(spr, 64)
        spr.save(os.path.join(OUT, 'tiles', names_fg[i] + '.png'))
        i += 1
print('fg tiles saved:', names_fg[:11])

# ---- background tiles: 2x2 ----
bg = Image.open(find_src('media-generation-tiles-bg'))
key = key_color(bg)
cols, rows = col_row_bands(bg, key)
print('bg cols:', len(cols), 'rows:', len(rows), 'size:', bg.size)
names_bg = ['dirtbg', 'cavebg', 'bg3', 'bg4']
i = 0
for r, (y0, y1) in enumerate(rows):
    for c, (x0, x1) in enumerate(cols):
        spr = extract(bg, key, x0, x1, y0, y1)
        spr = norm_square(spr, 64)
        spr.save(os.path.join(OUT, 'tiles', names_bg[i] + '.png'))
        i += 1

# ---- flora: 4 growth stages ----
fl = Image.open(find_src('media-generation-flora'))
key = key_color(fl)
cols, rows = col_row_bands(fl, key)
print('flora cols:', len(cols), 'rows:', len(rows), 'size:', fl.size)
names_fl = ['seed', 'sapling', 'tree_young', 'tree_mature']
assert len(cols) == 4, 'unexpected flora grid'
for (x0, x1), name in zip(cols, names_fl):
    y0, y1 = rows[0][0], rows[-1][1]
    spr = extract(fl, key, x0, x1, y0, y1, pad=4)
    # normalize into 64x96 canvas, bottom-anchored (trees drawn 2 tiles tall)
    w, h = spr.size
    scale = min(64 / w, 96 / h)
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    spr = spr.resize((nw, nh), Image.NEAREST)
    canvas = Image.new('RGBA', (64, 96), (0, 0, 0, 0))
    canvas.paste(spr, ((64 - nw) // 2, 96 - nh), spr)
    canvas.save(os.path.join(OUT, 'flora', name + '.png'))
print('flora saved:', names_fl)

# ---- backdrop ----
bd = Image.open(find_src('media-generation-backdrop'))
print('backdrop size:', bd.size)
bd.convert('RGB').resize((960, 540), Image.LANCZOS).save(os.path.join(OUT, 'backdrop.png'))
print('backdrop saved')
print('DONE')
