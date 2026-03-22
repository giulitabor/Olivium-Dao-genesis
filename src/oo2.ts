
// ================================================================
//  GENESIS v1.8  —  Oracle Admin Dashboard
//  oo2.ts logic compiled to plain JS — zero CDN dependencies
//  Sources: 8 mock sensors + Tomorrow.io + Open-Meteo (live)
// ================================================================

// ── SENSOR SIMULATOR ────────────────────────────────────────────
const DRIFT_THRESH = {
  soilMoisture:5, soilTemperature:4, leafWetness:20,
  ambientLight:300, co2Ppm:30, windLocal:5, rainGauge:1, humidity:10
};

let _prev = {}, _cycle = 0, _fault = null;

function readSensors() {
  const now = new Date(), h = now.getHours(), t = Date.now(), day = h > 6 && h < 20;
  _cycle++;

  const soilMoisture    = +((22 + Math.sin(t/280000)*9 + (Math.random()-.5)*.6)).toFixed(1);
  const soilTemperature = +((10 + Math.sin((h-8)/5.5)*7 + (Math.random()-.5)*.4)).toFixed(1);
  const leafWetness     = +(Math.min(100,Math.max(0,30+Math.sin(t/110000)*35+(day?-15:10)+Math.random()*8))).toFixed(1);
  const ambientLight    = day ? +(600+Math.sin((h-6)/9)*700+(Math.random()-.5)*80).toFixed(0) : +(Math.random()*3).toFixed(1);
  const co2Ppm          = +(400+(!day?28:0)+Math.sin(t/200000)*12+(Math.random()-.5)*8).toFixed(1);
  const windLocal       = +(Math.max(0,3.5+Math.sin(t/55000)*2.5+(Math.random()-.5)*1.5)).toFixed(1);
  const rainGauge       = +(Math.random()<.12 ? Math.random()*3.2 : 0).toFixed(2);
  const humidity        = Math.round(Math.min(98,52+(!day?18:0)+Math.sin(t/250000)*15+Math.random()*8));

  if (_cycle % 25 === 0) {
    const pool = ['soilMoisture','leafWetness','co2Ppm','humidity'];
    _fault = pool[Math.floor(Math.random()*pool.length)];
  } else if (_cycle % 25 === 5) { _fault = null; }

  const cur = { soilMoisture, soilTemperature, leafWetness, ambientLight, co2Ppm, windLocal, rainGauge, humidity };
  const driftFlags = [];

  for (const [key, val] of Object.entries(cur)) {
    const prev = _prev[key];
    if (prev === undefined) continue;
    const thr = DRIFT_THRESH[key] || 10;
    const delta = Math.abs(val - prev);
    const isFault = _fault === key && delta > thr * 0.3;
    if (delta > thr*2 || isFault) {
      driftFlags.push({ sensor:key, delta:+delta.toFixed(2), threshold:thr, type:isFault?'fault':'spike',
        message: isFault ? `${key}: fault detected (Δ${delta.toFixed(1)})` : `${key}: spike Δ${delta.toFixed(1)} > 2× thr` });
    } else if (delta > thr) {
      driftFlags.push({ sensor:key, delta:+delta.toFixed(2), threshold:thr, type:'gradual',
        message: `${key}: gradual drift Δ${delta.toFixed(1)}` });
    }
  }

  const faults  = driftFlags.filter(f=>f.type==='fault').length;
  const spikes  = driftFlags.filter(f=>f.type==='spike').length;
  const quality = +Math.max(0, 1 - faults*.3 - spikes*.1).toFixed(2);

  _prev = cur;
  return { soilMoisture, soilTemperature, leafWetness, ambientLight, co2Ppm, windLocal, rainGauge, humidity,
    timestamp:now, driftFlags, quality };
}

// ── MOCK ATMOSPHERIC ────────────────────────────────────────────
function mockAtmo(src) {
  const h = new Date().getHours(), day = h>6&&h<20, b = src==='tomorrow' ? 0 : 0.7;
  return {
    source:src,
    temperature:   +((17+Math.sin(h/4)*6+b*.5+(Math.random()-.5))).toFixed(1),
    humidity:      Math.round(60+b*4+Math.random()*14),
    windSpeed:     +((3.2+b*.3+Math.random()*3.5)).toFixed(1),
    windDir:       Math.round(200+Math.random()*70),
    pressure:      +((1013+b*.3+(Math.random()-.5)*1.5)).toFixed(1),
    cloudCover:    Math.round(28+b*6+Math.random()*32),
    rainProb:      +(.28+Math.random()*.44).toFixed(2),
    rainIntensity: +(Math.random()*.35).toFixed(2),
    evapo:         +(day ? .07+Math.random()*.16 : .01+Math.random()*.03).toFixed(3),
    soilMoistureM: Math.round(19+b*2+Math.random()*13),
    uvIndex:       day ? +((1.5+Math.random()*6)).toFixed(1) : 0,
    solar:         day ? Math.round(220+Math.random()*560) : 0,
    health:'fresh', fetchedAt:new Date(), ageMs:0, latencyMs:Math.round(60+Math.random()*180)
  };
}

// ── API FETCHERS ────────────────────────────────────────────────
async function fetchTomorrow(lat, lon, key) {
  const t0 = Date.now();
  if (!key || key === 'demo') return { ...mockAtmo('tomorrow'), latencyMs: Date.now()-t0 };
  try {
    const fields = 'temperature,humidity,windSpeed,windDirection,pressureSurfaceLevel,cloudCover,precipitationProbability,precipitationIntensity,evapotranspiration,soilMoistureVolumetric0To10cm,uvIndex,solarRadiationSurface';
    const res = await fetch(`https://api.tomorrow.io/v4/timelines?location=${lat},${lon}&fields=${fields}&timesteps=1h&units=metric&apikey=${key}`);
    if (!res.ok) throw new Error('HTTP '+res.status);
    const v = (await res.json()).data.timelines[0].intervals[0].values;
    return {
      source:'tomorrow', temperature:v.temperature, humidity:v.humidity, windSpeed:v.windSpeed,
      windDir:v.windDirection||0, pressure:v.pressureSurfaceLevel||1013, cloudCover:v.cloudCover,
      rainProb:v.precipitationProbability/100, rainIntensity:v.precipitationIntensity,
      evapo:v.evapotranspiration||0, soilMoistureM:Math.round((v.soilMoistureVolumetric0To10cm||.28)*100),
      uvIndex:v.uvIndex||0, solar:v.solarRadiationSurface||0,
      health:'fresh', fetchedAt:new Date(), ageMs:0, latencyMs:Date.now()-t0
    };
  } catch(e) {
    console.warn('[Oracle] Tomorrow.io:', e);
    return { ...mockAtmo('tomorrow'), health:'error', latencyMs:Date.now()-t0 };
  }
}

async function fetchOpenMeteo(lat, lon) {
  const t0 = Date.now();
  try {
    const vars = 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,surface_pressure,cloud_cover,precipitation_probability,rain,et0_fao_evapotranspiration,soil_moisture_0_to_1cm,uv_index,shortwave_radiation';
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=${vars}&forecast_days=1&timezone=auto`);
    if (!res.ok) throw new Error('HTTP '+res.status);
    const hd = (await res.json()).hourly, i = new Date().getHours();
    return {
      source:'openmeteo',
      temperature:hd.temperature_2m?.[i]||0, humidity:hd.relative_humidity_2m?.[i]||0,
      windSpeed:hd.wind_speed_10m?.[i]||0, windDir:hd.wind_direction_10m?.[i]||0,
      pressure:hd.surface_pressure?.[i]||1013, cloudCover:hd.cloud_cover?.[i]||0,
      rainProb:(hd.precipitation_probability?.[i]||0)/100, rainIntensity:hd.rain?.[i]||0,
      evapo:hd.et0_fao_evapotranspiration?.[i]||0,
      soilMoistureM:Math.round((hd.soil_moisture_0_to_1cm?.[i]||.28)*100),
      uvIndex:hd.uv_index?.[i]||0, solar:hd.shortwave_radiation?.[i]||0,
      health:'fresh', fetchedAt:new Date(), ageMs:0, latencyMs:Date.now()-t0
    };
  } catch(e) {
    console.warn('[Oracle] Open-Meteo:', e);
    return { ...mockAtmo('openmeteo'), health:'error', latencyMs:Date.now()-t0 };
  }
}

// ── FUSION ──────────────────────────────────────────────────────
const W = { tomorrow:.55, openmeteo:.45 };

function wMean(sources, field) {
  let t=0, w=0;
  for (const r of sources) {
    if (r.health==='error') continue;
    const v = r[field];
    if (typeof v !== 'number' || isNaN(v)) continue;
    t += v * W[r.source]; w += W[r.source];
  }
  return w > 0 ? +((t/w)).toFixed(2) : 0;
}

function checkFreshness(sources, staleMs) {
  const alerts = [];
  for (const r of sources) {
    r.ageMs = Date.now() - r.fetchedAt.getTime();
    const stale = r.health==='fresh' && r.ageMs > staleMs;
    if (stale) r.health = 'stale';
    if (stale || r.health==='error') {
      alerts.push({ source:r.source, ageMs:r.ageMs, stale,
        message: stale ? `${r.source} stale (${Math.round(r.ageMs/1000)}s)` : `${r.source} failed — mock fallback` });
    }
  }
  return alerts;
}

function calcConfidence(sensor, sources, freshAlerts) {
  let s = sensor.quality;
  for (const r of sources) { if (r.health==='error') s-=.18; if (r.health==='stale') s-=.09; }
  s -= freshAlerts.length * .04;
  for (const d of sensor.driftFlags) {
    if (d.type==='fault') s-=.12;
    if (d.type==='spike') s-=.06;
    if (d.type==='gradual') s-=.02;
  }
  return +Math.max(0,Math.min(1,s)).toFixed(2);
}

function fuseAll(sensor, sources, staleMs) {
  const freshnessAlerts = checkFreshness(sources, staleMs);
  const confidence = calcConfidence(sensor, sources, freshnessAlerts);
  const sourceHealth = {
    sensor:   sensor.quality > .7 ? 'fresh' : 'stale',
    tomorrow: sources.find(r=>r.source==='tomorrow')?.health  || 'pending',
    openmeteo:sources.find(r=>r.source==='openmeteo')?.health || 'pending',
  };
  const humBlend = +((sensor.humidity*.6 + wMean(sources,'humidity')*.4)).toFixed(1);
  return {
    soilMoisture:sensor.soilMoisture, soilTemperature:sensor.soilTemperature,
    leafWetness:sensor.leafWetness, ambientLight:sensor.ambientLight,
    co2Ppm:sensor.co2Ppm, windLocal:sensor.windLocal,
    rainGauge:sensor.rainGauge, humidity:humBlend,
    temperature:wMean(sources,'temperature'), windSpeed:wMean(sources,'windSpeed'),
    pressure:wMean(sources,'pressure'), cloudCover:wMean(sources,'cloudCover'),
    rainProb:wMean(sources,'rainProb'), rainIntensity:wMean(sources,'rainIntensity'),
    evapo:wMean(sources,'evapo'), uvIndex:wMean(sources,'uvIndex'), solar:wMean(sources,'solar'),
    confidence, sourceHealth, driftFlags:sensor.driftFlags,
    freshnessAlerts, sensor, sources, fusedAt:new Date()
  };
}

// ── DECISIONS ───────────────────────────────────────────────────
function evalDecisions(e) {
  const d = [];
  const { soilMoisture:sm, soilTemperature:st, leafWetness:lw, co2Ppm, humidity,
          windLocal, rainGauge, rainProb, evapo, temperature, uvIndex, confidence } = e;

  if (sm<25 && evapo>.12 && rainProb<.4)
    d.push({id:'irrigate',type:'action',severity:'high',title:'Initiate Irrigation',
      detail:`Soil ${sm}% · ET ${evapo} mm/h · Rain ${Math.round(rainProb*100)}%.`,
      icon:'💧',rule:'soil<25 AND evapo>0.12 AND rain<40%',triggers:[`soil:${sm}%`,`evapo:${evapo}`,`rain:${Math.round(rainProb*100)}%`]});
  else if (rainProb>.65 || rainGauge>1.2)
    d.push({id:'pause',type:'hold',severity:'medium',title:'Irrigation Paused',
      detail:`Rain ${Math.round(rainProb*100)}% · Gauge ${rainGauge} mm/h.`,
      icon:'⏸️',rule:'rainProb>65% OR gauge>1.2',triggers:[`rain:${Math.round(rainProb*100)}%`,`gauge:${rainGauge}`]});
  else if (sm>=25 && sm<40)
    d.push({id:'monitor',type:'watch',severity:'low',title:'Monitor Soil Levels',
      detail:`Soil ${sm}% — acceptable. Recheck in 4h.`,icon:'👁️',rule:'25≤soil<40',triggers:[`soil:${sm}%`]});

  if (temperature>35) d.push({id:'heat',type:'alert',severity:'high',title:'Heat Stress Risk',detail:`${temperature}°C · soil ${st}°C.`,icon:'🌡️',rule:'temp>35°C',triggers:[`temp:${temperature}°C`]});
  if (temperature<3)  d.push({id:'frost',type:'alert',severity:'high',title:'Frost Risk',detail:`${temperature}°C — protect crops now.`,icon:'❄️',rule:'temp<3°C',triggers:[`temp:${temperature}°C`]});
  if (evapo>.18)      d.push({id:'evapo',type:'watch',severity:'medium',title:'High Evapotranspiration',detail:`ET ${evapo} mm/h — soil drying fast. Check in 6h.`,icon:'🔥',rule:'evapo>0.18',triggers:[`evapo:${evapo}`]});
  if (lw>65&&humidity>80) d.push({id:'fungal',type:'alert',severity:'medium',title:'Fungal Disease Risk',detail:`Leaf wet ${lw.toFixed(0)} · Humidity ${humidity}%.`,icon:'🍂',rule:'leafWetness>65 AND hum>80',triggers:[`lw:${lw.toFixed(0)}`,`hum:${humidity}%`]});
  if (co2Ppm>425)     d.push({id:'co2',type:'watch',severity:'low',title:'Elevated CO₂',detail:`CO₂ ${co2Ppm} ppm — check ventilation.`,icon:'🌿',rule:'co2>425ppm',triggers:[`co2:${co2Ppm}`]});
  if (uvIndex>7)      d.push({id:'uv',type:'watch',severity:'medium',title:'High UV Index',detail:`UV ${uvIndex} — photoinhibition risk.`,icon:'☀️',rule:'uv>7',triggers:[`uv:${uvIndex}`]});
  if (windLocal>9)    d.push({id:'wind',type:'alert',severity:'medium',title:'Strong Wind',detail:`${windLocal} m/s — check supports.`,icon:'💨',rule:'windLocal>9',triggers:[`wind:${windLocal}m/s`]});
  if (confidence<.65) d.push({id:'conf',type:'alert',severity:'medium',title:'Low Data Confidence',detail:`${Math.round(confidence*100)}% — verify sensors & APIs.`,icon:'⚠️',rule:'conf<65%',triggers:[`conf:${Math.round(confidence*100)}%`]});

  if (!d.length) d.push({id:'nominal',type:'nominal',severity:'none',title:'All Systems Nominal',
    detail:`Confidence ${Math.round(confidence*100)}% — no interventions required.`,icon:'✅',rule:'default',triggers:[]});
  return d;
}

// ── FORECAST ────────────────────────────────────────────────────
function genForecast() {
  return Array.from({length:24},(_,i)=>({
    hour:i,
    temp:+((14+Math.sin((i-6)/4)*8+(Math.random()-.5)*1.5)).toFixed(1),
    rain:+(Math.random()*.95).toFixed(2),
    evapo:+(i>6&&i<20 ? .04+Math.random()*.2 : .01+Math.random()*.03).toFixed(3),
  }));
}

// ── STATE ────────────────────────────────────────────────────────
const S = {
  env:null, decisions:[], forecast:genForecast(),
  tab:'oracle', cfgOpen:false, loading:true,
  tomorrowKey:'demo', lat:'40.7128', lon:'-74.0060', tick:0
};
let _apiData = [], _sTimer = null, _aTimer = null;

// ── DATA PIPELINE ────────────────────────────────────────────────
async function fetchAPIs() {
  const lat = parseFloat(S.lat), lon = parseFloat(S.lon);
  const [tm, om] = await Promise.all([fetchTomorrow(lat,lon,S.tomorrowKey), fetchOpenMeteo(lat,lon)]);
  _apiData = [tm, om];
}

function pollSensors() {
  if (!_apiData.length) return;
  const sensor = readSensors();
  S.env = fuseAll(sensor, _apiData, 90000);
  S.decisions = evalDecisions(S.env);
  S.tick++;
  render();
}

async function doRefresh() {
  S.loading = true;
  render();
  await fetchAPIs();
  pollSensors();
  S.loading = false;
  S.forecast = genForecast();
  render();
  const app = document.getElementById('app');
  if (app) { app.classList.add('flash-it'); setTimeout(()=>app.classList.remove('flash-it'),1200); }
}

// ── HTML BUILDERS ────────────────────────────────────────────────
function gauge(lbl, v, unit, mn, mx, col) {
  const r=28, c=2*Math.PI*r, p=Math.min(100,Math.max(0,((v-mn)/(mx-mn))*100)), da=(p/100)*c;
  return `<div class="gw">
    <svg width="70" height="70" viewBox="0 0 70 70">
      <circle cx="35" cy="35" r="${r}" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="5"/>
      <circle cx="35" cy="35" r="${r}" fill="none" stroke="${col}" stroke-width="5"
        stroke-dasharray="${da.toFixed(1)} ${c.toFixed(1)}" stroke-linecap="round"
        transform="rotate(-90 35 35)" style="transition:stroke-dasharray 1s ease"/>
      <text x="35" y="39" text-anchor="middle" fill="white" font-size="10.5"
        font-family="'Space Mono',monospace" font-weight="bold">${v}${unit}</text>
    </svg>
    <span class="gl">${lbl}</span></div>`;
}

function mbar(lbl, val, fill, col) {
  return `<div class="mrow">
    <div class="mhdr"><span style="color:var(--muted)">${lbl}</span><span style="color:${col};font-weight:700">${val}</span></div>
    <div class="mtrack"><div class="mfill" style="width:${Math.min(100,fill*100).toFixed(1)}%;background:${col}"></div></div>
  </div>`;
}

function fcBars(fc) {
  return `<div class="fc-bars">${fc.map(f=>{
    const h = Math.max(4, Math.round(f.rain*52));
    const l = f.hour%4===0 ? `<div class="fc-lbl">${String(f.hour).padStart(2,'0')}h</div>` : '';
    return `<div class="fc-col"><div class="fc-bar" style="height:${h}px;background:rgba(56,189,248,${(.15+f.rain*.75).toFixed(2)})"></div>${l}</div>`;
  }).join('')}</div>`;
}

function tempSvg(fc) {
  const vals = fc.map(f=>f.temp), mn=Math.min(...vals), mx=Math.max(...vals);
  const W=320, H=50, P=8;
  const pts = fc.map((f,i)=>{
    const x = P+(i/(fc.length-1))*(W-P*2);
    const y = H-P-((f.temp-mn)/(mx-mn||1))*(H-P*2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg width="100%" viewBox="0 0 ${W} ${H}" style="overflow:visible">
    <polyline points="${pts}" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linejoin="round"/>
  </svg>`;
}

const DS = {
  action: {bg:'rgba(239,68,68,.12)',  bc:'#ef4444'},
  alert:  {bg:'rgba(239,68,68,.12)',  bc:'#ef4444'},
  hold:   {bg:'rgba(245,158,11,.12)', bc:'#f59e0b'},
  watch:  {bg:'rgba(56,189,248,.12)', bc:'#38bdf8'},
  nominal:{bg:'rgba(34,197,94,.12)',  bc:'#22c55e'},
};

function decCard(d, i) {
  const s = DS[d.type] || DS.nominal;
  const trigs = d.triggers.map(t=>`<span class="trig">${t}</span>`).join('');
  return `<div class="dec fade-up" style="background:${s.bg};border-color:${s.bc};animation-delay:${i*.07}s">
    <div class="dec-hdr">
      <div class="dec-title"><span>${d.icon}</span><span>${d.title}</span></div>
      <span class="dec-badge" style="color:${s.bc};border-color:${s.bc}44">${d.type}</span>
    </div>
    <div class="dec-detail">${d.detail}</div>
    <div class="dec-rule">rule: ${d.rule}</div>
    ${trigs ? `<div class="dec-trigs">${trigs}</div>` : ''}
  </div>`;
}

function stile(lbl, val, sub, col, driftFlags, key) {
  const match = driftFlags.filter(f=>f.sensor===key);
  const cls = match.some(f=>f.type==='fault') ? 'stile fault' : match.some(f=>f.type==='spike') ? 'stile drift' : 'stile';
  const bc = match.length ? (match[0].type==='fault' ? '#ef4444' : '#f59e0b') : '';
  const badge = match.length ? `<span class="stile-badge" style="color:${bc};background:${bc}22">${match[0].type}</span>` : '';
  return `<div class="${cls}">
    ${badge}
    <div class="stile-lbl">${lbl}</div>
    <div class="stile-val" style="color:${col}">${val}</div>
    <div class="stile-sub">${sub}</div>
  </div>`;
}

// ── RENDER ───────────────────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  if (!app) return;

  if (S.loading) {
    app.innerHTML = `<div class="loading"><div class="spinner">⟳</div><div class="loading-txt">Fetching all sources…</div></div>`;
    return;
  }

  const e = S.env;
  const cc = e.confidence>.8?'var(--green)':e.confidence>.6?'var(--amber)':'var(--red)';
  const cp = Math.round(e.confidence*100);
  const liveSrc = e.sources.filter(r=>r.health==='fresh').length;
  const srcNames = {tomorrow:'Tomorrow.io', openmeteo:'Open-Meteo'};

  const srcCards = e.sources.map(r=>{
    const col = r.health==='fresh'?'var(--green)':r.health==='error'?'var(--red)':'var(--amber)';
    return `<div class="src-card">
      <div class="src-name">${srcNames[r.source]}</div>
      <div class="src-status" style="color:${col}">${r.health.toUpperCase()}</div>
      <div class="src-meta">${r.latencyMs}ms · ${r.temperature.toFixed(1)}°C · ${Math.round(r.rainProb*100)}% rain</div>
    </div>`;
  }).join('');

  const hdr = `<div class="header">
    <div>
      <div class="logo-tag">Genesis v1.8</div>
      <div class="logo-title">Oracle<br><b>Admin</b></div>
    </div>
    <div class="hdr-right">
      <button class="btn" id="btnCfg">⚙ Config</button>
      <span class="pill ${liveSrc===2?'pill-g':'pill-a'}">
        <span class="dot ${liveSrc===2?'dot-g':'dot-a'}"></span>
        ${liveSrc}/2 LIVE
      </span>
      <div style="font-size:8px;color:var(--dim)">Tick #${S.tick} · ${e.fusedAt.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</div>
    </div>
  </div>`;

  const cfg = S.cfgOpen ? `<div class="cfg-panel">
    <div class="ct">Configuration</div>
    <div class="cfg-lbl">Tomorrow.io API Key</div>
    <input type="text" class="cfg-in" id="cfg_tk" value="${S.tomorrowKey}" placeholder='key or "demo"'/>
    <div class="cfg-lbl">Latitude</div>
    <input type="text" class="cfg-in" id="cfg_lat" value="${S.lat}" placeholder="40.7128"/>
    <div class="cfg-lbl">Longitude</div>
    <input type="text" class="cfg-in" id="cfg_lon" value="${S.lon}" placeholder="-74.0060"/>
    <button class="apply" id="btnApply">APPLY &amp; REFRESH</button>
  </div>` : '';

  const confBar = `<div class="conf-strip">
    <span class="conf-lbl">Confidence</span>
    <div class="conf-track"><div class="conf-fill" style="width:${cp}%;background:${cc}"></div></div>
    <span class="conf-val" style="color:${cc}">${cp}%</span>
  </div>`;

  const tabs = `<div class="tabs">
    ${['oracle','weather','sensors','fusion'].map(id=>
      `<button class="tab ${S.tab===id?'on':''}" data-tab="${id}">${
        id==='oracle'?'🧠 Oracle':id==='weather'?'🌦 Weather':id==='sensors'?'📡 Sensors':'🔀 Fusion'
      }</button>`
    ).join('')}
  </div>`;

  let tab = '';

  // ── ORACLE TAB ──────────────────────────────────────────────
  if (S.tab === 'oracle') {
    const apiSoil = wMean(e.sources, 'soilMoistureM');
    const drift = Math.abs(e.soilMoisture - apiSoil);

    const soilCard = `<div class="card">
      <div class="ct">Soil Validation Layer</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:11px">
        <div style="background:rgba(34,197,94,.07);border:1px solid rgba(34,197,94,.2);border-radius:10px;padding:12px">
          <div style="font-size:7px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">Sensor · Truth</div>
          <div style="font-family:var(--disp);font-size:26px;font-weight:800;color:var(--green)">${e.soilMoisture}%</div>
          <div style="font-size:8px;color:var(--dim);margin-top:3px">Real-time field sensor</div>
        </div>
        <div style="background:rgba(56,189,248,.07);border:1px solid rgba(56,189,248,.2);border-radius:10px;padding:12px">
          <div style="font-size:7px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;margin-bottom:4px">API · Fused Model</div>
          <div style="font-family:var(--disp);font-size:26px;font-weight:800;color:var(--blue)">${apiSoil}%</div>
          <div style="font-size:8px;color:var(--dim);margin-top:3px">Tomorrow + Open-Meteo</div>
        </div>
      </div>
      <div style="padding:8px 11px;background:rgba(255,255,255,.04);border-radius:7px;font-size:9px;color:var(--muted)">
        Δ Drift: <strong>${drift.toFixed(1)}%</strong> — ${drift<5?'✅ Within tolerance':'⚠️ Divergence detected'}
      </div>
    </div>`;

    const decs = S.decisions.map((d,i)=>decCard(d,i)).join('');

    const traces = [
      {l:'soil_moisture < 25%',         v:e.soilMoisture<25,         c:e.soilMoisture+'%'},
      {l:'evapo > 0.12 mm/h',           v:e.evapo>.12,               c:e.evapo},
      {l:'rain_prob > 65%',             v:e.rainProb>.65,            c:Math.round(e.rainProb*100)+'%'},
      {l:'temperature > 35°C',          v:e.temperature>35,          c:e.temperature+'°C'},
      {l:'temperature < 3°C (frost)',   v:e.temperature<3,           c:e.temperature+'°C'},
      {l:'leafWetness>65 AND hum>80',   v:e.leafWetness>65&&e.humidity>80, c:`lw:${e.leafWetness.toFixed(0)} h:${e.humidity}%`},
      {l:'co2Ppm > 425',               v:e.co2Ppm>425,              c:e.co2Ppm.toFixed(0)},
      {l:'uvIndex > 7',                v:e.uvIndex>7,               c:e.uvIndex},
      {l:'windLocal > 9 m/s',          v:e.windLocal>9,             c:e.windLocal+' m/s'},
      {l:'confidence < 65%',           v:e.confidence<.65,          c:Math.round(e.confidence*100)+'%'},
    ].map(r=>`<div class="trace-row">
      <span style="color:var(--muted)">${r.l}</span>
      <div style="display:flex;gap:9px;align-items:center">
        <span style="color:var(--dim);font-size:8px">${r.c}</span>
        <span class="tbool ${r.v?'t':'f'}">${r.v?'TRUE':'FALSE'}</span>
      </div>
    </div>`).join('');

    tab = `<div class="fade-up">${soilCard}
      <div style="font-size:8px;letter-spacing:3px;color:var(--muted);margin-bottom:10px">ORACLE DECISIONS (${S.decisions.length})</div>
      ${decs}
      <div class="card" style="margin-top:2px"><div class="ct">Rule Engine Trace</div>${traces}</div>
    </div>`;
  }

  // ── WEATHER TAB ─────────────────────────────────────────────
  if (S.tab === 'weather') {
    const cmpGrid = `<div class="cmp-grid">${e.sources.map(r=>`
      <div class="cmp-cell">
        <div class="cmp-name">${r.source}</div>
        <div class="cmp-val" style="color:${r.health==='error'?'var(--red)':'#f59e0b'}">${r.temperature.toFixed(1)}°C</div>
      </div>`).join('')}</div>`;

    tab = `<div class="fade-up">
      <div class="card"><div class="ct">Atmospheric (Fused — ${e.sources.filter(r=>r.health==='fresh').length} sources)</div>
        <div class="gauges">
          ${gauge('Temp',e.temperature,'°',-10,45,'#f59e0b')}
          ${gauge('Humid',e.humidity,'%',0,100,'#38bdf8')}
          ${gauge('Wind',e.windSpeed,'m/s',0,25,'#a78bfa')}
          ${gauge('Cloud',e.cloudCover,'%',0,100,'#94a3b8')}
        </div>
      </div>
      <div class="card"><div class="ct">Precipitation Layer</div>
        ${mbar('Rain probability',Math.round(e.rainProb*100)+'%',e.rainProb,'#38bdf8')}
        ${mbar('Rain intensity (mm/h)',e.rainIntensity,e.rainIntensity/5,'#60a5fa')}
        ${mbar('Evapotranspiration (mm/h)',e.evapo,e.evapo/.5,'#f97316')}
      </div>
      <div class="card"><div class="ct">Solar &amp; Energy</div>
        ${mbar('Solar radiation (W/m²)',e.solar,e.solar/1000,'#fbbf24')}
        ${mbar('UV Index',e.uvIndex,e.uvIndex/11,'#c084fc')}
      </div>
      <div class="card"><div class="ct">Source Comparison &amp; Forecast</div>
        ${cmpGrid}
        <div style="margin-top:13px;font-size:9px;color:var(--muted);margin-bottom:5px">24h Temperature Curve</div>
        ${tempSvg(S.forecast)}
        <div style="margin-top:12px;font-size:9px;color:var(--muted);margin-bottom:4px">Precipitation Probability</div>
        ${fcBars(S.forecast)}
      </div>
    </div>`;
  }

  // ── SENSORS TAB ─────────────────────────────────────────────
  if (S.tab === 'sensors') {
    const df = e.driftFlags;
    const tiles = [
      {k:'soilMoisture',    l:'Soil Moisture',  v:e.soilMoisture+'%',             sub:'Volumetric',       c:'var(--green)'},
      {k:'soilTemperature', l:'Soil Temp',       v:e.soilTemperature+'°C',         sub:'10cm depth',       c:'#f59e0b'},
      {k:'leafWetness',     l:'Leaf Wetness',    v:e.leafWetness.toFixed(0)+'%',   sub:'0–100 index',      c:'#2dd4bf'},
      {k:'ambientLight',    l:'Ambient Light',   v:e.ambientLight.toFixed(0)+' lx',sub:'Current lux',      c:'#fbbf24'},
      {k:'co2Ppm',          l:'CO₂',             v:e.co2Ppm.toFixed(0)+' ppm',     sub:'Canopy level',     c:'#4ade80'},
      {k:'windLocal',       l:'Local Wind',      v:e.windLocal+' m/s',             sub:'Anemometer',       c:'#a78bfa'},
      {k:'rainGauge',       l:'Rain Gauge',      v:e.rainGauge+' mm/h',            sub:'Last hour',        c:'#38bdf8'},
      {k:'humidity',        l:'Humidity',        v:e.humidity+'%',                 sub:'Sensor+API blend',  c:'#fb7185'},
    ].map(t=>stile(t.l,t.v,t.sub,t.c,df,t.k)).join('');

    const driftRows = df.length
      ? df.map(f=>{
          const tc = f.type==='fault'?'var(--red)':f.type==='spike'?'var(--amber)':'var(--blue)';
          return `<div class="drift-item">
            <div style="font-size:9px;color:var(--text)">${f.message}</div>
            <div style="display:flex;gap:7px;align-items:center">
              <span style="color:var(--dim);font-size:8px">Δ${f.delta}/thr${f.threshold}</span>
              <span style="color:${tc};background:${tc}22;padding:2px 6px;border-radius:4px;font-size:7px;font-weight:700">${f.type.toUpperCase()}</span>
            </div>
          </div>`;
        }).join('')
      : `<div style="font-size:10px;color:var(--muted);text-align:center;padding:14px">✅ No drift detected</div>`;

    tab = `<div class="fade-up">
      <div class="card"><div class="ct">Field Sensor Readings — Tick #${S.tick}</div>
        <div class="sgrid">${tiles}</div>
      </div>
      <div class="card"><div class="ct">Drift Flags (${df.length})</div>${driftRows}</div>
      <div class="card"><div class="ct">Sensor Quality Score</div>
        ${mbar('Overall quality',Math.round(e.sensor.quality*100)+'%',e.sensor.quality,
          e.sensor.quality>.8?'var(--green)':e.sensor.quality>.6?'var(--amber)':'var(--red)')}
      </div>
      <div class="card"><div class="ct">Sensor vs API Soil Moisture</div>
        ${mbar('📡 Sensor (truth)',e.soilMoisture+'%',e.soilMoisture/100,'var(--green)')}
        ${e.sources.map(r=>mbar(`🌐 ${r.source} (model)`,r.soilMoistureM+'%',r.soilMoistureM/100,'#38bdf8')).join('')}
      </div>
    </div>`;
  }

  // ── FUSION TAB ──────────────────────────────────────────────
  if (S.tab === 'fusion') {
    const freshRows = e.freshnessAlerts.length
      ? e.freshnessAlerts.map(a=>{
          const c = a.stale?'var(--amber)':'var(--red)';
          return `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;border:1px solid ${c}33;background:${c}09;color:${c};font-size:9px;margin-bottom:7px">
            <span>${a.stale?'⏱':'🔌'}</span><span>${a.message}</span>
            <span style="margin-left:auto;font-size:8px">${Math.round(a.ageMs/1000)}s</span>
          </div>`;
        }).join('')
      : `<div style="font-size:10px;color:var(--muted);text-align:center;padding:14px">✅ All sources fresh</div>`;

    const wRows = Object.entries(W).map(([src,w])=>
      mbar(src, Math.round(w*100)+'%', w, 'var(--green)')
    ).join('');

    const payload = JSON.stringify({
      fusedAt: e.fusedAt.toISOString(), confidence: e.confidence,
      temperature: e.temperature, humidity: e.humidity,
      rainProb: e.rainProb, evapo: e.evapo, soilMoisture: e.soilMoisture,
      driftFlags: e.driftFlags.length, freshnessAlerts: e.freshnessAlerts.length,
      sourceHealth: e.sourceHealth, sensorQuality: e.sensor.quality,
    }, null, 2);

    tab = `<div class="fade-up">
      <div class="card"><div class="ct">API Source Weights (Tomorrow 55% · Open-Meteo 45%)</div>${wRows}</div>
      <div class="card"><div class="ct">Freshness Alerts (${e.freshnessAlerts.length})</div>${freshRows}</div>
      <div class="card"><div class="ct">Fused State Payload</div>
        <div class="code" style="background:rgba(34,197,94,.04);border:1px solid rgba(34,197,94,.14);color:#22c55e">${payload}</div>
      </div>
    </div>`;
  }

  app.innerHTML = hdr + cfg + `<div class="src-row">${srcCards}</div>` + confBar + tabs + tab
    + `<div class="footer">Genesis v1.8 · Oracle Engine · 8 Sensors · 2 APIs · Tick #${S.tick}</div>`;

  // Bind events after innerHTML
  document.getElementById('btnCfg')?.addEventListener('click', ()=>{ S.cfgOpen=!S.cfgOpen; render(); });
  document.getElementById('btnApply')?.addEventListener('click', async ()=>{
    S.tomorrowKey = document.getElementById('cfg_tk')?.value || 'demo';
    S.lat         = document.getElementById('cfg_lat')?.value || '40.7128';
    S.lon         = document.getElementById('cfg_lon')?.value || '-74.0060';
    S.cfgOpen = false;
    await doRefresh();
  });
  document.querySelectorAll('.tab').forEach(b=>{
    b.addEventListener('click', ()=>{ S.tab = b.dataset.tab; render(); });
  });
}

// ── BOOT ─────────────────────────────────────────────────────────
(async function boot() {
  await doRefresh();
  _sTimer = setInterval(pollSensors, 5000);   // sensors every 5s
  _aTimer = setInterval(()=>fetchAPIs().then(pollSensors), 60000); // APIs every 60s
})();
