import './polyfill';import * as anchor from "@coral-xyz/anchor";

// main.ts

import { runDistribution } from "./distribution";

(window as any).runSimulation = async () => {
  const trees = await fetch("/mock/trees.json").then(r => r.json());
  const ownerships = await fetch("/mock/ownership.json").then(r => r.json());

  const snapshot = runDistribution({
    field_id: "F1",
    period: "2025-H1",
    oil_liters: 18250,
    oil_price_per_l: 7.5,
    verified_co2_kg: 94000,
    carbon_price_per_kg: 0.035,
    trees,
    ownerships
  });

  document.getElementById("output")!.textContent =
    JSON.stringify(snapshot, null, 2);

  console.log("DISTRIBUTION SNAPSHOT", snapshot);
};
