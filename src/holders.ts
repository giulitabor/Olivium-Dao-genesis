/* holders.ts - Portfolio & Dashboard Sync */
import { getProgram, GlobalState, ADMIN_WALLET } from "./config.js";
import { PublicKey } from "@solana/web3.js";

// Add this at the top of your file if not present
const GlobalState = {
    isLocked: false,
    isGenesisHolder: false
};

(window as any).refreshDashboard = async () => {
    console.log("[DEBUG] Starting Dashboard Sync...");

    // Ensure wallet is connected
    const wallet = (window as any).solana.publicKey;
    if (!wallet) return;

    const program = getProgram();

    try {
        // 1. Fetch User Positions & Tree Registry
        const [positions, allTrees] = await Promise.all([
            program.account.treePosition.all([{ memcmp: { offset: 8, bytes: wallet.toBase58() } }]),
            program.account.tree.all()
        ]);

        // 2. Calculate Aggregated Portfolio Value
        let totalShares = 0;
        let globalLockActive = false;

        positions.forEach(p => {
            // totalShares = Liquid + Locked
            totalShares += p.account.shares.toNumber() + p.account.lockedShares.toNumber();

            // [2026-01-16] Global Lock Check
            if (p.account.hasActiveVote) {
                globalLockActive = true;
            }
        });

        // 3. Genesis Check [2026-02-07] - First 3 Trees in Registry
        const genesisPDAs = allTrees.slice(0, 3).map(t => t.publicKey.toBase58());
        const isGenesisHolder = positions.some(p => genesisPDAs.includes(p.account.tree.toBase58()));

        // 4. Update Global State
        GlobalState.isLocked = globalLockActive;
        GlobalState.isGenesisHolder = isGenesisHolder;

        // 5. UPDATE UI - Matching your HTML ID exactly
        const portfolioEl = document.getElementById('total-portfolio-value');
        if (portfolioEl) {
            portfolioEl.innerText = totalShares.toLocaleString();
        }

        // Update Genesis Status UI if it exists
        const genesisEl = document.getElementById('genesis-status-text');
        if (genesisEl) {
            genesisEl.innerText = isGenesisHolder ? "ACTIVE" : "INACTIVE";
            genesisEl.className = isGenesisHolder ? "text-4xl font-black italic text-emerald-400 uppercase" : "text-4xl font-black italic text-zinc-800 uppercase";
        }

        // Update Lock Status UI [2026-02-07] Admin Bypass
        const isAdmin = wallet.toBase58() === ADMIN_WALLET;
        const lockStatusEl = document.getElementById('lock-status');
        if (lockStatusEl) {
            if (globalLockActive && !isAdmin) {
                lockStatusEl.innerText = "🚫 WALLET LOCKED";
                lockStatusEl.classList.add('text-red-500', 'animate-pulse');
            } else {
                lockStatusEl.innerText = isAdmin ? "⚡ ADMIN ACCESS" : "✅ VERIFIED MEMBER";
                lockStatusEl.classList.remove('text-red-500', 'animate-pulse');
                lockStatusEl.classList.add('text-emerald-400');
            }
        }

    } catch (err) {
        console.error("[CRITICAL] Dashboard Sync Failed:", err);
    }
};
/**
 * UI BINDER - Maps data to the HTML IDs from the PRO Template
 */
function updateDashboardUI(shares: number, locked: boolean, genesis: boolean) {
    const valueEl = document.getElementById('total-portfolio-value');
    const lockAlert = document.getElementById('global-lock-alert');
    const genesisBadge = document.getElementById('genesis-status-badge');
    const mainPortal = document.getElementById('portal-main');

    if (valueEl) valueEl.innerText = `${shares.toLocaleString()} Fractions`;

    // [2026-01-16] Wallet Restriction UI
    if (lockAlert) {
        lockAlert.classList.toggle('hidden', !locked);
        if (locked) {
            console.log("[UI] Applying Governance Lock Overlay");
            mainPortal?.classList.add('opacity-80');
        }
    }

    // [2026-02-07] Genesis Badge
    if (genesisBadge) {
        genesisBadge.classList.toggle('hidden', !genesis);
    }
}

/**
 * [2026-01-10] Field Discovery Logic
 * Browses Fields first, then Trees.
 */
(window as any).loadDiscovery = async () => {
    const grid = document.getElementById('field-grid');
    if (!grid) return;

    console.log("[DEBUG] Loading Field Registry...");
    const program = getProgram();

    try {
        const fields = await program.account.field.all();

        grid.innerHTML = fields.map(f => `
            <button onclick="window.filterByField('${f.publicKey.toBase58()}')"
                    class="glass p-4 rounded-2xl border border-white/5 hover:border-solana text-left transition-all group">
                <p class="text-[8px] text-zinc-500 font-black uppercase mb-1">Field Cluster</p>
                <h4 class="text-sm font-black italic uppercase text-white group-hover:text-solana">${f.account.name}</h4>
            </button>
        `).join('');
    } catch (err) {
        console.error("[DEBUG] Field Load Error:", err);
    }
};

// Initializer Hook
window.addEventListener('load', () => {
    console.log("[MODULE] holders.ts ready.");
});
