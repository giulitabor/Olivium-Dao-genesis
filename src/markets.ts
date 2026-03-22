/* markets.ts - Master Integration [2026-02-20] */
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { createClient } from "@supabase/supabase-js";
import idl from "../idl.json";

// --- CORE CONFIGURATION ---
const PROGRAM_ID = new PublicKey("6HjkwwiKSkr8YCtR9HchVZQ97CmjbBbrW2SeE2U8T6rj");
const ADMIN_WALLET = "8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54";

// Supabase Initialization (Replace placeholders with your env keys)
const sb = createClient("YOUR_SUPABASE_URL", "YOUR_SUPABASE_ANON_KEY");

// Global Tracker for UI State
export const GlobalState = {
    isLocked: false,
    isGenesisHolder: false,
};

/** * [DEBUG] Anchor Program Factory
 */
function getProgram() {
    const solana = (window as any).solana;
    if (!solana) throw new Error("Solana wallet not found.");
    const connection = new Connection("https://api.devnet.solana.com", "confirmed");
    const provider = new AnchorProvider(solana, connection, AnchorProvider.defaultOptions());
    return new Program(idl as any, provider);
}

/**
 * 1. THE ENTRY POINT: initializeMemberPortal
 */
 // market.ts
// import { getProgram, ADMIN_WALLET } from "./config";

 export async function initializeMemberPortal() {
     console.log("[DEBUG] Initializing Neural Link...");
     const btn = document.getElementById('connect-btn');

     try {
         const solana = (window as any).solana;
         if (!solana) return alert("Please install a Solana wallet.");

         // 1. MUST CALL CONNECT FIRST
         await solana.connect();

         // 2. Now initialize the program
         const program = getProgram();
         const wallet = program.provider.publicKey.toBase58();

         // 3. Admin Check [2026-02-07]
         const isAdmin = wallet === ADMIN_WALLET;
         if (isAdmin) console.log("[AUTH] Admin Session Started.");

         // 4. Reveal the UI
         document.getElementById('portal-main')?.classList.remove('opacity-20', 'pointer-events-none');
         if (btn) {
             btn.innerText = wallet.slice(0,6) + "..." + wallet.slice(-4);
             btn.classList.replace('bg-white', 'bg-emerald-400');
         }

         // 5. Trigger Modular Refreshes
         if ((window as any).refreshDashboard) (window as any).refreshDashboard();

     } catch (err: any) {
         if (err.message === "WALLET_NOT_CONNECTED") {
             console.warn("User cancelled or wallet not found.");
         } else {
             console.error("Initialization failed:", err);
         }
         if (btn) btn.innerText = "Connection Failed";
     }
 }

 // Map to window for the HTML button
 (window as any).initializeMemberPortal = initializeMemberPortal;
/**
 * 2. DASHBOARD SYNC: Portfolio, Genesis [2026-02-07], and Lock [2026-01-16]
 */
(window as any).refreshDashboard = async () => {
    console.log("[DEBUG] Syncing Portfolio & Governance...");
    const program = getProgram();
    const wallet = program.provider.publicKey;

    try {
        const [positions, allTrees] = await Promise.all([
            program.account.treePosition.all([{ memcmp: { offset: 8, bytes: wallet.toBase58() } }]),
            program.account.tree.all()
        ]);

        // Identify Genesis Trees (First 3) [2026-02-07]
        const genesisPdas = allTrees.slice(0, 3).map(t => t.publicKey.toBase58());

        let totalFractions = 0;
        let isGenesis = false;
        let hasActiveVoteLock = false;

        positions.forEach(p => {
            const data = p.account;
            totalFractions += data.shares.toNumber() + data.lockedShares.toNumber();
            if (genesisPdas.includes(data.tree.toBase58())) isGenesis = true;
            if (data.hasActiveVote) hasActiveVoteLock = true;
        });

        // Update Global State
        GlobalState.isLocked = hasActiveVoteLock;
        GlobalState.isGenesisHolder = isGenesis;

        // UI Updates
        document.getElementById('total-portfolio-value')!.innerText = `${totalFractions.toLocaleString()} Fractions`;
        document.getElementById('genesis-status-badge')?.classList.toggle('hidden', !isGenesis);
        document.getElementById('global-lock-alert')?.classList.toggle('hidden', !hasActiveVoteLock);

    } catch (err) {
        console.error("Dashboard Sync Error", err);
    }
};

/**
 * 3. DISCOVERY: Field Registry [2026-01-10]
 */
(window as any).loadDiscovery = async () => {
    console.log("[DEBUG] Loading Field Registry...");
    const program = getProgram();
    try {
        const fields = await program.account.field.all();
        const grid = document.getElementById('field-grid');
        if (grid) {
            grid.innerHTML = fields.map(f => `
                <button onclick="window.filterByField('${f.publicKey.toBase58()}')"
                        class="glass p-4 rounded-2xl border border-white/5 hover:border-solana text-left transition-all group">
                    <p class="text-[8px] text-zinc-500 font-black uppercase mb-1">Field</p>
                    <h4 class="text-sm font-black italic uppercase text-white group-hover:text-solana">${f.account.name}</h4>
                </button>
            `).join('');
        }
    } catch (err) { console.error("Field discovery error", err); }
};

/**
 * 4. THE PURCHASE FLOW: With Wallet Lock & Admin Bypass
 */
(window as any).confirmPurchase = async () => {
    const program = getProgram();
    const buyer = program.provider.publicKey;
    const purchaseData = (window as any).currentPurchase;

    // Check Rules [2026-01-16] & [2026-02-07]
    const isAdmin = buyer.toBase58() === ADMIN_WALLET;
    if (GlobalState.isLocked && !isAdmin) {
        return alert("WALLET RESTRICTED: Active governance vote in progress. Market calls disabled.");
    }

    try {
        const amount = parseInt((document.getElementById('buyAmount') as HTMLInputElement).value) || 1;
        const treePda = new PublicKey(purchaseData.treePda);
        const seller = new PublicKey(purchaseData.seller);

        const tx = await program.methods
            .purchaseTreeShares(new BN(amount))
            .accounts({
                buyer: buyer,
                seller: seller,
                tree: treePda,
                // Add remaining accounts as per your IDL...
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        console.log("Purchase Success:", tx);

        // Post-Purchase Sync to DB
        await syncOwnershipToDb(treePda.toBase58(), amount, false);

        alert("Success! Your fractions are being provisioned.");
        (window as any).refreshDashboard();
        (window as any).closeBuyModal();

    } catch (err: any) {
        console.error("Purchase failed", err);
        alert(err.message);
    }
};

/**
 * DB SYNC: Keep Supabase aligned with On-Chain Truth
 */
async function syncOwnershipToDb(treePda: string, shares: number, locked: boolean) {
    const user = (window as any).solana.publicKey.toString();
    console.log(`[DEBUG] Syncing ${shares} shares for ${treePda} to Supabase...`);
    try {
        await sb.from('tree_ownership').upsert({
            tree_pda: treePda,
            wallet_address: user,
            fractions_owned: shares,
            is_locked: locked,
            last_sync: new Date().toISOString()
        });
    } catch (err) { console.error("DB Sync Failed", err); }
}

/**
 * TICKER [2026-02-18]
 */
function updateTicker() {
    const solPrice = (110 + Math.random() * 5).toFixed(2);
    const feed = document.getElementById('dynamic-feed');
    const tickSol = document.getElementById('tick-sol');

    if (tickSol) tickSol.innerText = `$${solPrice}`;
    if (feed) {
        const msgs = ["DAO STABLE", "NETWORK SYNCED", "GENESIS PHASE ACTIVE"];
        feed.innerText = msgs[Math.floor(Math.random() * msgs.length)];
    }
}

// Start Background Loop
setInterval(updateTicker, 5000);
