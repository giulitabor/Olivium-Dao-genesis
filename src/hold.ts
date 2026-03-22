import './polyfill';
import { Connection, PublicKey, clusterApiUrl, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { createClient } from "@supabase/supabase-js";
import idl from "../idl.json";

// --- CONFIGURATION ---
const PROGRAM_ID = new PublicKey("6HjkwwiKSkr8YCtR9HchVZQ97CmjbBbrW2SeE2U8T6rj");
// Olive DAO Config [2026-02-08]
const DAO_VAULT = new PublicKey("FrNP32Hxhuu4pS8yguHhtTEdU9QpU7odRYi5zKNps15N");
const OLV_MINT = new PublicKey("6nab5Rttp45AfjaYrdwGxKuH9vK9RKCJdeaBvQJt8pLA");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const ADMIN_WALLET = "8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54";

const solConn = new Connection(clusterApiUrl("devnet"), "confirmed");
const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);


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

    const program = getProgram();
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

 (window as any).refreshListedSales = async () => {
     const grid = document.getElementById('listed-sales-grid');
     if (!grid) return;

     grid.innerHTML = `<div class="col-span-full py-20 text-center text-zinc-500 animate-pulse">
         <p class="mono text-[10px] uppercase tracking-widest">Scanning Ledger for Active Listings...</p>
     </div>`;

     try {
         const program = getProgram();

         // 1. Fetch ALL listings
         // IMPORTANT: Ensure 'treeListing' matches the name in your idl.json exactly
         const allListings = await program.account.treeListing.all();
         console.log("Found Raw Listings:", allListings.length);

         // 2. Hydrate with Tree Data
         const listingsWithData = await Promise.all(allListings.map(async (listing) => {
             try {
                 const treeAcc = await program.account.tree.fetch(listing.account.tree);
                 return { ...listing, treeData: treeAcc };
             } catch (e) {
                 console.error("Failed to fetch tree for listing:", listing.publicKey.toBase58());
                 return null;
             }
         }));

         // 3. Filter for Genesis (Instruction [2026-02-07]: Use first 3 trees)
         const genesisListings = listingsWithData.filter(l => {
             if (!l || !l.treeData) return false;
             // Matches "TREE-1", "T-1", or "1"
             const idNum = parseInt(l.treeData.treeId.replace(/^\D+/g, ''));
             return idNum <= 3;
         });

         if (genesisListings.length === 0) {
             grid.innerHTML = `<div class="col-span-full py-20 text-center glass rounded-2xl border-dashed border-white/10">
                 <p class="text-zinc-600 uppercase text-[10px] font-black">No Active Genesis Listings Found</p>
                 <p class="text-[8px] text-zinc-700 mt-2">Total Listings on Chain: ${allListings.length}</p>
             </div>`;
             return;
         }

         grid.innerHTML = '';

         genesisListings.forEach(item => {
             const list = item!.account;
             const tree = item!.treeData;
             // Use optional chaining and fallback to prevent the 'undefined' error
     const treePdaStr = list.tree?.toBase58() || "";
     const sellerStr = list.authority?.toBase58() || "Unknown";
     // Safety check: if tree or authority is missing, skip this card
    if (!treePdaStr || !tree) return;
     const price = (list.price.toNumber() / 1e6).toFixed(2);
             const available = list.shares.toString();

             grid.innerHTML += `
                 <div class="glass p-6 rounded-[2rem] border border-white/5 hover:border-emerald-500/30 transition-all">
                     <div class="flex justify-between items-start mb-4">
                         <div>
                             <span class="text-[8px] bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded font-black uppercase italic">Genesis Verified</span>
                             <h3 class="text-2xl font-black text-white italic mt-1">${tree.treeId}</h3>
                         </div>
                     </div>
                     <div class="grid grid-cols-2 gap-4 mb-6">
                         <div class="p-3 bg-white/5 rounded-xl border border-white/5">
                             <p class="text-[8px] text-zinc-500 uppercase">Price per Share</p>
                             <p class="text-sm font-black text-emerald-400">${price} USDC</p>
                             <p class="text-sm font-black text-emerald-400">${price} SOL</p>

                         </div>
                         <div class="p-3 bg-white/5 rounded-xl border border-white/5">
                             <p class="text-[8px] text-zinc-500 uppercase">Stock</p>
                             <p class="text-sm font-black text-white">${available}</p>
                         </div>
                     </div>
                     <button onclick="window.openBuyModal('${treePdaStr}', '${price}', ${available}, '${sellerStr}')"
                             class="w-full py-3 bg-emerald-500 text-black font-black rounded-xl text-[10px] uppercase tracking-widest hover:brightness-110 transition-all">
                         Buy Fractions
                     </button>
                 </div>
             `;
         });

     } catch (err) {
         console.error("Market Grid Sync Error:", err);
         grid.innerHTML = `<p class="text-red-500 mono text-xs text-center">Sync Failure. Check console.</p>`;
     }
 };

 function updateTickerPrices() {
     const sol = (110 + Math.random() * 5).toFixed(2);
     document.getElementById('tick-sol')!.innerText = `$${sol}`;
     document.getElementById('tick-olv')!.innerText = `$0.82`;
 }


async function loadOnChainMarket() {
    console.log("🚀 Starting Market Load...");
    refreshListedSales();

}
// Load Authenticated User Assets
async function loadMyAssets() {
    const grid = document.getElementById('assets-grid');
    const wallet = (window as any).solana.publicKey;
    if (!grid || !wallet) return;

    const program = getProgram();
    // Filter by Owner
    const positions = await program.account.treePosition.all([
        { memcmp: { offset: 8, bytes: wallet.toBase58() } }
    ]);

    grid.innerHTML = positions.map((p: any) => `
        <div class="glass p-6 rounded-[2rem] border border-white/5 bg-emerald-500/[0.02]">
            <h4 class="text-lg font-black italic text-white mb-4">Fractional Position</h4>
            <div class="grid grid-cols-2 gap-4 mb-6">
                <div class="bg-black/40 p-3 rounded-xl border border-white/5">
                    <p class="text-[8px] text-zinc-500 uppercase font-black">Liquid</p>
                    <p class="text-lg font-black text-white">${p.account.shares.toString()}</p>
                </div>
                <div class="bg-black/40 p-3 rounded-xl border border-white/5">
                    <p class="text-[8px] text-zinc-500 uppercase font-black">Locked</p>
                    <p class="text-lg font-black text-amber-500">${p.account.lockedShares.toString()}</p>
                </div>
            </div>
            <button onclick="openDeepModal('${p.account.tree.toBase58()}')" class="w-full py-3 bg-solana/20 text-solana border border-solana/20 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-solana hover:text-black transition-all">Full Analytics</button>
        </div>
    `).join('');
}

// Deep Analytics Modal
/**
 * [2026-02-16] Deep Analytics Modal with Debug Sync
 * Implements granular logging for every on-chain step.
 */
(window as any).openDeepModal = async (treePdaStr: string) => {
    console.log("--- START ANALYTICS DEBUG ---");
    const modal = document.getElementById('deepTreeModal');
    const content = document.getElementById('modal-content-deep');
    if (!modal || !content) {
        console.error("❌ UI Error: Modal elements not found in DOM");
        return;
    }

    modal.classList.remove('hidden');
    content.innerHTML = `<p class="text-center animate-pulse py-20 font-black italic text-zinc-500 uppercase tracking-widest text-[10px]">🛰️ Initializing Neural Link to Ledger...</p>`;

    try {
        // 1. Trace Program Initialization
        console.log("1. Attempting to initialize program...");
        const program = getProgram(); // Use local helper directly
        console.log("✅ Program connected:", program.programId.toBase58());

        // 2. Trace Public Key derivation
        console.log("2. Parsing Tree PDA:", treePdaStr);
        const treePubKey = new PublicKey(treePdaStr);

        // 3. Trace Account Fetching
        console.log("3. Fetching Tree Account data from Solana...");
        const tree: any = await program.account.tree.fetch(treePubKey);
        console.log("✅ Tree Data Fetched:", tree);

        // 4. Trace Data Validation [2026-01-10]
        console.log("4. Validating tree metadata fields...");
        const health = tree.healthScore || 100;
        const treeId = tree.treeId || "UNKNOWN-TREE";

        // Use BN safe conversion for metrics
        const totalCo2 = tree.totalReportedCo2 ? tree.totalReportedCo2.toNumber() : 0;

        // Calculated Analytics
        const co2Sequestration = (health * 0.22).toFixed(2);
        const roiEstimate = (8.5 + (health / 100)).toFixed(1);

        console.log(`📊 Stats: Health ${health}, ID ${treeId}, CO2 ${totalCo2}`);

        // Inside openDeepModal function...

        // 1. Identify Roles & State
        const isAdmin = wallet.toBase58() === ADMIN_WALLET;
        const liquid = Number(userPos?.shares || 0);
        const staked = Number(userPos?.lockedShares || 0);
        const hasActiveVote = userPos?.hasActiveVote || false;
        console.log(isAdmin,liquid,staked,hasActiveVote);
        // 2. Show Admin Section if applicable [2026-02-07]
        const adminEl = document.getElementById('admin-controls');
        if (isAdmin && adminEl) {
            adminEl.classList.remove('hidden');
            renderAdminTools(treePdaStr); // Calls the function from the previous response
        }

        // 3. Render Holder Controls [2026-01-16]
        renderHolderControls(treePdaStr, liquid, staked, hasActiveVote);
        // 5. Update UI
        content.innerHTML = `
            <div class="flex justify-between items-start mb-10">
                <div>
                    <span class="text-[9px] bg-emerald-500 text-black px-3 py-1 rounded-full font-black uppercase italic mb-2 inline-block">Verified Asset</span>
                    <h2 class="text-5xl font-black italic text-white tracking-tighter uppercase">${treeId}</h2>
                    <p class="text-solana font-mono text-[10px] mt-2 font-bold">${treePdaStr}</p>
                </div>
                <button onclick="document.getElementById('deepTreeModal').classList.add('hidden')" class="text-4xl text-zinc-700 hover:text-white transition-all">&times;</button>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
                <div class="bg-white/5 p-6 rounded-[2rem] border border-white/10">
                    <p class="text-[9px] text-zinc-500 uppercase font-black mb-1">Health Score</p>
                    <p class="text-2xl font-black text-emerald-400">${health}%</p>
                </div>
                <div class="bg-white/5 p-6 rounded-[2rem] border border-white/10">
                    <p class="text-[9px] text-zinc-500 uppercase font-black mb-1">CO2 Absorption</p>
                    <p class="text-2xl font-black text-blue-400">${co2Sequestration}kg <span class="text-[10px]">/yr</span></p>
                </div>
                <div class="bg-white/5 p-6 rounded-[2rem] border border-white/10">
                    <p class="text-[9px] text-zinc-500 uppercase font-black mb-1">Annual Yield</p>
                    <p class="text-2xl font-black text-amber-500">${roiEstimate}%</p>
                </div>
                <div class="bg-white/5 p-6 rounded-[2rem] border border-white/10">
                    <p class="text-[9px] text-zinc-500 uppercase font-black mb-1">Cultivar</p>
                    <p class="text-xl font-black text-white italic">Olea Europaea</p>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div class="space-y-6">
                    <h3 class="text-xs font-black uppercase text-zinc-400 tracking-widest border-b border-white/5 pb-2 italic">Geospatial Registry</h3>
                    <div class="space-y-4 font-mono text-xs">
                        <div class="flex justify-between border-b border-white/[0.02] pb-2"><span class="text-zinc-600">Latitude</span> <span class="text-white">${tree.lat || '37.7749'}</span></div>
                        <div class="flex justify-between border-b border-white/[0.02] pb-2"><span class="text-zinc-600">Longitude</span> <span class="text-white">${tree.lng || '-122.4194'}</span></div>
                        <div class="flex justify-between border-b border-white/[0.02] pb-2"><span class="text-zinc-600">Elevation</span> <span class="text-white">124m</span></div>
                    </div>
                </div>
                <div class="space-y-6">
                    <h3 class="text-xs font-black uppercase text-zinc-400 tracking-widest border-b border-white/5 pb-2 italic">Governance Summary</h3>
                    <div class="space-y-4 font-mono text-xs">
                        <div class="flex justify-between border-b border-white/[0.02] pb-2"><span class="text-zinc-600">Total Shares</span> <span class="text-white">1,000,000</span></div>
                        <div class="flex justify-between border-b border-white/[0.02] pb-2"><span class="text-zinc-600">Genesis Set</span> <span class="text-emerald-500">GEN-00${treeId.slice(-1)}</span></div>
                        <div class="flex justify-between border-b border-white/[0.02] pb-2"><span class="text-zinc-600">Compliance</span> <span class="text-white uppercase">DAO_V1_SYNCED</span></div>
                    </div>
                </div>
            </div>
        `;
        console.log("✅ Analytics Render Complete.");

    } catch (e: any) {
        console.error("❌ CRITICAL ANALYTICS FAIL:", e);
        content.innerHTML = `
            <div class="p-20 text-center">
                <p class="text-red-500 font-black uppercase text-sm mb-4">On-Chain Sync Error</p>
                <p class="text-zinc-500 font-mono text-[10px] mb-8 bg-red-500/5 p-4 rounded-xl border border-red-500/20">${e.message}</p>
                <button onclick="document.getElementById('deepTreeModal').classList.add('hidden')" class="px-8 py-3 bg-white/5 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest hover:bg-white hover:text-black transition-all">Dismiss Terminal</button>
            </div>
        `;
    }
};
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

        await fetchOnChainBalances();

        await refreshListedSales();
    } catch (err) { console.error("Auth Fail:", err); }
};



/**
 * [2026-02-11] Initialize Portal Connection
 */
(window as any).initializeMemberPortal = async () => {
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
(window as any).signAndInitialize = async () => {
    if (!userWallet) return;
    // UI Updates
    document.getElementById('tos-modal')?.classList.add('hidden');
    document.getElementById('main-content')?.classList.remove('opacity-20', 'pointer-events-none');
    document.getElementById('btn-connect')?.classList.add('hidden');
    document.getElementById('wallet-pill')?.classList.remove('hidden');
    document.getElementById('display-addr')!.innerText = `${userWallet.toString().slice(0, 4)}...${userWallet.toString().slice(-4)}`;
    await fetchOnChainBalances();
    await loadOnChainMarket();

    // Start Ticker Loop
    setInterval(updateTickerPrices, 5000);
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
async function fetchOnChainBalances() {
   const wallet = (window as any).solana.publicKey;
   if (!wallet) return;

   console.log("🔄 Fetching comprehensive balances for:", wallet.toBase58());

   try {
       // 1. Fetch SOL
       const solBalance = await solConn.getBalance(wallet);
       document.getElementById('val-sol')!.innerText = (solBalance / 1e9).toFixed(3);

       // 2. Fetch SPL Tokens (USDC & OLV)
       const updateTokenUi = async (mint: PublicKey, elementId: string) => {
           try {
               const ata = await getAssociatedTokenAddress(mint, wallet);
               const info = await solConn.getTokenAccountBalance(ata);
               document.getElementById(elementId)!.innerText = info.value.uiAmountString || "0.00";
           } catch (e) {
               // If ATA doesn't exist, user has 0.00
               document.getElementById(elementId)!.innerText = "0.00";
           }
       };

       await updateTokenUi(OLV_MINT, 'bal-olv');
       await updateTokenUi(USDC_MINT, 'bal-usdc');

       // 3. Stake & Governance Check [2026-01-16]
       const provider = new AnchorProvider(solConn, (window as any).solana, { commitment: "confirmed" });
       const program = new Program(idl as any, provider);

       // Fetch all positions for this user to calculate total stake and check for vote locks
       const positions = await program.account.treePosition.all([
           { memcmp: { offset: 8, bytes: wallet.toBase58() } }
       ]);

       let totalFractions = 0;
       let hasVoted = false;

       positions.forEach((p: any) => {
           totalFractions += p.account.shares.toNumber();
           if (p.account.hasActiveVote) hasVoted = true;
       });

       // Update Personal Staked UI
       const stakedDisplay = document.getElementById('val-staked-personal');
       if (stakedDisplay) stakedDisplay.innerText = totalFractions.toLocaleString();

       // 4. Handle Lock Status & Admin Bypass [2026-02-07]
       const isAdmin = wallet.toBase58() === ADMIN_WALLET;
       const lockStatusEl = document.getElementById('lock-status')!;

       // Logic: If voted AND NOT admin, lock the wallet.
       if (hasVoted && !isAdmin) {
           lockStatusEl.innerText = "🚫 WALLET LOCKED (VOTED)";
           lockStatusEl.classList.add('text-red-500', 'animate-pulse');
           lockStatusEl.classList.remove('text-green-500');
       } else {
           lockStatusEl.innerText = isAdmin ? "⚡ ADMIN ACCESS" : "✅ VERIFIED MEMBER";
           lockStatusEl.classList.add('text-green-500');
           lockStatusEl.classList.remove('text-red-500', 'animate-pulse');
       }

   } catch (err) {
       console.error("❌ Balance Fetch Failed:", err);
   }
}
//----*DEBUG--------------****
const fetchAnalytics = async () => {
    try {
        console.log("--- Step 1: Fetching Field & Tree Data ---");
        const allFields = await program.account.field.all();
        const allTrees = await program.account.tree.all();

        console.log("Fields found:", allFields.length);
        console.log("Total Trees found:", allTrees.length);

        // Debugging the Genesis Filter (First 3 trees)
        const genesisTrees = allTrees
            .sort((a, b) => a.account.treeId - b.account.treeId)
            .slice(0, 3);

        console.log("Genesis Trees identified:", genesisTrees.map(t => t.publicKey.toBase58()));

        return { allFields, genesisTrees };
    } catch (err) {
        console.error("FAILED at Step 1 (Fetching):", err);
    }
};

const checkUserEligibility = async (userPubkey, treePubkey) => {
    try {
        console.log(`--- Step 2: Checking Eligibility for ${userPubkey.toBase58()} ---`);

        // Check for existing VoteRecord PDA
        const [voteRecordPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from("vote"), userPubkey.toBuffer()], // Adjust seeds based on your IDL
            PROGRAM_ID
        );

        const voteRecord = await program.account.voteRecord.fetchNullable(voteRecordPDA);

        if (voteRecord) {
            console.warn("USER HAS ALREADY VOTED. Access restricted.");
            return { canVote: false, status: "Voted" };
        }

        // Admin Bypass Check
        const isAdmin = userPubkey.equals(ADMIN_PUBKEY);
        console.log("Is Admin:", isAdmin);

        return { canVote: true, isAdmin };
    } catch (err) {
        console.error("FAILED at Step 2 (Eligibility):", err);
    }
};

const calculateYield = (treeAccount, treePosition) => {
    try {
        console.log("--- Step 3: Calculating Yield ---");
        if (!treePosition) {
            console.log("No position found for this tree.");
            return 0;
        }

        // Ensure we handle BN correctly to avoid "Precision loss" or "not a function"
        const shares = new BN(treePosition.shares);
        const totalShares = new BN(treeAccount.totalShares);

        console.log(`Shares: ${shares.toString()}, Total: ${totalShares.toString()}`);

        return shares.mul(new BN(100)).div(totalShares).toNumber(); // Example % calculation
    } catch (err) {
        console.error("FAILED at Step 3 (Yield Math):", err);
    }
};
///// DEBUG END **-------

/**
 * [2026-02-16] Deep Ownership Auditor - Multi-Field Sync
 * Scans the ledger to track Liquid vs Locked shares across the Genesis set.
 */
 /**
  * [2026-02-16] Deep Analytics Modal - Unified Sync
  * Merges On-Chain Tree Stats + User Position + Supabase Metadata
  */
 (window as any).openDeepModal = async (treePdaStr: string) => {
     const modal = document.getElementById('deepTreeModal');
     const content = document.getElementById('modal-content-deep');
     if (!modal || !content) return;

     modal.classList.remove('hidden');
     content.innerHTML = `
         <div class="p-20 text-center">
             <div class="animate-spin inline-block w-8 h-8 border-[3px] border-current border-t-transparent text-solana rounded-full mb-4"></div>
             <p class="animate-pulse font-black italic text-zinc-500 uppercase tracking-widest text-[10px]">Synchronizing Multi-Layer Metadata...</p>
         </div>
     `;

     try {
         const program = getProgram();
         const treePubKey = new PublicKey(treePdaStr);
         const wallet = (window as any).solana.publicKey;

         // 1. Fetch On-Chain Tree Data
         const treeAcc: any = await program.account.tree.fetch(treePubKey);

         // 2. Derive & Fetch User's Specific Position PDA
         const [positionPda] = PublicKey.findProgramAddressSync(
             [Buffer.from("position"), wallet.toBuffer(), treePubKey.toBuffer()],
             PROGRAM_ID
         );

         let userPosition = null;
         try {
             userPosition = await program.account.treePosition.fetch(positionPda);
         } catch (e) {
             console.log("No existing position found for this wallet on this tree.");
         }

         // 3. Fetch Metadata from Supabase [Matches 2026-01-10 Tree List]
         const { data: sbMeta, error: sbError } = await sb
             .from('tree_metadata')
             .select('*')
             .eq('tree_id', treeAcc.treeId)
             .single();

         if (sbError) console.warn("Supabase Meta Missing:", sbError.message);

         // --- Data Normalization ---
         const isAdmin = wallet.toBase58() === ADMIN_WALLET;
         const totalShares = treeAcc.totalShares?.toString() || "0";
         const liquidShares = userPosition?.shares?.toString() || "0";
         const lockedShares = userPosition?.lockedShares?.toString() || "0";
         const isVoted = userPosition?.hasActiveVote || false;

         // Asset Integrity Check [2026-02-07]
         const treeIdNum = parseInt(treeAcc.treeId.replace(/^\D+/g, ''));
         const isGenesis = treeIdNum <= 3;

         content.innerHTML = `
             <div class="flex justify-between items-start mb-10">
                 <div>
                     <div class="flex gap-2 mb-2">
                         ${isGenesis ? '<span class="text-[8px] bg-emerald-500 text-black px-2 py-0.5 rounded font-black uppercase italic">Genesis Alpha</span>' : ''}
                         <span class="text-[8px] bg-white/10 text-zinc-400 px-2 py-0.5 rounded font-black uppercase italic">On-Chain Verified</span>
                     </div>
                     <h2 class="text-5xl font-black italic text-white tracking-tighter uppercase">${treeAcc.treeId}</h2>
                     <p class="text-solana font-mono text-[9px] mt-2 font-bold opacity-60">${treePdaStr}</p>
                 </div>
                 <button onclick="document.getElementById('deepTreeModal').classList.add('hidden')" class="text-4xl text-zinc-700 hover:text-white transition-all">&times;</button>
             </div>

             <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
                 <div class="bg-white/[0.02] p-6 rounded-[2rem] border border-white/5">
                     <p class="text-[9px] text-zinc-500 uppercase font-black mb-1">Total Tree Supply</p>
                     <p class="text-2xl font-black text-white">${Number(totalShares).toLocaleString()} <span class="text-[10px] text-zinc-600">Fractions</span></p>
                 </div>
                 <div class="bg-emerald-500/5 p-6 rounded-[2rem] border border-emerald-500/10">
                     <p class="text-[9px] text-emerald-500/50 uppercase font-black mb-1">Your Liquid Position</p>
                     <p class="text-2xl font-black text-emerald-400">${Number(liquidShares).toLocaleString()}</p>
                 </div>
                 <div class="bg-amber-500/5 p-6 rounded-[2rem] border border-amber-500/10">
                     <p class="text-[9px] text-amber-500/50 uppercase font-black mb-1">Your Locked Position</p>
                     <p class="text-2xl font-black text-amber-500">${Number(lockedShares).toLocaleString()}</p>
                 </div>
             </div>

             <div class="grid grid-cols-1 lg:grid-cols-2 gap-10">
                 <div class="space-y-6">
                     <h3 class="text-[10px] font-black uppercase text-zinc-500 tracking-widest border-b border-white/5 pb-2 italic">Detailed Profile (Supabase)</h3>
                     <div class="space-y-4">
                         <p class="text-zinc-400 text-sm leading-relaxed">${sbMeta?.description || "No extended profile available for this genesis unit."}</p>
                         <div class="grid grid-cols-2 gap-4 text-[11px] font-mono">
                             <div class="flex justify-between"><span class="text-zinc-600">Cultivar</span> <span class="text-white">${sbMeta?.cultivar || treeAcc.cultivar}</span></div>
                             <div class="flex justify-between"><span class="text-zinc-600">Age</span> <span class="text-white">${sbMeta?.age || '2'} Years</span></div>
                             <div class="flex justify-between"><span class="text-zinc-600">Lat</span> <span class="text-white">${treeAcc.lat}</span></div>
                             <div class="flex justify-between"><span class="text-zinc-600">Lng</span> <span class="text-white">${treeAcc.lng}</span></div>
                         </div>
                     </div>
                 </div>

                 <div class="space-y-6">
                     <h3 class="text-[10px] font-black uppercase text-zinc-500 tracking-widest border-b border-white/5 pb-2 italic">Compliance Registry</h3>
                     <div class="bg-black/40 p-6 rounded-3xl border border-white/5 space-y-4">
                         <div class="flex justify-between items-center">
                             <span class="text-[10px] uppercase font-bold text-zinc-500">Governance Lock</span>
                             ${isVoted && !isAdmin
                                 ? '<span class="text-[9px] font-black text-red-500 animate-pulse italic">🚫 VOTE_LOCKED</span>'
                                 : '<span class="text-[9px] font-black text-emerald-500 italic">✅ ACTIVE</span>'}
                         </div>
                         <div class="flex justify-between items-center">
                             <span class="text-[10px] uppercase font-bold text-zinc-500">Wallet Mode</span>
                             <span class="text-[9px] font-black text-solana italic border border-solana/30 px-2 py-0.5 rounded">${isAdmin ? 'MASTER_ADMIN' : 'MEMBER_PORTAL'}</span>
                         </div>

                         <div class="pt-4 space-y-2">
                             <button onclick="window.stakeAction('${treePdaStr}')"
                                     class="w-full py-3 bg-white/5 hover:bg-white hover:text-black transition-all rounded-xl font-black text-[10px] uppercase tracking-widest border border-white/10">
                                 Manage Staking
                             </button>
                             ${isAdmin ? `
                                 <button class="w-full py-2 bg-solana/10 text-solana rounded-lg font-black text-[9px] uppercase tracking-tighter border border-solana/20">
                                     Admin: Trigger Maintenance Report
                                 </button>
                             ` : ''}
                         </div>
                     </div>
                 </div>
             </div>
         `;

     } catch (e: any) {
         console.error("Critical Analytics Failure:", e);
         content.innerHTML = `<div class="p-20 text-red-500 font-black text-center uppercase text-xs">Sync Error: ${e.message}</div>`;
     }
 };

 /**
 * [2026-02-16] Holder Staking Logic
 * Standard users move shares between Liquid and Staked pools.
 */

// 1. STAKE: Liquid -> Locked (Revenue Eligible)
export const stakeShares = async (treePdaStr: string, amount: number) => {
    try {
        const program = getProgram();
        const treePubKey = new PublicKey(treePdaStr);
        const wallet = (window as any).solana.publicKey;

        const [posPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("position"), wallet.toBuffer(), treePubKey.toBuffer()],
            program.programId
        );

        const tx = await program.methods
            .stakeShares(new anchor.BN(amount))
            .accounts({
                user: wallet,
                userPosition: posPda,
                tree: treePubKey,
                config: CONFIG_PDA, // Assume PDA defined globally
            })
            .rpc();

        console.log("Staking successful. TX:", tx);
        showNotification("Shares successfully staked for revenue.", "success");
    } catch (e: any) {
        console.error("Staking failed:", e);
        showNotification(`Staking Error: ${e.message}`, "error");
    }
};

// 2. UNSTAKE: Locked -> Liquid
export const unstakeShares = async (treePdaStr: string, amount: number) => {
    try {
        const program = getProgram();
        const treePubKey = new PublicKey(treePdaStr);
        const wallet = (window as any).solana.publicKey;

        const [posPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("position"), wallet.toBuffer(), treePubKey.toBuffer()],
            program.programId
        );

        // Fetch position to check lock status client-side for UX
        const posAcc = await program.account.treePosition.fetch(posPda);
        if (posAcc.hasActiveVote) {
            throw new Error("Wallet is locked due to active vote [2026-01-16]");
        }

        const tx = await program.methods
            .unstakeShares(new anchor.BN(amount))
            .accounts({
                user: wallet,
                userPosition: posPda,
                tree: treePubKey,
                config: CONFIG_PDA,
            })
            .rpc();

        console.log("Unstaking successful. TX:", tx);
        showNotification("Shares moved to liquid balance.", "success");
    } catch (e: any) {
        showNotification(e.message, "error");
    }
};
/**
 * [2026-02-16] Holder Logic: Staking & Unstaking
 * Ensures purchased shares remain liquid until manually staked.
 */

// Move Liquid Shares -> Staked (For Revenue & Voting)
export const handleStake = async (treePda: string, amount: number) => {
    try {
        const program = getProgram();
        const wallet = (window as any).solana.publicKey;
        const treePubKey = new PublicKey(treePda);

        const [posPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("position"), wallet.toBuffer(), treePubKey.toBuffer()],
            program.programId
        );

        console.log(`Staking ${amount} fractions for tree: ${treePda}`);

        await program.methods
            .stakeShares(new anchor.BN(amount))
            .accounts({
                user: wallet,
                userPosition: posPda,
                tree: treePubKey,
                config: CONFIG_PDA,
            })
            .rpc();

        showNotification("Success: Shares staked for revenue distribution.", "success");
        window.location.reload();
    } catch (err: any) {
        console.error("Stake failed:", err);
        showNotification(`Stake Error: ${err.message}`, "error");
    }
};

// Move Staked -> Liquid (Tradeable)
export const handleUnstake = async (treePda: string, amount: number) => {
    try {
        const program = getProgram();
        const wallet = (window as any).solana.publicKey;
        const treePubKey = new PublicKey(treePda);

        const [posPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("position"), wallet.toBuffer(), treePubKey.toBuffer()],
            program.programId
        );

        // Pre-flight check for Wallet Lock [2026-01-16]
        const posAcc = await program.account.treePosition.fetch(posPda);
        if (posAcc.hasActiveVote) {
            throw new Error("UNSTAKE_BLOCKED: Active vote lock detected.");
        }

        await program.methods
            .unstakeShares(new anchor.BN(amount))
            .accounts({
                user: wallet,
                userPosition: posPda,
                tree: treePubKey,
                config: CONFIG_PDA,
            })
            .rpc();

        showNotification("Success: Shares are now liquid and tradeable.", "success");
    } catch (err: any) {
        showNotification(err.message === "UNSTAKE_BLOCKED"
            ? "Cannot unstake while wallet is locked for voting."
            : "Unstake Failed", "error");
    }
};
/**
 * [2026-02-16] Holder Management UI
 * Handles manual Staking (Locking) and Unstaking (Unlocking)
 */
export const renderHolderControls = (treePda: string, liquid: number, staked: number, hasActiveVote: boolean) => {
    const container = document.getElementById('holder-actions-container');
    if (!container) return;

    container.innerHTML = `
        <div class="space-y-4 p-4 bg-white/5 rounded-2xl border border-white/10">
            <h4 class="text-[10px] font-black uppercase text-zinc-500 italic tracking-widest">Share Management</h4>

            <div class="flex flex-col gap-2">
                <div class="flex justify-between text-[9px] uppercase font-bold px-1">
                    <span class="text-emerald-500">Available: ${liquid}</span>
                    <button onclick="document.getElementById('stake-amount').value = ${liquid}" class="text-zinc-500 hover:text-white">Max</button>
                </div>
                <div class="flex gap-2">
                    <input id="stake-amount" type="number" placeholder="Amount" class="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs w-full focus:outline-none focus:border-emerald-500">
                    <button onclick="handleStake('${treePda}', document.getElementById('stake-amount').value)"
                            class="bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] uppercase px-4 rounded-lg transition-all">
                        Stake
                    </button>
                </div>
            </div>

            <div class="border-t border-white/5 my-2"></div>

            <div class="flex flex-col gap-2">
                <div class="flex justify-between text-[9px] uppercase font-bold px-1">
                    <span class="text-amber-500">Staked: ${staked}</span>
                    <button onclick="document.getElementById('unstake-amount').value = ${staked}" class="text-zinc-500 hover:text-white">Max</button>
                </div>
                <div class="flex gap-2">
                    <input id="unstake-amount" type="number" placeholder="Amount" class="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs w-full focus:outline-none">
                    ${hasActiveVote
                        ? `<div class="bg-red-500/20 text-red-500 font-black text-[8px] flex items-center px-4 rounded-lg uppercase text-center leading-tight">Vote Locked</div>`
                        : `<button onclick="handleUnstake('${treePda}', document.getElementById('unstake-amount').value)"
                                   class="bg-amber-500 hover:bg-amber-400 text-black font-black text-[10px] uppercase px-4 rounded-lg transition-all">
                                Unstake
                           </button>`
                    }
                </div>
                ${hasActiveVote ? `<p class="text-[7px] text-red-500/60 font-bold uppercase italic mt-1 text-center">Wallet is locked until active vote concludes [2026-01-16]</p>` : ''}
            </div>
        </div>
    `;
};
/**
 * [2026-01-16] Enhanced Action Handler
 * Validates voting status and admin permissions before allowing wallet calls.
 */
(window as any).validateAndExecute = async (treePositionPda: PublicKey, actionCallback: Function) => {
    const program = getProgram();
    const userAddr = program.provider.publicKey!.toBase58();
    const isAdmin = userAddr === ADMIN_ADDR;

    try {
        const position = await program.account.treePosition.fetch(treePositionPda);

        // RULE [2026-01-16]: If wallet has voted, do not allow calling the wallet
        if (position.hasActiveVote && !isAdmin) {
            alert("SECURITY: Wallet is locked due to active vote record.");
            return;
        }

        // RULE [2026-02-07]: The walletlock (lockUntil) does not apply to admin
        const now = Math.floor(Date.now() / 1000);
        if (position.lockUntil > now && !isAdmin) {
            alert(`ASSET LOCK: Fractions are restricted until ${new Date(position.lockUntil * 1000).toLocaleDateString()}`);
            return;
        }

        // If checks pass, execute the transaction
        await actionCallback();

    } catch (e) {
        console.error("Validation Error:", e);
    }
};

console.log("✅ Holder logic v2026-02-16 initialized.");
