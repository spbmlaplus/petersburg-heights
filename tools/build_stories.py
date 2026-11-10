"""Обложки закладок (ч/б) + js/stories.js из лонгрида прошлого исследования. python3 -I build_stories.py <repo> <site>"""
import sys, os, json, re
from PIL import Image, ImageOps, ImageEnhance
REPO, SITE = sys.argv[1:3]
NF = REPO + '/new_files'
def find(d, n):
    for e in ('.jpg', '.JPG', '.png', '.jpeg'):
        p = f'{d}/{n}{e}'
        if os.path.exists(p): return p
    raise FileNotFoundError(n)
COV = {
  'amph': find(NF + '/1', '613'), 'geo': find(NF + '/1', '704'),
  'finns': REPO + '/src/assets/photos/Suomi.jpg', 'observers': REPO + '/src/assets/photos/Belveder.jpg',
  'painting': find(NF + '/21', '8'), 'today': REPO + '/src/assets/photos/Jukki.jpg', 'trail': find(NF + '/1', '309'),
}
os.makedirs(SITE + '/media/covers', exist_ok=True)
for k, p in COV.items():
    im = ImageOps.exif_transpose(Image.open(p)).convert('L')
    im = ImageOps.autocontrast(im, cutoff=1); im = ImageEnhance.Contrast(im).enhance(1.12)
    im.thumbnail((2200, 2200)); im.convert('RGB').save(f'{SITE}/media/covers/{k}.webp', 'WEBP', quality=78, method=5)
    t = im.copy(); t.thumbnail((640, 640)); t.convert('RGB').save(f'{SITE}/media/covers/{k}.t.webp', 'WEBP', quality=72)

s = open(REPO + '/src/fallbackLongread.ts', encoding='utf-8').read()
items = json.loads(s[s.index('= [') + 2:s.rindex(']') + 1])
def clean_html(h):
    h = re.sub(r'<(?!/?(b|i|em|strong|br)\b)[^>]*>', '', h or '')
    return h.strip()
CH = {'Горный Петербург': 'amph', 'Горы Петербурга — геологическая летопись': 'geo', 'История «горных финнов»': 'finns',
      'Высочайшие наблюдатели': 'observers', 'Горы сейчас': 'today'}
steps = {}
for it in items:
    sid = CH.get(it['chapter'])
    if sid is None:
        sid = next(v for k, v in CH.items() if it['chapter'].startswith(k[:10]))
    if it.get('subtitle') == 'Горная живопись': sid = 'painting'
    lst = steps.setdefault(sid, [])
    key = (it.get('subtitle') or '', it['id_map'], (it.get('zoom') or {}).get('layer'))
    paras = [clean_html(p) for p in it['paragraphs'] if p.strip()]
    media = it.get('mediaLink')
    if lst and lst[-1]['_key'][:2] == key[:2] and not (key[2] and key[2] != lst[-1]['_key'][2]) and len(' '.join(lst[-1]['paras'])) < 650 and not lst[-1].get('media'):
        lst[-1]['paras'] += paras
        if media: lst[-1]['media'] = os.path.splitext(media)[0]
        if it.get('fact'): lst[-1]['fact'] = True
    else:
        st = {'_key': key, 'subtitle': it.get('subtitle') or '', 'map': it['id_map'], 'paras': paras}
        if media: st['media'] = os.path.splitext(media)[0]
        if key[2]: st['zoom'] = key[2]
        if it.get('fact'): st['fact'] = True
        lst.append(st)
for v in steps.values():
    for st in v: st.pop('_key', None)
steps['trail'] = [{'subtitle': 'Маршрут по видовым точкам', 'map': 'trail', 'zoom': 'trail', 'paras': [
  'В поисках историй пришлось объехать весь Петербургский амфитеатр, подняться на вершины, отыскать исторические панорамы и поговорить с местными жителями.',
  'Результатом стал маршрут, соединяющий ключевые видовые точки, откуда Петербург открывается с его архитектурными доминантами, историческими силуэтами и бескрайними просторами.',
  'Розовые точки — места, где мы стояли и смотрели на город. Нажмите на любую, чтобы увидеть снимок.']}]
with open(SITE + '/js/stories-data.js', 'w', encoding='utf-8') as fh:
    fh.write('/* Тексты историй — из лонгрида исследования. Сгенерировано tools/build_stories.py */\nwindow.GP_STEPS = ' + json.dumps(steps, ensure_ascii=False, indent=0) + ';\n')
print({k: len(v) for k, v in steps.items()})
