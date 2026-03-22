import { createClient } from "@supabase/supabase-js";
import { PublicKey } from "@solana/web3.js"; // Ensure this is imported
import { fetchWeatherConsensus } from './weatherEngine';

const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Define this OUTSIDE the class or as a static/private member
const STAKE_PROGRAM_ID = new PublicKey("9ZmtBmwCBy2wvjr6DKBLmddRNu5AGd42S6mYg1thh9bV");

export interface FieldMetrics {
  fieldId: string;
  soilMoisture: number;
  leafWetness: number;
  co2: number;
  temp: number;
  humidity: number;
  uvIndex: number;
  windSpeed: number;
  rainRate: number;
}

export class GenesisOracle {
  private listeners: Function[] = [];
  public metrics: FieldMetrics | null = null;
  public weather: any[] = [];
  public decisions: any[] = [];
  public systemLogs: string[] = [];
  public lastUpdate: Date | null = null;

  public daoStats = {
    totalOlvStaked: 0,
    treeSharesLocked: 0,
    oilYield: 0,
    epochRemaining: "24h 12m"
  };

  constructor() {
    this.systemLogs = [];
    // Explicitly bind methods to ensure 'this' context in callbacks/intervals
    this.addLog = this.addLog.bind(this);
    this.doRefresh = this.doRefresh.bind(this);
    this.evaluate = this.evaluate.bind(this);
    console.log("Oracle Engine Initialized");
  }

  private addLog(msg: string) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    this.systemLogs.unshift(`[${time}] ${msg}`);
    if (this.systemLogs.length > 5) this.systemLogs.pop();
  }

  public async syncDAO(walletPubKey: PublicKey, program: any) {
    try {
      // 1. Fetch OLV Staked
      const [stakePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("stake"), walletPubKey.toBuffer()],
        STAKE_PROGRAM_ID
      );

      const stakeAccount = await program.account.stakeAccount.fetchNullable(stakePda);

      if (stakeAccount) {
        this.daoStats.totalOlvStaked = (stakeAccount.amount?.toNumber() || 0) / 1_000_000_000;
        this.addLog(`STAKE_FOUND: ${this.daoStats.totalOlvStaked.toFixed(2)} OVL`);
      } else {
        this.daoStats.totalOlvStaked = 0;
        this.addLog("STAKE_EMPTY: No OVL locked");
      }

      // 2. Fetch Tree Shares
      const positions = await program.account.treePosition.all([
        { memcmp: { offset: 8, bytes: walletPubKey.toBase58() } }
      ]);
      this.daoStats.treeSharesLocked = positions.reduce((acc: number, p: any) => acc + (p.account.lockedShares?.toNumber() || 0), 0);

      // 3. Oil Yield Simulation
      this.daoStats.oilYield = 84.50 + (Math.random() * 2);

      this.addLog("DAO_SYNC: Verified");
      this.notify();
    } catch (e) {
      console.error(e);
      this.addLog("DAO_SYNC_ERROR: RPC Failure");
    }
  }

  public startHardwareHeartbeat() {
    console.log("🛰️ Initializing Hardware Heartbeat...");
    setInterval(async () => {
  const mockReading = {
    field_id: "FIELD_01",
    soil_moisture: 25 + Math.random() * 5,
    leaf_wetness: Math.random() * 20,
    co2: 410 + Math.random() * 15,
    temperature: 20 + Math.random() * 5,
    humidity: 40 + Math.random() * 10,
    // ADD THESE TO PREVENT UI CRASH:
    uv_index: Math.random() * 5,
    wind_speed: 10 + Math.random() * 10,
    rain_rate: 0,
    lat: 43.1037,
    lon: 10.5784
  };
      const { error } = await sb.from('node_sensors').insert([mockReading]);

      if (!error) {
        console.log("📤 Mock Hardware Pulse Sent");
        this.doRefresh();
      } else {
        console.error("Heartbeat Error:", error.message);
      }
    }, 30000);
  }

  public async doRefresh() {
    try {
      const { data: raw, error } = await sb
        .from('node_sensors')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;

      const searchId = "FIELD_01";
      this.metrics = {
        fieldId: searchId,
        soilMoisture: raw.soil_moisture ?? 0,
        leafWetness: raw.leaf_wetness ?? 0,
        co2: raw.co2 ?? 400,
        temp: raw.temperature ?? 0,
        humidity: raw.humidity ?? 0,
        uvIndex: raw.uv_index ?? 0,
        windSpeed: raw.wind_speed ?? 0,
        rainRate: raw.rain_rate ?? 0
      };

      // Use node location or default
      this.weather = await fetchWeatherConsensus(raw.lat || 43.1, raw.lon || 10.5);

      this.evaluate();
      this.lastUpdate = new Date();
      this.notify();
    } catch (err) {
      console.error("Oracle Refresh Error:", err);
    }
  }

  private evaluate() {
    if (!this.metrics || !this.weather.length) return;
    this.decisions = [];

    const avgRain = this.weather.reduce((a, b) => a + (b.prob || 0), 0) / this.weather.length;

    if (this.metrics.co2 > 420) {
      this.decisions.push({ type: "revenue", label: "OPTIMAL SEQUESTRATION", status: true, val: this.metrics.co2 });
    }

    if (this.metrics.soilMoisture < 25 && avgRain < 0.4) {
      this.decisions.push({ type: "action", label: "IRRIGATE", status: true, val: "DRY" });
    }
  }

  subscribe(callback: Function) {
    this.listeners.push(callback);
  }

  private notify() {
    this.listeners.forEach(fn => fn(this.metrics, this.decisions, this.weather));
  }
}

export const Oracle = new GenesisOracle();
