import './polyfill';
import { Buffer } from "buffer";
import { Oracle } from './or1';
import { createClient } from "@supabase/supabase-js";
import { PublicKey, Connection, clusterApiUrl } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";


const CACHE_TIME_KEY = 'oracle_weather_timestamp';

// --- INITIALIZATION ---
const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");
const provider = new anchor.AnchorProvider(
  connection,
  (window as any).solana,
  { commitment: "confirmed" }
);

const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// --- GLOBAL STATE ---
const state = {
  totalStakedOlv: 0,
  lastUpdate: new Date().toLocaleTimeString(),
  carbonHistory: [3.8, 4.0, 4.2, 4.1, 4.4, 4.2] // Mock data for the chart
};
// 1. Establish the "Wire" first
Oracle.subscribe((metrics: any, decisions: any[], weather: any[]) => {
  console.log("📥 UI received data from Oracle:", metrics);
  renderUI(metrics, decisions, weather);
});
// --- DATA FETCHERS ---

/** Fetches Staked OVL using the protocol logic */
async function getStakedBalance() {
  try {
    const walletPubKey = (window as any).solana?.publicKey;
    if (!walletPubKey) return;

    // Using the specific logic from your requirements
    const [stakePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("stake"), walletPubKey.toBuffer()],
      new PublicKey("STAKE_PROGRAM_ID_HERE") // Replace with actual program ID
    );

    // Assuming 'program' is available in your scope or passed in
    // const stakeAccount = await program.account.stakeAccount.fetch(stakePda);
    // state.totalStakedOlv = (stakeAccount.amount?.toNumber() || 0) / 1_000_000_000;

    state.totalStakedOlv = 1250.55; // Placeholder
  } catch (e) {
    console.log("No StakeAccount found for this user.");
  }
}
function renderConsensusUI(providers: any[]) {
  const avgTemp = providers.reduce((a, b) => a + b.temp, 0) / providers.length;
  const maxProb = Math.max(...providers.map(p => p.prob));

  return `
    <div class="card" style="margin-top:20px; border: 1px solid #333; background: #0a0a0a;">
      <div class="ct" style="display:flex; justify-content:space-between; align-items:center;">
        <span>WEATHER CONSENSUS</span>
        <div class="pill pill-g" style="font-size:8px;">${providers.length} NODES ONLINE</div>
      </div>

      <div style="margin: 15px 0;">
        ${providers.map(p => `
          <div style="display:flex; justify-content:space-between; font-size:11px; margin-bottom:6px;">
            <span style="color:var(--muted)">● ${p.name}</span>
            <span>${p.temp.toFixed(1)}°C <span style="color:#444; margin:0 5px;">|</span> Rain: ${Math.round(p.prob * 100)}%</span>
          </div>
        `).join('')}
      </div>

      <div style="border-top:1px solid #222; padding-top:15px; text-align:center;">
        <div style="font-size:28px; font-weight:800; font-family:'Syne';">${avgTemp.toFixed(1)}°C</div>
        <div style="font-size:10px; color:var(--teal); letter-spacing:1px;">FINAL ORACLE READOUT</div>
      </div>
    </div>
  `;
}

function renderOraclePulse(weatherData: any) {
  return `
    <div class="card" style="background: rgba(0,0,0,0.4); border: 1px solid var(--border);">
      <div class="ct" style="display:flex; justify-content:space-between;">
        <span>ORACLE CONSENSUS</span>
        <span style="color:var(--teal)">LIVE</span>
      </div>

      <div style="margin-top:10px;">
        ${weatherData.providers.map(p => {
          const usage = Throttler.getUsage(p.source.toLowerCase().replace('.io', ''));
          return `
            <div style="display:flex; justify-content:space-between; font-size:10px; margin-bottom:4px;">
              <span style="color:${p.source === 'Open-Meteo' ? 'var(--blue)' : 'var(--green)'}">● ${p.source}</span>
              <span style="color:var(--muted)">${p.temp}°C | Rain: ${Math.round(p.prob * 100)}%</span>
            </div>
          `;
        }).join('')}
      </div>

      <hr style="border:0; border-top:1px solid #333; margin:10px 0;">

      <div style="text-align:center;">
        <div style="font-size:22px; font-weight:bold; color:var(--white);">${weatherData.consensus.temp.toFixed(1)}°C</div>
        <div style="font-size:9px; color:var(--muted); text-transform:uppercase; letter-spacing:1px;">Consensus Ambient</div>
      </div>
    </div>
  `;
}
const KEYS = {
  tomorrow: "K6ik2jrBrMwH3yBDtxf3gQC7hgrxxCkf",
  openweather: "200c6ff84644e627280d94acaaa825bc" // Add your One Call 3.0 key
};

const API_CONFIG = {
  tomorrow: { limit: 25, reset: "hourly" },
  openweather: { limit: 1000, reset: "daily" },
  openmeteo: { limit: 10000, reset: "daily" } // Keyless
};

const Throttler = {
  getUsage(id: string) {
    const data = JSON.parse(localStorage.getItem(`oracle_usage_${id}`) || '{"count":0, "lastReset":0}');
    const now = Date.now();

    // Hourly reset for Tomorrow.io
    if (id === 'tomorrow' && now - data.lastReset > 3600000) return { count: 0, lastReset: now };
    // Daily reset (roughly) for others
    if (now - data.lastReset > 86400000) return { count: 0, lastReset: now };

    return data;
  },
  increment(id: string) {
    const usage = this.getUsage(id);
    usage.count += 1;
    localStorage.setItem(`oracle_usage_${id}`, JSON.stringify(usage));
  },
  isBlocked(id: string, limit: number) {
    return this.getUsage(id).count >= limit;
  }
};

async function fetchWeatherConsensus(lat: number, lon: number) {
  const results: any[] = [];
  const coords = { lat: lat.toFixed(4), lon: lon.toFixed(4) };

  // --- 1. TOMORROW.IO (Strict Check) ---
  if (!Throttler.isBlocked('tomorrow', API_CONFIG.tomorrow.limit)) {
    try {
      const res = await fetch(`https://api.tomorrow.io/v4/weather/realtime?location=${coords.lat},${coords.lon}&apikey=${KEYS.tomorrow}`);
      if (res.status === 429) {
        // Force block for the rest of the hour if we hit a 429
        localStorage.setItem(`oracle_usage_tomorrow`, JSON.stringify({count: 25, lastReset: Date.now()}));
      } else if (res.ok) {
        const d = await res.json();
        Throttler.increment('tomorrow');
        results.push({ name: 'Tomorrow.io', temp: d.data.values.temperature, prob: d.data.values.precipitationProbability / 100 });
      }
    } catch (e) { console.warn("T-IO Blocked by Network/Quota"); }
  }

  // --- 2. OPENWEATHER (Subscription Check) ---
  // We skip 3.0 entirely if we know it's unauthorized (401)
  const isOWMBlocked = Throttler.isBlocked('openweather', 1000);
  if (!isOWMBlocked) {
    try {
      // Use 2.5 by default to avoid 401 until you've added the card to OWM
      const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${coords.lat}&lon=${coords.lon}&units=metric&appid=${KEYS.openweather}`);
      if (res.ok) {
        const d = await res.json();
        Throttler.increment('openweather');
        results.push({ name: 'OpenWeather 2.5', temp: d.main.temp, prob: d.clouds.all / 100 });
      }
    } catch (e) { console.warn("OWM Skipped"); }
  }

  // --- 3. OPEN-METEO (Always attempted as last resort) ---
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m&hourly=precipitation_probability&forecast_days=1`);
    if (res.ok) {
      const d = await res.json();
      results.push({ name: 'Open-Meteo', temp: d.current.temperature_2m, prob: (d.hourly.precipitation_probability[0] || 0) / 100 });
    }
  } catch (e) { console.error("Critical: All providers down"); }

  // ENSURE RESULTS IS NEVER EMPTY TO PREVENT MATH ERRORS
  if (results.length === 0) {
    results.push({ name: 'Offline Cache', temp: 20, prob: 0 });
  }

  return results;
}
async function fetchFieldDetails(fieldId: string) {
  const searchId = (fieldId === "genesis-001" || !fieldId) ? "FIELD_01" : fieldId;
  const { data } = await sb.from('fields').select('*').eq('field_id', searchId).maybeSingle();
  return data || { field_name: "Node Alpha", tree_count: 0, gps_lat: 43.1037, gps_long: 10.5784 };
}

// --- UI COMPONENTS ---

const DataRow = (label: string, value: any, unit: string, color: string = "#fff") => `
  <div style="display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(255,255,255,0.03); font-size:11px;">
    <span style="color:var(--muted)">${label}</span>
    <span style="color:${color}; font-weight:700;">${value}<small style="font-size:8px; margin-left:2px; opacity:0.6">${unit}</small></span>
  </div>
`;

const Sparkline = (data: number[]) => {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min;
  const points = data.map((d, i) => `${(i / (data.length - 1)) * 100},${100 - ((d - min) / range) * 80}`).join(' ');
  return `
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%; height:40px; stroke:var(--teal); stroke-width:3; fill:none;">
      <polyline points="${points}" />
    </svg>
  `;
};
// --- 1. REVENUE & CARBON ENGINE ---
// omain.ts

const RevenueEngine = {
  accrued: 11.03, // Your current reported value
  threshold: 50.00,
  lastSync: Date.now(),

  calculate(currentPpm: number) {
    const ppm = currentPpm || 400; // Default to baseline
    const hourlyRate = (ppm / 400) * 1.25;
    // STAKE MULTIPLIER: Every 1000 OVL staked adds 10% to the yield
    // Accessing the Oracle instance stats
    // Use || 0 to handle cases where the Oracle hasn't synced yet
        const staked = Oracle?.daoStats?.totalOlvStaked || 0;
        const stakeMultiplier = 1 + (staked / 10000);
            const thirtyMinYield = hourlyRate / 2;

    // 1. Accumulate the yield
    this.accrued += thirtyMinYield;

    // 2. SAFETY GATE: Ensure threshold is a valid number and > 0
    const safeThreshold = (this.threshold && this.threshold > 0) ? this.threshold : 50.00;

    // 3. Calculate Percent with NaN Check
    let percent = (this.accrued / safeThreshold) * 100;

    // If percent is still NaN or Infinity, force it to 0
    if (isNaN(percent) || !isFinite(percent)) {
      percent = 0;
    }

    return {
      total: this.accrued,
      percent: isNaN(percent) ? 0 : Math.min(100, percent),
      isReady: this.accrued >= safeThreshold,
      multiplier: stakeMultiplier, // <--- ENSURE THIS IS RETURNED
      yield: thirtyMinYield
    };
  }
};// --- 2. QUOTA RESET UTILITY ---
window.resetAllQuotas = () => {
  const keys = Object.keys(localStorage).filter(k => k.startsWith('oracle_usage_') || k.startsWith('quota_'));
  keys.forEach(k => localStorage.removeItem(k));
  console.log("🛠️ Quotas Cleared. Refreshing...");
  location.reload();
};

function updateCarbonState(currentPpm: number) {
  // Logic from your snippet
  const tons = (currentPpm / 100) * 0.85;
  state.carbonHistory.push(tons);
  if (state.carbonHistory.length > 20) state.carbonHistory.shift();
}
// Time constants in milliseconds
const ONE_HOUR = 60 * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;
const FIVE_MINUTES = 5 * 60 * 1000; // Useful for the "Reset In" countdown

async function renderUI(metrics: any, decisions: any[], weather: any[]) {
  const app = document.getElementById('app');
  if (!app) return;
  // Formatting for clarity
  const lastFetchTime = Oracle.lastUpdate ? Oracle.lastUpdate.getTime() : Date.now();
  const co2Level = metrics.co2.toFixed(0);
  const soil = metrics.soilMoisture.toFixed(1);
  const temp = metrics.temp ? metrics.temp.toFixed(1) : "0.0";
  const rev = RevenueEngine.calculate(metrics.co2);
console.log(rev);

  // If we have no data yet, show a loading skeleton
  if (!metrics) {
    app.innerHTML = `<div class="loading">INITIATING ORACLE PROTOCOL...</div>`;
    return;
  }
  // 1. DATA GATHERING
  const field = await fetchFieldDetails(metrics.field_id);

  // Calculate Consensus values for the Rule Trace
  const avgTemp = weather.reduce((a, b) => a + b.temp, 0) / weather.length;
  const avgRainProb = weather.reduce((a, b) => a + b.prob, 0) / weather.length;
const minsToReset = Math.round((ONE_HOUR - (Date.now() - lastFetchTime)) / 60000);
const carbonRev = RevenueEngine.calculate(metrics.co2);
const stakingYield = (Oracle.daoStats.totalOlvStaked * 0.05) + (Oracle.daoStats.treeSharesLocked * 0.10);
const totalPoolRevenue = carbonRev.total + stakingYield;
  const sequestrationRate = (co2Level / 100) * 0.85; // Metric tons/yr per hectare (Simplified)
    const estRevenue = sequestrationRate * 25.00; // Assuming $25/ton carbon credit price
    // Calculate Revenue State
    //  const rev = RevenueEngine.calculate(metrics.co2 || 412);
  // 2. LOGIC TRACE EVALUATION
  const logicTrace = [
    { label: "Soil < 25%", status: (metrics.soilMoisture < 25), val: (metrics.soilMoisture || 0) + "%" },
    { label: "Heat Stress", status: (avgTemp > 35), val: avgTemp.toFixed(1) + "°C" },
    { label: "Rain Risk", status: (avgRainProb > 0.6), val: (avgRainProb * 100).toFixed(0) + "%" },
    { label: "Frost Alert", status: (avgTemp < 3), val: avgTemp.toFixed(1) + "°C" }
  ];
  // Calculate Staking Yield (Stream B - Mocked Multiplier)
  const totalCombinedRev = carbonRev.total + stakingYield;
  // 3. GENERATE HTML
  app.innerHTML = `
    <div class="fade-up" style="max-width:500px; margin:0 auto; padding-bottom:40px;">

      <header class="header">
        <div>
          <div class="logo-tag">Protocol v1.9 // ${metrics.field_id} --// CO2 ASSET MGM</div>
          <h1 class="logo-title">ORACLE <b>ADMIN</b></h1>
        </div>
        <div class="hdr-right">
          <div class="pill pill-g"><span class="dot dot-g"></span> UPLINK_ACTIVE</div>
          <div style="font-size:10px; color:#fff; margin-top:5px; font-weight:bold;">
            STAKED: ${state.totalStakedOlv.toFixed(2)} OVL
          </div>
        </div>
      </header>
      <aside style="background:rgba(255,255,255,0.05); border-left:2px solid var(--teal); padding:12px; margin-bottom:20px; font-family:'JetBrains Mono', monospace;">
              <div style="font-size:10px; color:var(--teal); font-weight:bold; margin-bottom:8px;">[ORACLE_THINKING_PROCESS]</div>
              <ul style="list-style:none; padding:0; margin:0; font-size:9px; color:var(--muted); line-height:1.4;">
                <li>▶ DATA_INGRESS: Received consensus from ${weather.length} nodes.</li>
                <li>▶ EVAL_TEMP: Ambient avg ${avgTemp.toFixed(1)}°C (within growth delta).</li>
                <li>▶ EVAL_PRECIP: ${Math.round(avgRainProb*100)}% rain probability detected via OpenWeather/Meteo.</li>
                <li>▶ EVAL_CARBON: Local CO2 at ${co2Level}ppm. Sequestration yield identified.</li>
                <li style="color:var(--white); margin-top:5px;">⚡ DECISION: Maintain irrigation; CO2 levels support 100% distribution tier.</li>
              </ul>
            </aside>
            <aside style="background:rgba(10,10,10,0.8); border-left:2px solid var(--teal); padding:15px; margin-bottom:20px; font-family:'JetBrains Mono', monospace; border-radius:0 8px 8px 0;">
        <div style="font-size:10px; color:var(--teal); font-weight:bold; margin-bottom:10px;">[ORACLE_INTERNAL_REASONING]</div>
        <div style="font-size:9px; color:rgba(255,255,255,0.6); line-height:1.6;">
          <div style="margin-bottom:4px;">>> INGESTING: CO2_LEVEL @ ${metrics.co2.toFixed(1)}PPM</div>
          <div style="margin-bottom:4px;">>> ANALYZING: Photosynthetic yield is +12% vs baseline.</div>
          <div style="margin-bottom:4px;">>> CALCULATING: Sequestration revenue accruing at $${(rev.yield * 2).toFixed(2)}/hr.</div>
          <div style="margin-bottom:4px; color:${rev.isReady ? 'var(--green)' : 'var(--amber)'}">
            >> STATUS: ${rev.isReady ? 'REVENUE_THRESHOLD_MET' : 'ACCUMULATING_ASSETS...'}
          </div>
          <div style="color:var(--white); font-weight:bold; margin-top:8px;">
            >> RECOMMENDATION: ${rev.isReady ? 'EXECUTE_DISTRIBUTION' : 'HOLD_FOR_CONSENSUS'}
          </div>
        </div>
      </aside>
      <div class="fade-up" style="max-width:550px; margin:0 auto; padding-bottom:40px;">

    <div style="display:grid; grid-template-columns: 1.2fr 1fr; gap:15px; margin-bottom:20px;">

      <div class="card" style="background:rgba(20, 184, 166, 0.05); border-left:3px solid var(--teal);">
        <div class="label" style="color:var(--teal);">STAKING NODES</div>
        <div style="font-size:24px; font-weight:900; color:var(--white);">
          ${Oracle.daoStats.totalOlvStaked.toLocaleString()} <small style="font-size:10px; color:var(--muted)">OVL</small>
        </div>
        <div style="font-size:9px; color:var(--muted); margin-top:5px; font-family:monospace;">
  POWER_MULT: <span style="color:var(--green)">
    x${(rev.multiplier ?? 1.0).toFixed(3)}
  </span>
</div>
      </div>

      <div class="card" style="background:rgba(0,0,0,0.3); border:1px solid #222;">
        <div class="label">EPOCH 12 STATUS</div>
        <div style="font-size:18px; font-weight:bold; color:var(--white);">14h 22m <small style="font-size:9px;">REMAINING</small></div>
        <div class="pill pill-g" style="margin-top:8px; font-size:8px;">ACTIVE_VOTER</div>
      </div>
    </div>
      <div class="card treasury-card" style="background: linear-gradient(135deg, #000 0%, #051a14 100%); border: 1px solid #14b8a666;">
          <div class="label" style="color:var(--teal)">TOTAL POOL REVENUE (EPOCH 12)</div>
          <div style="font-size:42px; font-weight:900; color:var(--white);">$${totalCombinedRev.toFixed(2)}</div>

          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:15px;">
            <div style="font-size:10px; color:var(--muted);">
              CARBON: <span style="color:var(--white)">$${carbonRev.total.toFixed(2)}</span>
            </div>
            <div style="font-size:10px; color:var(--muted);">
              STAKING YIELD: <span style="color:var(--white)">$${stakingYield.toFixed(2)}</span>
            </div>
          </div>

          <div class="progress-bar" style="height:2px; background:#111; margin-top:20px;">
             <div style="width:65%; height:100%; background:var(--teal); box-shadow: 0 0 10px var(--teal);"></div>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:8px; font-size:9px; color:var(--teal); font-family:monospace;">
             <span>ORACLE_SWAP: OLV/SOL</span>
             <span>EXECUTION: 14:02:11</span>
          </div>
        </div>

        <div class="card" style="margin-top:15px; border:1px solid #333;">
          <div class="label">OIL:ORACLE (MOCK)</div>
          <div style="font-size:24px; font-weight:bold;">$${Oracle.daoStats.oilYield.toFixed(2)} <small style="font-size:10px; color:var(--muted)">USD/BBL</small></div>
          <div style="font-size:9px; color:var(--green); margin-top:5px;">↑ 1.2% SWAP_EFFICIENCY</div>
        </div>

      <div class="card" style="border: 1px solid ${rev.isReady ? 'var(--teal)' : '#333'}; background: #000;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <div class="label" style="letter-spacing:1px;">ACCRUED REVENUE</div>
            <div style="font-size:32px; font-weight:800; font-family:'Syne'; color:var(--white);">$${rev.total.toFixed(2)}</div>
          </div>
          <div style="text-align:right;">
             <div class="pill ${rev.isReady ? 'pill-g' : 'pill-a'}">${Math.min(100, Number(rev.percent)).toFixed(0)}% TO GOAL</div>
          </div>
        </div>

        <button
          class="apply"
          style="width:100%; margin-top:15px; background:${rev.isReady ? 'var(--teal)' : '#222'}; color:${rev.isReady ? '#000' : '#666'}; cursor:${rev.isReady ? 'pointer' : 'not-allowed'}"
          ${!rev.isReady ? 'disabled' : ''}
          onclick="handleDistribution()"
        >
          ${rev.isReady ? '🚀 DISTRIBUTE REVENUE' : '🔒 ASSET LOCK ACTIVE'}
        </button>
      </div>

      </div>
      <div class="ct" style="margin-top:20px;">Weather Consensus Pulse</div>
      <div class="card" style="background:rgba(0,0,0,0.4); border:1px solid #333;">
        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
          <span style="font-size:10px; color:var(--teal); font-weight:bold;">${weather.length} PROVIDERS ACTIVE</span>
          <span style="font-size:9px; color:var(--muted)">RESET IN: ${minsToReset}m</span>
        </div>
        ${weather.map(p => {
          const usage = Throttler.getUsage(p.name.toLowerCase().replace('.io', ''));
          const isLimit = usage.count >= (API_CONFIG[p.name.toLowerCase().replace('.io', '')]?.limit || 9999);
          return `
            <div style="display:flex; justify-content:space-between; font-size:10px; margin-bottom:4px;">
              <span style="color:${isLimit ? 'var(--red)' : 'var(--green)'}">● ${p.name} ${isLimit ? '(LIMIT)' : ''}</span>
              <span style="color:var(--white)">${p.temp.toFixed(1)}°C | Rain: ${Math.round(p.prob * 100)}%</span>
            </div>
          `;
        }).join('')}
      </div>

      <div class="ct" style="margin-top:20px;">Oracle Logic Trace</div>
      <div class="card" style="background:rgba(0,0,0,0.2); border:1px dashed rgba(255,255,255,0.1)">
        ${logicTrace.map(t => `
          <div style="display:flex; justify-content:space-between; font-size:9px; margin-bottom:4px;">
            <span style="color:var(--muted)">${t.label}</span>
            <span style="color:${t.status ? 'var(--red)' : 'var(--green)'}">
              ${t.val} → ${t.status ? 'TRUE' : 'FALSE'}
            </span>
          </div>
        `).join('')}
      </div>

      <div class="ct" style="margin-top:20px;">Hardware Node: Local Telemetry</div>
      // omain.ts -> inside renderUI
<div class="card" style="border-left: 3px solid var(--blue);">
  ${DataRow("Soil Moisture Probe", (metrics?.soilMoisture ?? 0).toFixed(1), "%", "var(--green)")}
  ${DataRow("Leaf Wetness Sensor", (metrics?.leafWetness ?? 0).toFixed(1), "%", "var(--blue)")}
  ${DataRow("Node Temperature", (metrics?.temp ?? 0).toFixed(1), "°C", "var(--amber)")}
  ${DataRow("Wind Velocity", (metrics?.windSpeed ?? 0).toFixed(1), "km/h", "var(--blue)")}
</div>

      <div class="card" style="margin-top:20px; border:1px solid var(--teal); background:rgba(45,212,191,0.02)">
        <div class="ct" style="color:var(--teal)">Carbon Sequestration (t/yr)</div>
        <div style="display:flex; align-items:flex-end; gap:15px;">
          <div style="font-size:24px; font-weight:800; font-family:var(--disp);">4.22</div>
          <div style="flex:1; padding-bottom:5px;">${Sparkline(state.carbonHistory)}</div>
        </div>
      </div>
      <div class="ct">Carbon Asset & Revenue Distribution</div>
            <div class="card" style="border-top: 2px solid var(--teal); background: linear-gradient(180deg, rgba(45,212,191,0.1) 0%, rgba(0,0,0,0) 100%);">
              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                 <div>
                   <div class="label">CURRENT CO2</div>
                   <div style="font-size:20px; font-weight:800; color:var(--teal);">${co2Level} <small style="font-size:10px;">PPM</small></div>
                 </div>
                 <div>
                   <div class="label">EST. REVENUE</div>
                   <div style="font-size:20px; font-weight:800; color:var(--white);">$${estRevenue.toFixed(2)} <small style="font-size:10px;">/HA</small></div>
                 </div>
              </div>
              <div style="margin-top:10px; font-size:9px; color:var(--muted);">
                *Distribution calculated based on sequestration delta of ${sequestrationRate.toFixed(2)} t/yr.
              </div>
            </div>

            </div>
      <div style="margin-top:20px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <button class="apply" onclick="openDeepFieldModal('${field.field_id}')" style="margin:0;">🛰️ DEEP SATELLITE</button>
        <button class="tab" onclick="location.reload()">🔄 SYNC ENGINE</button>
      </div>

      <div class="footer">ADMIN PROTOCOL // ${state.lastUpdate}</div>
    </div>
  `;
}
window.handleDistribution = () => {
  alert(`Oracle Consensus verified. $${RevenueEngine.accrued.toFixed(2)} has been distributed to stake holders.`);
  RevenueEngine.accrued = 0; // Reset after distribution
   claimRevenue("YOUR_TREE_PDA_HERE");
  // In production, this would call your smart contract
}
// --- MODAL LOGIC ---

(window as any).openDeepFieldModal = async (id: string) => {
  const modal = document.getElementById('deepModal');
  const body = document.getElementById('modalBody');
  if (!modal || !body) return;

  modal.style.display = 'block';
  const field = await fetchFieldDetails(id);

  body.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:15px; height:100%;">
      <div style="border-radius:18px; overflow:hidden; border:1px solid var(--bdr2); flex-grow:1; min-height:400px; box-shadow: 0 0 50px rgba(0,0,0,0.5);">
        <iframe width="100%" height="100%" frameborder="0" style="border:0; filter: contrast(1.1) brightness(0.9);"
          src="https://www.google.com/maps/embed/v1/view?key=YOUR_GOOGLE_KEY_HERE&center=${field.gps_lat},${field.gps_long}&zoom=18&maptype=satellite">
        </iframe>
      </div>

      <div class="card" style="background:var(--bg3); margin:0;">
        <div class="ct">Node GPS Context</div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
           <div>
             ${DataRow("Latitude", field.gps_lat, "deg")}
             ${DataRow("Longitude", field.gps_long, "deg")}
           </div>
           <div>
             ${DataRow("Tree Count", field.tree_count, "units")}
             ${DataRow("Last Sync", state.lastUpdate, "UTC")}
           </div>
        </div>
      </div>
    </div>
  `;
};
(window as any).closeModal = () => document.getElementById('deepModal')!.style.display = 'none';

// --- START ---
// The subscription is the only entry point for UI updates
// Initialize the loop
Oracle.startHardwareHeartbeat();

// Initial manual trigger to load the UI immediately
Oracle.doRefresh();
