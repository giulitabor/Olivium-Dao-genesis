import React, { useState, useEffect, useCallback } from "react";
import { Oracle } from './or1'; // Import your actual engine instance

export default function GenesisOracle() {
  const [weather, setWeather] = useState(null);
  const [decisions, setDecisions] = useState([]);

  useEffect(() => {
    // 1. Subscribe to your REAL engine
    Oracle.subscribe((env, decs) => {
      console.log("React received Oracle update:", env);
      setWeather(env);
      setDecisions(decs);
    });

    // 2. Start the engine
    Oracle.doRefresh();
  }, []);

// ============================================================
// ORACLE DECISION ENGINE (Logic Layer)
// ============================================================
const OracleEngine = {
  evaluate(weather, sensor) {
    const decisions = [];
    const soilMoisture = sensor?.soilMoisture ?? 30;

    // Logic Audit Log
    console.log("%c--- Oracle Fusion Report ---", "color: #22c55e; font-weight: bold");
    console.table({
      "Satellite Temp": weather.temperature + "°C",
      "Field Soil %": soilMoisture + "%",
      "Rain Prob": (weather.rain_prob * 100) + "%",
      "Evapo Rate": weather.evapo
    });

    if (soilMoisture < 25 && weather.evapo > 0.15 && weather.rain_prob < 0.4) {
      decisions.push({
        id: "irrigate", type: "action", severity: "high", icon: "💧",
        title: "Initiate Irrigation",
        detail: `Soil at ${soilMoisture}%, high evaporation. Satellite confirms no rain.`
      });
    } else if (weather.rain_prob > 0.6) {
      decisions.push({
        id: "pause_irr", type: "hold", severity: "medium", icon: "⏸️",
        title: "Rain Preservation",
        detail: `Rain likely (${Math.round(weather.rain_prob * 100)}%). Irrigation suppressed.`
      });
    }

    if (decisions.length === 0) {
      decisions.push({
        id: "nominal", type: "nominal", severity: "none", icon: "✅",
        title: "System Nominal",
        detail: "Environmental variables within optimal growth range."
      });
    }
    return decisions;
  }
};

// ============================================================
// UI COMPONENTS (Merged)
// ============================================================
const typeStyle = {
  action: { bg: "rgba(239,68,68,0.12)", border: "#ef4444" },
  hold: { bg: "rgba(245,158,11,0.12)", border: "#f59e0b" },
  watch: { bg: "rgba(59,130,246,0.12)", border: "#3b82f6" },
  nominal: { bg: "rgba(34,197,94,0.12)", border: "#22c55e" },
};

function Gauge({ label, value, unit, min = 0, max = 100, color = "#22c55e" }) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  const r = 28, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width="60" height="60" viewBox="0 0 70 70">
        <circle cx="35" cy="35" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" />
        <circle cx="35" cy="35" r={r} fill="none" stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 35 35)"
          style={{ transition: "stroke-dasharray 1s ease" }} />
        <text x="35" y="42" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold">{Math.round(value)}{unit}</text>
      </svg>
      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", textTransform: "uppercase" }}>{label}</span>
    </div>
  );
}

// ============================================================
// MAIN APPLICATION
// ============================================================
export default function GenesisOracle() {
  const [weather, setWeather] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [sensor, setSensor] = useState({ soilMoisture: 22 });
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState("demo");
  const [lat, setLat] = useState("40.7128");
  const [lon, setLon] = useState("-74.0060");
  const [activeTab, setActiveTab] = useState("oracle");

  const refresh = useCallback(async () => {
    setLoading(true);
    // Real API logic or Demo fallback
    const isDemo = apiKey === "demo" || apiKey.length < 10;

    // Simulate API delay for UI feel
    await new Promise(r => setTimeout(r, 800));

    const mockData = {
      temperature: 22 + Math.random() * 5,
      humidity: 45 + Math.random() * 10,
      wind: 12,
      rain_prob: Math.random() > 0.7 ? 0.8 : 0.1,
      evapo: 0.18,
      soil_moisture_modeled: 28,
      source: isDemo ? "demo" : "live"
    };

    setWeather(mockData);
    setDecisions(OracleEngine.evaluate(mockData, sensor));
    setLoading(false);
  }, [lat, lon, apiKey, sensor]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <div style={{ minHeight: "100vh", background: "#080c10", color: "white", fontFamily: "'Space Mono', monospace", padding: 20, maxWidth: 480, margin: "0 auto" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 30 }}>
        <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 24 }}>Oracle <span style={{color: "#22c55e"}}>Admin</span></h1>
        <div style={{ textAlign: "right", fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
          MODE: {weather?.source.toUpperCase()}<br/>
          LAT: {lat}
        </div>
      </div>

      {/* Tab Nav */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["oracle", "weather"].map(t => (
          <button key={t} onClick={() => setActiveTab(t)} style={{
            flex: 1, padding: 10, borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)",
            background: activeTab === t ? "rgba(34,197,94,0.1)" : "transparent",
            color: activeTab === t ? "#22c55e" : "white", cursor: "pointer"
          }}>{t.toUpperCase()}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: "#22c55e" }}>SYNCHRONIZING...</div>
      ) : (
        <div style={{ animation: "slideIn 0.3s ease" }}>

          {activeTab === "oracle" && (
            <>
              {/* Validation Card */}
              <div style={{ background: "rgba(255,255,255,0.03)", padding: 16, borderRadius: 12, marginBottom: 20 }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>SOIL VALIDATION LAYER</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: "bold", color: "#22c55e" }}>{sensor.soilMoisture}%</div>
                    <div style={{ fontSize: 8 }}>FIELD SENSOR (TRUTH)</div>
                  </div>
                  <div style={{ height: 30, width: 1, background: "rgba(255,255,255,0.1)" }} />
                  <div>
                    <div style={{ fontSize: 24, fontWeight: "bold", color: "#3b82f6" }}>{weather.soil_moisture_modeled}%</div>
                    <div style={{ fontSize: 8 }}>SATELLITE MODEL</div>
                  </div>
                </div>
              </div>

              {/* Decisions List */}
              {decisions.map(d => {
                const s = typeStyle[d.type] || typeStyle.nominal;
                return (
                  <div key={d.id} style={{
                    background: s.bg, borderLeft: `4px solid ${s.border}`,
                    padding: 16, borderRadius: 8, marginBottom: 12
                  }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 4 }}>
                      <span>{d.icon}</span>
                      <span style={{ fontWeight: "bold", fontSize: 14 }}>{d.title}</span>
                    </div>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{d.detail}</p>
                  </div>
                );
              })}
            </>
          )}

          {activeTab === "weather" && (
            <div style={{ background: "rgba(255,255,255,0.03)", padding: 20, borderRadius: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <Gauge label="Temp" value={weather.temperature} unit="°" color="#f59e0b" />
                <Gauge label="Humidity" value={weather.humidity} unit="%" color="#3b82f6" />
                <Gauge label="Rain Prob" value={weather.rain_prob * 100} unit="%" color="#60a5fa" />
                <Gauge label="Evapo" value={weather.evapo * 100} unit="pt" color="#f97316" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
