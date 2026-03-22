// distribution.ts

export interface TreeRow {
  tree_id: string;
  status: "active" | "inactive";
  health_score: number;
  base_yield_kg: number;
}

export interface OwnershipRow {
  tree_id: string;
  wallet: string;
  percentage: number;
}

export interface DistributionInput {
  field_id: string;
  period: string;
  oil_liters: number;
  oil_price_per_l: number;
  verified_co2_kg: number;
  carbon_price_per_kg: number;
  trees: TreeRow[];
  ownerships: OwnershipRow[];
}

export interface WalletResult {
  trees: number;
  revenue: number;
  co2_kg: number;
}

// Ensure this name matches what commitDistribution.ts imports
export interface DistributionSnapshot {
  distribution_id: string;
  field_id: string;
  period: string;
  totals: {
    oil_revenue: number;
    carbon_revenue: number;
    field_revenue: number;
  };
  wallets: Record<string, WalletResult>;
  snapshot_hash?: string;
}

export function runDistribution(input: DistributionInput): DistributionSnapshot {
  const activeTrees = input.trees.filter(t => t.status === "active" && t.health_score > 0);

  const weights = new Map<string, number>();
  let totalWeight = 0;

  for (const t of activeTrees) {
    const w = t.base_yield_kg * t.health_score;
    weights.set(t.tree_id, w);
    totalWeight += w;
  }

  const oilRevenue = input.oil_liters * input.oil_price_per_l;
  const carbonRevenue = input.verified_co2_kg * input.carbon_price_per_kg;
  const fieldRevenue = oilRevenue + carbonRevenue;

  const wallets: Record<string, WalletResult> = {};

  for (const o of input.ownerships) {
    const w = weights.get(o.tree_id);
    if (!w) continue;

    const treeShare = w / totalWeight;
    const treeRevenue = treeShare * fieldRevenue;
    const treeCo2 = treeShare * input.verified_co2_kg;

    const ownerRevenue = treeRevenue * (o.percentage / 100);
    const ownerCo2 = treeCo2 * (o.percentage / 100);

    if (!wallets[o.wallet]) {
      wallets[o.wallet] = { trees: 0, revenue: 0, co2_kg: 0 };
    }

    wallets[o.wallet].trees += 1;
    wallets[o.wallet].revenue += ownerRevenue;
    wallets[o.wallet].co2_kg += ownerCo2;
  }

  return {
    distribution_id: `${input.field_id}-${input.period}`,
    field_id: input.field_id,
    period: input.period,
    totals: {
      oil_revenue: oilRevenue,
      carbon_revenue: carbonRevenue,
      field_revenue: fieldRevenue
    },
    wallets
  };
}
