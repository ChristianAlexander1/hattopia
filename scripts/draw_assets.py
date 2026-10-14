#!/usr/bin/env python3
"""Procedural pixel-art for Sproutopia, drawn in the researched 2D-sandbox style:
32x32 tiles with speckled dirt, vivid grass tops, dark cave backgrounds;
chibi characters; bright sky backdrop with hill silhouettes.
Every pixel is original; public references were used for style/palette study only.
Run from repo root:  python3 scripts/draw_assets.py
"""
import os, random
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'client', 'img')
os.makedirs(os.path.join(OUT, 'tiles'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'flora'), exist_ok=True)
os.makedirs(os.path.join(OUT, 'icons'), exist_ok=True)

T = 32

def R(seed):
    return random.Random(seed)

def px(d, x, y, c):
    if 0 <= x < T and 0 <= y < T:
        d.point((x, y), fill=c)

def noise_fill(d, rng, base, amt=10):
    for y in range(T):
        for x in range(T):
            v = rng.randint(-amt, amt)
            px(d, x, y, (base[0] + v, base[1] + v, base[2] + v))

def speckle(d, rng, n, colors, size=((1, 2), (1, 2))):
    for _ in range(n):
        c = rng.choice(colors)
        x, y = rng.randrange(T), rng.randrange(T)
        if isinstance(size[0], tuple):
            w = rng.randint(*size[0]); h = rng.randint(*size[1])
        else:
            w, h = size
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=c)

def edge_shade(d, color=(95, 59, 34)):
    d.line([0, T - 1, T - 1, T - 1], fill=color)
    d.line([T - 1, 0, T - 1, T - 1], fill=color)

def save_tile(img, name):
    img.save(os.path.join(OUT, 'tiles', name + '.png'))
    print('tile', name)

# ---------------- dirt (brown with diagonal stripe bands) ----------------
def dirt():
    rng = R(11)
    img = Image.new('RGB', (T, T), (110, 74, 44)); d = ImageDraw.Draw(img)
    # diagonal stripe bands (top-left to bottom-right)
    for y in range(T):
        for x in range(T):
            if ((x + y) % 9) < 3:
                img.putpixel((x, y), (88, 58, 34))
    noise_fill(d, rng, (110, 74, 44), 7)
    # re-apply stripes over noise (keep them visible)
    for y in range(T):
        for x in range(T):
            if ((x + y) % 9) < 3:
                r, g, b = img.getpixel((x, y))
                img.putpixel((x, y), (max(0, r - 22), max(0, g - 16), max(0, b - 10)))
    speckle(d, rng, 34, [(88, 58, 34)], ((1, 2), (1, 2)))
    speckle(d, rng, 22, [(132, 92, 56)], ((1, 2), (1, 2)))
    speckle(d, rng, 6, [(70, 45, 26)], ((2, 3), (2, 3)))
    for x in range(T):
        for y in range(T - 2, T):
            r, g, b = img.getpixel((x, y))
            img.putpixel((x, y), (max(0, r - 16), max(0, g - 12), max(0, b - 8)))
    edge_shade(d, (70, 45, 26))
    return img

# ---------------- grass (dirt + vivid top) ----------------
def grass():
    rng = R(22)
    img = dirt(); d = ImageDraw.Draw(img)
    GH, GL, GD = (87, 202, 50), (135, 217, 89), (62, 158, 42)
    for x in range(T):
        depth = 6 + (rng.randrange(4))  # jagged blades
        for y in range(depth):
            c = GL if y == 0 else GH
            if y >= depth - 2:
                c = GD
            img.putpixel((x, y), c)
        # dark soil shadow under blades
        for y in range(depth, min(T, depth + 2)):
            r, g, b = img.getpixel((x, y))
            img.putpixel((x, y), (max(0, r - 30), max(0, g - 22), max(0, b - 16)))
    # a few light blade tips
    for _ in range(10):
        x = rng.randrange(T)
        img.putpixel((x, 0), GL)
    return img

# ---------------- stone (pale rounded rock) ----------------
def stone():
    rng = R(33)
    img = Image.new('RGB', (T, T), (216, 216, 220)); d = ImageDraw.Draw(img)
    noise_fill(d, rng, (216, 216, 220), 7)
    # soft cloudy blobs
    for _ in range(8):
        x, y = rng.randrange(T), rng.randrange(T)
        r = rng.randrange(3, 7)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(188, 188, 196))
    for _ in range(6):
        x, y = rng.randrange(T), rng.randrange(T)
        r = rng.randrange(2, 5)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(232, 232, 236))
    # crevice shadows
    for _ in range(4):
        x, y = rng.randrange(4, 28), rng.randrange(4, 28)
        for _ in range(rng.randrange(3, 6)):
            px(d, x, y, (160, 160, 170))
            x += rng.choice([-1, 0, 1]); y += 1
    edge_shade(d, (170, 170, 178))
    return img

# ---------------- bedrock (dark purple-gray shattered rock) ----------------
def bedrock():
    rng = R(44)
    img = Image.new('RGB', (T, T), (74, 68, 88)); d = ImageDraw.Draw(img)
    noise_fill(d, rng, (74, 68, 88), 8)
    # angular facets: dark cracks
    for _ in range(6):
        x, y = rng.randrange(4, 28), rng.randrange(4, 28)
        dx, dy = rng.choice([-1, 1]), rng.choice([-1, 1])
        for _ in range(rng.randrange(5, 10)):
            for w in range(2):
                px(d, x + w, y, (38, 34, 48))
            x += dx; y += dy
            if not (0 < x < T - 1 and 0 < y < T - 1): break
    # light facet highlights
    for _ in range(8):
        x, y = rng.randrange(T), rng.randrange(T)
        d.ellipse([x - 2, y - 1, x + 2, y + 1], fill=(102, 96, 118))
    speckle(d, rng, 14, [(52, 48, 64)], ((1, 2), (1, 2)))
    return img

# ---------------- wood (framed wooden panel) ----------------
def wood():
    rng = R(55)
    img = Image.new('RGB', (T, T), (196, 148, 100)); d = ImageDraw.Draw(img)
    noise_fill(d, rng, (196, 148, 100), 7)
    # wood grain
    for _ in range(20):
        x, y = rng.randrange(T), rng.randrange(T)
        d.line([x, y, x + rng.randrange(2, 6), y], fill=(170, 124, 80))
    # beveled frame border
    d.rectangle([0, 0, T - 1, T - 1], outline=(120, 84, 52), width=3)
    d.rectangle([3, 3, T - 4, T - 4], outline=(214, 168, 118), width=1)
    # inner panel shading
    for x in range(4, T - 4):
        for y in range(T - 6, T - 4):
            r, g, b = img.getpixel((x, y))
            img.putpixel((x, y), (max(0, r - 24), max(0, g - 18), max(0, b - 12)))
    return img

# ---------------- leaves ----------------
def leaves():
    rng = R(66)
    img = Image.new('RGB', (T, T), (79, 174, 46)); d = ImageDraw.Draw(img)
    noise_fill(d, rng, (79, 174, 46), 12)
    for _ in range(7):
        x, y = rng.randrange(T), rng.randrange(T)
        d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(58, 132, 35))
    for _ in range(7):
        x, y = rng.randrange(T), rng.randrange(T)
        d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(111, 203, 69))
    return img

# ---------------- sand ----------------
def sand():
    rng = R(77)
    img = Image.new('RGB', (T, T), (227, 210, 154)); d = ImageDraw.Draw(img)
    noise_fill(d, rng, (227, 210, 154), 8)
    speckle(d, rng, 36, [(208, 188, 130)], (1, 2))
    speckle(d, rng, 22, [(242, 230, 188)], (1, 2))
    edge_shade(d, (190, 170, 115))
    return img

# ---------------- brick ----------------
def brick():
    rng = R(88)
    img = Image.new('RGB', (T, T), (122, 100, 88)); d = ImageDraw.Draw(img)
    bh, bw, m = 6, 14, 2
    for row in range(0, T, bh + m):
        off = (bw // 2) if ((row // (bh + m)) % 2) else 0
        for cx in range(-bw, T + bw, bw + m):
            x0 = cx + off
            d.rectangle([x0, row, x0 + bw - 1, row + bh - 1], fill=(176, 90, 60))
            for _ in range(4):
                px(d, rng.randrange(x0, x0 + bw), rng.randrange(row, row + bh), (150, 72, 48))
            d.line([x0, row, x0 + bw - 1, row], fill=(190, 104, 72))
    return img

# ---------------- glass ----------------
def glass():
    rng = R(99)
    img = Image.new('RGBA', (T, T), (191, 232, 242, 170)); d = ImageDraw.Draw(img)
    d.rectangle([0, 0, T - 1, T - 1], outline=(255, 255, 255, 230), width=2)
    d.polygon([(8, T - 4), (16, T - 4), (26, 4), (18, 4)], fill=(255, 255, 255, 110))
    d.polygon([(20, T - 4), (23, T - 4), (31, 8), (31, 4)], fill=(255, 255, 255, 70))
    return img

# ---------------- door ----------------
def door():
    rng = R(111)
    img = Image.new('RGBA', (T, T), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.rectangle([4, 0, T - 5, T - 1], fill=(107, 66, 38))          # frame
    d.rectangle([7, 2, T - 8, T - 1], fill=(160, 107, 63))         # door
    for yy in (4, 12, 20):
        d.rectangle([10, yy, T - 11, yy + 5], outline=(107, 66, 38), width=1)
    for x in range(9, T - 8, 4):
        d.line([x, 2, x, T - 1], fill=(140, 92, 54))
    px(d, T - 11, 16, (40, 40, 40)); px(d, T - 10, 16, (40, 40, 40))  # knob
    return img

# ---------------- sign ----------------
def sign():
    img = Image.new('RGBA', (T, T), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.rectangle([14, 10, 17, T - 1], fill=(107, 66, 38))           # post
    d.rectangle([3, 2, T - 4, 12], fill=(160, 107, 63))           # board
    d.rectangle([3, 2, T - 4, 12], outline=(107, 66, 38), width=1)
    d.line([6, 7, T - 7, 7], fill=(107, 66, 38))
    return img

# ---------------- world lock (gold padlock) ----------------
def worldlock():
    img = Image.new('RGBA', (T, T), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.arc([9, 4, 22, 17], start=180, end=0, fill=(150, 150, 155), width=4)  # shackle
    d.rectangle([7, 14, 24, 29], fill=(232, 185, 60))               # body
    d.rectangle([7, 14, 24, 17], fill=(245, 205, 90))               # top shine
    d.rectangle([7, 14, 24, 29], outline=(150, 115, 35), width=1)
    d.ellipse([13, 19, 18, 24], fill=(90, 65, 20))                  # keyhole
    d.rectangle([14, 23, 17, 28], fill=(90, 65, 20))
    return img

# ---------------- torch ----------------
def torch():
    img = Image.new('RGBA', (T, T), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.rectangle([14, 12, 17, T - 1], fill=(107, 66, 38))
    d.ellipse([9, 2, 22, 15], fill=(242, 140, 40))                 # flame
    d.ellipse([12, 6, 19, 14], fill=(255, 210, 60))                # core
    d.ellipse([14, 9, 17, 13], fill=(255, 240, 180))
    return img

# ---------------- backgrounds ----------------
def dirtbg():
    rng = R(121)
    img = Image.new('RGB', (T, T), (90, 61, 38)); d = ImageDraw.Draw(img)
    noise_fill(d, rng, (90, 61, 38), 8)
    speckle(d, rng, 26, [(70, 46, 28)], (1, 2))
    return img

def cavebg():
    rng = R(131)
    img = Image.new('RGB', (T, T), (42, 33, 26)); d = ImageDraw.Draw(img)
    noise_fill(d, rng, (42, 33, 26), 6)
    for yy in (3, 11, 19, 27):
        d.line([0, yy, T - 1, yy], fill=(28, 21, 16))
        d.line([0, yy + 1, T - 1, yy + 1], fill=(52, 41, 32))
    speckle(d, rng, 18, [(58, 47, 37)], ((1, 1), (1, 1)))
    return img

# ---------------- flora (64x96, bottom anchored) ----------------
def flora_canvas():
    return Image.new('RGBA', (64, 96), (0, 0, 0, 0))

def fseed():
    img = flora_canvas(); d = ImageDraw.Draw(img)
    d.ellipse([26, 78, 38, 90], fill=(120, 82, 45))       # seed
    d.ellipse([28, 80, 33, 85], fill=(150, 108, 62))
    d.line([32, 78, 32, 68], fill=(87, 202, 50), width=2)  # sprout
    d.ellipse([28, 64, 36, 70], fill=(111, 203, 69))
    img.save(os.path.join(OUT, 'flora', 'seed.png')); print('flora seed')

def fsapling():
    img = flora_canvas(); d = ImageDraw.Draw(img)
    d.line([32, 90, 32, 58], fill=(90, 140, 50), width=3)
    d.ellipse([20, 56, 32, 68], fill=(87, 202, 50))
    d.ellipse([32, 56, 44, 68], fill=(79, 174, 46))
    d.ellipse([26, 48, 38, 60], fill=(111, 203, 69))
    img.save(os.path.join(OUT, 'flora', 'sapling.png')); print('flora sapling')

def canopy(d, cx, cy, r, rng):
    for _ in range(26):
        x = cx + rng.randint(-r, r); y = cy + rng.randint(-r, r)
        rr = rng.randint(4, 8)
        c = rng.choice([(79, 174, 46), (87, 202, 50), (58, 132, 35), (111, 203, 69)])
        d.ellipse([x - rr, y - rr, x + rr, y + rr], fill=c)

def ftree_young():
    rng = R(141)
    img = flora_canvas(); d = ImageDraw.Draw(img)
    d.rectangle([29, 55, 34, 90], fill=(120, 82, 45))
    d.rectangle([29, 55, 31, 90], fill=(140, 98, 56))
    canopy(d, 32, 38, 20, rng)
    img.save(os.path.join(OUT, 'flora', 'tree_young.png')); print('flora tree_young')

def ftree_mature():
    rng = R(151)
    img = flora_canvas(); d = ImageDraw.Draw(img)
    d.rectangle([27, 45, 36, 90], fill=(120, 82, 45))
    d.rectangle([27, 45, 30, 90], fill=(140, 98, 56))
    d.rectangle([33, 60, 40, 68], fill=(107, 66, 38))     # branch
    canopy(d, 32, 28, 28, rng)
    img.save(os.path.join(OUT, 'flora', 'tree_mature.png')); print('flora tree_mature')

# ---------------- backdrop: sky, clouds, hill silhouettes ----------------
def backdrop():
    rng = R(161)
    W, H = 960, 540
    img = Image.new('RGB', (W, H)); d = ImageDraw.Draw(img)
    top, bot = (96, 213, 240), (200, 245, 253)
    for y in range(H):
        f = y / H
        d.line([0, y, W - 1, y], fill=tuple(int(top[i] + (bot[i] - top[i]) * f) for i in range(3)))
    # lavender hills
    for base, amp, col in ((430, 60, (161, 172, 237)), (470, 45, (140, 152, 230))):
        pts = []
        for x in range(0, W + 20, 20):
            y = base - abs(((x * 7) % 200) - 100) / 100 * amp - rng.randint(0, 12)
            pts.append((x, y))
        pts += [(W, H), (0, H)]
        d.polygon(pts, fill=col)
    # clouds
    for _ in range(9):
        x, y = rng.randrange(W), rng.randrange(40, 300)
        for _ in range(7):
            ox, oy = rng.randint(-45, 45), rng.randint(-12, 12)
            r = rng.randint(14, 30)
            d.ellipse([x + ox - r, y + oy - r // 2, x + ox + r, y + oy + r // 2], fill=(255, 255, 255))
    img.save(os.path.join(OUT, 'backdrop.png')); print('backdrop')

# ---------------- icons ----------------
def gem():
    img = Image.new('RGBA', (32, 32), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.polygon([(16, 2), (28, 12), (16, 30), (4, 12)], fill=(79, 216, 240))
    d.polygon([(16, 2), (28, 12), (16, 16), (4, 12)], fill=(150, 235, 250))
    d.polygon([(16, 6), (22, 12), (16, 14), (10, 12)], fill=(255, 255, 255))
    img.save(os.path.join(OUT, 'icons', 'gem.png')); print('icon gem')

def wrench():
    img = Image.new('RGBA', (32, 32), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.line([8, 24, 20, 12], fill=(170, 170, 175), width=5)
    d.arc([14, 2, 28, 16], start=300, end=120, fill=(170, 170, 175), width=5)
    d.line([8, 24, 4, 28], fill=(140, 140, 145), width=6)
    img.save(os.path.join(OUT, 'icons', 'wrench.png')); print('icon wrench')

if __name__ == '__main__':
    save_tile(dirt(), 'dirt')
    save_tile(grass(), 'grass')
    save_tile(stone(), 'stone')
    save_tile(bedrock(), 'bedrock')
    save_tile(wood(), 'wood')
    save_tile(leaves(), 'leaves')
    save_tile(sand(), 'sand')
    save_tile(brick(), 'brick')
    save_tile(glass(), 'glass')
    save_tile(door(), 'door')
    save_tile(sign(), 'sign')
    save_tile(worldlock(), 'worldlock')
    save_tile(torch(), 'torch')
    save_tile(dirtbg(), 'dirtbg')
    save_tile(cavebg(), 'cavebg')
    fseed(); fsapling(); ftree_young(); ftree_mature()
    backdrop(); gem(); wrench()
    print('DONE')
