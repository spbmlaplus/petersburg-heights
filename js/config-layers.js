/* Конфигурация: палитра, эпохи, истории, слои и пояснения к ним. Тексты explain — черновики, правьте здесь. */
window.GP = (function(){
  const C = {
    // зелёный спутник + три семьи (по референсам): синий — природа и время, оранжевый — люди прошлого, розовый — мы и сегодня
    snow:'#F4F6F5', ink:'#14181A', graphite:'#F4F6F5', pink:'#FF3E9A',
    ochre:'#2C6BFF', clay:'#3BA3FF', ice:'#7FD0FF', sea:'#BFEAFF',
    indigo:'#FF7A1A', gold:'#FFB066', parchment:'#FFD9A8', cinnabar:'#E8382B',
    lavender:'#FF9CCB', concrete:'#FFC4DF'
  };

  // шкала времени
  const EPOCHS = [
    {id:'e450', label:'450 млн лет', short:'Плато', color:C.ochre, layers:['landscape_450'],
     text:'Древнее море отступило, оставив известняковые плато — Ижорское и Путиловское. Их обрыв к северу и есть глинт.'},
    {id:'e25', label:'2,5 млн лет', short:'Морена', color:C.clay, layers:['landscape_25'],
     text:'Ледники приносят с севера камни и глину. Так складываются Дудергофские высоты и моренный пояс.'},
    {id:'e12', label:'12 тыс. лет', short:'Ледник', color:C.ice, layers:['landscape_12'],
     text:'Последний ледник тает и оставляет камы и гряды Карельского перешейка: Юкки, Токсово, Колтуши.'},
    {id:'e7', label:'7 тыс. лет', short:'Литориновое море', color:C.sea, layers:['landscape_7'],
     text:'Литориновое море подступает к уступам. Его береговая терраса — линия, вдоль которой позже встанут дворцы.'},
    {id:'finns', label:'XVII–XIX вв.', short:'Горные финны', color:C.indigo, layers:['resettlement','maki_selki','finns_today'],
     text:'Первыми горы заселяют финны: деревни-«мяки» на холмах, «сельки» на грядах.'},
    {id:'estates', label:'XVIII–XX вв.', short:'Усадьбы и панорамы', color:C.gold, layers:['estate','paintings'],
     text:'Дворяне и императорская семья занимают гребни и уступы ради видов на столицу.'},
    {id:'war', label:'1941–1944', short:'Рубежи', color:C.cinnabar, layers:[], disabled:true,
     text:'Высоты становятся линией фронта. Данные этого раздела ещё готовятся.'},
    {id:'today', label:'Сегодня', short:'Горы сейчас', color:C.lavender, layers:['walking','leisure','routes','bubbles','photo_points','trail','viewpoints'],
     text:'Склоны осваивают лыжники, парапланеристы и новые кварталы. Розовым — наш маршрут и видовые точки.'}
  ];

  // истории-закладки
  const STORIES = [
    {id:'amph', title:'Амфитеатр', lead:'Как Петербург оказался на сцене гигантского амфитеатра из холмов и уступов', credit:'Фото экспедиции'},
    {id:'geo', title:'Геологическая летопись', lead:'Древние моря, ледники и обрывы, из которых сложились горы вокруг города', credit:'Фото экспедиции'},
    {id:'finns', title:'Горные финны', lead:'Первые жители гор: мяки, сельки и призрак Ингерманландии', credit:'Архивная фотография'},
    {id:'observers', title:'Высочайшие наблюдатели', lead:'Дворцы и усадьбы, поставленные на гребни ради вида на столицу', credit:'Бельведер, литография XIX века'},
    {id:'painting', title:'Горная живопись', lead:'Какими художники видели Петербург с окрестных высот', credit:'Живопись из собрания исследования'},
    {id:'today', title:'Горы сейчас', lead:'Кто пользуется горами сегодня и знает ли, что живёт на горе', credit:'Живопись: лыжники в Юкках'},
    {id:'trail', title:'Большая горная тропа', lead:'Наш маршрут по видовым точкам амфитеатра', credit:'Фото экспедиции'}
  ];

  // эпоха шага истории по id_map
  const MAP_EPOCH = {8:'e450',9:'e25',10:'e12',11:'e7',12:'finns',13:'finns',14:'finns',15:'estates',16:'estates',17:'estates',18:'estates',19:'estates',20:'estates',21:'estates',22:'today',23:'today',trail:'today'};
  // какие слои показывает шаг истории (по наборам id_map прошлого исследования)
  const MAP_LAYERS = {
    1:['mount_polygon'], 2:['mount_polygon'], 3:['mask_stage'], 4:['mask_parter'], 5:['mask_belletazh'], 6:['mask_balcon'], 7:['vomitoria'],
    8:['landscape_450'], 9:['landscape_450','landscape_25'], 10:['landscape_450','landscape_25','landscape_12'], 11:['landscape_450','landscape_25','landscape_12','landscape_7'],
    12:['resettlement'], 13:['maki_selki'], 14:['resettlement','finns_today'],
    15:['estate'],16:['estate'],17:['estate'],18:['estate'],19:['estate'],20:['estate'], 21:['paintings'],
    22:['walking','leisure'], 23:['routes','photo_points'], trail:['trail','viewpoints','photo_points']
  };
  const ZOOM_SRC = {amphitheater_bound:'bound', historical_zones_1:'zone_1', historical_zones_2:'zone_2', historical_zones_3:'zone_3', historical_zones_4:'zone_4', historical_zones_5:'zone_5', trail:'trail'};

  const LAND_COL = {
    landscape_450:C.ochre, landscape_25:C.clay, landscape_12:C.ice, landscape_7:C.sea
  };

  // пояснения в карточках
  const INFO = {
    mount:{name:'Вершины', color:C.graphite, kicker:p=>p.type||'вершина', title:p=>p.name||'Безымянная вершина',
      meta:p=>p.height_value?`${String(p.height_value).replace('.',',')} м над уровнем моря`:'', text:p=>p.description||'',
      explain:p=>({'гора':'Гора — самые высокие и выразительные вершины амфитеатра, заметные с равнины города.','холм':'Холм — невысокая округлая вершина; таких в амфитеатре большинство.','возвышенность':'Возвышенность — пологое поднятие: гребень или плато над окружающей местностью.'})[p.type]||''},
    estate:{name:'Усадьбы и дачи', color:C.gold, kicker:p=>p.type||'усадьба', title:p=>p.name, meta:p=>p.fact&&p.fact!=='Нет'?p.fact:'', text:p=>p.description||'',
      explain:()=>'Усадьбы ставили на гребни и уступы, чтобы с них открывалась панорама столицы.'},
    paintings:{name:'Живопись', color:C.parchment, kicker:()=>'живопись', title:p=>p.name, meta:()=>'', text:()=>'',
      explain:()=>'Точка, с которой художник смотрел на пейзаж.'},
    photo_points:{name:'Снимки экспедиции', color:C.pink, kicker:()=>'вид с высоты', title:p=>'Снимок '+p.id,
      meta:p=>[p.alt?`высота ${p.alt} м`:'', p.azimuth!=null?`смотрим на ${dir(p.azimuth)}`:''].filter(Boolean).join(', '), text:()=>'',
      explain:()=>'Кадр, снятый во время экспедиции. Розовый сектор показывает направление взгляда.'},
    viewpoints:{name:'Точки обзора', color:C.pink, kicker:()=>'точка обзора', title:p=>'Точка обзора', meta:()=>'', text:()=>'',
      explain:()=>'Ключевая видовая точка Большой горной тропы.'},
    trail:{name:'Большая горная тропа', color:C.pink, kicker:()=>'маршрут', title:()=>'Большая горная тропа', meta:()=>'', text:()=>'',
      explain:()=>'Маршрут, соединяющий видовые точки амфитеатра.'},
    routes:{name:'Пешие маршруты', color:C.lavender, kicker:()=>'пеший маршрут', title:p=>p.name, meta:p=>p.length||'', text:p=>p.description||'', explain:()=>''},
    walking:{name:'Тропы и веломаршруты', color:C.lavender, kicker:()=>'тропа', title:p=>p.desc||p.name||'Маршрут', meta:()=>'', text:()=>'', explain:()=>'Маршруты из открытых источников.'},
    leisure:{name:'Горный досуг', color:C.lavender, kicker:p=>p.kind, title:p=>p.name||p.kind, meta:p=>p.address||'', text:p=>p.description||'', explain:()=>''},
    bubbles:{name:'Новое расселение 2005–2025', color:C.concrete, kicker:()=>'расселение 2005–2025', title:()=>'Новая застройка', meta:()=>'', text:()=>'',
      explain:()=>'Кварталы, выросшие на склонах за последние двадцать лет.'},
    maki_selki:{name:'Мяки и сельки', color:C.indigo, kicker:()=>'финское урочище', title:p=>p.name, meta:p=>p.name_ru?`сейчас — ${p.name_ru}`:'',
      text:p=>(p.description||'').replace(/<[^>]+>/g,' ').replace(/https?:\S+/g,'').trim(),
      explain:()=>'«Мяки» по-фински — холм, «сельки» — гряда. Названия сохранили память о рельефе.'},
    resettlement:{name:'Историческое расселение', color:C.indigo, kicker:()=>'историческое поселение', title:p=>p.name, meta:()=>'', text:()=>'',
      explain:()=>'Деревни на карте XVIII–XIX веков. Большинство стоит на возвышенностях.'},
    finns_today:{name:'Финны сегодня', color:C.indigo, kicker:()=>'перепись 2021', title:p=>p.settlement||'Населённый пункт', meta:p=>p.population?`население ${p.population}`:'', text:()=>'',
      explain:()=>'Где сегодня живут люди, назвавшие себя финнами.'},
    landscape:{name:'Древний ландшафт', color:C.ochre, kicker:p=>p._epoch||'древний ландшафт', title:p=>p.name, meta:()=>'', text:()=>'', explain:()=>''},
    sectors:{name:'Ярусы амфитеатра', color:C.graphite, kicker:p=>p.type==='сцена'?'центр амфитеатра':p.type, title:p=>p.type_2||p.type, meta:()=>'', text:()=>'',
      explain:p=>({'сцена':'Сцена — низменность, на которой стоит исторический Петербург.','партер':'Партер — нижний ярус, ближайший к сцене-городу.','бельэтаж':'Бельэтаж — средний ярус: уступы и гребни, откуда город читается как панорама.','балкон':'Балкон — верхний ярус, высоты на горизонте.'})[p.type]||''}
  };
  function dir(a){ const d=['север','северо-восток','восток','юго-восток','юг','юго-запад','запад','северо-запад']; return d[Math.round(((+a%360)+360)%360/45)%8]; }

  return {C, EPOCHS, STORIES, MAP_EPOCH, MAP_LAYERS, ZOOM_SRC, LAND_COL, INFO};
})();
