"""Конвертирует слои QGIS (GeoJSON/GPKG в EPSG:3857 или 4326) в site/data/layers.js (EPSG:4326, упрощённые)."""
import json, math, sqlite3, struct, sys, os

R = 6378137.0

def to_ll(x, y):
    return [round(math.degrees(x / R), 6), round(math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2), 6)]

def dp(pts, tol):
    if len(pts) < 3: return pts
    keep = [False]*len(pts); keep[0]=keep[-1]=True
    stack=[(0,len(pts)-1)]; t2=tol*tol
    while stack:
        a,b=stack.pop(); ax,ay=pts[a]; bx,by=pts[b]; dx,dy=bx-ax,by-ay; L=dx*dx+dy*dy
        best,bi=-1,-1
        for i in range(a+1,b):
            px,py=pts[i]
            if L==0: d=(px-ax)**2+(py-ay)**2
            else:
                t=max(0,min(1,((px-ax)*dx+(py-ay)*dy)/L)); d=(px-ax-t*dx)**2+(py-ay-t*dy)**2
            if d>best: best,bi=d,i
        if best>t2: keep[bi]=True; stack+= [(a,bi),(bi,b)]
    return [p for p,k in zip(pts,keep) if k]

def tx_geom(g, tol, src4326=False):
    """g: dict geojson geometry in 3857 (или 4326) -> 4326, упрощённая"""
    def line(c):
        c=[tuple(p[:2]) for p in c]
        if not src4326 and tol: c=dp(c,tol)
        return [list(map(lambda v: round(v,6), p)) if src4326 else to_ll(*p) for p in c]
    t=g['type']; c=g['coordinates']
    if t=='Point': return {'type':t,'coordinates': [round(c[0],6),round(c[1],6)] if src4326 else to_ll(*c[:2])}
    if t=='MultiPoint': return {'type':t,'coordinates':[to_ll(*p[:2]) if not src4326 else p[:2] for p in c]}
    if t=='LineString': return {'type':t,'coordinates':line(c)}
    if t in('MultiLineString','Polygon'): return {'type':t,'coordinates':[line(r) for r in c]}
    if t=='MultiPolygon': return {'type':t,'coordinates':[[line(r) for r in p] for p in c]}
    raise ValueError(t)

# --- WKB ---
def read_wkb(b, o=0):
    bo = '<' if b[o]==1 else '>'; o+=1
    (t,)=struct.unpack_from(bo+'I',b,o); o+=4
    base=t%1000; dims=2+(1 if (t//1000) in (1,2) else 0)+(1 if t//1000==3 else 0)
    if t & 0x80000000: dims=3; base=t & 0xff
    def pts(o):
        (n,)=struct.unpack_from(bo+'I',b,o); o+=4
        arr=[list(struct.unpack_from(bo+'d'*dims,b,o+i*8*dims))[:2] for i in range(n)]
        return arr,o+n*8*dims
    if base==1:
        p=list(struct.unpack_from(bo+'d'*dims,b,o))[:2]; return {'type':'Point','coordinates':p},o+8*dims
    if base==2:
        a,o=pts(o); return {'type':'LineString','coordinates':a},o
    if base==3:
        (n,)=struct.unpack_from(bo+'I',b,o); o+=4; rs=[]
        for _ in range(n): a,o=pts(o); rs.append(a)
        return {'type':'Polygon','coordinates':rs},o
    if base in (4,5,6):
        (n,)=struct.unpack_from(bo+'I',b,o); o+=4; parts=[]
        for _ in range(n): g,o=read_wkb(b,o); parts.append(g['coordinates'])
        return {'type':{4:'MultiPoint',5:'MultiLineString',6:'MultiPolygon'}[base],'coordinates':parts},o
    raise ValueError(t)

def gpkg_geom(blob):
    flags=blob[3]; env=(flags>>1)&7; elen={0:0,1:32,2:48,3:48,4:64}[env]
    return read_wkb(blob,8+elen)[0]

def read_gpkg(path):
    c=sqlite3.connect('file:'+path+'?mode=ro',uri=True)
    t,srs=c.execute('select table_name,srs_id from gpkg_contents').fetchone()
    gcol=c.execute('select column_name from gpkg_geometry_columns where table_name=?',(t,)).fetchone()[0]
    cols=[r[1] for r in c.execute(f'pragma table_info("{t}")')]
    feats=[]
    for row in c.execute(f'select * from "{t}"'):
        props={}; geom=None
        for k,v in zip(cols,row):
            if k==gcol: geom=gpkg_geom(v) if v else None
            else: props[k]=v
        if geom: feats.append({'type':'Feature','properties':props,'geometry':geom})
    return feats, srs==4326

def read_geojson(path):
    d=json.load(open(path,encoding='utf-8'))
    crs=d.get('crs',{}).get('properties',{}).get('name','')
    return [f for f in d['features'] if f.get('geometry')], ('3857' not in crs)

def layer(path, tol=0, keep=None, filt=None):
    feats,is4326 = read_gpkg(path) if path.endswith('.gpkg') else read_geojson(path)
    # не доверяем объявленной СК: смотрим на величину координат
    c=feats[0]['geometry']['coordinates']
    while isinstance(c[0],list): c=c[0]
    is4326 = abs(c[0])<=180 and abs(c[1])<=90
    out=[]
    for f in feats:
        if filt and not filt(f['properties']): continue
        p=f['properties']
        if keep is not None: p={k:p.get(k) for k in keep if k in p}
        out.append({'type':'Feature','properties':p,'geometry':tx_geom(f['geometry'],tol,is4326)})
    return {'type':'FeatureCollection','features':out}

