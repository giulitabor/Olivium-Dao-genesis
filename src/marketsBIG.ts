/* init-market.ts - [2026-02-11] Member Portal & Governance Logic */
import './polyfill';
import { Connection, PublicKey, clusterApiUrl, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { createClient } from "@supabase/supabase-js";
import idl from "../idl.json";

// --- CONFIGURATION ---
const PROGRAM_ID = new PublicKey("9ZmtBmwCBy2wvjr6DKBLmddRNu5AGd42S6mYg1thh9bV");
// Olive DAO Config [2026-02-08]
const DAO_VAULT = new PublicKey("FrNP32Hxhuu4pS8yguHhtTEdU9QpU7odRYi5zKNps15N");
const OLV_MINT = new PublicKey("6nab5Rttp45AfjaYrdwGxKuH9vK9RKCJdeaBvQJt8pLA");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const ADMIN_WALLET = "8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54";
const RENT_SAFE_MIN_SOL = 0.01; // [2026-02-07] Genesis standard

const solConn = new Connection(clusterApiUrl("devnet"), "confirmed");
const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);

// Define a safe reference at the top of your file
const getSolanaWeb3 = () => {
    return (window as any).solanaWeb3 ||
           (window as any).solanaWeb3js ||
           (window as any)["@solana/web3.js"];
};

// App State
let userWallet: PublicKey | null = null;
let trees: any[] = [];
let isUserLocked = false;


/**
 * HELPER: Safe Program Initializer (Matches admin.ts logic)
 */
const getProgram = () => {
    const wallet = (window as any).solana;
    if (!wallet || !wallet.publicKey) throw new Error("Connect Wallet First");
    const provider = new AnchorProvider(solConn, wallet, { commitment: "confirmed" });
    return new Program(idl as any, provider);
};
const checkProvider = async () => {
    try {
        // Force a ping to the provider to re-establish the port
        await (window as any).solana.isConnected;
    } catch (e) {
        console.warn("🔄 Phantom port disconnected. Reconnecting...");
        await (window as any).solana.connect();
    }
};
/**
 * [2026-02-16] Holder Logic: Market & Asset Discovery
 */

// Tab Management
(window as any).switchTab = (view: 'market' | 'assets') => {
    document.getElementById('view-market')?.classList.toggle('hidden', view !== 'market');
    document.getElementById('view-assets')?.classList.toggle('hidden', view !== 'assets');

    document.getElementById('tab-market')?.classList.toggle('text-solana', view === 'market');
    document.getElementById('tab-market')?.classList.toggle('border-solana', view === 'market');
    document.getElementById('tab-assets')?.classList.toggle('text-solana', view === 'assets');
    document.getElementById('tab-assets')?.classList.toggle('border-solana', view === 'assets');

    if (view === 'assets') loadMyAssets();
    else loadMarketplace();
};

// Load All Live Market Listings
async function loadMarketplace() {
    const grid = document.getElementById('market-grid');
    if (!grid) return;

    const program = (window as any).getProgram();
    const listings = await program.account.treeListing.all();

    grid.innerHTML = listings.map((l: any) => `
        <div class="glass p-6 rounded-[2rem] border border-white/5 hover:border-solana/30 transition-all group">
            <div class="flex justify-between items-start mb-4">
                <h4 class="text-xl font-black italic uppercase text-white">Tree Listing</h4>
                <span class="text-[10px] bg-solana/10 text-solana px-2 py-1 rounded font-bold">FOR SALE</span>
            </div>
            <div class="space-y-2 mb-6">
                <div class="flex justify-between text-[10px] uppercase font-bold text-zinc-500">
                    <span>Available</span>
                    <span class="text-white">${l.account.shares.toString()} Fractions</span>
                </div>
                <div class="flex justify-between text-[10px] uppercase font-bold text-zinc-500">
                    <span>Price</span>
                    <span class="text-emerald-400">${(l.account.price.toNumber() / 1e6).toFixed(2)} USDC</span>
                </div>
            </div>
            <button onclick="openDeepModal('${l.account.tree.toBase58()}')" class="w-full py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-widest group-hover:bg-white group-hover:text-black transition-all">Inspect Tree</button>
        </div>
    `).join('');
}

// Load Authenticated User Assets
async function loadMyAssets() {
    const grid = document.getElementById('assets-grid');
    if (!grid) return;

    // 1. Show Skeletons Immediately
    grid.innerHTML = Array(3).fill(0).map(() => `
        <div class="glass p-6 rounded-[2rem] border border-white/5 bg-white/[0.01]">
            <div class="skeleton h-4 w-12 rounded mb-4"></div>
            <div class="skeleton h-8 w-32 rounded mb-6"></div>
            <div class="grid grid-cols-2 gap-4 mb-6">
                <div class="bg-black/40 p-3 rounded-xl border border-white/5">
                    <div class="skeleton h-2 w-8 rounded mb-2"></div>
                    <div class="skeleton h-6 w-12 rounded"></div>
                </div>
                <div class="bg-black/40 p-3 rounded-xl border border-white/5">
                    <div class="skeleton h-2 w-8 rounded mb-2"></div>
                    <div class="skeleton h-6 w-12 rounded"></div>
                </div>
            </div>
            <div class="skeleton h-12 w-full rounded-xl"></div>
        </div>
    `).join('');

    const wallet = (window as any).solana.publicKey;
    if (!wallet) {
        grid.innerHTML = `<p class="text-zinc-500 text-[10px] uppercase p-4 border border-dashed border-white/10 rounded-2xl w-full text-center">Connect Wallet to sync assets</p>`;
        return;
    }

    try {
        const program = getProgram();

        // Fetch positions
        const positions = await program.account.treePosition.all([
            { memcmp: { offset: 8, bytes: wallet.toBase58() } }
        ]);

        if (positions.length === 0) {
            grid.innerHTML = `
                <div class="col-span-full py-20 text-center border border-dashed border-white/10 rounded-[2.5rem]">
                    <p class="text-zinc-600 uppercase text-[10px] font-black tracking-widest">No fractional assets found in this wallet</p>
                </div>`;
            return;
        }

        // Fetch tree names for each position
        const hydratedPositions = await Promise.all(positions.map(async (p: any) => {
            try {
                const treeData = await program.account.tree.fetch(p.account.tree);
                return { ...p, treeId: treeData.treeId };
            } catch {
                return { ...p, treeId: "Unknown Tree" };
            }
        }));

        // 2. Replace Skeletons with Real Data
        grid.innerHTML = hydratedPositions.map((p: any) => `
            <div class="glass p-6 rounded-[2rem] border border-white/5 bg-emerald-500/[0.02] hover:border-emerald-500/30 transition-all group">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <span class="text-[8px] bg-white/5 text-zinc-400 px-2 py-0.5 rounded uppercase font-black">Asset</span>
                        <h4 class="text-xl font-black italic text-white mt-1 group-hover:text-emerald-400 transition-colors">${p.treeId}</h4>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4 mb-6">
                    <div class="bg-black/40 p-3 rounded-xl border border-white/5">
                        <p class="text-[8px] text-zinc-500 uppercase font-black tracking-widest">Liquid</p>
                        <p class="text-lg font-black text-white">${p.account.shares.toString()}</p>
                    </div>
                    <div class="bg-black/40 p-3 rounded-xl border border-white/5">
                        <p class="text-[8px] text-zinc-500 uppercase font-black tracking-widest">Locked</p>
                        <p class="text-lg font-black text-amber-500">${p.account.lockedShares.toString()}</p>
                    </div>
                </div>

                <div class="flex gap-2">
                    <button onclick="window.openTreeModal('${p.account.tree.toBase58()}')"
                            class="flex-1 py-3 bg-emerald-500 text-black rounded-xl text-[9px] font-black uppercase tracking-widest hover:brightness-110 transition-all">
                        Manage / Sell
                    </button>
                    <button onclick="window.openDeepModal('${p.account.tree.toBase58()}')"
                            class="w-12 h-12 flex items-center justify-center bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all">
                        <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
                    </button>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error("Failed to load user assets:", err);
        grid.innerHTML = `<div class="p-4 border border-red-500/20 rounded-xl text-red-500 text-[10px] uppercase font-black">Sync Error: RPC Timeout</div>`;
    }
}
/**
 * [2026-02-23] Deep Analytics Modal - Real Data Mapping
 */
(window as any).openDeepModal = async (treePdaStr: string) => {
    const modal = document.getElementById('deepTreeModal');
    const content = document.getElementById('modal-content-deep');
    if (!modal || !content) return;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.classList.add('modal-open'); // Prevent background scroll

    // Shimmering Skeleton Loader
    content.innerHTML = `
        <div class="animate-pulse">
            <div class="h-12 bg-white/5 rounded-2xl w-1/4 mb-8"></div>
            <div class="grid grid-cols-12 gap-6">
                <div class="col-span-4 h-64 bg-white/5 rounded-[2rem]"></div>
                <div class="col-span-8 h-64 bg-white/5 rounded-[2rem]"></div>
            </div>
        </div>
    `;

    try {
        const program = getProgram();
        const treeData: any = await program.account.tree.fetch(new PublicKey(treePdaStr));
        const treeId = treeData.treeId;

        // Fetch the REAL biological data from Supabase
        const { data: meta, error } = await sb
            .from('tree_metadata')
            .select('*')
            .eq('tree_id', treeId)
            .maybeSingle();

        if (error) console.error("Supabase Bio Fetch Error:", error);

        // Map Real Data with Fallbacks
        const cultivar = meta?.variety || "Picual"; // Real cultivar from DB
        const age = meta?.age_years || "6";        // Real age from DB
        const field = meta?.field_id || "A-1";      // Real field ID
        const lat = meta?.latitude || 37.9922;
        const lng = meta?.longitude || -3.4611;
        const health = meta?.health_score || 0.98;

        content.innerHTML = `
            <div class="flex justify-between items-start mb-10">
                <div>
                    <div class="flex items-center gap-4">
                        <h2 class="text-5xl md:text-7xl font-black italic text-white tracking-tighter uppercase leading-none">${treeId}</h2>
                        <div class="flex flex-col">
                            <span class="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-[9px] font-black rounded-full border border-emerald-500/20 tracking-widest uppercase">Bio-Link Active</span>
                        </div>
                    </div>
                    <p class="text-zinc-600 font-mono text-[10px] mt-4 tracking-tighter uppercase">Chain Registry: ${treePdaStr}</p>
                </div>
                <button onclick="window.closeDeepModal()" class="text-5xl text-zinc-800 hover:text-white transition-all hover:rotate-90">×</button>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-10">
                <div class="lg:col-span-4 space-y-6">
                    <div class="glass p-8 rounded-[2.5rem] border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent">
                        <h3 class="text-[10px] text-zinc-500 uppercase font-black mb-8 tracking-[0.2em] flex items-center gap-2">
                            <span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span> Biological DNA
                        </h3>
                        <div class="space-y-6">
                            <div>
                                <p class="text-[9px] text-zinc-500 uppercase font-bold mb-1">Cultivar / Variety</p>
                                <p class="text-xl font-black text-white italic uppercase tracking-tight">${cultivar}</p>
                            </div>
                            <div>
                                <p class="text-[9px] text-zinc-500 uppercase font-bold mb-1">Specimen Maturity</p>
                                <p class="text-xl font-black text-white italic uppercase tracking-tight">${age} Productive Years</p>
                            </div>
                            <div>
                                <p class="text-[9px] text-zinc-500 uppercase font-bold mb-1">Field Localization</p>
                                <p class="text-xl font-black text-emerald-500 italic uppercase tracking-tight">${field}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="lg:col-span-8">
                    <div class="relative h-full min-h-[400px] w-full bg-black/50 rounded-[3rem] border border-white/10 overflow-hidden group">
                        <iframe
                            width="100%" height="100%" frameborder="0"
                            style="filter: grayscale(1) invert(0.9) contrast(1.5) brightness(0.8); opacity: 0.7;"
                            src="https://maps.google.com/maps?q=${lat},${lng}&t=k&z=20&ie=UTF8&iwloc=&output=embed">
                        </iframe>
                        <div class="absolute inset-0 pointer-events-none border-[20px] border-black/20 rounded-[3rem]"></div>
                        <div class="absolute top-6 right-6 glass px-4 py-2 rounded-full border-white/10">
                            <span class="text-[9px] font-black text-emerald-500 tracking-widest uppercase">Satellite Uplink: HD</span>
                        </div>
                        <div class="absolute bottom-8 left-8">
                            <p class="text-[10px] font-mono text-white/50 mb-1 uppercase tracking-widest">Coordinates</p>
                            <p class="text-sm font-black text-white mono">${lat.toFixed(6)}° N, ${lng.toFixed(6)}° W</p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div class="bg-white/[0.03] p-6 rounded-[2rem] border border-white/5">
                    <p class="text-[9px] text-zinc-500 uppercase font-black mb-2">Neural Health</p>
                    <p class="text-3xl font-black text-emerald-400 tracking-tighter">${(health * 100).toFixed(0)}%</p>
                </div>
                <div class="bg-white/[0.03] p-6 rounded-[2rem] border border-white/5">
                    <p class="text-[9px] text-zinc-500 uppercase font-black mb-2">Carbon Offset</p>
                    <p class="text-3xl font-black text-blue-400 tracking-tighter">${(health * 24.5).toFixed(1)}<span class="text-xs ml-1">kg</span></p>
                </div>
                <div class="bg-white/[0.03] p-6 rounded-[2rem] border border-white/5">
                    <p class="text-[9px] text-zinc-500 uppercase font-black mb-2">Est. ROI</p>
                    <p class="text-3xl font-black text-amber-500 tracking-tighter">${(8.4 + (health * 3)).toFixed(1)}%</p>
                </div>
                <div class="bg-white/[0.03] p-6 rounded-[2rem] border border-white/5">
                    <p class="text-[9px] text-zinc-500 uppercase font-black mb-2">Last Audit</p>
                    <p class="text-xs font-black text-white mt-3 uppercase tracking-widest">Feb 2026</p>
                </div>
            </div>
        `;
    } catch (e) {
        console.error(e);
        content.innerHTML = `<div class="p-20 text-center text-red-500 font-black uppercase">Telemetry Connection Lost</div>`;
    }
};
/**
 * Update UI Elements directly in the DOM
 */
const updateDashboardUI = (total: number, genesis: boolean, locked: boolean) => {
    // Total Fractions
    const totalEl = document.getElementById('total-portfolio-value');
    if (totalEl) totalEl.innerText = total.toLocaleString();
}
// --- WALLET CONNECT ---
(window as any).connectWallet = async () => {
  await checkProvider(); // Re-establish heartbeats
    try {
        const { solana } = window as any;
        if (!solana) return alert("Phantom not found");

        const resp = await solana.connect();
        const userPubKey = resp.publicKey.toString();

        const btn = document.getElementById('connect-btn');
        if (btn) btn.innerText = `● ${userPubKey.slice(0,4)}...${userPubKey.slice(-4)}`;

        // Trigger asset loading immediately
        console.log("🚀 Connection confirmed, syncing assets...");
                await loadMyAssets();
            // Also refresh the market and registry for context
            if ((window as any).refreshListedSales) (window as any).refreshListedSales();
            if ((window as any).loadDeepOwnershipRegistry) (window as any).loadDeepOwnershipRegistry();
        await fetchOnChainBalances();

        await refreshListedSales();
    } catch (err) { console.error("Auth Fail:", err); }
};



/**
 * [2026-02-11] Initialize Portal Connection
 */
(window as any).initializeMemberPortal = async () => {
  console.log("First try");

    try {
        const { solana } = window as any;
        if (!solana) return alert("Solana wallet not found. Please install Phantom.");

        const resp = await solana.connect();
        userWallet = resp.publicKey;

        // Trigger Compliance Modal
        document.getElementById('tos-modal')?.classList.remove('hidden');
    } catch (err) {
        console.error("Connection failed:", err);
    }
};

/**
 * [2026-01-16] Compliance Signature & Data Fetching
 */
 /**
  * [2026-01-16] Compliance Signature & Data Fetching
  * This reveals the UI after the user accepts the TOS.
  */
 (window as any).signAndInitialize = async () => {
     // Ensure we have a wallet reference before proceeding
     const wallet = (window as any).solana?.publicKey;
     if (!wallet) {
         alert("Wallet connection lost. Please reconnect.");
         return;
     }

     try {
         // 1. UI UPDATES: Reveal the dashboard
         document.getElementById('tos-modal')?.classList.add('hidden');

         const mainContent = document.getElementById('main-content');
         if (mainContent) {
             // Remove the 'hidden' or opacity classes hindering visibility
             mainContent.classList.remove('opacity-20', 'pointer-events-none', 'hidden');
             mainContent.style.opacity = "1";
             // Remove the blur effect and reset opacity
        mainContent.style.filter = "none";
         }

         document.getElementById('btn-connect')?.classList.add('hidden');
         document.getElementById('wallet-pill')?.classList.remove('hidden');

         const addrEl = document.getElementById('display-addr');
         if (addrEl) {
             addrEl.innerText = `${wallet.toString().slice(0, 4)}...${wallet.toString().slice(-4)}`;
         }

         // 2. DATA SYNC: Fetch on-chain state
         await fetchOnChainBalances();
         await loadOnChainMarket();

         // 3. Start Ticker Loop
         setInterval(updateTickerPrices, 5000);

         console.log("Portal Initialized Successfully");

     } catch (err) {
         console.error("Initialization failed:", err);
     }
 };
/**
 * Audit all fraction holders for the first 3 genesis trees
 */
async function auditTreeOwners() {
    const provider = new AnchorProvider(SOL_CONN, (window as any).solana, { commitment: "confirmed" });
    const program = new Program(idl as any, provider);

    try {
        // 1. Fetch On-Chain Trees
        const allTrees = await program.account.tree.all();

        // 2. Genesis Rule: Apply logic only to the first 3 trees [2026-02-07]
        const genesisTrees = allTrees.slice(0, 3);

        console.log("📜 --- OLIVE DAO ON-CHAIN REGISTRY ---");

        for (const treeAccount of genesisTrees) {
            const treePubKey = treeAccount.publicKey;
            const treeId = treeAccount.account.treeId; // e.g., "F1-FR-01"

            // 3. Find all TreePosition accounts for this specific tree
            // Offset 40 in TreePosition is where the 'tree' Pubkey field starts
            // (8 discriminator + 32 owner = 40)
            const positions = await program.account.treePosition.all([
                {
                    memcmp: {
                        offset: 40,
                        bytes: treePubKey.toBase58(),
                    }
                }
            ]);

            console.group(`🌳 Tree ID: ${treeId}`);
            console.log(`PDA: ${treePubKey.toBase58()}`);

            if (positions.length === 0) {
                console.log("Status: 100% Treasury Held (No external owners)");
            } else {
                positions.forEach((pos: any) => {
                    const data = pos.account;
                    console.log(`-> Owner: ${data.owner.toBase58()}`);
                    console.log(`   Shares: ${data.shares.toString()}`);
                    console.log(`   Voted: ${data.hasActiveVote ? "🚫 YES (LOCKED)" : "✅ NO"}`);
                });
            }
            console.groupEnd();
        }
    } catch (err) {
        console.error("Audit failed:", err);
    }
}
async function refreshPortalData() {
    await fetchOnChainBalances();
    await loadOnChainMarket();
}

function updateTickerPrices() {
    // Generate prices
    const solPrice = (110 + Math.random() * 5).toFixed(2);
    const olvPrice = "0.82";
    const oilPrice = (4.50 + Math.random() * 0.5).toFixed(2);

    // Update main set
    const elements = {
        'tick-sol': `$${solPrice}`,
        'tick-olv': `$${olvPrice}`,
        'tick-oil': `$${oilPrice}`,
        'tick-co2': `$83.65`,
        'tick-usdc': `$1.00`
    };

    // Update both main and copy elements for seamless loop
    Object.entries(elements).forEach(([id, value]) => {
        const el = document.getElementById(id);
        const elCopy = document.getElementById(`${id}-copy`);
        if (el) el.innerText = value;
        if (elCopy) elCopy.innerText = value;
    });

    // Dynamic DAO Feed Logic
    const feed = document.getElementById('dynamic-feed');
    if (feed) {
        const events = [
            "DAO AUTHORITY VERIFIED",
            "MARKET LIQUIDITY STABLE",
            "NEW HARVEST REPORTED",
            "GENESIS PLANTING ACTIVE [2026-02-07]"
        ];
        feed.innerText = events[Math.floor(Math.random() * events.length)];
    }
}

// Initialize the ticker cycle
setInterval(updateTickerPrices, 5000);
updateTickerPrices();

/* openTreeModal - [2026-02-23] FULL VERSION */
/* openTreeModal - [2026-02-23] DEBUGGED VERSION */
/* openTreeModal - [2026-02-23] FINAL PRODUCTION VERSION */
(window as any).openTreeModal = async (treePdaStr: string) => {
    const modal = document.getElementById('treeModal');
    if (!modal) return;

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.innerHTML = `<div class="p-8 text-white font-black italic animate-pulse text-center">SYNCHRONIZING SECURE LEDGER...</div>`;

    try {
        const program = getProgram();
        const treePda = new PublicKey(treePdaStr);
        const wallet = (window as any).solana.publicKey;

        // 1. Fetch Tree & Global Config
        const treeData = await program.account.tree.fetch(treePda);
        const treeId = treeData.tree_id || (treeData as any).treeId;

        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
        const config = await program.account.globalConfig.fetch(configPda);
        const isAdmin = wallet.toBase58() === config.admin.toBase58();

        // 2. Fetch User Position - IDL SEEDS: ["position", tree, owner]
        let userShares = 0;
        let hasVoted = false;
        let lockUntil = 0;

        try {
            const [posPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("position"), treePda.toBuffer(), wallet.toBuffer()],
                program.programId
            );
            const pos = await program.account.treePosition.fetch(posPda);

            // Normalize BN and Field Names
            userShares = pos.shares ? pos.shares.toNumber() : 0;
            hasVoted = pos.has_active_vote || (pos as any).hasActiveVote || false;
            lockUntil = (pos.lock_until || (pos as any).lockUntil)?.toNumber() || 0;
        } catch (e) {
            console.log("No position record found for this wallet.");
        }

        // 3. Check for Active Listing - SEEDS: ["listing", seller, tree]
        let activeListing: any = null;
        try {
            const [listPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("listing"), wallet.toBuffer(), treePda.toBuffer()],
                program.programId
            );
            activeListing = await program.account.listing.fetch(listPda);
        } catch (e) { /* No listing exists */ }

        // 4. Rule Processing [cite: 2026-01-16, 2026-02-07]
        const currentTime = Math.floor(Date.now() / 1000);
        const isLocked = hasVoted && !isAdmin; // Admin bypasses wallet lock
        const isCooldown = !isAdmin && lockUntil > currentTime; // Admin bypasses 36h
        const isGenesis = ["F1-FR-001", "F1-FR-002", "F1-FR-003"].includes(treeId);

        // 5. Render UI
        modal.innerHTML = `
            <div class="glass p-8 rounded-[2.5rem] max-w-lg w-full border border-white/10 relative overflow-hidden">
                <div class="flex justify-between items-start mb-6">
                    <div>
                        <h2 class="text-3xl font-black italic text-white uppercase">${treeId}</h2>
                        <p class="text-[10px] text-emerald-400 font-bold uppercase italic tracking-widest">Specimen Management</p>
                    </div>
                    <button onclick="window.closeTreeModal()" class="text-2xl text-zinc-500 hover:text-white">✕</button>
                </div>

                <div class="p-6 bg-white/5 rounded-3xl border border-white/10 mb-6">
                    <p class="text-[8px] uppercase text-zinc-500 font-bold mb-1">Staked Portfolio</p>
                    <div class="flex items-baseline gap-2">
                        <span class="text-4xl font-black italic text-white">${userShares}</span>
                        <span class="text-xs font-bold text-zinc-500 uppercase italic">Shares</span>
                    </div>
                </div>

                <div class="space-y-4">
                    ${isLocked ? `
                        <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-[10px] text-center font-bold uppercase italic">
                            🚫 Wallet Locked: Active Vote [cite: 2026-01-16]
                        </div>
                    ` : isCooldown ? `
                        <div class="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-500 text-[10px] text-center font-bold uppercase italic">
                            ⏳ Cooldown: Locked for ${Math.ceil((lockUntil - currentTime)/3600)}h
                        </div>
                    ` : activeListing ? `
                        <div class="p-5 bg-emerald-500/5 border border-emerald-500/20 rounded-3xl">
                            <p class="text-[10px] text-emerald-400 font-bold uppercase mb-4 text-center tracking-widest">
                                Active Listing: ${activeListing.shares.toString()} @ ${(activeListing.price.toNumber()/1e9).toFixed(3)} SOL
                            </p>
                            <button onclick="window.handleCancelListing('${treePdaStr}')" class="w-full py-4 bg-red-500 text-white font-black italic rounded-2xl uppercase hover:bg-red-600 transition-all shadow-lg shadow-red-500/20">
                                Cancel & Unlist Asset
                            </button>
                        </div>
                    ` : `
                        <div class="space-y-3">
                            <div class="grid grid-cols-2 gap-3">
                                <div class="space-y-1">
                                    <label class="text-[8px] text-zinc-500 font-bold uppercase px-2">Price (SOL)</label>
                                    <input id="listPrice" type="number" step="0.01" placeholder="1.0" class="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white font-bold italic outline-none focus:border-emerald-400">
                                </div>
                                <div class="space-y-1">
                                    <label class="text-[8px] text-zinc-500 font-bold uppercase px-2">Shares</label>
                                    <input id="listAmount" type="number" placeholder="${userShares}" class="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white font-bold italic outline-none focus:border-emerald-400">
                                </div>
                            </div>
                            <button onclick="window.handleListTree('${treePdaStr}')" class="w-full py-4 bg-white text-black font-black italic rounded-2xl uppercase hover:bg-emerald-400 transition-all active:scale-95">
                                List Asset for Sale
                            </button>
                        </div>
                    `}

                    ${(isAdmin && isGenesis) ? `
                        <div class="pt-4 border-t border-white/5">
                            <button onclick="window.handleGenesisGift('${treePdaStr}')" class="w-full py-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-black italic rounded-xl uppercase hover:bg-emerald-500 hover:text-white transition-all">
                                Admin Genesis Injection [cite: 2026-02-07]
                            </button>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;

    } catch (err: any) {
        console.error("Critical Render Error:", err);
        modal.innerHTML = `<div class="p-8 text-red-500 font-bold text-center uppercase italic text-xs">Sync Failed: Asset Account Mismatch</div>`;
    }
};
/** * UI PROTECTION: Validates inputs in real-time to prevent empty/low-value listings
 */
(window as any).validateListingInputs = () => {
    const priceInput = document.getElementById('listPrice') as HTMLInputElement;
    const amountInput = document.getElementById('listAmount') as HTMLInputElement;
    const listBtn = document.getElementById('listBtn') as HTMLButtonElement;
    const errorMsg = document.getElementById('listing-error');

    const price = parseFloat(priceInput?.value || "0");
    const amount = parseInt(amountInput?.value || "0");

    // Logic: Must have values, and price must be >= 0.1
    const isValid = price >= 0.1 && amount > 0;

    if (listBtn) {
        if (isValid) {
            listBtn.disabled = false;
            listBtn.classList.remove('bg-zinc-800', 'text-zinc-500', 'cursor-not-allowed');
            listBtn.classList.add('bg-emerald-500', 'text-black', 'hover:brightness-110');
            errorMsg?.classList.add('hidden');
        } else {
            listBtn.disabled = true;
            listBtn.classList.add('bg-zinc-800', 'text-zinc-500', 'cursor-not-allowed');
            listBtn.classList.remove('bg-emerald-500', 'text-black', 'hover:brightness-110');

            // Show specific error if price is too low
            if (price > 0 && price < 0.1) {
                errorMsg?.classList.remove('hidden');
            } else {
                errorMsg?.classList.add('hidden');
            }
        }
    }
};
/* markets.ts - [2026-02-14] Market Execution Engine */

// Global state for the active purchase
let activePurchase: { treePda: string, price: number, max: number, authority: string } | null = null;

let currentPurchase = { treePda: '', price: 0, seller: '' };

  /**
   * [2026-02-18] Market Action: List Asset
   * Includes [2026-02-07] Admin Bypass & 36h Cooldown Check
   */
   (window as any).handleListTree = async (treePdaStr: string) => {
       const priceInput = document.getElementById('listPrice') as HTMLInputElement;
       const amountInput = document.getElementById('listAmount') as HTMLInputElement;

       // 1. CLIENT-SIDE VALIDATION (Block RPC before it starts)
       const price = parseFloat(priceInput?.value);
       const amount = parseInt(amountInput?.value);

       if (!price || price <= 0) {
           alert("VALIDATION ERROR: Please enter a valid price in SOL.");
           priceInput?.focus();
           return;
       }
       if (!amount || amount <= 0) {
           alert("VALIDATION ERROR: Share amount must be at least 1.");
           amountInput?.focus();
           return;
       }

       try {
           const program = getProgram();
           const treePda = new PublicKey(treePdaStr);
           const wallet = (window as any).solana.publicKey;

           // Verify user has enough shares before trying to list
           const [posPda] = PublicKey.findProgramAddressSync(
               [Buffer.from("position"), treePda.toBuffer(), wallet.toBuffer()],
               program.programId
           );
           console.log("🔍 Debugging Position PDA:", posPda.toBase58());
           const pos = await program.account.treePosition.fetch(posPda);
           // STEP 1: Check if the account actually exists on-chain
        const accountInfo = await program.provider.connection.getAccountInfo(posPda);
        console.log(accountInfo);


        if (!accountInfo) {
            console.error("❌ Position account does not exist. Address:", posPda.toBase58());
            alert("NO SHARES FOUND: You don't have a position for this tree yet. Use the Admin 'Genesis Injection' to fund this wallet first.");
            return; // STOP HERE - No RPC wasted
        }

           if (amount > pos.shares.toNumber()) {
               alert(`INSUFFICIENT BALANCE: You only have ${pos.shares.toNumber()} shares available.`);
               return;
           }

           console.log("🛰️ Validation Passed. Initializing RPC...");

           // STEP 2: Fetch data only if account exists
                   const posData = await program.account.treePosition.fetch(posPda);
                   console.log("📊 Position Data Found:", posData.shares.toNumber(), "shares");

                   if (amount > posData.shares.toNumber()) {
                       alert(`Insufficient shares. You have ${posData.shares.toNumber()}.`);
                       return;
                   }
           const [listingPda] = PublicKey.findProgramAddressSync([Buffer.from("listing"), wallet.toBuffer(), treePda.toBuffer()], program.programId);
           const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

           await program.methods.listShares(new BN(price * 1e9), new BN(amount))
               .accounts({
                   seller: wallet,
                   treePosition: posPda,
                   tree: treePda,
                   listing: listingPda,
                   config: configPda,
                   systemProgram: SystemProgram.programId,
               }).rpc();

           alert("ASSET LISTED SUCCESSFULLY");
           window.location.reload();
       } catch (err: any) {
           console.error("Listing Failed:", err);
           alert(err.message);
       }
   };
     /**
 * [2026-02-18] Market Action: Cancel Listing
 * Removes the asset from the public registry
 */
 /**
  * [2026-02-18] Market Action: Cancel Listing
  * Fixed: Added 'config' and 'treePosition' accounts per IDL
  */
 (window as any).handleCancelListing = async (treePdaStr: string) => {
     if (!confirm("Are you sure you want to remove this listing?")) return;

     try {
         const program = getProgram();
         const treePda = new PublicKey(treePdaStr);
         const seller = program.provider.publicKey;

         // Derive necessary PDAs
         const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
         const [listingPda] = PublicKey.findProgramAddressSync(
             [Buffer.from("listing"), seller.toBuffer(), treePda.toBuffer()],
             program.programId
         );
         const [positionPda] = PublicKey.findProgramAddressSync(
             [Buffer.from("position"), seller.toBuffer(), treePda.toBuffer()],
             program.programId
         );

         console.log("🛰️ Sending 'cancel_listing' Instruction...");

         // Note: Anchor TS converts snake_case 'tree_position' to 'treePosition'
         const tx = await program.methods
             .cancelListing()
             .accounts({
                 seller: seller,
                 config: configPda,
                 treePosition: positionPda,
                 listing: listingPda,
             })
             .rpc();

         console.log("✅ Listing Cancelled:", tx);
         alert("LISTING REMOVED: Asset returned to private holdings.");

         document.getElementById('treeModal')?.classList.add('hidden');
         if ((window as any).refreshListedSales) await (window as any).refreshListedSales();

     } catch (err: any) {
         console.error("🛑 Cancellation Error:", err);
         alert("Cancel Failed: " + err.message);
     }
 };
 // PRO Flow Helper: Validate if a user can act
const canUserAct = (positionData: any, isAdmin: boolean) => {
    const now = Math.floor(Date.now() / 1000);

    if (isAdmin) return { allowed: true };
    if (positionData.hasActiveVote) return { allowed: false, reason: "Active Vote" };
    if (positionData.lockUntil > now) return { allowed: false, reason: "Cooldown Active" };

    return { allowed: true };
};

// Use this in your UI to gray out buttons
const updateButtonState = (btnId: string, positionData: any) => {
    const status = canUserAct(positionData, userWallet?.toBase58() === ADMIN_WALLET);
    const btn = document.getElementById(btnId) as HTMLButtonElement;
    if (!status.allowed) {
        btn.disabled = true;
        btn.innerText = `Locked (${status.reason})`;
    }
};
/* markets.ts - [2026-02-16] Fixed openBuyModal */

/* [2026-02-23] FIXED: Buy Modal with Payment Highlighting & Total Cost Math */
/* [2026-02-23] FIXED: openBuyModal with IDL alignment & Cost Logic */
(window as any).openBuyModal = async (treePda: string, price: string, available: number, seller: string) => {
    console.log("🌿 Opening Purchase Portal for Tree:", treePda);

    try {
        const program = getProgram();
        const treePublicKey = new PublicKey(treePda);

        // 1. Fetch On-Chain Data
        // Note: Field names must match your IDL (total_locked_shares, tree_id)
        const treeData = await program.account.tree.fetch(treePublicKey);

        // 2. Setup Global State
        const unitPrice = parseFloat(price);
        (window as any).currentPurchase = {
            treePda,
            price: unitPrice,
            seller,
            availableShares: available,
            selectedMethod: 'SOL' // Default
        };
        (window as any).activePurchase = true;

        // 3. Prepare UI Elements
        const modal = document.getElementById('buyModal');
        const titleEl = document.getElementById('buyModalTitle');
        const statsContainer = document.getElementById('buyModalStats');
        const qtyInput = document.getElementById('buyQty') as HTMLInputElement;
        const totalEl = document.getElementById('buyTotalCost');
        const priceDisplay = document.getElementById('buyModalPrice');

        if (!modal) {
            console.error("Buy Modal not found");
            return;
        }

        // 4. Safe String Conversion (Fixes the undefined .toString() error)
        const onChainTotal = treeData.total_locked_shares ? treeData.total_locked_shares.toString() : "0";
        const displayTreeId = treeData.tree_id || "Specimen";

        // 5. Update UI Content
        if (titleEl) titleEl.innerText = `Acquire Fractions: ${displayTreeId}`;

        if (statsContainer) {
            statsContainer.innerHTML = `
                <div class="grid grid-cols-2 gap-2 mb-6">
                    <div class="p-3 bg-white/5 rounded-xl border border-white/5 text-center">
                        <p class="text-[8px] text-zinc-500 uppercase font-black">Specimen Total</p>
                        <p class="text-white font-black">${onChainTotal} Units</p>
                    </div>
                    <div class="p-3 bg-white/5 rounded-xl border border-white/5 text-center">
                        <p class="text-[8px] text-zinc-500 uppercase font-black">Listing Available</p>
                        <p class="text-emerald-400 font-black">${available} Units</p>
                    </div>
                </div>
            `;
        }

        // Reset inputs
        if (qtyInput) qtyInput.value = "1";
        if (priceDisplay) priceDisplay.innerText = `${unitPrice.toFixed(4)} SOL Per Unit`;
        if (totalEl) totalEl.innerText = `${unitPrice.toFixed(4)} SOL`;

        // 6. Show Modal and Init Payment Highlight
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        if (typeof (window as any).selectPaymentMethod === 'function') {
            (window as any).selectPaymentMethod('SOL');
        }

    } catch (err) {
        console.error("❌ Failed to open purchase portal:", err);
        alert("Metadata Sync Error: Could not fetch specimen data from chain.");
    }
};

/**
 * FIXED: selectPaymentMethod
 * Updates highlighting and global state
 */
(window as any).selectPaymentMethod = (method: string) => {
    if (!(window as any).currentPurchase) return;

    (window as any).currentPurchase.selectedMethod = method;

    // Toggle CSS classes for SOL, USDC, OLV buttons
    ['SOL', 'USDC', 'OLV'].forEach(m => {
        const el = document.getElementById(`pay-${m.toLowerCase()}`);
        if (el) {
            if (m === method) {
                el.classList.add('border-emerald-500', 'bg-emerald-500/10', 'text-white');
                el.classList.remove('border-white/10', 'bg-white/5', 'text-zinc-500');
            } else {
                el.classList.remove('border-emerald-500', 'bg-emerald-500/10', 'text-white');
                el.classList.add('border-white/10', 'bg-white/5', 'text-zinc-500');
            }
        }
    });

    (window as any).updateBuyTotal();
};

/**
 * FIXED: updateBuyTotal
 * Updates the final cost display based on quantity
 */
(window as any).updateBuyTotal = () => {
    const data = (window as any).currentPurchase;
    const qtyInput = document.getElementById('buyQty') as HTMLInputElement;
    const totalEl = document.getElementById('buyTotalCost');

    if (!data || !qtyInput || !totalEl) return;

    const qty = parseInt(qtyInput.value) || 0;
    const total = qty * data.price;
    const method = data.selectedMethod || 'SOL';

    totalEl.innerText = `${total.toFixed(4)} ${method}`;

    // Safety check: Disable button if over available shares
    const btn = document.getElementById('confirmPurchaseBtn') as HTMLButtonElement;
    if (btn) {
        btn.disabled = qty > data.availableShares || qty <= 0;
        btn.style.opacity = btn.disabled ? "0.5" : "1";
    }
};/* markets.ts - [2026-02-16] Close Modal & Reset State */

(window as any).closeBuyModal = () => {
    const modal = document.getElementById('buyModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    // Clear global tracking to prevent accidental repeat purchases
    (window as any).currentPurchase = null;

    // Reset input amount if it exists
    const amountInput = document.getElementById('buyAmount') as HTMLInputElement;
    if (amountInput) amountInput.value = "1";

    console.log("🚪 Purchase Portal Closed");
};
// Click outside to close listener
document.getElementById('buyModal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('buyModal')) {
        (window as any).closeBuyModal();
    }
});

(window as any).closeDeepModal = () => {
    const modal = document.getElementById('deepTreeModal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.classList.remove('modal-open');
    }
};
(window as any).closeTreeModal = () => {
    document.getElementById('treeModal')?.classList.add('hidden');
};

/* [2026-02-23] FIXED: Unified Purchase Logic with Multi-Currency Support */
(window as any).confirmPurchase = async () => {
    console.log("🔄 Initiating Purchase Transaction...");
    const qtyInput = document.getElementById('buyQty') as HTMLInputElement;
        const amount = parseInt(qtyInput?.value || "0");

        // 1. PRE-FLIGHT VALIDATION
        if (!amount || amount <= 0) {
            alert("PURCHASE BLOCKED: Quantity must be greater than 0.");
            qtyInput?.focus();
            return;
        }
    // 1. Validate Global State
    const pData = (window as any).currentPurchase;
    if (!pData || !pData.treePda) {
        console.error("❌ No active purchase data found.");
        return;
    }

    // 2. Safely Get Quantity from UI
    if (!qtyInput) {
        console.error("❌ UI Error: Element 'buyQty' not found.");
        return;
    }
    const quantity = parseInt(qtyInput.value);

    if (isNaN(quantity) || quantity <= 0 || quantity > pData.availableShares) {
        alert("Please enter a valid quantity within the available limit.");
        return;
    }

    try {
        const program = getProgram();
        const provider = program.provider as AnchorProvider;
        const buyer = provider.publicKey;
        const treePda = new PublicKey(pData.treePda);
        const seller = new PublicKey(pData.seller);
        const method = pData.selectedMethod || 'SOL';

        console.log(`🛒 Buying ${quantity} shares via ${method} from ${seller.toBase58()}`);

        // Derive PDAs needed for the instruction
        const [listingPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("listing"), seller.toBuffer(), treePda.toBuffer()],
            program.programId
        );

        const [treePositionPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("position"), buyer.toBuffer(), treePda.toBuffer()],
            program.programId
        );

        // --- MULTI-PAYMENT LOGIC ---
        let tx = new Transaction();

        if (method === 'SOL') {
            // Standard SOL Purchase
            tx.add(
                await program.methods
                    .purchaseTreeShares(new BN(quantity))
                    .accounts({
                        tree: treePda,
                        listing: listingPda,
                        buyer: buyer,
                        seller: seller,
                        buyerPosition: treePositionPda,
                        systemProgram: SystemProgram.programId,
                    })
                    .instruction()
            );
        } else {
            // USDC or OLV Logic
            // Note: This requires your Anchor program to have a specific 'purchase_with_tokens' instruction
            alert(`${method} payments are being routed through the swap aggregator. Please confirm SOL equivalent.`);
            // For now, we fallback to SOL to prevent crash, or you can insert your Token instruction here
            return;
        }

        // 3. Execute Transaction
        const signature = await provider.sendAndConfirm(tx);
        console.log("✅ Purchase Successful! Sig:", signature);

        // 4. Cleanup UI
        const modal = document.getElementById('buyModal');
        if (modal) modal.classList.add('hidden');

        // Refresh Balances and Market [2026-02-23]
        await fetchOnChainBalances();
        await refreshListedSales();

        alert(`Successfully acquired ${quantity} fractions!`);

    } catch (err: any) {
        console.error("❌ Purchase Failed:", err);
        // Handle specific Solana errors
        if (err.message.includes("0x1")) alert("Insufficient funds for purchase.");
        else alert("Transaction failed. Check console for details.");
    }
};

/**
 * Handles visual highlighting of payment methods and updates the global state
 */
(window as any).selectPaymentMethod = (method: string) => {
    (window as any).currentPurchase.selectedMethod = method;

    // UI Visuals: Loop through common method IDs
    ['pay-sol', 'pay-usdc', 'pay-olv'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        if (id === `pay-${method.toLowerCase()}`) {
            el.classList.add('border-emerald-500', 'bg-emerald-500/10');
            el.classList.remove('border-white/10', 'bg-white/5');
        } else {
            el.classList.remove('border-emerald-500', 'bg-emerald-500/10');
            el.classList.add('border-white/10', 'bg-white/5');
        }
    });

    window.updateBuyTotal();
};
/**
 * Calculates the final cost based on qty and unit price
 */
(window as any).updateBuyTotal = () => {
    const data = (window as any).currentPurchase;
    const qtyInput = document.getElementById('buyQty') as HTMLInputElement;
    const totalEl = document.getElementById('buyTotalCost');

    if (!data || !qtyInput || !totalEl) return;

    const qty = parseInt(qtyInput.value) || 0;
    const total = qty * data.price;

    // Regardless of the label, we show the SOL total for the transaction
    totalEl.innerText = `${total.toFixed(4)} SOL`;

    // Disable button if qty exceeds availability
    const btn = document.getElementById('confirmPurchaseBtn') as HTMLButtonElement;
    if (btn) {
        if (qty > data.availableShares || qty <= 0) {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            qtyInput.classList.add('border-red-500');
        } else {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            qtyInput.classList.remove('border-red-500');
        }
    }
};

// Listen for input changes
document.getElementById('buyAmount')?.addEventListener('input', (window as any).updateTotalCost);
// Handle Real-time cost calculation
document.getElementById('buyAmount')?.addEventListener('input', (e) => {
    if (!activePurchase) return;
    const amount = parseInt((e.target as HTMLInputElement).value) || 0;
    const total = (amount * activePurchase.price).toFixed(2);
    document.getElementById('buyTotalCost')!.innerText = `${total} USDC`;
});

(window as any).confirmPurchase = async () => {
    const amount = parseInt((document.getElementById('buyQty') as HTMLInputElement).value);
    console.log("Confirm amountBuy -- is activePurchase", amount,activePurchase);

        // 1. PRE-FLIGHT VALIDATION
        if (!amount || amount <= 0) {
            alert("PURCHASE BLOCKED: Quantity must be greater than 0.");
            qtyInput?.focus();
            return;
        }
    if (!activePurchase || isNaN(amount) || amount <= 0 || amount > activePurchase.max) {
        return alert("Invalid Amount");
    }
    const isAdmin = buyer.toBase58() === ADMIN_WALLET;
// If the wallet has already voted, do not allow voting or calling the wallet [2026-01-16]
// The walletlock does not apply to admin [2026-02-07]
if (hasVoted && !isAdmin) {
    throw new Error("Wallet Locked: Active Vote Detected");
}

    try {
        const program = getProgram();
        const buyer = program.provider.publicKey;
        const treePubkey = new PublicKey(activePurchase.treePda);
        const sellerPubkey = new PublicKey(activePurchase.authority);

        // Fetch Field for the instruction
        const treeAcc = await program.account.tree.fetch(treePubkey);

        const [buyPos] = PublicKey.findProgramAddressSync(
            [Buffer.from("position"), buyer.toBuffer(), treePubkey.toBuffer()],
            program.programId
        );
        const [listingPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("listing"), sellerPubkey.toBuffer(), treePubkey.toBuffer()],
            program.programId
        );

        console.log("🛒 Purchasing", amount, "fractions...");

        // Instruction: .purchaseTreeShares(amount)
        // Note: Ensure your IDL instruction takes 'amount' as an argument
        await program.methods.purchaseTreeShares(new BN(amount))
            .accounts({
                buyer: buyer,
                seller: sellerPubkey,
                config: configPda,
                field: treeAcc.field,
                tree: treePubkey,
                listing: listingPda,
                buyerPosition: buyPos,
                systemProgram: SystemProgram.programId,
            }).rpc();

        alert("✅ Purchase Successful!");
        document.getElementById('buyModal')!.classList.add('hidden');
        loadOnChainMarket(); // Refresh grid
    } catch (e: any) {
        console.error("Purchase Failed", e);
        alert(`Error: ${e.message}`);
    }
};

document.getElementById('confirmBuyBtn')?.addEventListener('click', (window as any).confirmPurchase);
/**
 * Fetch Wallet & Vault Balances
 */

 /* markets.ts - [2026-02-14] Public Market Fetcher */
 /* markets.ts - [2026-02-14] Fixed Market Sync */

 (window as any).refreshListedSales = async () => {
    const grid = document.getElementById('listed-sales-grid');
    if (!grid) return;

    try {
        const program = getProgram();
        const connection = program.provider.connection;
        const allListings = await program.account.treeListing.all();

        console.log("🔍 --- MARKET AUDIT START ---");

        grid.innerHTML = '';

        for (const listing of allListings) {
            const data = listing.account;
            const treeAcc = await program.account.tree.fetch(data.tree);

            // 1. Fetch Real-time Balance of the Seller
            const sellerBalance = await connection.getBalance(data.seller);
            const sellerSol = sellerBalance / 1e9;

            // 2. Cost calculations
            const rawPrice = data.price.toNumber();
            const pricePerShareSol = rawPrice / 1e9;
            const rentExemptMin = 0.002; // Roughly what Solana needs

            console.group(`🌳 Tree: ${treeAcc.treeId}`);
            console.log(`Seller Wallet: ${data.seller.toBase58()}`);
            console.log(`Seller Balance: ${sellerSol.toFixed(6)} SOL`);
            console.log(`Price per Share: ${pricePerShareSol.toFixed(6)} SOL`);
            console.log(`Available Shares: ${data.shares.toString()}`);

            // 3. Rent Logic Check
            if (sellerSol < 0.001) {
                console.warn("⚠️ ALERT: Seller balance is dangerously low. Transactions will likely fail Rent-Exemption.");
            }
            if (pricePerShareSol < 0.0005) {
                console.warn("⚠️ ALERT: Price per share is very low. Purchasing 1 share may not provide enough rent to an empty seller wallet.");
            }
            console.groupEnd();

            // Render to UI
            grid.innerHTML += `
                <div class="glass p-6 rounded-[2rem] border ${sellerSol < 0.001 ? 'border-red-500/50' : 'border-white/5'}">
                    <div class="flex justify-between items-center mb-2">
                        <h3 class="text-xl font-black italic text-white">${treeAcc.treeId}</h3>
                        <span class="text-[10px] font-mono text-zinc-500">${data.seller.toBase58().slice(0,6)}...</span>
                    </div>

                    <div class="space-y-2 mb-4">
                        <div class="flex justify-between text-xs">
                            <span class="text-zinc-500">Seller Balance:</span>
                            <span class="${sellerSol < 0.001 ? 'text-red-400 font-bold' : 'text-emerald-400'}">${sellerSol.toFixed(4)} SOL</span>
                        </div>
                        <div class="flex justify-between text-xs">
                            <span class="text-zinc-500">Price/Share:</span>
                            <span class="text-white font-bold">${pricePerShareSol.toFixed(6)} SOL</span>
                        </div>
                        <div class="flex justify-between text-xs">
                            <span class="text-zinc-500">Stock:</span>
                            <span class="text-white">${data.shares.toString()}</span>
                        </div>
                    </div>

                    <button onclick="window.openBuyModal('${data.tree.toBase58()}', '${pricePerShareSol}', ${data.shares}, '${data.seller.toBase58()}')"
                            class="w-full py-3 ${sellerSol < 0.001 ? 'bg-zinc-700' : 'bg-emerald-500'} text-black font-black rounded-xl text-[10px] uppercase">
                        ${sellerSol < 0.001 ? 'Seller Low SOL' : 'Buy Fractions'}
                    </button>
                </div>
            `;
        }
        console.log("🔍 --- MARKET AUDIT END ---");

    } catch (err) {
        console.error("Market Audit Error:", err);
    }
};
/* fetchOnChainBalances - [2026-02-23] FIXED VERSION */
/* [2026-02-23] UPDATED: Fetch Balances + Total Market Supply */
/* fetchOnChainBalances - [2026-02-23] FULL VERSION */
async function fetchOnChainBalances() {
    const wallet = (window as any).solana?.publicKey;
    if (!wallet) return;

    try {
        const provider = new AnchorProvider(solConn, (window as any).solana, { commitment: "confirmed" });
        const program = new Program(idl as any, provider);

        // 1. Parallel Fetch: User Positions, Market Listings, Wallet SOL, and Vault SOL
        const [positions, allListings, userBalance, vaultBalance] = await Promise.all([
            program.account.treePosition.all([{ memcmp: { offset: 8, bytes: wallet.toBase58() } }]),
            program.account.treeListing.all(),
            solConn.getBalance(wallet),
            solConn.getBalance(DAO_VAULT)
        ]);

        // 2. ATA OLV Fetch
                let currentOlv = 0;
                try {
                    const ataAddress = await getAssociatedTokenAddress(OLV_MINT, wallet, false);
                    const tokenAccountInfo = await solConn.getTokenAccountBalance(ataAddress);
                    currentOlv = tokenAccountInfo?.value?.uiAmount || 0;
                } catch (ataErr) {
                    console.warn("OLV ATA not found - user has 0 balance.");
                }
        // 2. Calculate Market & Portfolio Metrics
        const totalMarketShares = allListings.reduce((sum, l) => sum + l.account.shares.toNumber(), 0);

        let totalLiquid = 0;
        let totalLocked = 0;
        let hasVoted = false;

        positions.forEach((p: any) => {
            const rawShares = p.account.shares.toNumber();
            const locked = p.account.lockedShares ? p.account.lockedShares.toNumber() : 0;
            const total = Math.max(rawShares, locked);

            totalLocked += locked;
            totalLiquid += (total - locked);
            if (p.account.hasActiveVote) hasVoted = true;
        });

        const solVal = userBalance / 1e9;
        const vaultSol = vaultBalance / 1e9;
        const totalPortfolio = totalLiquid + totalLocked;

        // 3. Update UI Elements
        const updates: Record<string, string> = {
            'val-sol': solVal.toFixed(3),
            'val-vault-total': vaultSol.toLocaleString(undefined, { minimumFractionDigits: 2 }),
            'val-olv': currentOlv.toLocaleString(),
            'total-market-supply': totalMarketShares.toLocaleString(),
            'staked-liquid': totalLiquid.toString(),
            'staked-locked': totalLocked.toString(),
            'total-portfolio-value': totalPortfolio.toLocaleString(),
            'dao-treasury-total': (solVal + (totalPortfolio * 0.1)).toFixed(2) + " SOL"
        };

        // Apply Status & Admin Bypass [2026-02-07]
        const isAdmin = wallet.toBase58() === ADMIN_WALLET;
        const lockStatusEl = document.getElementById('lock-status');
        if (lockStatusEl) {
            lockStatusEl.innerText = isAdmin ? "⚡ ADMIN ACCESS" : (hasVoted ? "🚫 WALLET LOCKED (VOTED)" : "✅ VERIFIED MEMBER");
            lockStatusEl.className = "text-[9px] mono uppercase bg-white/5 px-2 py-1 rounded " +
                                   (hasVoted && !isAdmin ? "text-red-500 animate-pulse" : "text-green-500");
        }

        Object.entries(updates).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.innerText = val;
        });

    } catch (err) {
        console.error("❌ Sync Failure:", err);
    }
}
async function loadOnChainMarket() {
    console.log("🚀 Starting Market Load...");
    console.log("🚀 Connection confirmed, syncing assets...");
            await loadMyAssets();
    refreshListedSales();

}
/**
 * [2026-02-18] EXECUTION: Purchase Shares on Solana
 * Includes [2026-02-07] Admin Bypass & [2026-01-16] Wallet Lock checks
 */(window as any).executePurchase = async (
    treeAddrStr: string,
    sellerStr: string,
    qty: number
) => {
    try {
        const program = getProgram();

        if (!program?.provider?.publicKey) {
            alert("Wallet not connected.");
            return;
        }

        const buyer = program.provider.publicKey;

        if (!treeAddrStr || !sellerStr) {
            alert("Missing purchase data.");
            return;
        }

        if (!Number.isInteger(qty) || qty <= 0) {
            alert("Invalid quantity.");
            return;
        }

        const treePubkey = new PublicKey(treeAddrStr);
        const seller = new PublicKey(sellerStr);

        // 🚫 Prevent self purchase
        if (buyer.equals(seller)) {
            alert("You cannot purchase your own listing.");
            return;
        }

        const treeAccount = await program.account.tree.fetch(treePubkey);

        const [configPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("config")],
            program.programId
        );

        const configAccount = await program.account.globalConfig.fetch(configPda);

        const [listingPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("listing"), seller.toBuffer(), treePubkey.toBuffer()],
            program.programId
        );

        // 🔍 Confirm listing exists BEFORE sending tx
        const listingInfo =
            await program.provider.connection.getAccountInfo(listingPda);

        if (!listingInfo) {
            alert("Listing not found. It may have been cancelled.");
            return;
        }

        const [buyerPosPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("position"), buyer.toBuffer(), treePubkey.toBuffer()],
            program.programId
        );

        const [stakePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("stake"), buyer.toBuffer()],
            program.programId
        );

        const [revVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("revenue_vault"), treePubkey.toBuffer()],
            program.programId
        );

        const amount = new BN(qty);

        console.log("Executing purchase:");
        console.log("Tree:", treePubkey.toBase58());
        console.log("Seller:", seller.toBase58());
        console.log("Buyer:", buyer.toBase58());
        console.log("Quantity:", qty);
        console.log("Listing PDA:", listingPda.toBase58());

        const tx = await program.methods
            .purchaseTreeShares(amount)
            .accounts({
                buyer,
                seller,
                config: configPda,
                field: treeAccount.field,
                tree: treePubkey,
                listing: listingPda,
                buyerPosition: buyerPosPda,
                authorityStake: stakePda,
                treasury: configAccount.treasury,
                treeRevenueVault: revVault,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        console.log("✅ Purchase Success:", tx);
        alert("PURCHASE COMPLETE");

        if ((window as any).refreshListedSales) {
            await (window as any).refreshListedSales();
        }

    } catch (err: any) {
        console.error("🛑 Purchase Error:", err);
        alert(err?.message || "Transaction failed.");
    }
};
 // Add this helper to markets.ts
 const isAssetLocked = (position: any) => {
     // [2026-01-16] Restriction: If already voted, no calling or selling
     return position.account.hasActiveVote || position.account.lockedShares.gt(new BN(0));
 };

 /**
  * STEP 1: Cancel the broken low-price listing
  */
 (window as any).fixListingStep1_Cancel = async (treeAddrStr: string) => {
     const program = getProgram();
     const seller = program.provider.publicKey;
     const treePubkey = new PublicKey(treeAddrStr);

     try {
         const [listingPda] = PublicKey.findProgramAddressSync(
             [Buffer.from("listing"), seller.toBuffer(), treePubkey.toBuffer()],
             program.programId
         );

         const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

         // Find the seller's position for this tree
         const [sellerPosPda] = PublicKey.findProgramAddressSync(
             [Buffer.from("position"), seller.toBuffer(), treePubkey.toBuffer()],
             program.programId
         );

         console.log("🚫 Cancelling Listing...");
         const tx = await program.methods
             .cancelListing()
             .accounts({
                 seller: seller,
                 config: configPda,
                 treePosition: sellerPosPda,
                 listing: listingPda,
             })
             .rpc();

         console.log("✅ Listing Cancelled. Signature:", tx);
     } catch (err) {
         console.error("Cancel Failed:", err);
     }
 };

 /**
  * STEP 2: Create a new listing with a viable price (e.g., 0.1 SOL)
  */
 (window as any).fixListingStep2_Relist = async (treeAddrStr: string, shares: number, priceInSol: number) => {
     const program = getProgram();
     const seller = program.provider.publicKey;
     const treePubkey = new PublicKey(treeAddrStr);

     // Convert SOL to Lamports (1 SOL = 1,000,000,000 Lamports)
     const priceInLamports = new BN(priceInSol * 1_000_000_000);

     try {
         const [listingPda] = PublicKey.findProgramAddressSync(
             [Buffer.from("listing"), seller.toBuffer(), treePubkey.toBuffer()],
             program.programId
         );

         const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

         const [sellerPosPda] = PublicKey.findProgramAddressSync(
             [Buffer.from("position"), seller.toBuffer(), treePubkey.toBuffer()],
             program.programId
         );

         console.log(`✨ Relisting ${shares} shares at ${priceInSol} SOL...`);
         const tx = await program.methods
             .listShares(priceInLamports, new BN(shares))
             .accounts({
                 seller: seller,
                 config: configPda,
                 treePosition: sellerPosPda,
                 tree: treePubkey,
                 listing: listingPda,
                 systemProgram: SystemProgram.programId,
             })
             .rpc();

         console.log("✅ Successfully Relisted! Signature:", tx);
     } catch (err) {
         console.error("Relist Failed:", err);
     }
 };

 //====================================================//
 //---------------PAYMENTS------------
 //===================================================//
 /* markets.ts - Multi-Payment Logic [2026-02-14] */

let selectedCurrency = 'USDC';
const PRICE_PER_SHARE_USDC = 1.00; // Base price

(window as any).setPayment = (currency: string) => {
    selectedCurrency = currency;
    // Update UI Toggles
    document.querySelectorAll('.pay-toggle').forEach(el => {
        el.classList.remove('border-emerald-500', 'bg-emerald-500/20', 'text-white');
        el.classList.add('border-white/10', 'bg-white/5', 'text-zinc-400');
    });
    const active = document.getElementById(`pay-${currency}`);
    active?.classList.add('border-emerald-500', 'bg-emerald-500/20', 'text-white');

    (window as any).updateTotalCost();
};

(window as any).updateTotalCost = () => {
    const qty = parseInt((document.getElementById('buyAmount') as HTMLInputElement).value) || 0;
    let costStr = "";

    // In a real app, you'd fetch live SOL/OLV prices here
    if (selectedCurrency === 'USDC') costStr = `${(qty * 10).toFixed(2)} USDC`;
    if (selectedCurrency === 'SOL') costStr = `${(qty * 0.15).toFixed(3)} SOL`; // Example rate
    if (selectedCurrency === 'OLV') costStr = `${(qty * 100).toFixed(0)} OLV`;  // Example rate

    document.getElementById('buyTotalCost')!.innerText = costStr;
};

/* markets.ts - [2026-02-16] Fix for "Invalid Amount" */
(window as any).confirmMultiPaymentPurchase = async () => {
    const amountInput = document.getElementById('buyAmount') as HTMLInputElement;

    // Default quantity
    let qty = 1;

    if (amountInput && amountInput.value.trim() !== "") {
        qty = Number(amountInput.value);
    }

    console.log("Requested quantity:", qty);

    // Strict validation
    if (!Number.isInteger(qty) || qty <= 0) {
        alert("Please enter a valid quantity greater than 0.");
        return;
    }

    if (qty > purchaseData.availableShares) {
        alert("Not enough shares available.");
        return;
    }
    if (buyer.equals(seller)) {
    alert("You cannot purchase your own listing.");
    return;
}
    // Get data from modal tracker
    const purchaseData = (window as any).currentPurchase;

    if (!purchaseData?.treePda || !purchaseData?.seller) {
        alert("Error: Missing purchase data. Please close and reopen the modal.");
        return;
    }

    const treePdaStr = purchaseData.treePda;
    const sellerStr = purchaseData.seller;

    try {
await (window as any).executePurchase(treePdaStr, sellerStr, qty);
    } catch (err) {
        console.error("Purchase failed:", err);
    }
};
  /**
 * DB SYNC: Keep Supabase aligned with On-Chain Truth
 */
async function syncOwnershipToDb(treeId: string, shares: number, locked: boolean) {
    const user = (window as any).solana.publicKey.toString();
    try {
        await sb.from('tree_ownership').upsert({
            tree_id: treeId,
            wallet_address: user,
            fractions_owned: shares,
            is_locked: locked,
            last_sync: new Date().toISOString()
        });
    } catch (e) { console.error("Supabase sync failed"); }
}

// Initial Load
window.addEventListener('load', () => {
    if ((window as any).solana?.isConnected) (window as any).connectWallet();
});
