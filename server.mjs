import express from "express";
import Database from "better-sqlite3";
import cors from "cors";

const app = express();
const db = new Database("wolive.db");

app.use(cors());
app.use(express.json());

// Initialize Table
db.exec(`
  CREATE TABLE IF NOT EXISTS trees (
    tree_id TEXT PRIMARY KEY,
    cultivar TEXT,
    total_co2 REAL,
    latitude REAL,
    longitude REAL
  )
`);

// API Routes
app.get("/api/trees", (req, res) => {
    res.json(db.prepare("SELECT * FROM trees").all());
});

app.post("/api/trees", (req, res) => {
    const t = req.body;
    const stmt = db.prepare("INSERT OR REPLACE INTO trees VALUES (?, ?, ?, ?, ?)");
    stmt.run(t.tree_id, t.cultivar, t.total_co2, t.latitude, t.longitude);
    res.json({ success: true });
});

app.delete("/api/trees", (req, res) => {
    db.prepare("DELETE FROM trees").run();
    res.json({ success: true });
});

app.listen(3000, () => console.log("🚀 Server: http://localhost:3000"));
