(function(){
'use strict';
const D = window.GP_DATA || {}, M = window.GP_MEDIA || {viewpoints:[],paintings:[],mount:{},story:[]};
const {C, EPOCHS, STORIES, MAP_EPOCH, MAP_LAYERS, ZOOM_SRC, INFO} = window.GP;
const STEPS = window.GP_STEPS || {};
const $ = id => document.getElementById(id);
const body = document.body;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const isTouch = matchMedia('(hover: none)').matches;
const isNarrow = () => innerWidth <= 760;

/* ---------- карта ---------- */
const qs = new URLSearchParams(location.search).get('key');
let saved = null; try{ saved = localStorage.getItem('gp_mapbox_key'); }catch(e){}
const TOKEN = [window.MAPBOX_TOKEN, qs, saved].find(k => k && k.startsWith('pk.'));
const MB_ATTR = '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="https://www.maxar.com/">Maxar</a>';
// спутник: со своим ключом Mapbox (config.js) — Mapbox Satellite, без ключа — Esri World Imagery
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const SAT = TOKEN ? {tiles:[`https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.jpg90?access_token=${TOKEN}`], tileSize:512, attribution:MB_ATTR}
                  : {tiles:[ESRI], tileSize:256, attribution:'Снимок © Esri, Maxar, Earthstar Geographics'};
// рельеф: со своим ключом — Mapbox Terrain-RGB, без ключа — открытый Terrarium (AWS)
const DEM = TOKEN ? {tiles:[`https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.pngraw?access_token=${TOKEN}`], encoding:'mapbox'}
                  : {tiles:['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], encoding:'terrarium'};

const INTRO = {center:[30.32,59.93], zoom:8.6, pitch:35, bearing:-24};
const HOME  = {center:[30.30,59.90], zoom:9.2, pitch:58, bearing:-14};
let exag = 5;

const map = new maplibregl.Map({
  container:'map',
  style:{
    version:8,
    glyphs:'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
    sources:{
      sat:{type:'raster', ...SAT, maxzoom:19},
      sat2:{type:'raster', tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize:256, maxzoom:19, attribution:'Снимок © Esri, Maxar'},
      dem:{type:'raster-dem', ...DEM, tileSize:256, maxzoom:14},
      dem2:{type:'raster-dem', ...DEM, tileSize:256, maxzoom:14}
    },
    layers:[
      {id:'bg', type:'background', paint:{'background-color':'#16211b'}},
      {id:'sat2', type:'raster', source:'sat2', layout:{visibility:'none'}, paint:{'raster-saturation':-0.65,'raster-contrast':0.18,'raster-brightness-max':0.52}},
      {id:'sat', type:'raster', source:'sat', paint:{'raster-brightness-min-transition':{duration:1800},'raster-saturation-transition':{duration:1800},'raster-saturation':-0.65,'raster-contrast':0.18,'raster-brightness-max':0.52,'raster-brightness-min':0.02,'raster-fade-duration':300}},
      {id:'hillshade', type:'hillshade', source:'dem2', paint:{'hillshade-exaggeration':0.55,'hillshade-illumination-direction':315,
        'hillshade-shadow-color':'rgba(4,8,6,0.7)','hillshade-highlight-color':'rgba(255,250,240,0.22)','hillshade-accent-color':'rgba(0,0,0,0)'}}
    ],
    sky:{'sky-color':'#8ea3a6','horizon-color':'#c9d3cf','fog-color':'#c9d3cf','sky-horizon-blend':0.5,'horizon-fog-blend':0.55,'fog-ground-blend':0.88}
  },
  ...INTRO, maxPitch:72, minZoom:7.5, maxZoom:17,
  attributionControl:{compact:true}
});
window.GPMap = map;
// страховка: если задача отрисовки упала, карта не должна замирать навсегда
(function guardRenderQueue(){
  const q = map._renderTaskQueue;
  if(!q || typeof q.run !== 'function') return;
  const run = q.run.bind(q);
  q.run = function(t){ try{ return run(t); }catch(e){ console.error('[карта] ошибка в кадре отрисовки:', e); this._currentlyRunning = false; map.triggerRepaint(); } };
})();
let satFails = 0;
let demFails = 0;
map.on('error', e => {
  if(e.sourceId === 'sat' && ++satFails > 4) map.setLayoutProperty('sat2','visibility','visible');
  // высоты не грузятся — выключаем объём, карта остаётся рабочей
  if((e.sourceId === 'dem' || e.sourceId === 'dem2') && ++demFails === 4){
    try{ map.setTerrain(null); map.setLayoutProperty('hillshade','visibility','none'); }catch(_){}
    const r = document.querySelector('.relief'); if(r) r.hidden = true;
  }
});
const HANDLERS = ['scrollZoom','boxZoom','dragRotate','dragPan','keyboard','doubleClickZoom','touchZoomRotate'];
const setInteractive = on => HANDLERS.forEach(h => on ? map[h].enable() : map[h].disable());
setInteractive(false);

/* ---------- слои ---------- */
// Две темы: «ночь» — обложка (тёмный спутник, белые линии), «бумага» — карта (выбеленный снимок, графит и пастель)
const HOVER = ['boolean',['feature-state','hover'],false], SEL = ['boolean',['feature-state','sel'],false];
const hov = (a,b,c) => ['case', SEL, c ?? b, HOVER, b, a];
const GROUPS = {};   // ключ слоя → id слоёв карты
const CLICK = [];    // [id слоя карты, ключ INFO, ключ слоя]
function src(key, data){ if(!map.getSource(key)) map.addSource(key,{type:'geojson', data, generateId:true}); }
function add(key, layers, clickInfo){
  if(!D[key]) return;
  src(key, D[key]);
  GROUPS[key] = [];
  layers.forEach(l => { map.addLayer({source:key, ...l, layout:{visibility:'none', ...(l.layout||{})}}); GROUPS[key].push(l.id); });
  if(clickInfo){ const f = layers.find(l => l.type === 'fill'); CLICK.push([(f || layers[layers.length-1]).id, clickInfo, key]); }
}
const WHITE = '#ffffff';
// плоская пастельная заливка с белым контуром — как на архитектурных схемах
const fill = (id,col,op=0.62) => [
  {id:id+'-f', type:'fill', paint:{'fill-color':col,'fill-opacity':hov(op*0.42, Math.min(op*0.42+0.2,0.7), 0.7)}},
  {id:id+'-h', type:'fill', paint:{'fill-pattern':hatchFor(col),'fill-opacity':0.85}},
  {id:id+'-l', type:'line', paint:{'line-color':['case',SEL,WHITE,col],'line-width':hov(1.3,2.2,2.8),'line-dasharray':[3,2],'line-opacity':1}}
];
// штриховка цветом слоя
const HATCH = {};
function hatchFor(col){
  const id = 'hatch-' + col.replace('#','');
  if(!HATCH[id]){
    const s = 12, c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d');
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.2;
    g.beginPath(); for(let k=-s; k<=s; k+=6){ g.moveTo(k,s); g.lineTo(k+s,0); } g.stroke();
    HATCH[id] = g.getImageData(0,0,s,s);
    map.addImage(id, HATCH[id], {pixelRatio:2});
  }
  return id;
}
const dot = (id,col,r,sw=1.6) => [{id, type:'circle', paint:{
  'circle-color':col, 'circle-radius':hov(r, r+2.5, r+3), 'circle-stroke-color':['case',SEL,C.pink,'#111416'],
  'circle-stroke-width':hov(sw, sw+0.6, 2.6), 'circle-pitch-alignment':'map'}}];

function triangleIcon(){
  const s = 48, c = document.createElement('canvas'); c.width = c.height = s; const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(s/2, 4); g.lineTo(s-4, s-6); g.lineTo(4, s-6); g.closePath(); g.fill();
  return g.getImageData(0,0,s,s);
}

const THEMES = {
  night:{
    sat:{'raster-saturation':-0.55,'raster-contrast':0.15,'raster-brightness-min':0,'raster-brightness-max':0.55},
    hill:{'hillshade-shadow-color':'rgba(4,8,6,0.65)','hillshade-highlight-color':'rgba(255,250,240,0.18)'},
    line:C.snow, isoOp:0.32, isoIOp:0.6, mask:['#05080a',0.45], label:C.snow, halo:'rgba(4,7,5,0.9)'
  },
  paper:{   // рабочая карта: зелёный спутник, чуть приглушённый
    sat:{'raster-saturation':-0.08,'raster-contrast':0.12,'raster-brightness-min':0,'raster-brightness-max':0.82},
    hill:{'hillshade-shadow-color':'rgba(4,10,6,0.5)','hillshade-highlight-color':'rgba(255,250,235,0.14)'},
    line:C.snow, isoOp:0.3, isoIOp:0.66, mask:['#1b201d',0.66], label:C.snow, halo:'rgba(6,12,8,0.92)'
  }
};
let theme = 'night';
function setTheme(t){
  theme = t; const T = THEMES[t];
  Object.entries(T.sat).forEach(([k,v]) => { map.setPaintProperty('sat',k,v); map.setPaintProperty('sat2',k,v); });
  Object.entries(T.hill).forEach(([k,v]) => map.setPaintProperty('hillshade',k,v));
  const L = (id,p,v) => map.getLayer(id) && map.setPaintProperty(id,p,v);
  L('isolines','line-color',T.line); L('isolines-i','line-color',T.line);
  L('isolines','line-opacity',['interpolate',['linear'],['zoom'],8,T.isoOp*0.6,12,T.isoOp,14,T.isoOp*1.3]);
  L('isolines-i','line-opacity',['interpolate',['linear'],['zoom'],8,T.isoIOp*0.75,12,T.isoIOp]);
  L('bound','line-color',T.line); L('stage','line-color',T.line); L('sectors-l','line-color',T.line);
  L('mask','fill-color',T.mask[0]); L('mask','fill-opacity',T.mask[1]);
  L('mount','icon-color',['case',SEL,C.pink,T.line]);
  ['lab-mount','lab-tier','isolines-lab'].forEach(id => { L(id,'text-color',T.label); L(id,'text-halo-color',T.halo); });
  L('lab-vom','text-halo-color',T.halo);
  map.setPaintProperty('bg','background-color','#16211b');
  map.setSky(t === 'paper' ? {'sky-color':'#8ea3a6','horizon-color':'#c9d3cf','fog-color':'#c9d3cf','sky-horizon-blend':0.5,'horizon-fog-blend':0.55,'fog-ground-blend':0.88}
                           : {'sky-color':'#8ea3a6','horizon-color':'#c9d3cf','fog-color':'#c9d3cf','sky-horizon-blend':0.5,'horizon-fog-blend':0.55,'fog-ground-blend':0.88});
  body.classList.toggle('mono', t === 'paper');
}

map.on('load', () => {
  if(demFails < 4) map.setTerrain({source:'dem', exaggeration:exag});
  else { map.setLayoutProperty('hillshade','visibility','none'); }
  map.addImage('tri', triangleIcon(), {sdf:true, pixelRatio:2});
  // плашка для подписей (как в референсах: текст на прямоугольнике)
  { const s = 16, cv = document.createElement('canvas'); cv.width = cv.height = s; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0,0,s,s);
    map.addImage('tag', g.getImageData(0,0,s,s), {sdf:true, pixelRatio:2, stretchX:[[2,14]], stretchY:[[2,14]], content:[2,2,14,14]}); }

  // постоянные: маска вне амфитеатра, ярусы пунктиром, изолинии
  add('mask', [{id:'mask', type:'fill', paint:{'fill-color':'#05080a','fill-opacity':0.45,'fill-opacity-transition':{duration:1500}}}]);
  add('sectors', [
    {id:'sectors-f', type:'fill', paint:{'fill-color':C.pink,'fill-opacity':['case',SEL,0.14,HOVER,0.08,0]}},
    {id:'sectors-l', type:'line', paint:{'line-color':C.snow,'line-opacity':0.4,'line-width':0.7,'line-dasharray':[3,3]}}], 'sectors');
  add('isolines', [
    {id:'isolines', type:'line', filter:['!=',['%',['to-number',['get','ELEV'],1],25],0], layout:{'line-join':'round'},
     paint:{'line-color':C.snow,'line-width':0.67,'line-opacity':0.3}},
    {id:'isolines-i', type:'line', filter:['==',['%',['to-number',['get','ELEV'],1],25],0], layout:{'line-join':'round'},
     paint:{'line-color':C.snow,'line-width':['interpolate',['linear'],['zoom'],8,0.8,13,1.3],'line-opacity':0.6}}]);
  add('mount_polygon', [{id:'mount_polygon-f', type:'fill', paint:{'fill-color':C.graphite,'fill-opacity':0.12}},
                        {id:'mount_polygon-l', type:'line', paint:{'line-color':C.graphite,'line-opacity':0.6,'line-width':0.6}}]);
  ['mask_stage','mask_parter','mask_belletazh','mask_balcon'].forEach(k => add(k, [{id:k, type:'fill', paint:{'fill-color':C.pink,'fill-opacity':0.32}},
    {id:k+'-l', type:'line', paint:{'line-color':C.pink,'line-width':1.4}}]));
  add('vomitoria', [{id:'vomitoria-c', type:'line', paint:{'line-color':'#111416','line-width':5,'line-opacity':0.7}},
                    {id:'vomitoria', type:'line', paint:{'line-color':C.ice,'line-width':2.6}}]);

  // эпохи: плоские пастельные заливки
  const LAND = {landscape_450:['450 млн лет назад',C.ochre], landscape_25:['2,5 млн лет назад',C.clay], landscape_12:['12 тыс. лет назад',C.ice], landscape_7:['7 тыс. лет назад',C.sea]};
  Object.entries(LAND).forEach(([k,[lab,col]]) => { (D[k]?.features||[]).forEach(f => f.properties._epoch = lab); add(k, fill(k,col,0.66), 'landscape'); });
  add('resettlement', fill('resettlement', C.indigo, 0.7), 'resettlement');
  add('maki_selki', fill('maki_selki', C.indigo, 0.8), 'maki_selki');
  add('finns_today', [{id:'finns_today', type:'circle', paint:{'circle-color':C.indigo,'circle-opacity':0.85,
    'circle-radius':['+',['interpolate',['linear'],['sqrt',['to-number',['get','population'],100]],0,2,300,14], ['case',HOVER,2,0]],
    'circle-stroke-color':['case',SEL,C.pink,'#111416'],'circle-stroke-width':1.2}}], 'finns_today');
  // новое расселение: скруглённые пятна с размытым краем — «тепловые облака»
  add('bubbles', [{id:'bubbles-g', type:'line', paint:{'line-color':C.concrete,'line-width':5,'line-blur':5,'line-opacity':0.18}},
                  {id:'bubbles-f', type:'fill', paint:{'fill-color':C.concrete,'fill-opacity':hov(0.14,0.4,0.5)}}], 'bubbles');
  add('walking', [{id:'walking', type:'line', paint:{'line-color':C.lavender,'line-dasharray':[2,1.5],'line-opacity':['case',HOVER,1,SEL,1,0.7],'line-width':hov(1,2.2,2.8)}}], 'walking');
  add('routes', [{id:'routes-c', type:'line', layout:{'line-cap':'round','line-join':'round'}, paint:{'line-color':'#111416','line-width':5.5,'line-opacity':0.7}},
                 {id:'routes', type:'line', layout:{'line-cap':'round','line-join':'round'}, paint:{'line-color':C.lavender,'line-width':hov(2.6,3.6,4.2)}}], 'routes');
  add('trail', [{id:'trail-g', type:'line', layout:{'line-cap':'round','line-join':'round'}, paint:{'line-color':C.pink,'line-width':['interpolate',['linear'],['zoom'],9,9,13,18],'line-opacity':0.35}},
                {id:'trail-c', type:'line', layout:{'line-cap':'round','line-join':'round'}, paint:{'line-color':'#111416','line-width':6,'line-opacity':0.35}},
                {id:'trail', type:'line', layout:{'line-cap':'round','line-join':'round'}, paint:{'line-color':C.pink,'line-width':hov(3,4,4.6)}}], 'trail');
  add('estate', dot('estate', C.gold, 5), 'estate');
  add('paintings', [{id:'paintings', type:'circle', paint:{'circle-color':C.parchment,'circle-radius':hov(5.5,8,9),
    'circle-stroke-color':['case',SEL,C.pink,'#111416'],'circle-stroke-width':hov(2.2,2.6,3),'circle-pitch-alignment':'map'}}], 'paintings');
  add('leisure', dot('leisure', C.lavender, 5.5), 'leisure');
  add('photo_points', dot('photo_points', C.pink, 4.5), 'photo_points');
  add('viewpoints', [{id:'viewpoints-h', type:'circle', paint:{'circle-color':'#ffffff','circle-radius':hov(9,11,12),'circle-stroke-color':C.pink,'circle-stroke-width':hov(2.5,3,3.5)}},
                     {id:'viewpoints', type:'circle', paint:{'circle-color':C.pink,'circle-radius':4}}], 'viewpoints');
  map.setPaintProperty('photo_points','circle-stroke-color',WHITE);

  // конус обзора для снимков
  map.addSource('cone', {type:'geojson', data:{type:'FeatureCollection', features:[]}});
  map.addLayer({id:'cone', type:'fill', source:'cone', paint:{'fill-color':C.pink,'fill-opacity':0.25}});
  map.addLayer({id:'cone-l', type:'line', source:'cone', paint:{'line-color':C.pink,'line-width':1.2,'line-dasharray':[2,2]}});

  // граница амфитеатра и сцена
  add('bound', [{id:'bound', type:'line', paint:{'line-color':C.snow,'line-width':1.8}}]);
  add('stage', [{id:'stage', type:'line', paint:{'line-color':C.snow,'line-width':1,'line-opacity':0.85,'line-dasharray':[2,2]}}]);

  // вершины — треугольники (графит на бумаге, белые ночью)
  add('mount', [{id:'mount', type:'symbol', layout:{'icon-image':'tri','icon-size':['match',['get','type'],'гора',0.6,'возвышенность',0.45,0.38],
      'icon-allow-overlap':true, 'symbol-sort-key':['-',0,['to-number',['get','height_value'],0]]},
    paint:{'icon-color':['case',SEL,C.pink,C.snow],'icon-opacity':['case',HOVER,1,0.9]}}], 'mount');

  // подписи — отдельные источники, чтобы точки не зависели от шрифтов
  src('labels', D.labels);
  map.addSource('mount-names', {type:'geojson', data:D.mount});
  const halo = {'text-halo-color':'rgba(4,7,5,0.9)','text-halo-width':2,'text-halo-blur':0.3};
  map.addLayer({id:'isolines-lab', type:'symbol', source:'isolines', minzoom:11.5, filter:['==',['%',['to-number',['get','ELEV'],1],25],0],
    layout:{'symbol-placement':'line','text-field':['concat',['to-string',['get','ELEV']],' м'],'text-font':['Open Sans Semibold'],'text-size':10,'symbol-spacing':420},
    paint:{'text-color':C.snow, ...halo, 'text-opacity':0.8}});
  map.addLayer({id:'lab-mount', type:'symbol', source:'mount-names', layout:{'text-field':['get','name'],'text-font':['Open Sans Semibold'],
    'text-size':['match',['get','type'],'гора',13,11.5],'text-offset':[0,0.95],'text-anchor':'top','text-optional':true,'text-padding':4,
    'symbol-sort-key':['-',0,['to-number',['get','height_value'],0]]},
    paint:{'text-color':C.snow, ...halo, 'text-opacity':['step',['zoom'],['case',['==',['get','type'],'гора'],1,0],11,1]}});
  map.addLayer({id:'lab-massif', type:'symbol', source:'labels', filter:['==',['get','kind'],'massif'], layout:{'text-field':['get','name'],
    'text-font':['Open Sans Semibold'],'text-size':['interpolate',['linear'],['zoom'],8,10.5,12,13],'text-letter-spacing':0.08,'text-transform':'uppercase','text-max-width':14,
    'icon-image':'tag','icon-text-fit':'both','icon-text-fit-padding':[4,8,4,8],'icon-allow-overlap':false,'text-padding':6},
    paint:{'text-color':C.snow,'icon-color':'rgba(16,20,18,0.86)'}});
  map.addLayer({id:'lab-tier', type:'symbol', source:'labels', filter:['==',['get','kind'],'none'], layout:{'text-field':['get','name'],
    'text-font':['Open Sans Semibold'],'text-size':17,'text-letter-spacing':0.12,'text-transform':'uppercase'}, paint:{'text-color':C.snow, ...halo}});
  // подписи эпох — тёмным тоном своего цвета, чтобы читались на белом
  map.addLayer({id:'lab-epoch', type:'symbol', source:'labels', filter:['==',['get','kind'],'none'], layout:{'text-field':['get','name'],
    'text-font':['Open Sans Semibold'],'text-size':['interpolate',['linear'],['zoom'],8,11.5,12,14],'text-max-width':12,
    'icon-image':'tag','icon-text-fit':'both','icon-text-fit-padding':[3,7,3,7],'text-padding':6},
    paint:{'text-color':['match',['get','epoch'],'e12','#0d1b26','e7','#0d1b26','estates','#2a1606',WHITE],
      'icon-color':['match',['get','epoch'],'e450',C.ochre,'e25',C.clay,'e12',C.ice,'e7',C.sea,'finns',C.indigo,'estates',C.gold,C.graphite]}});
  map.addLayer({id:'lab-vom', type:'symbol', source:'labels', filter:['==',['get','kind'],'none'], layout:{'text-field':['get','name'],
    'text-font':['Open Sans Semibold'],'text-size':11.5}, paint:{'text-color':C.ice, ...halo}});

  ['mask','sectors','isolines','bound','stage','mount'].forEach(k => show(k, true));
  setTheme(body.classList.contains('state-map') ? 'paper' : 'night');
  orbit();
  ready = true; if(pending) { pending(); pending = null; }
});
let ready = false, pending = null;
const whenReady = fn => ready ? fn() : (pending = fn);

function show(key, on){ (GROUPS[key]||[]).forEach(id => map.getLayer(id) && map.setLayoutProperty(id,'visibility', on ? 'visible' : 'none')); }
const OPTIONAL = ['mount_polygon','mask_stage','mask_parter','mask_belletazh','mask_balcon','vomitoria','landscape_450','landscape_25','landscape_12','landscape_7',
  'resettlement','maki_selki','finns_today','bubbles','walking','routes','trail','estate','paintings','leisure','photo_points','viewpoints'];
let visibleSet = [];
function setLayers(keys, epochIds){
  visibleSet = keys;
  toggleCallouts(keys.includes('photo_points'));
  OPTIONAL.forEach(k => show(k, keys.includes(k)));
  const tiers = keys.filter(k => k.startsWith('mask_')).map(k => k.replace('mask_','').replace('belletazh','belletazh'));
  map.setFilter('lab-tier', ['all',['==',['get','kind'],'tier'],['in',['get','tier'],['literal',tiers]]]);
  map.setFilter('lab-epoch', ['all',['==',['get','kind'],'epoch'],['in',['get','epoch'],['literal',epochIds||[]]]]);
  map.setFilter('lab-vom', keys.includes('vomitoria') ? ['==',['get','kind'],'vomitoria'] : ['==',['get','kind'],'none']);
  clearCone(); buildLegend();
}

/* ---------- выноски с фото ---------- */
// на общем плане выноски прячутся, появляются при приближении
map.on('zoom', () => document.getElementById('map').classList.toggle('far', map.getZoom() < 10.4));
let callouts = [];
function toggleCallouts(on){
  callouts.forEach(m => m.remove()); callouts = [];
  if(!on || !D.photo_points) return;
  const feats = D.photo_points.features;
  // не больше 9 выносок, равномерно по списку, только с фото
  const pick = feats.map((f,i) => [f,i]).filter(([f]) => M.viewpoints.includes(String(f.properties.id)));
  const step = Math.max(1, Math.floor(pick.length / 9));
  pick.filter((_, k) => k % step === 0).slice(0, 9).forEach(([f, i], k) => {
    const el = document.createElement('button');
    el.className = 'callout ' + (k % 2 ? 'up' : 'down');
    el.innerHTML = `<span class="co-card"><img src="media/vp/${f.properties.id}.t.webp" alt="Вид с точки ${f.properties.id}"><span>Снимок ${f.properties.id}</span></span><i class="co-leg"></i>`;
    el.onclick = ev => { ev.stopPropagation(); openCard({properties:f.properties, geometry:f.geometry, source:'photo_points', id:i}, 'photo_points', 'photo_points'); };
    callouts.push(new maplibregl.Marker({element:el, anchor:'bottom'}).setLngLat(f.geometry.coordinates).addTo(map));
  });
}

/* ---------- камера ---------- */
let idle = true;
function orbit(){ if(idle) map.easeTo({bearing:map.getBearing()+5, duration:22000, easing:t=>t}); }
map.on('moveend', () => { if(idle && (body.classList.contains('state-cover') || body.classList.contains('state-welcome'))) orbit(); });
function bboxOf(fc){
  let b = [180,90,-180,-90];
  const walk = c => { if(typeof c[0] === 'number'){ b[0]=Math.min(b[0],c[0]); b[1]=Math.min(b[1],c[1]); b[2]=Math.max(b[2],c[0]); b[3]=Math.max(b[3],c[1]); } else c.forEach(walk); };
  (fc.features||[]).forEach(f => f.geometry && walk(f.geometry.coordinates));
  return [[b[0],b[1]],[b[2],b[3]]];
}
function panelPad(){ return isNarrow() ? {top:60,bottom:Math.round(innerHeight*0.5),left:10,right:10} : {top:70,bottom:130,left:body.classList.contains('reading') ? 480 : 60,right:90}; }
function fitTo(key, opts={}){
  const fc = D[key]; if(!fc || !fc.features.length) return;
  // наклонённая камера показывает больше, чем плоский bbox, — приближаем на полшага
  const cam = map.cameraForBounds(bboxOf(fc), {padding:panelPad(), bearing:opts.bearing ?? -12});
  if(!cam) return;
  map.flyTo({center:cam.center, zoom:Math.min((cam.zoom || 9) + 0.8, opts.maxZoom ?? 12.5), pitch:opts.pitch ?? 55, bearing:opts.bearing ?? -12,
    duration:opts.duration ?? 2600, essential:true, padding:panelPad()});
}

/* ---------- состояния ---------- */
function setState(s){
  ['state-cover','state-welcome','state-map'].forEach(c => body.classList.remove(c));
  body.classList.add('state-'+s);
  if(s === 'cover'){ closeAll(); if(ready) setTheme('night'); idle = true; setInteractive(false); GPClouds.setClear(0); map.flyTo({...INTRO, duration:3000}); }
  if(s === 'welcome'){ closeAll(); if(ready) setTheme('night'); idle = true; setInteractive(false); GPClouds.setClear(.45); map.flyTo({...HOME, duration:4200, essential:true}); }
  if(s === 'map'){ idle = false; map.stop(); setInteractive(true); GPClouds.setClear(1); if(ready) setTheme('paper'); }
}
function closeAll(){ closeCard(); closeStory(true); hideStoryCover(); toggleFinds(false); }

$('enter').onclick = () => setState('welcome');
$('home').onclick = () => setState('cover');
document.querySelectorAll('.role').forEach(b => b.onclick = () => whenReady(() => {
  setState('map');
  if(b.dataset.role === 'explorer'){ setEpoch('today'); map.flyTo({...HOME, duration:2400}); const h = $('hint'); h.hidden = false; setTimeout(() => h.hidden = true, 7000); }
  else openStoryCover('amph');
}));

/* ---------- шкала времени ---------- */
let activeEpoch = null;
const track = $('timeTrack');
EPOCHS.forEach((e,i) => {
  const b = document.createElement('button');
  b.className = 'tick'; b.dataset.id = e.id; b.style.setProperty('--c', e.color); b.setAttribute('role','tab');
  b.innerHTML = `<i></i><span class="t-when">${esc(e.label)}</span><span class="t-what">${esc(e.short)}</span>`;
  if(e.disabled){ b.classList.add('off'); b.title = 'Данные готовятся'; }
  b.onclick = () => { if(e.disabled) return; if(story) closeStory(); setEpoch(e.id); };
  b.onmouseenter = () => showEpochHint(e, b);
  b.onmouseleave = () => hideTip();
  track.appendChild(b);
});
function setEpoch(id, fromStory){
  activeEpoch = id;
  track.querySelectorAll('.tick').forEach(t => t.classList.toggle('on', t.dataset.id === id));
  if(fromStory) return;
  const e = EPOCHS.find(x => x.id === id);
  setLayers(e ? e.layers : [], e ? [e.id] : []);
}
function showEpochHint(e, el){
  const r = el.getBoundingClientRect();
  tip.innerHTML = `<b style="color:${e.color}">${esc(e.short)}</b><span>${esc(e.text)}</span>`;
  tip.hidden = false; tip.classList.add('wide');
  tip.style.left = Math.min(innerWidth - 300, Math.max(12, r.left + r.width/2 - 140)) + 'px'; tip.style.top = (r.top - 12) + 'px';
  tip.style.transform = 'translateY(-100%)';
}

/* ---------- объём ---------- */
$('exag').oninput = e => { exag = +e.target.value; $('exagOut').textContent = '×' + String(exag).replace('.',','); if(demFails < 4) map.setTerrain({source:'dem', exaggeration:exag}); };

/* ---------- закладки ---------- */
const tabs = $('tabs');
STORIES.forEach((s,i) => {
  const b = document.createElement('button');
  b.className = 'tab'; b.dataset.id = s.id;
  b.innerHTML = `<span class="tab-img" style="background-image:url('media/covers/${s.id}.t.webp')"></span>
    <span class="tab-num">${String(i+1).padStart(2,'0')}</span>
    <span class="tab-body"><span class="tab-title">${esc(s.title)}</span><span class="tab-lead">${esc(s.lead)}</span></span>`;
  b.onclick = () => openStoryCover(s.id);
  tabs.appendChild(b);
});

let story = null, stepIdx = 0, coverFor = null;
function openStoryCover(id){
  const s = STORIES.find(x => x.id === id), i = STORIES.indexOf(s);
  coverFor = id; closeCard();
  $('scImg').src = `media/covers/${id}.webp`;
  $('scNum').textContent = `История ${i+1} из ${STORIES.length}`;
  $('scTitle').textContent = s.title; $('scLead').textContent = s.lead; $('scCredit').textContent = s.credit || '';
  $('storyCover').setAttribute('aria-hidden','false'); body.classList.add('covered');
  tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.id === id));
  setTimeout(() => $('scStart').focus(), 400);
  // карта за обложкой перелетает к истории
  whenReady(() => { idle = false; fitTo('bound', {duration:3000, pitch:55}); });
}
function hideStoryCover(){ $('storyCover').setAttribute('aria-hidden','true'); body.classList.remove('covered'); }
$('scStart').onclick = () => { hideStoryCover(); startStory(coverFor); };
$('scClose').onclick = () => { hideStoryCover(); if(!story) tabs.querySelectorAll('.tab').forEach(t => t.classList.remove('on')); };

function startStory(id){
  story = id; stepIdx = 0; lastZoom = null; body.classList.add('reading'); $('story').hidden = false;
  tabs.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.id === id));
  renderStep();
}
function closeStory(silent){
  if(!story) return;
  story = null; body.classList.remove('reading'); $('story').hidden = true;
  tabs.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
  if(!silent && ready) setEpoch(activeEpoch || 'today');
}
let lastZoom = null;
function renderStep(){
  const steps = STEPS[story] || [], st = steps[stepIdx], s = STORIES.find(x => x.id === story);
  if(!st) return;
  $('stName').textContent = s.title;
  $('stCount').textContent = `${String(stepIdx+1).padStart(2,'0')} / ${String(steps.length).padStart(2,'0')}`;
  $('stSub').textContent = st.title;
  $('stText').innerHTML = (st.text || []).map(p => `<p>${p}</p>`).join('');
  $('stLook').textContent = st.look || ''; $('stLook').hidden = !st.look;
  const fig = $('stFig');
  if(st.media){ fig.hidden = false; $('stImg').src = `media/story/${st.media}.webp`; $('stImg').alt = st.title; $('stImg').onclick = () => lightbox($('stImg').src, st.title); }
  else fig.hidden = true;
  $('stDots').innerHTML = steps.map((_,i) => `<i class="${i === stepIdx ? 'on' : i < stepIdx ? 'done' : ''}"></i>`).join('');
  $('stPrev').disabled = stepIdx === 0;
  $('stNext').textContent = stepIdx === steps.length-1 ? (nextStory() ? 'Следующая история' : 'К свободной карте') : 'Дальше';
  $('stScroll').scrollTop = 0;
  whenReady(() => {
    const keys = MAP_LAYERS[st.map] || [];
    const ep = MAP_EPOCH[st.map] || null;
    const epochs = ep ? (String(st.map).match(/^(9|10|11)$/) ? ['e450','e25','e12','e7'].slice(0, +st.map - 7) : [ep]) : [];
    setLayers(keys, epochs);
    setEpoch(ep, true);
    const z = st.zoom || 'amphitheater_bound';
    if(z !== lastZoom){ lastZoom = z; fitTo(ZOOM_SRC[z] || 'bound', {maxZoom: z === 'amphitheater_bound' ? 10 : 12}); }
  });
}
const nextStory = () => STORIES[STORIES.findIndex(x => x.id === story) + 1];
$('stPrev').onclick = () => { if(stepIdx > 0){ stepIdx--; renderStep(); } };
$('stNext').onclick = () => {
  const n = (STEPS[story]||[]).length;
  if(stepIdx < n-1){ stepIdx++; renderStep(); return; }
  const nx = nextStory(); closeStory(); if(nx) openStoryCover(nx.id);
};
$('storyX').onclick = () => closeStory();

/* ---------- наведение и клик ---------- */
const tip = $('tip');
let hovered = null, selected = null, selKey = null;
const clickIds = () => CLICK.map(c => c[0]).filter(id => map.getLayer(id) && map.getLayoutProperty(id,'visibility') === 'visible');
function pick(point){
  const ids = clickIds(); if(!ids.length) return null;
  const fs = map.queryRenderedFeatures([[point.x-5,point.y-5],[point.x+5,point.y+5]], {layers:ids});
  if(!fs.length) return null;
  // точки важнее линий, линии важнее полигонов, ярусы — в последнюю очередь
  const rank = f => f.layer.id === 'sectors-f' ? 4 : f.layer.type === 'fill' ? 3 : f.layer.type === 'line' ? 2 : 1;
  fs.sort((a,b) => rank(a) - rank(b));
  const f = fs[0], c = CLICK.find(c => c[0] === f.layer.id);
  return {f, info:c[1], key:c[2]};
}
function setFS(t, st){ if(t) try{ map.setFeatureState({source:t.source, id:t.id}, st); }catch(e){} }
map.on('mousemove', e => {
  if(!body.classList.contains('state-map') || isTouch) return;
  const p = pick(e.point);
  map.getCanvas().style.cursor = p ? 'pointer' : '';
  const ref = p ? {source:p.f.source, id:p.f.id} : null;
  if(hovered && (!ref || hovered.source !== ref.source || hovered.id !== ref.id)){ setFS(hovered,{hover:false}); if(!selected || selKey !== 'photo_points') clearConeIfNotSel(); }
  hovered = ref;
  if(!p){ hideTip(); return; }
  setFS(ref,{hover:true});
  const I = INFO[p.info], pr = p.f.properties;
  tip.classList.remove('wide'); tip.style.transform = '';
  tip.innerHTML = `<b>${esc(I.title(pr) || I.name)}</b><span>${esc(I.kicker(pr))}</span>`;
  tip.hidden = false; tip.style.left = (e.point.x + 16) + 'px'; tip.style.top = (e.point.y + 14) + 'px';
  if(p.key === 'photo_points') drawCone(p.f);
});
map.on('mouseout', () => { hideTip(); if(hovered){ setFS(hovered,{hover:false}); hovered = null; } });
function hideTip(){ tip.hidden = true; }

map.on('click', e => {
  if(!body.classList.contains('state-map')) return;
  const p = pick(e.point);
  if(!p){ closeCard(); return; }
  openCard(p.f, p.info, p.key, e.lngLat);
});

/* ---------- карточка ---------- */
let cardData = null;
function openCard(f, infoKey, key, lngLat){
  const I = INFO[infoKey], pr = f.properties;
  if(selected) setFS(selected,{sel:false});
  selected = {source:f.source, id:f.id}; selKey = key; setFS(selected,{sel:true});
  const center = f.geometry.type === 'Point' ? f.geometry.coordinates : [lngLat.lng, lngLat.lat];
  cardData = {key, info:infoKey, fid:f.id, title:I.title(pr) || I.name, kicker:I.kicker(pr), center, color:I.color};
  $('cKick').innerHTML = `<i style="background:${I.color}"></i>${esc(I.kicker(pr))}`;
  $('cTitle').textContent = I.title(pr) || I.name;
  const meta = I.meta(pr); $('cMeta').textContent = meta; $('cMeta').hidden = !meta;
  const txt = I.text(pr); $('cText').innerHTML = txt ? esc(txt).replace(/\n+/g,'</p><p>').replace(/^/,'<p>').replace(/$/,'</p>') : '';
  const ex = I.explain(pr); $('cExplain').textContent = ex; $('cExplain').hidden = !ex;
  // фото
  const photos = [];
  if(key === 'mount' && M.mount[String(pr.fid)]) M.mount[String(pr.fid)].forEach(n => photos.push(`media/mount/${n}.webp`));
  if(key === 'paintings' && M.paintings.includes(String(pr.fid))) photos.push(`media/paint/${pr.fid}.webp`);
  if(key === 'photo_points' && M.viewpoints.includes(String(pr.id))) photos.push(`media/vp/${pr.id}.webp`);
  $('cPhotos').innerHTML = photos.map((u,i) => `<button class="ph" data-u="${u}"><img src="${u}" alt="${esc(cardData.title)}, фото ${i+1}" loading="lazy"></button>`).join('');
  $('cPhotos').hidden = !photos.length;
  $('cPhotos').querySelectorAll('.ph').forEach(b => b.onclick = () => lightbox(b.dataset.u, cardData.title));
  $('cardBack').hidden = !story;
  updateSaveBtn();
  $('card').hidden = false; body.classList.add('carded');
  if(key === 'photo_points') drawCone(f); else clearCone();
}
function closeCard(){
  if(selected){ setFS(selected,{sel:false}); selected = null; selKey = null; }
  $('card').hidden = true; body.classList.remove('carded'); cardData = null; clearCone();
}
$('cardX').onclick = closeCard;
$('cardBack').onclick = closeCard;
$('cZoom').onclick = () => { if(cardData) map.flyTo({center:cardData.center, zoom:Math.max(map.getZoom(), 13), pitch:60, duration:1800, padding:panelPad()}); };

/* ---------- конус обзора ---------- */
function drawCone(f){
  const p = f.properties, az = +p.azimuth; if(isNaN(az)) return;
  const [lng,lat] = f.geometry.coordinates, R = 2200, fov = 32, pts = [[lng,lat]];
  for(let a = az - fov; a <= az + fov; a += 4){
    const r = a * Math.PI/180, dx = R*Math.sin(r), dy = R*Math.cos(r);
    pts.push([lng + dx/(111320*Math.cos(lat*Math.PI/180)), lat + dy/110540]);
  }
  pts.push([lng,lat]);
  map.getSource('cone')?.setData({type:'FeatureCollection', features:[{type:'Feature', properties:{}, geometry:{type:'Polygon', coordinates:[pts]}}]});
}
function clearCone(){ map.getSource('cone')?.setData({type:'FeatureCollection', features:[]}); }
function clearConeIfNotSel(){ if(selKey !== 'photo_points') clearCone(); }

/* ---------- находки ---------- */
let finds = []; try{ finds = JSON.parse(localStorage.getItem('gp_finds') || '[]'); }catch(e){}
const saveFinds = () => { try{ localStorage.setItem('gp_finds', JSON.stringify(finds)); }catch(e){} renderFinds(); };
const findIdx = () => cardData ? finds.findIndex(x => x.key === cardData.key && x.title === cardData.title && Math.abs(x.center[0]-cardData.center[0]) < 1e-6) : -1;
function updateSaveBtn(){ const on = findIdx() >= 0; $('cSave').textContent = on ? 'В находках ✓' : 'В находки'; $('cSave').classList.toggle('saved', on); }
$('cSave').onclick = () => {
  const i = findIdx();
  if(i >= 0) finds.splice(i,1); else finds.push({key:cardData.key, title:cardData.title, kicker:cardData.kicker, center:cardData.center, color:cardData.color, t:Date.now()});
  saveFinds(); updateSaveBtn();
  $('findsBtn').classList.remove('bump'); void $('findsBtn').offsetWidth; $('findsBtn').classList.add('bump');
};
function renderFinds(){
  $('findsCount').textContent = finds.length;
  $('findsEmpty').hidden = finds.length > 0;
  $('findsList').innerHTML = finds.map((f,i) => `<li><button class="fi" data-i="${i}"><i style="background:${f.color}"></i><span><b>${esc(f.title)}</b><small>${esc(f.kicker)}</small></span></button><button class="fx" data-i="${i}" aria-label="Убрать из находок">×</button></li>`).join('');
  $('findsList').querySelectorAll('.fi').forEach(b => b.onclick = () => {
    const f = finds[+b.dataset.i]; toggleFinds(false); if(story) closeStory();
    const ep = EPOCHS.find(e => e.layers.includes(f.key)); if(ep && !visibleSet.includes(f.key)) setEpoch(ep.id);
    map.flyTo({center:f.center, zoom:13, pitch:60, duration:2200, padding:panelPad()});
    map.once('moveend', () => { const pt = map.project(f.center); const p = pick(pt); if(p) openCard(p.f, p.info, p.key, {lng:f.center[0], lat:f.center[1]}); });
  });
  $('findsList').querySelectorAll('.fx').forEach(b => b.onclick = () => { finds.splice(+b.dataset.i,1); saveFinds(); updateSaveBtn && cardData && updateSaveBtn(); });
}
function toggleFinds(on){ const el = $('finds'); on = on ?? el.hidden; el.hidden = !on; $('findsBtn').setAttribute('aria-expanded', on); }
$('findsBtn').onclick = () => toggleFinds();
$('findsX').onclick = () => toggleFinds(false);
renderFinds();

/* ---------- лайтбокс ---------- */
function lightbox(src, cap){ $('lbImg').src = src; $('lbCap').textContent = cap || ''; $('lightbox').hidden = false; }
$('lbX').onclick = () => $('lightbox').hidden = true;
$('lightbox').onclick = e => { if(e.target.id === 'lightbox') $('lightbox').hidden = true; };

/* ---------- легенда ---------- */
function buildLegend(){
  const map_ = {mount:'mount', estate:'estate', paintings:'paintings', photo_points:'photo_points', viewpoints:'viewpoints', trail:'trail', routes:'routes', walking:'walking',
    leisure:'leisure', bubbles:'bubbles', maki_selki:'maki_selki', resettlement:'resettlement', finns_today:'finns_today'};
  const items = [['Изолинии через 5 м, жирные — 25 м', C.snow, 'line'], ['Граница амфитеатра', C.snow, 'bold'], ['Вершины', C.snow, 'tri']];
  visibleSet.forEach(k => {
    if(k.startsWith('landscape')) { const lab = (D[k]?.features[0]?.properties._epoch); items.push(['Ландшафт ' + (lab||''), window.GP.LAND_COL[k], 'fill']); return; }
    if(k.startsWith('mask_')) return;
    const I = INFO[map_[k]]; if(I) items.push([I.name, I.color, ['trail','routes','walking'].includes(k) ? 'bold' : ['bubbles','maki_selki','resettlement'].includes(k) ? 'fill' : 'dot']);
  });
  $('legend').innerHTML = items.map(([t,c,s]) => `<span><i class="sw sw-${s}" style="--c:${c}"></i>${esc(t)}</span>`).join('');
}

/* ---------- клавиатура ---------- */
addEventListener('keydown', e => {
  if(story && !e.target.closest('input') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')){ e.preventDefault(); (e.key === 'ArrowRight' ? $('stNext') : $('stPrev')).click(); return; }
  if(e.key !== 'Escape') return;
  if(!$('lightbox').hidden) return $('lightbox').hidden = true;
  if(!$('card').hidden) return closeCard();
  if(!$('finds').hidden) return toggleFinds(false);
  if(body.classList.contains('covered')) return $('scClose').click();
  if(story) return closeStory();
  if(body.classList.contains('state-welcome')) return setState('cover');
});
if(isTouch) body.classList.add('touch');
})();
