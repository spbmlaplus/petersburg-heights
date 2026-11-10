"""Собирает данные нового сайта: site/data/*.js из слоёв QGIS (M:) и материалов прошлого исследования.
python3 -I build_data.py <M_root> <repo_root> <site_dir>"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import geo

M, REPO, SITE = sys.argv[1:4]
L = REPO + '/src/assets/layers/'
G = M + '/04 GIS/01 Project/01 Stage/'
GJ = G + '01 Горные просторы/Project_data/01 GeoJSON/'

def clean(v):
    if v in (None, 'None', '', 'nan'): return None
    if isinstance(v, str): return v.strip()
    return v

def lay(path, tol=0, keep=None, rename=None, filt=None, fn=None):
    fc = geo.layer(path, tol=tol, keep=keep, filt=filt)
    for f in fc['features']:
        p = {k: clean(v) for k, v in f['properties'].items()}
        if rename: p = {rename.get(k, k): v for k, v in p.items()}
        p = {k: v for k, v in p.items() if v is not None}
        if fn: p = fn(p) or p
        f['properties'] = p
    fc['features'] = [f for f in fc['features'] if f['geometry']['coordinates']]
    return fc

def num(p, k):
    try: p[k] = round(float(p[k]), 1)
    except Exception: p.pop(k, None)
    return p

base = {
  'isolines':   lay(GJ + 'isoline_5m_crop.gpkg', tol=4, keep=['ELEV']),
  'mask':       lay(GJ + 'составляющие амфитеатра/mask_amphitheater.geojson', tol=10, keep=[]),
  'bound':      lay(GJ + 'составляющие амфитеатра/amphitheater_bound.geojson', tol=6, keep=[]),
  'stage':      lay(GJ + 'составляющие амфитеатра/amphitheater.geojson', tol=6, keep=[]),
  'sectors':    lay(GJ + 'составляющие амфитеатра/sectors_level.geojson', tol=8),
  'mount':      lay(M + '/Передать/Передать/mount.geojson', keep=['fid', 'type', 'name', 'height_value', 'description '],
                    rename={'description ': 'description'}, fn=lambda p: num(p, 'height_value')),
  'trail':      lay(G + 'проектирование тропы/Большая Горная Тропа.gpkg', tol=3, keep=[]),
  'viewpoints': lay(G + 'ТОчки обзора.gpkg', keep=['fid']),
}
# ярусы для дневника (маски) и вомитории
tiers = {k: lay(L + k + '.geojson', tol=10, keep=[]) for k in ['mask_stage', 'mask_parter', 'mask_belletazh', 'mask_balcon']}
for i in range(1, 6):
    tiers[f'zone_{i}'] = lay(L + f'historical_zones_{i}.geojson', tol=20, keep=[])
tiers['mount_polygon'] = lay(L + 'mount_polygon.geojson', tol=8, keep=[])
tiers['vomitoria'] = lay(L + 'vomitoria.geojson', tol=6, keep=['type'])

epochs = {
  'landscape_450': lay(L + 'landscape_450.geojson', tol=10, keep=['name']),
  'landscape_25':  lay(L + 'landscape_2,5.geojson', tol=10, keep=['name']),
  'landscape_12':  lay(L + 'landscape_12.geojson', tol=10, keep=['name']),
  'landscape_7':   lay(L + 'landscape_7.geojson', tol=10, keep=['name']),
  'resettlement':  lay(L + 'historical_resettlement.geojson', tol=12, keep=['name']),
  'maki_selki':    lay(L + 'maki_selki.geojson', tol=8, keep=['name', 'Имя (русск)', 'description'],
                       rename={'Имя (русск)': 'name_ru'}),
  'finns_today':   lay(L + 'Finns.geojson', keep=['settlement', 'population', 'finns', 'finns_share', 'finns_count', 'share', 'count']),
  'estate':        lay(L + 'estate.geojson', keep=['id', 'name', 'type', 'fact', 'description']),
  'paintings':     lay(L + '21_живопись.geojson', keep=['fid', 'name']),
  'photo_points':  lay(L + 'Viewpoints.geojson', keep=['Name', 'Azimuth', 'Altitude'],
                       fn=lambda p: {'id': p.get('Name', '').split('.')[0], 'azimuth': round(float(p.get('Azimuth', 0) or 0)), 'alt': round(float(p.get('Altitude', 0) or 0))}),
  'viewsheds':     lay(L + '23_2_viewshed.geojson', tol=6, keep=['layer']),
  'routes':        lay(L + 'routes.geojson', tol=5, keep=['name', 'description ', 'type'], rename={'description ': 'description', 'type': 'length'}),
  'walking':       lay(L + 'walking_routes.geojson', tol=25, keep=['name', 'desc']),
  'leisure':       {'type': 'FeatureCollection', 'features': []},
  'bubbles':       lay(L + '2005_2025_баблы_расселения.geojson', tol=10, keep=['тип'], rename={'тип': 'kind'}),
}
LEIS = {'ski_resorts': 'Горнолыжный курорт', 'paragliding_clubs': 'Парапланеризм', 'horse_riding_clubs': 'Конный клуб',
        'golf_clubs': 'Гольф-клуб', 'motocross': 'Мотокросс'}
for k, label in LEIS.items():
    fc = lay(L + k + '.geojson', rename={'Наименование': 'name'})
    for f in fc['features']:
        if f['geometry']['type'] != 'Point': continue
        p = f['properties']; f['properties'] = {'kind': label, 'name': p.get('name'), 'description': p.get('description'), 'address': p.get('type')}
        f['properties'] = {a: b for a, b in f['properties'].items() if b}
        epochs['leisure']['features'].append(f)

# новое расселение — скругление как smooth($geometry, 5) в QGIS (Чайкин, 5 итераций, offset 0.25)
def chaikin(ring, n=5, k=0.25):
    pts = ring[:-1] if ring[0] == ring[-1] else ring[:]
    for _ in range(n):
        out = []
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            out.append([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k])
            out.append([a[0] + (b[0] - a[0]) * (1 - k), a[1] + (b[1] - a[1]) * (1 - k)])
        pts = out
    pts = geo.dp([tuple(p) for p in pts], 1.2e-5)
    pts = [[round(x, 6), round(y, 6)] for x, y in pts]
    return pts + [pts[0]]
for f in epochs['bubbles']['features']:
    g = f['geometry']
    if g['type'] == 'Polygon': g['coordinates'] = [chaikin(r) for r in g['coordinates'] if len(r) >= 4]
    elif g['type'] == 'MultiPolygon': g['coordinates'] = [[chaikin(r) for r in p if len(r) >= 4] for p in g['coordinates']]
# Finns 2021: оставить только нужные поля
for f in epochs['finns_today']['features']:
    p = f['properties']
src = json.load(open(L + 'Finns.geojson', encoding='utf-8'))['features']
print('Finns keys:', list(src[0]['properties'].keys())[:40])

def write(name, obj, var):
    path = os.path.join(SITE, 'data', name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(f'/* Сгенерировано tools/build_data.py. EPSG:4326 */\nwindow.{var} = Object.assign(window.{var} || {{}}, ')
        fh.write(json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + ');\n')
    print(f'{name}: {os.path.getsize(path)//1024} KB')

write('base.js', {**base, **tiers}, 'GP_DATA')
write('epochs.js', epochs, 'GP_DATA')
for k, v in {**base, **tiers, **epochs}.items():
    print(f'  {k}: {len(v["features"])} feats, {len(json.dumps(v))//1024} KB')

# ---- подписи (из «inscriptions» прошлого исследования) ----
def pts(n, **extra):
    fc = lay(L + n + '.geojson', keep=['name'])
    for f in fc['features']: f['properties'].update(extra)
    return fc['features']
labels = {'type': 'FeatureCollection', 'features': []}
labels['features'] += pts('2', kind='massif')
for n, t in [('3', 'stage'), ('4', 'parter'), ('5', 'belletazh'), ('6', 'balcon')]: labels['features'] += pts(n, kind='tier', tier=t)
labels['features'] += pts('7', kind='vomitoria')
seen = set()
for n, ep in [('8', 'e450'), ('9', 'e25'), ('10', 'e12'), ('11', 'e7')]:
    for f in pts(n, kind='epoch', epoch=ep):
        if f['properties']['name'] in seen: continue
        seen.add(f['properties']['name']); labels['features'].append(f)
labels['features'] += pts('12', kind='epoch', epoch='finns')
for n in ['16', '17']: labels['features'] += pts(n, kind='epoch', epoch='estates')
write('labels.js', {'labels': labels}, 'GP_DATA')
print('labels', len(labels['features']))
