import fs from 'fs';
import path from 'path';

const TREES_PATH = path.join(process.cwd(), 'mock', 'trees.json');
const OWNERSHIP_PATH = path.join(process.cwd(), 'mock', 'ownership.json');
const MARKET_WALLET = "DAO_MARKET_RESERVE_WALLET";

function fixRegistry() {
    console.log("🛠️  Repairing Registry Sync...");

    try {
        const trees = JSON.parse(fs.readFileSync(TREES_PATH, 'utf8'));
        let ownership = JSON.parse(fs.readFileSync(OWNERSHIP_PATH, 'utf8'));

        const existingTreeIds = new Set(ownership.map((o: any) => o.tree_id));
        let additions = 0;

        trees.forEach((tree: any) => {
            if (!existingTreeIds.has(tree.tree_id)) {
                // Add missing tree to ownership.json assigned to the DAO
                ownership.push({
                    tree_id: tree.tree_id,
                    wallet: MARKET_WALLET,
                    percentage: 100
                });
                additions++;
                console.log(`[FIXED] Added ${tree.tree_id} to ownership registry.`);
            }
        });

        if (additions > 0) {
            fs.writeFileSync(OWNERSHIP_PATH, JSON.stringify(ownership, null, 2));
            console.log(`✅ Success! ${additions} trees synchronized with ownership ledger.`);
        } else {
            console.log("✨ Registry already perfectly synced. No repairs needed.");
        }
    } catch (e) {
        console.error("❌ Fix Failed:", e.message);
    }
}

fixRegistry();
