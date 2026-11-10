/* Облака над спутником: WebGL-шейдер (fbm-шум), рисуется в половинном разрешении.
   window.GPClouds.setClear(0..1) — разогнать облака (0 = обложка, 1 = почти чисто). */
(function(){
  const canvas = document.getElementById('clouds');
  const gl = canvas.getContext('webgl', {premultipliedAlpha:true, alpha:true, antialias:false});
  if(!gl){ canvas.remove(); window.GPClouds = {setClear(){} , setWind(){}}; return; }

  const vs = `attribute vec2 p; varying vec2 uv; void main(){ uv = p*.5+.5; gl_Position = vec4(p,0.,1.); }`;
  const fs = `
  precision highp float;
  varying vec2 uv;
  uniform float t; uniform vec2 res; uniform float clear; uniform vec2 wind;
  float h(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
  float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float v=0., a=.5; mat2 m=mat2(1.6,1.2,-1.2,1.6);
    for(int i=0;i<6;i++){ v+=a*n(p); p=m*p; a*=.5; } return v; }
  float dens(vec2 p, float tt){
    // крупные массивы (где есть облака) × кучевая фактура
    float big = fbm(p*.35 + vec2(tt*.004, 0.));
    vec2 q = vec2(fbm(p + tt*.015), fbm(p + vec2(5.2,1.3) - tt*.012));
    float puff = fbm(p*1.4 + .55*q + tt*.008);
    return puff*.62 + big*.58 - .12;
  }
  void main(){
    float asp = res.x/res.y;
    vec2 p = vec2(uv.x*asp, uv.y)*3.0;
    vec2 drift = wind * t;
    float tt = t;
    // по краям облаков больше, в центре — чуть просвет
    vec2 c = uv - .5; c.x *= asp;
    float edge = smoothstep(.15, .95, length(c));
    float th = mix(.45, .62, clear) - edge*mix(.07, .10, clear);

    float d  = dens(p + drift, tt);
    float a  = smoothstep(th, th+.14, d);
    // объём: подсветка сверху-слева, тень снизу-справа
    float d2 = dens(p + drift + vec2(.035,-.035), tt);
    float light = clamp(.86 + (d - d2)*6.0, .5, 1.08);
    vec3 col = vec3(.93,.95,.94) * light;

    // тень облака на земле (смещена)
    float ds = dens(p + drift + vec2(-.12,.16), tt);
    float sh = smoothstep(th, th+.3, ds) * .32 * (1.-a);

    float alpha = a*.92;
    vec3 outc = col*alpha;            // premultiplied
    float outa = alpha + sh;
    gl_FragColor = vec4(outc, clamp(outa,0.,1.));
  }`;
  function sh(type, src){ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s; }
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(pr); gl.useProgram(pr);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr,'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  const uT=gl.getUniformLocation(pr,'t'), uR=gl.getUniformLocation(pr,'res'), uC=gl.getUniformLocation(pr,'clear'), uW=gl.getUniformLocation(pr,'wind');

  const SCALE = 0.5;
  function resize(){ canvas.width = Math.round(innerWidth*SCALE); canvas.height = Math.round(innerHeight*SCALE);
    gl.viewport(0,0,canvas.width,canvas.height); }
  addEventListener('resize', resize); resize();

  let clear = 0, clearTarget = 0, wind = [.018,.006], t0 = performance.now();
  let idleCleared = false;
  function frame(now){
    // на рабочей карте облака не рисуем — экономим видеокарту
    const b = document.body.classList;
    if(b.contains('state-map') && !b.contains('covered')){
      if(!idleCleared){ gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT); idleCleared = true; }
      requestAnimationFrame(frame); return;
    }
    idleCleared = false;
    clear += (clearTarget - clear)*0.02;
    gl.uniform1f(uT, (now - t0)/1000);
    gl.uniform2f(uR, canvas.width, canvas.height);
    gl.uniform1f(uC, clear);
    gl.uniform2f(uW, wind[0], wind[1]);
    gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.GPClouds = { setClear(v){ clearTarget = v; }, setWind(x,y){ wind=[x,y]; } };
})();
