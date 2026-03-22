// weatherEngine.ts

const KEYS = {
  tomorrow: 'K6ik2jrBrMwH3yBDtxf3gQC7hgrxxCkf',
  openweather: '200c6ff84644e627280d94acaaa825bc'
};

const Throttler = {
  counts: {} as Record<string, number>,
  increment(key: string) { this.counts[key] = (this.counts[key] || 0) + 1; },
  isBlocked(key: string, limit: number) { return (this.counts[key] || 0) >= limit; }
};
// weatherEngine.ts

let cachedWeather: any[] = [];
let lastFetchTime: number = 0;
const CACHE_TIME_KEY = 'oracle_weather_timestamp';
const CACHE_KEY = 'oracle_weather_cache';
const ONE_HOUR = 60 * 60 * 1000;

export async function fetchWeatherConsensus(lat: number, lon: number) {
  const now = Date.now();
  const storedTime = Number(localStorage.getItem(CACHE_TIME_KEY) || 0);
  const storedData = localStorage.getItem(CACHE_KEY);

  // 1. PERSISTENT CACHE CHECK
  if (storedData && (now - storedTime) < ONE_HOUR) {
    const minsLeft = Math.round((ONE_HOUR - (now - storedTime)) / 60000);
    console.log(`🌦️ Oracle: Using Persistent Cache. (Next refresh in ${minsLeft}m)`);
    return JSON.parse(storedData);
  }

  console.log("📡 Oracle: Cache expired. Fetching fresh multi-node consensus...");
  let results: any[] = [];

  // --- NODE A: TOMORROW.IO (Protected) ---
  try {
    const res = await fetch(`https://api.tomorrow.io/v4/weather/realtime?location=${lat},${lon}&apikey=${KEYS.tomorrow}`);
    if (res.ok) {
      const d = await res.json();
      results.push({ name: 'Tomorrow.io', temp: d.data.values.temperature, prob: (d.data.values.precipitationProbability || 0) / 100 });
    } else if (res.status === 429) {
      console.warn("🚫 Tomorrow.io: 429 Rate Limit. Skipping this node.");
    }
  } catch (e) { console.warn("Tomorrow IO Offline"); }

  // --- NODE B: OPENWEATHER (Added Back) ---
  try {
    const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric&appid=${KEYS.openweather}`);
    if (res.ok) {
      const d = await res.json();
      results.push({
        name: 'OpenWeather',
        temp: d.main.temp,
        prob: (d.clouds.all / 100) // Using cloud cover as a rain proxy for 2.5
      });
    }
  } catch (e) { console.warn("OpenWeather Offline"); }

  // --- NODE C: OPEN-METEO (Reliable) ---
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&hourly=precipitation_probability&forecast_days=1`);
    if (res.ok) {
      const d = await res.json();
      results.push({
        name: 'Open-Meteo',
        temp: d.current.temperature_2m,
        prob: (d.hourly.precipitation_probability[0] || 0) / 100
      });
    }
  } catch (e) { console.warn("Open-Meteo Offline"); }

  // 4. Update Persistent Cache
  if (results.length > 0) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(results));
    localStorage.setItem(CACHE_TIME_KEY, now.toString());
  } else {
    // If absolutely everything fails, use the old cache or a safe default
    return storedData ? JSON.parse(storedData) : [{ name: 'System Backup', temp: 22, prob: 0 }];
  }

  return results;
}
