// ================================================================
//  oracle.ts  —  Genesis v1.8  ·  Field Data Fusion Engine
//
//  HOW TO COMPILE:
//    tsc oracle.ts --target ES2017 --lib ES2017,DOM --outFile oracle.js
//
//  This file contains zero HTML. It exports one object: `window.Oracle`
//  which index.html uses after loading oracle.js via <script>.
//
//  Data sources:
//    [1] SensorSimulator   — 8 mock field sensors, polled every 5 s
//    [2] Tomorrow.io       — API key required (falls back to mock)
//    [3] Open-Meteo        — Free, no key, always attempted live
//
//  Fusion logic:
//    · Weighted average    — sensors primary for ground fields
//    · Drift detection     — per-sensor Δ thresholds + fault injection
//    · Freshness flags     — stale alert after configurable ms
//    · Confidence score    — 0–1 composite from all source health
// ================================================================
// ────────────────────────────────────────────────────────────────
//  DEFAULTS
// ────────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
    lat: 40.7128,
    lon: -74.0060,
    tomorrowKey: "demo",
    sensorPollMs: 5000,
    apiFetchMs: 60000,
    staleThreshMs: 90000,
    driftThresholds: {
        soilMoisture: 5,
        soilTemperature: 4,
        leafWetness: 20,
        ambientLight: 300,
        co2Ppm: 30,
        windLocal: 5,
        rainGauge: 1,
        humidity: 10,
    },
};
// API fusion weights (must sum to 1.0)
const API_WEIGHTS = {
    sensor: 0, // sensors bypass weighted mean
    tomorrow: 0.55,
    openmeteo: 0.45,
};
// ────────────────────────────────────────────────────────────────
//  SENSOR SIMULATOR  (8 channels)
// ────────────────────────────────────────────────────────────────
class SensorSimulator {
    constructor() {
        this.prev = {};
        this.cycle = 0;
        this.faultSensor = null;
    }
    read(thresholds) {
        var _a;
        const now = new Date();
        const h = now.getHours();
        const t = Date.now();
        const day = h > 6 && h < 20;
        this.cycle++;
        // Each sensor follows a physically plausible curve
        const soilMoisture = this.round(22 + Math.sin(t / 280000) * 9 + this.noise(0.6), 1);
        const soilTemperature = this.round(10 + Math.sin((h - 8) / 5.5) * 7 + this.noise(0.4), 1);
        const leafWetness = this.clamp(this.round(30 + Math.sin(t / 110000) * 35 + (day ? -15 : 10) + this.noise(8), 1), 0, 100);
        const ambientLight = day ? this.round(600 + Math.sin((h - 6) / 9) * 700 + this.noise(80), 0) : this.round(this.noise(3), 1);
        const co2Ppm = this.round(400 + (day ? 0 : 28) + Math.sin(t / 200000) * 12 + this.noise(8), 1);
        const windLocal = this.clamp(this.round(3.5 + Math.sin(t / 55000) * 2.5 + this.noise(1.5), 1), 0, 99);
        const rainGauge = Math.random() < 0.12 ? this.round(Math.random() * 3.2, 2) : 0;
        const humidity = Math.round(this.clamp(52 + (day ? 0 : 18) + Math.sin(t / 250000) * 15 + this.noise(8), 0, 98));
        // Rotate fault injection across random sensor every 25 cycles
        if (this.cycle % 25 === 0) {
            const pool = ["soilMoisture", "leafWetness", "co2Ppm", "humidity"];
            this.faultSensor = pool[Math.floor(Math.random() * pool.length)];
        }
        else if (this.cycle % 25 === 5) {
            this.faultSensor = null;
        }
        const current = {
            soilMoisture, soilTemperature, leafWetness,
            ambientLight, co2Ppm, windLocal, rainGauge, humidity,
        };
        const driftFlags = [];
        for (const [key, val] of Object.entries(current)) {
            const prev = this.prev[key];
            if (prev === undefined)
                continue;
            const thr = (_a = thresholds[key]) !== null && _a !== void 0 ? _a : 10;
            const delta = Math.abs(val - prev);
            const isFault = this.faultSensor === key && delta > thr * 0.3;
            if (isFault || delta > thr * 2) {
                driftFlags.push({
                    sensor: key, delta: this.round(delta, 2), threshold: thr,
                    type: isFault ? "fault" : "spike",
                    message: isFault
                        ? `${key}: sensor fault detected (Δ${delta.toFixed(1)})`
                        : `${key}: spike Δ${delta.toFixed(1)} exceeds 2× threshold`,
                });
            }
            else if (delta > thr) {
                driftFlags.push({
                    sensor: key, delta: this.round(delta, 2), threshold: thr,
                    type: "gradual",
                    message: `${key}: gradual drift Δ${delta.toFixed(1)}`,
                });
            }
        }
        const faults = driftFlags.filter(f => f.type === "fault").length;
        const spikes = driftFlags.filter(f => f.type === "spike").length;
        const quality = this.round(Math.max(0, 1 - faults * 0.3 - spikes * 0.1), 2);
        this.prev = Object.assign({}, current);
        return {
            soilMoisture, soilTemperature, leafWetness,
            ambientLight, co2Ppm, windLocal, rainGauge, humidity,
            timestamp: now, driftFlags, quality,
        };
    }
    noise(scale) {
        return (Math.random() - 0.5) * scale;
    }
    round(v, dp) {
        return parseFloat(v.toFixed(dp));
    }
    clamp(v, mn, mx) {
        return Math.min(mx, Math.max(mn, v));
    }
}
// ────────────────────────────────────────────────────────────────
//  MOCK ATMOSPHERIC DATA  (realistic per-source variance)
// ────────────────────────────────────────────────────────────────
function buildMockAtmo(src) {
    const h = new Date().getHours();
    const day = h > 6 && h < 20;
    const b = src === "tomorrow" ? 0 : 0.7; // inter-model bias
    return {
        source: src,
        temperature: parseFloat((17 + Math.sin(h / 4) * 6 + b * 0.5 + (Math.random() - 0.5)).toFixed(1)),
        humidity: Math.round(60 + b * 4 + Math.random() * 14),
        windSpeed: parseFloat((3.2 + b * 0.3 + Math.random() * 3.5).toFixed(1)),
        windDir: Math.round(200 + Math.random() * 70),
        pressure: parseFloat((1013 + b * 0.3 + (Math.random() - 0.5) * 1.5).toFixed(1)),
        cloudCover: Math.round(28 + b * 6 + Math.random() * 32),
        rainProb: parseFloat((0.28 + Math.random() * 0.44).toFixed(2)),
        rainIntensity: parseFloat((Math.random() * 0.35).toFixed(2)),
        evapo: parseFloat((day ? 0.07 + Math.random() * 0.16 : 0.01 + Math.random() * 0.03).toFixed(3)),
        soilMoistureM: Math.round(19 + b * 2 + Math.random() * 13),
        uvIndex: day ? parseFloat((1.5 + Math.random() * 6).toFixed(1)) : 0,
        solar: day ? Math.round(220 + Math.random() * 560) : 0,
        health: "fresh",
        fetchedAt: new Date(),
        ageMs: 0,
        latencyMs: Math.round(60 + Math.random() * 180),
    };
}
// ────────────────────────────────────────────────────────────────
//  API FETCHERS
// ────────────────────────────────────────────────────────────────
async function fetchTomorrow(lat, lon, apiKey) {
    var _a, _b, _c, _d, _e, _f;
    const t0 = Date.now();
    // No key or demo mode → return mock immediately
    if (!apiKey || apiKey === "demo") {
        return Object.assign(Object.assign({}, buildMockAtmo("tomorrow")), { latencyMs: Date.now() - t0 });
    }
    try {
        const fields = [
            "temperature", "humidity", "windSpeed", "windDirection",
            "pressureSurfaceLevel", "cloudCover",
            "precipitationProbability", "precipitationIntensity",
            "evapotranspiration", "soilMoistureVolumetric0To10cm",
            "uvIndex", "solarRadiationSurface",
        ].join(",");
        const url = `https://api.tomorrow.io/v4/timelines`
            + `?location=${lat},${lon}&fields=${fields}`
            + `&timesteps=1h&units=metric&apikey=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const v = (await res.json()).data.timelines[0].intervals[0].values;
        return {
            source: "tomorrow",
            temperature: v.temperature,
            humidity: v.humidity,
            windSpeed: v.windSpeed,
            windDir: (_a = v.windDirection) !== null && _a !== void 0 ? _a : 0,
            pressure: (_b = v.pressureSurfaceLevel) !== null && _b !== void 0 ? _b : 1013,
            cloudCover: v.cloudCover,
            rainProb: v.precipitationProbability / 100,
            rainIntensity: v.precipitationIntensity,
            evapo: (_c = v.evapotranspiration) !== null && _c !== void 0 ? _c : 0,
            soilMoistureM: Math.round(((_d = v.soilMoistureVolumetric0To10cm) !== null && _d !== void 0 ? _d : 0.28) * 100),
            uvIndex: (_e = v.uvIndex) !== null && _e !== void 0 ? _e : 0,
            solar: (_f = v.solarRadiationSurface) !== null && _f !== void 0 ? _f : 0,
            health: "fresh",
            fetchedAt: new Date(),
            ageMs: 0,
            latencyMs: Date.now() - t0,
        };
    }
    catch (err) {
        console.warn("[Oracle] Tomorrow.io fetch failed:", err);
        return Object.assign(Object.assign({}, buildMockAtmo("tomorrow")), { health: "error", latencyMs: Date.now() - t0 });
    }
}
async function fetchOpenMeteo(lat, lon) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z;
    const t0 = Date.now();
    try {
        const hourly = [
            "temperature_2m", "relative_humidity_2m",
            "wind_speed_10m", "wind_direction_10m", "surface_pressure",
            "cloud_cover", "precipitation_probability", "rain",
            "et0_fao_evapotranspiration", "soil_moisture_0_to_1cm",
            "uv_index", "shortwave_radiation",
        ].join(",");
        const url = `https://api.open-meteo.com/v1/forecast`
            + `?latitude=${lat}&longitude=${lon}`
            + `&hourly=${hourly}&forecast_days=1&timezone=auto`;
        const res = await fetch(url);
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const hd = (await res.json()).hourly;
        const idx = new Date().getHours();
        return {
            source: "openmeteo",
            temperature: (_b = (_a = hd.temperature_2m) === null || _a === void 0 ? void 0 : _a[idx]) !== null && _b !== void 0 ? _b : 0,
            humidity: (_d = (_c = hd.relative_humidity_2m) === null || _c === void 0 ? void 0 : _c[idx]) !== null && _d !== void 0 ? _d : 0,
            windSpeed: (_f = (_e = hd.wind_speed_10m) === null || _e === void 0 ? void 0 : _e[idx]) !== null && _f !== void 0 ? _f : 0,
            windDir: (_h = (_g = hd.wind_direction_10m) === null || _g === void 0 ? void 0 : _g[idx]) !== null && _h !== void 0 ? _h : 0,
            pressure: (_k = (_j = hd.surface_pressure) === null || _j === void 0 ? void 0 : _j[idx]) !== null && _k !== void 0 ? _k : 1013,
            cloudCover: (_m = (_l = hd.cloud_cover) === null || _l === void 0 ? void 0 : _l[idx]) !== null && _m !== void 0 ? _m : 0,
            rainProb: ((_p = (_o = hd.precipitation_probability) === null || _o === void 0 ? void 0 : _o[idx]) !== null && _p !== void 0 ? _p : 0) / 100,
            rainIntensity: (_r = (_q = hd.rain) === null || _q === void 0 ? void 0 : _q[idx]) !== null && _r !== void 0 ? _r : 0,
            evapo: (_t = (_s = hd.et0_fao_evapotranspiration) === null || _s === void 0 ? void 0 : _s[idx]) !== null && _t !== void 0 ? _t : 0,
            soilMoistureM: Math.round(((_v = (_u = hd.soil_moisture_0_to_1cm) === null || _u === void 0 ? void 0 : _u[idx]) !== null && _v !== void 0 ? _v : 0.28) * 100),
            uvIndex: (_x = (_w = hd.uv_index) === null || _w === void 0 ? void 0 : _w[idx]) !== null && _x !== void 0 ? _x : 0,
            solar: (_z = (_y = hd.shortwave_radiation) === null || _y === void 0 ? void 0 : _y[idx]) !== null && _z !== void 0 ? _z : 0,
            health: "fresh",
            fetchedAt: new Date(),
            ageMs: 0,
            latencyMs: Date.now() - t0,
        };
    }
    catch (err) {
        console.warn("[Oracle] Open-Meteo fetch failed:", err);
        return Object.assign(Object.assign({}, buildMockAtmo("openmeteo")), { health: "error", latencyMs: Date.now() - t0 });
    }
}
// ────────────────────────────────────────────────────────────────
//  FUSION HELPERS
// ────────────────────────────────────────────────────────────────
function weightedMean(sources, field) {
    let total = 0, wsum = 0;
    for (const r of sources) {
        if (r.health === "error")
            continue;
        const v = r[field];
        if (typeof v !== "number" || isNaN(v))
            continue;
        total += v * API_WEIGHTS[r.source];
        wsum += API_WEIGHTS[r.source];
    }
    return wsum > 0 ? parseFloat((total / wsum).toFixed(2)) : 0;
}
function checkFreshness(sources, staleMs) {
    const alerts = [];
    for (const r of sources) {
        r.ageMs = Date.now() - r.fetchedAt.getTime();
        const nowStale = r.health === "fresh" && r.ageMs > staleMs;
        if (nowStale)
            r.health = "stale";
        if (nowStale || r.health === "error") {
            alerts.push({
                source: r.source,
                ageMs: r.ageMs,
                stale: nowStale,
                message: nowStale
                    ? `${r.source} data is stale (${Math.round(r.ageMs / 1000)}s old)`
                    : `${r.source} fetch failed — mock fallback active`,
            });
        }
    }
    return alerts;
}
function computeConfidence(sensor, sources, freshAlerts) {
    let score = sensor.quality; // start from sensor quality (0–1)
    for (const r of sources) {
        if (r.health === "error")
            score -= 0.18;
        if (r.health === "stale")
            score -= 0.09;
    }
    score -= freshAlerts.length * 0.04;
    for (const d of sensor.driftFlags) {
        if (d.type === "fault")
            score -= 0.12;
        if (d.type === "spike")
            score -= 0.06;
        if (d.type === "gradual")
            score -= 0.02;
    }
    return parseFloat(Math.max(0, Math.min(1, score)).toFixed(2));
}
function fuseData(sensor, sources, staleMs) {
    var _a, _b, _c, _d;
    const freshnessAlerts = checkFreshness(sources, staleMs);
    const confidence = computeConfidence(sensor, sources, freshnessAlerts);
    const sourceHealth = {
        sensor: sensor.quality > 0.7 ? "fresh" : "stale",
        tomorrow: (_b = (_a = sources.find(r => r.source === "tomorrow")) === null || _a === void 0 ? void 0 : _a.health) !== null && _b !== void 0 ? _b : "pending",
        openmeteo: (_d = (_c = sources.find(r => r.source === "openmeteo")) === null || _c === void 0 ? void 0 : _c.health) !== null && _d !== void 0 ? _d : "pending",
    };
    // Humidity: 60 % sensor (local) + 40 % API blend
    const apiHumidity = weightedMean(sources, "humidity");
    const humidityFused = parseFloat((sensor.humidity * 0.6 + apiHumidity * 0.4).toFixed(1));
    return {
        // Sensor-primary fields (ground truth)
        soilMoisture: sensor.soilMoisture,
        soilTemperature: sensor.soilTemperature,
        leafWetness: sensor.leafWetness,
        ambientLight: sensor.ambientLight,
        co2Ppm: sensor.co2Ppm,
        windLocal: sensor.windLocal,
        rainGauge: sensor.rainGauge,
        humidity: humidityFused,
        // API-weighted atmospheric fields
        temperature: weightedMean(sources, "temperature"),
        windSpeed: weightedMean(sources, "windSpeed"),
        pressure: weightedMean(sources, "pressure"),
        cloudCover: weightedMean(sources, "cloudCover"),
        rainProb: weightedMean(sources, "rainProb"),
        rainIntensity: weightedMean(sources, "rainIntensity"),
        evapo: weightedMean(sources, "evapo"),
        uvIndex: weightedMean(sources, "uvIndex"),
        solar: weightedMean(sources, "solar"),
        // Meta
        confidence,
        sourceHealth,
        driftFlags: sensor.driftFlags,
        freshnessAlerts,
        sensor,
        sources,
        fusedAt: new Date(),
    };
}
// ────────────────────────────────────────────────────────────────
//  DECISION ENGINE
// ────────────────────────────────────────────────────────────────
function evaluateDecisions(env) {
    const decisions = [];
    const { soilMoisture: sm, soilTemperature: st, leafWetness: lw, co2Ppm, humidity, windLocal, rainGauge, rainProb, evapo, temperature, uvIndex, confidence, } = env;
    // Irrigation
    if (sm < 25 && evapo > 0.12 && rainProb < 0.4) {
        decisions.push({ id: "irrigate", type: "action", severity: "high",
            title: "Initiate Irrigation",
            detail: `Soil ${sm}% · ET ${evapo} mm/h · Rain prob ${Math.round(rainProb * 100)}%.`,
            icon: "💧", rule: "soil<25 AND evapo>0.12 AND rainProb<40%",
            triggers: [`soil:${sm}%`, `evapo:${evapo}`, `rain:${Math.round(rainProb * 100)}%`] });
    }
    else if (rainProb > 0.65 || rainGauge > 1.2) {
        decisions.push({ id: "pause_irr", type: "hold", severity: "medium",
            title: "Irrigation Paused",
            detail: `Rain ${Math.round(rainProb * 100)}% · Gauge ${rainGauge} mm/h.`,
            icon: "⏸️", rule: "rainProb>65% OR gauge>1.2mm",
            triggers: [`rain:${Math.round(rainProb * 100)}%`, `gauge:${rainGauge}`] });
    }
    else if (sm >= 25 && sm < 40) {
        decisions.push({ id: "monitor", type: "watch", severity: "low",
            title: "Monitor Soil Levels",
            detail: `Soil ${sm}% — acceptable. Recheck in 4 h.`,
            icon: "👁️", rule: "25≤soil<40",
            triggers: [`soil:${sm}%`] });
    }
    if (temperature > 35)
        decisions.push({ id: "heat", type: "alert", severity: "high",
            title: "Heat Stress Risk",
            detail: `Ambient ${temperature}°C · Soil ${st}°C.`,
            icon: "🌡️", rule: "temp>35°C", triggers: [`temp:${temperature}°C`] });
    if (temperature < 3)
        decisions.push({ id: "frost", type: "alert", severity: "high",
            title: "Frost Risk",
            detail: `${temperature}°C — protect crops immediately.`,
            icon: "❄️", rule: "temp<3°C", triggers: [`temp:${temperature}°C`] });
    if (evapo > 0.18)
        decisions.push({ id: "hi_evapo", type: "watch", severity: "medium",
            title: "High Evapotranspiration",
            detail: `ET ${evapo} mm/h — soil drying faster than expected.`,
            icon: "🔥", rule: "evapo>0.18", triggers: [`evapo:${evapo}`] });
    if (lw > 65 && humidity > 80)
        decisions.push({ id: "fungal", type: "alert", severity: "medium",
            title: "Fungal Disease Risk",
            detail: `Leaf wetness ${lw.toFixed(0)} · Humidity ${humidity}%.`,
            icon: "🍂", rule: "leafWetness>65 AND humidity>80",
            triggers: [`lw:${lw.toFixed(0)}`, `hum:${humidity}%`] });
    if (co2Ppm > 425)
        decisions.push({ id: "co2", type: "watch", severity: "low",
            title: "Elevated CO₂",
            detail: `CO₂ ${co2Ppm} ppm — check canopy ventilation.`,
            icon: "🌿", rule: "co2>425ppm", triggers: [`co2:${co2Ppm}`] });
    if (uvIndex > 7)
        decisions.push({ id: "uv", type: "watch", severity: "medium",
            title: "High UV Index",
            detail: `UV ${uvIndex} — photoinhibition risk.`,
            icon: "☀️", rule: "uv>7", triggers: [`uv:${uvIndex}`] });
    if (windLocal > 9)
        decisions.push({ id: "wind", type: "alert", severity: "medium",
            title: "Strong Wind Alert",
            detail: `Local wind ${windLocal} m/s — check supports.`,
            icon: "💨", rule: "windLocal>9m/s", triggers: [`wind:${windLocal}m/s`] });
    if (confidence < 0.65)
        decisions.push({ id: "data_quality", type: "alert", severity: "medium",
            title: "Low Data Confidence",
            detail: `Confidence ${Math.round(confidence * 100)}% — verify sensors & API keys.`,
            icon: "⚠️", rule: "confidence<65%",
            triggers: [`conf:${Math.round(confidence * 100)}%`] });
    if (decisions.length === 0)
        decisions.push({ id: "nominal", type: "nominal", severity: "none",
            title: "All Systems Nominal",
            detail: `Confidence ${Math.round(confidence * 100)}% — no interventions required.`,
            icon: "✅", rule: "default", triggers: [] });
    return decisions;
}
// ────────────────────────────────────────────────────────────────
//  FORECAST GENERATOR
// ────────────────────────────────────────────────────────────────
function generateForecast() {
    return Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        temp: parseFloat((14 + Math.sin((i - 6) / 4) * 8 + (Math.random() - 0.5) * 1.5).toFixed(1)),
        rain: parseFloat((Math.random() * 0.95).toFixed(2)),
        evapo: parseFloat((i > 6 && i < 20
            ? 0.04 + Math.random() * 0.2
            : 0.01 + Math.random() * 0.03).toFixed(3)),
    }));
}
// ────────────────────────────────────────────────────────────────
//  ORACLE ENGINE
// ────────────────────────────────────────────────────────────────
class OracleEngine {
    constructor() {
        this.cfg = Object.assign({}, DEFAULT_CONFIG);
        this.sim = new SensorSimulator();
        this.listeners = [];
        this.latestSensor = null;
        this.latestSources = [];
        this.latestEnv = null;
        this.latestDec = [];
        this.latestForecast = generateForecast();
        this.sensorTimer = -1;
        this.apiTimer = -1;
        this.running = false;
    }
    // ── Public ─────────────────────────────────────────────────
    async start() {
        if (this.running)
            return;
        this.running = true;
        console.info("[Oracle] Engine starting…");
        await this.fetchAPIs();
        this.pollSensors();
        this.sensorTimer = window.setInterval(() => this.pollSensors(), this.cfg.sensorPollMs);
        this.apiTimer = window.setInterval(() => this.fetchAPIs(), this.cfg.apiFetchMs);
    }
    stop() {
        this.running = false;
        clearInterval(this.sensorTimer);
        clearInterval(this.apiTimer);
        console.info("[Oracle] Engine stopped.");
    }
    async forceRefresh() {
        await this.fetchAPIs();
        this.pollSensors();
    }
    updateConfig(patch) {
        this.cfg = Object.assign(Object.assign({}, this.cfg), patch);
        if (this.running) {
            this.stop();
            this.start();
        }
    }
    subscribe(fn) {
        this.listeners.push(fn);
        if (this.latestEnv)
            fn(this.latestEnv, this.latestDec);
        return () => { this.listeners = this.listeners.filter(l => l !== fn); };
    }
    getEnv() { return this.latestEnv; }
    getDecisions() { return this.latestDec; }
    getForecast() { return this.latestForecast; }
    // ── Private ────────────────────────────────────────────────
    pollSensors() {
        this.latestSensor = this.sim.read(this.cfg.driftThresholds);
        this.latestForecast = generateForecast();
        this.fuse();
    }
    async fetchAPIs() {
        const { lat, lon, tomorrowKey } = this.cfg;
        const [tm, om] = await Promise.all([
            fetchTomorrow(lat, lon, tomorrowKey),
            fetchOpenMeteo(lat, lon),
        ]);
        this.latestSources = [tm, om];
        this.fuse();
    }
    fuse() {
        if (!this.latestSensor || this.latestSources.length === 0)
            return;
        this.latestEnv = fuseData(this.latestSensor, this.latestSources, this.cfg.staleThreshMs);
        this.latestDec = evaluateDecisions(this.latestEnv);
        this.emit();
    }
    emit() {
        if (!this.latestEnv)
            return;
        for (const fn of this.listeners) {
            try {
                fn(this.latestEnv, this.latestDec);
            }
            catch (err) {
                console.error("[Oracle] Listener error:", err);
            }
        }
    }
}
// ────────────────────────────────────────────────────────────────
//  EXPOSE ON window  (index.html accesses window.Oracle)
// ────────────────────────────────────────────────────────────────
// At the very end of oracle.js
const oracleInstance = new OracleEngine();
window.Oracle = oracleInstance;
