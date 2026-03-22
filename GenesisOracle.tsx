import { useState, useEffect, useCallback } from "react";

type Weather = {
  temperature: number;
  humidity: number;
  wind: number;
  rain_prob: number;
  evapo: number;
  soil_moisture_modeled: number;
  source?: string;
};

type Decision = {
  id: string;
  type: string;
  severity: string;
  title: string;
  detail: string;
  icon: string;
};

export default function GenesisOracle() {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [sensor, setSensor] = useState({ soilMoisture: 22 });
  const [loading, setLoading] = useState(true);

  const API = "http://localhost:3000";

  const refresh = useCallback(async () => {
    try {
      setLoading(true);

      const res = await fetch(`${API}/oracle/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sensor }),
      });

      const data = await res.json();

      setWeather(data.weather);
      setDecisions(data.decisions);

    } catch (err) {
      console.error("API error:", err);
    } finally {
      setLoading(false);
    }
  }, [sensor]);

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const t = setInterval(refresh, 60000);
    return () => clearInterval(t);
  }, [refresh]);

  if (loading) return <div style={{ padding: 40 }}>Loading...</div>;

  return (
    <div style={{ padding: 20, fontFamily: "system-ui" }}>
      <h1>🌿 Genesis Oracle</h1>

      <button onClick={refresh}>Refresh</button>

      {weather && (
        <div style={{ marginTop: 20 }}>
          <h3>Weather</h3>
          <p>Temp: {weather.temperature}°C</p>
          <p>Humidity: {weather.humidity}%</p>
          <p>Evapo: {weather.evapo}</p>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <h3>Decisions</h3>
        {decisions.map((d) => (
          <div key={d.id} style={{ marginBottom: 10 }}>
            <strong>{d.title}</strong>
            <p>{d.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
