// generateTrees.ts
import fs from "fs";

const trees = [];

for (let i = 1; i <= 240; i++) {
  trees.push({
    tree_id: `F1-MO-${String(i).padStart(3, "0")}`,
    status: "active",
    health_score: Number((0.85 + Math.random() * 0.1).toFixed(2)),
    base_yield_kg: Number((21 + Math.random() * 2.5).toFixed(1))
  });
}

fs.writeFileSync(
  "trees.json",
  JSON.stringify(trees, null, 2)
);
