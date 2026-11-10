"""Медиа для сайта: дуотон обложки дневника + фото в webp. python3 -I build_media.py <repo> <site>"""
import sys, os, glob, json
from PIL import Image, ImageOps
REPO, SITE = sys.argv[1:3]
OUT = os.path.join(SITE, 'media'); os.makedirs(OUT, exist_ok=True)
manifest = {'viewpoints': [], 'paintings': [], 'mount': {}, 'story': []}

def save(im, path, maxw, q=80):
    im = ImageOps.exif_transpose(im).convert('RGB')
    im.thumbnail((maxw, maxw))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.save(path, 'WEBP', quality=q, method=5)

# 1. обложка дневника — розовый дуотон
src = Image.open(f'{REPO}/new_files/1/309.jpg'); src = ImageOps.exif_transpose(src).convert('L')
src.thumbnail((2400, 2400)); src = ImageOps.autocontrast(src, cutoff=1)
stops = [(0, (38, 5, 24)), (0.5, (190, 32, 112)), (0.78, (240, 71, 158)), (1, (255, 226, 240))]
def grad(t):
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if t <= b:
            k = (t - a) / (b - a); return tuple(round(ca[i] + (cb[i] - ca[i]) * k) for i in range(3))
lut = [grad(i / 255) for i in range(256)]
duo = Image.merge('RGB', [src.point([c[i] for c in lut]) for i in range(3)])
duo.save(f'{OUT}/diary-cover.jpg', quality=84, optimize=True, progressive=True)

# 2. видовые точки (уже 1280 webp) + миниатюры
for f in sorted(glob.glob(f'{REPO}/src/assets/viewpoint_photos/*.webp')):
    n = os.path.basename(f)[:-5]
    save(Image.open(f), f'{OUT}/vp/{n}.webp', 1280, 78); save(Image.open(f), f'{OUT}/vp/{n}.t.webp', 320, 70)
    manifest['viewpoints'].append(n)

# 3. живопись
for f in sorted(glob.glob(f'{REPO}/new_files/21/*')):
    n = os.path.splitext(os.path.basename(f))[0]
    try:
        im = Image.open(f); save(im, f'{OUT}/paint/{n}.webp', 1400, 80); save(Image.open(f), f'{OUT}/paint/{n}.t.webp', 320, 72)
        manifest['paintings'].append(n)
    except Exception as e: print('skip', f, e)

# 4. фото вершин: <fid>_<k>
for f in sorted(glob.glob(f'{REPO}/new_files/mount/*')):
    n = os.path.splitext(os.path.basename(f))[0]
    if '_' not in n: continue
    fid = n.split('_')[0]
    try:
        save(Image.open(f), f'{OUT}/mount/{n}.webp', 1400, 80)
        manifest['mount'].setdefault(fid, []).append(n)
    except Exception as e: print('skip', f, e)

# 5. иллюстрации из лонгрида
for f in sorted(glob.glob(f'{REPO}/src/assets/photos/*')):
    n = os.path.splitext(os.path.basename(f))[0]
    save(Image.open(f), f'{OUT}/story/{n}.webp', 1600, 82); manifest['story'].append(n)

with open(os.path.join(SITE, 'data', 'media.js'), 'w', encoding='utf-8') as fh:
    fh.write('window.GP_MEDIA = ' + json.dumps(manifest, ensure_ascii=False) + ';\n')
tot = sum(os.path.getsize(p) for p in glob.glob(OUT + '/**/*', recursive=True) if os.path.isfile(p))
print({k: len(v) for k, v in manifest.items()}, f'{tot/1e6:.1f} MB')
