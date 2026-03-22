/* main.ts */
import './polyfill';
import { Connection, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL, SystemProgram, Transaction } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import idl from "../idl.json";

// Constants from your IDL/Rust [2026-02-08]
const PROGRAM_ID = new PublicKey("6HjkwwiKSkr8YCtR9HchVZQ97CmjbBbrW2SeE2U8T6rj");

// Olive DAO Config [2026-02-08]
const ADMIN_WALLET = "8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54";
const DAO_VAULT = new PublicKey("FrNP32Hxhuu4pS8yguHhtTEdU9QpU7odRYi5zKNps15N");
const OLV_MINT = new PublicKey("6nab5Rttp45AfjaYrdwGxKuH9vK9RKCJdeaBvQJt8pLA");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

const solConn = new Connection(clusterApiUrl("devnet"), "confirmed");
const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

// --- 1. PRO AUDIT: CONNECT & SECURITY GATE ---

let isProcessing = false; // Prevents double-triggering

(window as any).connectWallet = async () => {
    if (isProcessing) return;
    isProcessing = true;

    console.log("📡 Audit Connect Initiated...");
    const wallet = (window as any).solana;
    if (!wallet) { isProcessing = false; return alert("Phantom not found"); }

    try {
        const resp = await wallet.connect();
        const userAddr = resp.publicKey.toString(); // Consistent string conversion
        const isAdmin = userAddr === ADMIN_WALLET;
        console.log(isAdmin)

        // 1. Update UI Button
        const btn = document.getElementById('btn-connect');
        if (btn) btn.innerHTML = `<span class="text-emerald-500">●</span> ${userAddr.slice(0, 4)}...${userAddr.slice(-4)}`;

        // 2. Fetch Assets
        const { data: assets } = await sb
            .from('tree_ownership')
            .select('*')
            .eq('wallet_address', userAddr);

        const hasStake = (assets?.length || 0) > 0;

        // 3. CHECK SESSION VERIFICATION
        const sessionKey = `compliance_${userAddr}`;
        const isVerifiedSession = sessionStorage.getItem(sessionKey) === 'true';

        console.log(`System Check | Wallet: ${userAddr.slice(0,8)} | Stake: ${hasStake} | VerifiedSession: ${isVerifiedSession}`);

        // 4. THE GATE [2026-01-16]
        if (!hasStake && !isAdmin && !isVerifiedSession) {
            console.log("🚫 Access Denied. Modal Triggered.");
            document.getElementById('tos-modal')?.classList.remove('hidden');
            isProcessing = false;
            return;
        }

        // 5. SUCCESS: Break the loop
        console.log("🔓 Access Granted.");
        document.getElementById('tos-modal')?.classList.add('hidden');
        // Inside connectWallet success
        const feed = document.getElementById('dynamic-feed');
        if (feed) feed.innerText = `SESSION ACTIVE: ${userAddr.slice(0,8)}... CONNECTED`;
        const main = document.getElementById('main-content');
        if (main) {
            main.classList.remove('opacity-20', 'pointer-events-none');
            main.style.opacity = "1";
            main.style.pointerEvents = "auto";
        }

        await revealDashboard(resp.publicKey, assets || [], isAdmin);

    } catch (err) {
        console.error("Connection Failed:", err);
    } finally {
        isProcessing = false;
    }
};

/* [2026-02-10] Global Scope Attachment Fix */

/**
 * Explicitly define and attach the bridge function to window
 * This prevents the "is not a function" error in HTML onclick events
 */
const initDetailActions = () => {
    (window as any).executeBuyFromDetail = async () => {
        console.log("🛰️ Buy Action Triggered from Detail View");

        // 1. Extract data from the visible modal elements
        const treeId = document.getElementById('det-tree-id')?.innerText;
        const variety = document.getElementById('det-cultivar')?.innerText || "Frantoio";
        const fieldId = "FIELD_01";

        // 2. Validation
        if (!treeId || treeId === "---") {
            console.error("❌ Action Aborted: Tree metadata not fully hydrated.");
            return;
        }

        // 3. Logic Check: Already Voted? [2026-01-16]
        if ((window as any).solana.isLockedByGovernance) {
            alert("⛔ COMPLIANCE_LOCK: Wallet restricted due to active vote.");
            return;
        }

        // 4. Call the core purchase logic
        // We ensure buyTreeShare is called with the captured data
        if (typeof (window as any).buyTreeShare === "function") {
            await (window as any).buyTreeShare(treeId, variety, fieldId);
        } else {
            console.error("❌ Critical: buyTreeShare core logic not found in scope.");
        }
    };
};

// Run the attachment immediately
initDetailActions();    
(window as any).showStakedDetail = async (treeId: string) => {
    const detailPanel = document.getElementById('staked-asset-detail');
    if (!detailPanel) return;

    try {
        // 1. Fetch metadata from Supabase
        const { data: tree, error } = await sb
            .from('tree_metadata')
            .select('*')
            .eq('tree_id', treeId)
            .single();
            // ADD THIS LINE:
const pdaInput = document.getElementById('det-tree-pda-internal') as HTMLInputElement;
if (pdaInput) pdaInput.value = tree.pda_address; // Or whatever your PDA column is named

        if (error || !tree) throw new Error("Metadata missing");

        // 2. Hydrate Detail UI
        updateEl('det-tree-id', tree.tree_id);
        updateEl('det-cultivar', tree.cultivar);
        updateEl('det-lat', tree.latitude.toFixed(4));
        updateEl('det-lng', tree.longitude.toFixed(4));
        updateEl('det-co2', `${tree.co2_offset || '24.5'}kg`);
        updateEl('det-roi', `${tree.roi_yield || '8.2'}%`);

        // 3. Health Gauge Logic
        const health = tree.health_score || 95;
        const healthBar = document.getElementById('det-health-bar');
        if (healthBar) healthBar.style.width = `${health}%`;
        updateEl('det-health-num', `${health}%`);

        // 4. Reveal Panel
        detailPanel.classList.remove('hidden');
        detailPanel.classList.add('flex');

        // 5. Initialize Mini-Map (If Google Maps is loaded)
        if ((window as any).google) {
            new (window as any).google.maps.Map(document.getElementById("mini-map"), {
                center: { lat: Number(tree.latitude), lng: Number(tree.longitude) },
                zoom: 18,
                mapTypeId: 'satellite',
                disableDefaultUI: true,
                styles: [{ featureType: "all", elementType: "labels", stylers: [{ visibility: "off" }] }]
            });
        }

    } catch (err) {
        console.error("Failed to load tree details:", err);
    }
};

(window as any).signAndInitialize = async () => {
    console.log("🔐 Signing Compliance [2026-01-16]...");
    const wallet = (window as any).solana;
    if (!wallet || !wallet.publicKey) return;

    try {
        const userAddr = wallet.publicKey.toString();
        const message = `OLIVE DAO COMPLIANCE [2026-01-16]\nI acknowledge asset locking and protocol terms.`;
        const encoded = new TextEncoder().encode(message);

        // 1. Force the sign
        await wallet.signMessage(encoded, "utf8");

        // 2. SET SESSION STORAGE (Use the exact same key format)
        const sessionKey = `compliance_${userAddr}`;
        sessionStorage.setItem(sessionKey, 'true');

        console.log(`✅ Compliance Logged for: ${sessionKey}`);

        // 3. CALL CONNECT AGAIN
        // Reset processing flag so the next call isn't blocked
        isProcessing = false;
        await (window as any).connectWallet();

    } catch (e) {
        console.error("Signature rejected:", e);
        alert("Verification failed.");
    }
};
async function revealDashboard(pubKey: PublicKey, assets: any[], isAdmin: boolean) {
    const main = document.getElementById('main-content');
    if (!main) return;

    main.classList.remove('opacity-20', 'pointer-events-none');
    main.style.opacity = "1";

    // Update Balance Display
    const sol = await solConn.getBalance(pubKey);
    const solLabel = document.getElementById('val-sol');
    if (solLabel) solLabel.innerText = (sol / LAMPORTS_PER_SOL).toFixed(3);

    // --- ADMIN OVERLAY LOGIC ---
    const adminPanel = document.getElementById('admin-controls');
    if (isAdmin && adminPanel) {
        adminPanel.classList.remove('hidden');
        adminPanel.innerHTML = `
            <div class="flex gap-4 mb-8 p-1 bg-white/5 rounded-2xl w-fit border border-white/10">
                <button onclick="window.switchView('user')" id="view-user-btn" class="px-6 py-2 rounded-xl text-[10px] font-bold uppercase transition-all bg-emerald-500 text-black">Market View</button>
                <button onclick="window.switchView('admin')" id="view-admin-btn" class="px-6 py-2 rounded-xl text-[10px] font-bold uppercase transition-all text-zinc-400 hover:text-white">DAO Management</button>
            </div>
        `;
    }

    // Default to Market View
    await renderMarketplace();
}

// Global Switcher
(window as any).switchView = (mode: 'user' | 'admin') => {
    const marketGrid = document.getElementById('marketplace-grid');
    const managePanel = document.getElementById('management-panel');
    const uBtn = document.getElementById('view-user-btn');
    const aBtn = document.getElementById('view-admin-btn');

    if (mode === 'admin') {
        marketGrid?.classList.add('hidden');
        managePanel?.classList.remove('hidden');
        uBtn?.classList.replace('bg-emerald-500', 'text-zinc-400');
        uBtn?.classList.remove('text-black');
        aBtn?.classList.replace('text-zinc-400', 'bg-emerald-500');
        aBtn?.classList.add('text-black');
        renderAdminManagement();
    } else {
        marketGrid?.classList.remove('hidden');
        managePanel?.classList.add('hidden');
        aBtn?.classList.replace('bg-emerald-500', 'text-zinc-400');
        aBtn?.classList.remove('text-black');
        uBtn?.classList.replace('text-zinc-400', 'bg-emerald-500');
        uBtn?.classList.add('text-black');
    }
};
async function renderAdminManagement() {
    const panel = document.getElementById('management-panel');
    if (!panel) return;

    panel.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="glass p-8 rounded-[2.5rem] border border-emerald-500/20">
                <h3 class="text-xl font-black italic text-white mb-6 uppercase">Initialize Field</h3>
                <input id="field-name-in" placeholder="Field Name (e.g. Alpha-01)" class="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs mb-4">
                <button onclick="window.initFieldOnChain()" class="w-full py-4 bg-white/5 border border-white/10 text-white rounded-xl font-bold text-[10px] hover:bg-emerald-500 hover:text-black transition-all">CREATE FIELD PDA</button>
            </div>

            <div class="glass p-8 rounded-[2.5rem] border border-blue-500/20">
                <h3 class="text-xl font-black italic text-white mb-6 uppercase">Add Tree to Field</h3>
                <select id="field-select" class="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs mb-4 text-white">
                    <option>Loading Active Fields...</option>
                </select>
                <input id="tree-id-in" placeholder="New Tree ID (F1-PE-004)" class="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs mb-4">
                <button onclick="window.registerTreeOnChain()" class="w-full py-4 bg-emerald-500 text-black rounded-xl font-bold text-[10px] uppercase">Mint Tree to Registry</button>
            </div>
        </div>
    `;

    // Auto-populate field dropdown from Supabase
    const { data: fields } = await sb.from('fields').select('*');
    const select = document.getElementById('field-select') as HTMLSelectElement;
    if (select && fields) {
        select.innerHTML = fields.map(f => `<option value="${f.address}">${f.name}</option>`).join('');
    }
}
(window as any).registerTreeOnChain = async () => {
    const wallet = (window as any).solana;
    const provider = new AnchorProvider(solConn, wallet, { preflightCommitment: "confirmed" });
    const program = new Program(idl as any, provider);

    const treeId = (document.getElementById('tree-id-in') as HTMLInputElement).value;
    const fieldAddr = (document.getElementById('field-select') as HTMLSelectElement).value;
    const fieldPubkey = new PublicKey(fieldAddr);

    // [2026-02-08] Seed: "tree" + field_pubkey + tree_id
    const [treePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("tree"), fieldPubkey.toBuffer(), Buffer.from(treeId)],
        PROGRAM_ID
    );

    try {
        await program.methods
            .addTreeToField(treeId) // Rust: pub fn add_tree_to_field(ctx: Context<AddTree>, tree_id: String)
            .accounts({
                tree: treePda,
                field: fieldPubkey,
                authority: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        // Sync to Supabase for the marketplace
        await sb.from('tree_ownership').insert({
            tree_id: treeId,
            field_address: fieldAddr,
            tree_address: treePda.toString(),
            fractions_owned: 0
        });

        alert(`Tree ${treeId} initialized on-chain.`);
        window.switchView('user'); // Go back to market to see it
    } catch (e) {
        console.error(e);
    }
};
// [2026-02-08] Live Market Intelligence
const MARKET_DATA = {
    sol: 88.32,      // Live SOL/USD
    carbon: 85.10,   // EU Carbon Permits ($USD converted)
    oil: 4.70,       // Spanish EVOO ($USD per KG)
    olv: 0.42        // DAO Internal
};

async function initTicker() {
    console.log("📈 Initializing Market Feed...");

    // Update Static Values immediately
    const updates = {
        'tick-sol': `$${MARKET_DATA.sol}`,
        'tick-olv': `$${MARKET_DATA.olv}`,
        'tick-oil': `$${MARKET_DATA.oil}/KG`,
        'tick-co2': `$${MARKET_DATA.carbon}/T`
    };

    Object.entries(updates).forEach(([id, val]) => {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    });

    // Dynamic Feed Rotation
    const feed = document.getElementById('dynamic-feed');
    const events = [
        `SOLANA NETWORK: ${MARKET_DATA.sol} USD`,
        `GENESIS UNITS: F1-FR-001 TO 003 ACTIVE`,
        `CARBON INDEX: $${MARKET_DATA.carbon} [STABLE]`,
        `STAKE LOCK: ACTIVE FOR NON-ADMINS`,
        `OIL PRICE: $${MARKET_DATA.oil} (SPANISH EVOO)`,
        `REGISTRY: FIELD_01 UPLINK SYNCED`
    ];

    let i = 0;
    setInterval(() => {
        if (feed) {
            feed.style.opacity = '0';
            setTimeout(() => {
                feed.innerText = events[i];
                feed.style.opacity = '1';
                i = (i + 1) % events.length;
            }, 500);
        }
    }, 4000);
}

/**
 * Bridge function to call the on-chain purchase from the detail modal
 */
(window as any).executeBuyFromDetail = async () => {
    // 1. Get the values currently displayed in the detail modal
    const treeId = document.getElementById('det-tree-id')?.innerText;
    const variety = document.getElementById('det-cultivar')?.innerText;
    const fieldId = "FIELD_01"; // Consistent with your Field_01 requirement

    if (!treeId || treeId === "---") return alert("Error: Tree data not loaded.");

    // 2. Call your existing purchase function
    // Usage: buyTreeShare(treeId, variety, fieldId)
    await (window as any).buyTreeShare(treeId, variety, fieldId);
};

(window as any).buyTreeFractions = async (treeId: string, treeAddress: string, listingAddress: string, sellerAddress: string) => {
    const provider = (window as any).anchorProvider;
    const program = new Program(idl, programId, provider);
    const buyer = provider.wallet.publicKey;

    // 1. Derive the Buyer's TreePosition PDA
    // Seed: [b"position", buyer_pubkey, tree_pubkey]
    const [buyerPosition] = await PublicKey.findProgramAddress(
        [Buffer.from("position"), buyer.toBuffer(), new PublicKey(treeAddress).toBuffer()],
        program.programId
    );

    const treePubkey = new PublicKey(treeAddress);
    const listingPubkey = new PublicKey(listingAddress);
    const sellerPubkey = new PublicKey(sellerAddress);

    try {
        console.log("🌲 Initiating On-Chain Acquisition...");

        await program.methods
            .purchaseTreeShares()
            .accounts({
                buyer: buyer,
                seller: sellerPubkey,
                config: globalConfigAddress, // Your DAO's global config PDA
                field: fieldAddress,         // The field this tree belongs to [2026-01-10]
                tree: treePubkey,
                listing: listingPubkey,
                buyerPosition: buyerPosition,
                treeRevenueVault: treeRevenueVault, // Fills the pool for future yield
                treasury: daoTreasury,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        // 3. Update Ticker [2026-02-08]
        broadcastBuyToTicker(buyer.toString(), treeId, "shares");

    } catch (err) {
        console.error("Purchase failed:", err);
        // Handle WalletLockedByVote error [2026-01-16]
        if (err.message.includes("WalletLockedByVote")) {
            alert("This wallet has already voted and is locked.");
        }
    }
};
/**
 * [2026-02-08] On-Chain Sync: Forces DB to match Solana Ledger
 */
(window as any).syncSharesWithChain = async (treeId: string, treeAddress: string) => {
    const wallet = (window as any).solana;
    if (!wallet.publicKey) return;

    const provider = new AnchorProvider(solConn, wallet, { preflightCommitment: "confirmed" });
    const program = new Program(idl as any, provider);

    try {
        console.log(`🔄 Syncing shares for ${treeId}...`);

        // 1. Derive the TreePosition PDA
        const treePubkey = new PublicKey(treeAddress);
        const [positionPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("position"), wallet.publicKey.toBuffer(), treePubkey.toBuffer()],
            PROGRAM_ID
        );

        // 2. Fetch the On-Chain Account
        const positionAccount = await program.account.treePosition.fetch(positionPda);
        const actualShares = positionAccount.shares.toNumber();
        const isLocked = positionAccount.hasActiveVote; // [2026-01-16] lock check

        // 3. Update Supabase with the Truth
        await sb.from('tree_ownership').upsert({
            tree_id: treeId,
            wallet_address: wallet.publicKey.toString(),
            fractions_owned: actualShares,
            is_locked: isLocked
        });

        console.log(`✅ Sync Complete: ${actualShares} shares confirmed on-chain.`);
        alert(`Sync Successful: ${actualShares}/1000 shares verified.`);
        await renderMarketplace();

    } catch (err) {
        console.error("Sync failed (Position likely doesn't exist yet):", err);
    }
};

async function renderMarketplace() {
    const wallet = (window as any).solana;
    const grid = document.getElementById('marketplace-grid');
    if (!grid) return;

    // 1. Setup Connection & Program
    const provider = new AnchorProvider(solConn, wallet, { preflightCommitment: "confirmed" });
    const program = new Program(idl as any, provider);

    try {
        console.log("🛰️ Fetching On-Chain Tree Registry...");

        // 2. Pull ALL Tree Accounts from the Blockchain
        const onChainTrees = await program.account.tree.all();

        // 3. Optional: Enrich with Supabase metadata (for field names/images)
        const { data: dbTrees } = await sb.from('tree_ownership').select('*');

        if (onChainTrees.length === 0) {
            grid.innerHTML = `<div class="col-span-full text-center p-20 mono text-zinc-500 italic uppercase">No assets found on-chain.</div>`;
            return;
        }

        // 4. Genesis IDs for specific styles [2026-02-07]
        const genesisIds = ["F1-FR-001", "F1-LE-002", "F1-PE-003"];

        grid.innerHTML = onChainTrees.map(treeAccount => {
            const data = treeAccount.account;
            const treeId = data.treeId; // String from your Rust struct
            const isGenesis = genesisIds.includes(treeId);

            // On-chain values (using BN for u64)
            const priceInLamports = data.price.toNumber();
            const priceInSol = priceInLamports / LAMPORTS_PER_SOL;
            const totalShares = data.shares.toNumber();

            return `
                <div class="glass p-6 rounded-[2.5rem] border ${isGenesis ? 'border-emerald-500/30 shadow-lg shadow-emerald-500/5' : 'border-white/5'} transition-all hover:scale-[1.01]">
                    <div class="flex justify-between items-center mb-4">
                        <span class="text-[9px] mono text-zinc-500 uppercase">Registry: FIELD_${data.field.toString().slice(0,4)}</span>
                        ${isGenesis ? '<span class="text-emerald-400 font-bold text-[8px] tracking-widest animate-pulse">● GENESIS_UNIT</span>' : ''}
                    </div>

                    <h3 class="text-2xl font-black italic text-white tracking-tighter">${treeId}</h3>

                    <div class="mt-4 grid grid-cols-2 gap-2 text-[10px] mono">
                        <div class="bg-white/5 p-3 rounded-xl border border-white/5">
                            <p class="text-zinc-500 mb-1">UNIT PRICE</p>
                            <p class="text-white font-bold">${priceInSol.toFixed(4)} SOL</p>
                        </div>
                        <div class="bg-white/5 p-3 rounded-xl border border-white/5">
                            <p class="text-zinc-500 mb-1">LIQUIDITY</p>
                            <p class="text-emerald-500 font-bold">${totalShares}/1000</p>
                        </div>
                    </div>

                    <div class="mt-4 bg-black/20 p-4 rounded-2xl border border-white/5">
                        <label class="text-[9px] mono text-zinc-500 block mb-2">FRACTIONAL ACQUISITION (SHARES)</label>
                        <div class="flex items-center gap-3">
                            <input type="number" id="qty-${treeId}" value="10" min="1" max="1000"
                                class="w-full bg-transparent text-lg font-bold text-white focus:outline-none focus:ring-0">
                            <span class="text-zinc-600 mono text-xs">/1000</span>
                        </div>
                    </div>

                    <button onclick="window.initiatePurchase('${treeId}', '${treeAccount.publicKey.toString()}', '${data.field.toString()}')"
                        class="mt-4 w-full py-4 ${isGenesis ? 'bg-emerald-500 text-black' : 'bg-white/10 text-white'} rounded-2xl font-black text-[10px] uppercase tracking-widest hover:brightness-110 transition-all">
                        Initiate Pool Fill
                    </button>

                    <div class="mt-3 text-center">
                        <a href="https://explorer.solana.com/address/${treeAccount.publicKey.toString()}?cluster=devnet" target="_blank"
                            class="text-[7px] mono text-zinc-600 hover:text-blue-400 uppercase">
                            Verify Ledger: ${treeAccount.publicKey.toString().slice(0,8)}...
                        </a>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error("Failed to render on-chain market:", err);
    }
}
/**
 * Purchase logic utilizing the TreePosition pool filling
 */
(window as any).initiatePurchase = async (treeId: string, treeAddress: string, fieldAddress: string) => {
    const wallet = (window as any).solana;
    const provider = new AnchorProvider(solConn, wallet, { preflightCommitment: "confirmed" });
    const program = new Program(idl as any, provider);

    const qtyInput = document.getElementById(`qty-${treeId}`) as HTMLInputElement;
    const shares = new BN(qtyInput.value);

    try {
        const treePubkey = new PublicKey(treeAddress);
        const fieldPubkey = new PublicKey(fieldAddress);

        // Derive PDAs
        const [positionPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("position"), wallet.publicKey.toBuffer(), treePubkey.toBuffer()],
            PROGRAM_ID
        );

        console.log(`📡 Sending Transaction: Purchase ${shares.toString()} shares...`);

        // Call purchase_tree_shares (Ensure args match your lib.rs order)
        await program.methods
            .purchaseTreeShares(shares)
            .accounts({
                buyer: wallet.publicKey,
                tree: treePubkey,
                field: fieldPubkey,
                buyerPosition: positionPda,
                treeRevenueVault: DAO_VAULT,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        // Immediate Sync
        await (window as any).syncSharesWithChain(treeId, treeAddress);

        // Update Ticker
        const truncated = `${wallet.publicKey.toString().slice(0,4)}...`;
        const feed = document.getElementById('dynamic-feed');
        if (feed) feed.innerText = `🔥 POOL UPDATE: ${truncated} filled ${shares.toString()} shares of ${treeId}`;

    } catch (err: any) {
        if (err.message.includes("WalletLockedByVote")) {
            alert("VOTING LOCK ACTIVE [2026-01-16]: Shares cannot be moved while a vote is cast.");
        } else {
            console.error(err);
        }
    }
};
/**
 * Injects the buy event into the marquee feed
 */
function broadcastBuyToTicker(wallet: string, treeId: string, qty: number) {
    const feed = document.getElementById('dynamic-feed');
    const truncated = `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
    const eventMsg = `🔥 NEW ACQUISITION: ${truncated} bought ${qty}/1000 of ${treeId}`;

    if (feed) {
        feed.innerText = eventMsg;
        feed.classList.add('text-emerald-400');
        // Reverts to normal color after 10 seconds
        setTimeout(() => feed.classList.remove('text-emerald-400'), 10000);
    }
}










// Start immediately
window.addEventListener('DOMContentLoaded', initTicker);
async function syncMarketTicker() {
    try {
        // 1. Fetch Real Crypto Prices
        const cryptoResp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana,usd-coin&vs_currencies=usd');
        const cryptoData = await cryptoResp.json();

        const solPrice = cryptoData.solana.usd;
        const usdcPrice = cryptoData['usd-coin'].usd;

        // 2. February 2026 Market Benchmarks
        const carbonPriceEUR = 78.73; // EUR per Tonne (EUA Permits)
        const oliveOilPriceKG = 4.35; // EUR per KG (Spain EVOO)
        const eurToUsd = 1.08; // Current Exchange Rate

        const carbonUSD = (carbonPriceEUR * eurToUsd).toFixed(2);
        const oilUSD = (oliveOilPriceKG * eurToUsd).toFixed(2);
        const olvTokenPrice = 0.42; // DAO Internal

        // 3. Update Static Elements
        document.getElementById('tick-sol')!.innerHTML = `$${solPrice.toFixed(2)}`;
        document.getElementById('tick-olv')!.innerHTML = `$${olvTokenPrice.toFixed(2)}`;

        // Target specifically named spans for Oil and CO2
        const oilEl = document.getElementById('tick-oil');
        const co2El = document.getElementById('tick-co2');
        if (oilEl) oilEl.innerText = `$${oilUSD}/KG`;
        if (co2El) co2El.innerText = `$${carbonUSD}/T`;

        // 4. Dynamic Feed: Real-time DAO Events [2026-02-07]
        // Include genesis planting and staking info
        const feed = document.getElementById('dynamic-feed');
        const internalEvents = [
            `LIVE: SOLANA NETWORK @ ${solPrice.toFixed(2)} USD`,
            `REGISTRY: GENESIS UNITS F1-FR-001 THROUGH 003 ACTIVE`,
            `CLIMATE: CARBON INDEX STABLE AT $${carbonUSD}`,
            `STAKE: ADMIN WALLET BYPASS ACTIVE [2026-02-07]`,
            `MARKET: EXTRA VIRGIN INDEX $${oilUSD}/KG`,
            `ALERT: NEW ASSET FRACTIONALIZATION IN FIELD_01`
        ];

        let eventIdx = 0;
        setInterval(() => {
            if (feed) {
                feed.innerText = internalEvents[eventIdx];
                eventIdx = (eventIdx + 1) % internalEvents.length;
            }
        }, 6000);

    } catch (e) {
        console.error("Ticker Intelligence Failure:", e);
    }
}
/**
 * 2. SYNC ADMIN STATE & ON-CHAIN DATA
 */
async function syncAdminState(pubKey: PublicKey, isAdmin: boolean) {
    updateEl('admin-addr-display', pubKey.toString());

    const provider = new AnchorProvider(solConn, (window as any).solana, {});
    const program = new Program(idl as any, provider);

    try {
        // A. Fetch All Trees from Chain
        const trees = await program.account.tree.all();
        updateEl('field-count', `${trees.length} Trees`);

        // B. Populate Tree Integrity Table
        const treeList = document.getElementById('tree-list');
        if (treeList) {
            treeList.innerHTML = trees.map(t => `
                <tr class="border-b border-zinc-900">
                    <td class="py-2 text-white">${t.account.treeId}</td>
                    <td class="text-right text-green-500">${t.account.shares.toString()}</td>
                </tr>
            `).join('');
        }

        // C. Populate Dropdown for "Planting"
        const selector = document.getElementById('tree-selector') as HTMLSelectElement;
        if (selector) {
            // Mocking list of potential IDs from registry
            const options = ["F1-FR-001", "F1-LE-002", "F1-PE-003", "F1-PE-004"];
            selector.innerHTML = options.map(id => `<option value="${id}">${id}</option>`).join('');
        }

        // D. Populate Field Integrity from Supabase
        const { data: fields } = await sb.from('fields').select('*');
        const fieldList = document.getElementById('field-list-body');
        if (fieldList && fields) {
            fieldList.innerHTML = fields.map(f => `
                <tr class="border-b border-zinc-900">
                    <td class="py-2 text-white">${f.name}</td>
                    <td class="text-right text-blue-400 font-mono text-[9px]">${f.address.slice(0,12)}...</td>
                </tr>
            `).join('');
        }

    } catch (err) {
        console.error("Sync Error", err);
    }
}
/**
 * 4. PLANT FROM DROPDOWN
 * Logic for the "Plant Selected" button
 */
(window as any).plantFromDropdown = async () => {
    const treeId = (document.getElementById('tree-selector') as HTMLSelectElement).value;
    if (!treeId) return alert("Select a Tree ID first");

    console.log(`🌱 Planting Tree: ${treeId}`);

    const provider = new AnchorProvider(solConn, (window as any).solana, {});
    const program = new Program(idl as any, provider);

    try {
        // 1. Get current field (Hardcoded to Field 01 for this example)
        const { data: fieldData } = await sb.from('fields').select('*').limit(1).single();
        if (!fieldData) throw new Error("No fields in DB");

        const fieldPubKey = new PublicKey(fieldData.address);
        const [treePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("tree"), fieldPubKey.toBuffer(), Buffer.from(treeId)],
            PROGRAM_ID
        );

        // 2. Execute On-Chain
        await program.methods
            .addTreeToField(treeId)
            .accounts({
                tree: treePda,
                field: fieldPubKey,
                config: DAO_VAULT, // Usually the Global Config PDA
                authority: provider.wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        alert(`Successfully Planted ${treeId} on-chain!`);
        await syncAdminState(provider.wallet.publicKey, true);
    } catch (err) {
        console.error("Planting failed", err);
        alert("Transaction failed. Check console.");
    }
};

/**
 * 5. DB SYNC (OWNERSHIP LEDGER)
 */
(window as any).loadOwnershipData = async () => {
    console.log("🔄 Syncing Ownership Ledger...");
    const { data: owners } = await sb.from('tree_ownership').select('*');
    const display = document.getElementById('admin-display');
    if (display && owners) {
        display.innerHTML = owners.map(o => `
            <tr class="border-b border-zinc-900">
                <td class="py-2 text-white">${o.tree_id}</td>
                <td class="font-mono text-zinc-500">${o.wallet_address.slice(0,10)}...</td>
                <td class="text-right ${o.fractions_owned > 0 ? 'text-green-500' : 'text-zinc-700'}">
                    ${o.fractions_owned > 0 ? 'ACTIVE' : 'EMPTY'}
                </td>
            </tr>
        `).join('');
    }
};

// Start feed on load
window.addEventListener('DOMContentLoaded', () => {
    updateEl('system-status', "AWAITING_MASTER_KEY");
});
(window as any).initSecureSession = async () => {
    // Re-assigning locally to be safe
    const providerWallet = (window as any).solana;
    const dbClient = (window as any).sbClient;
    const netConn = (window as any).connection;

    if (!providerWallet) return alert("Phantom Extension Required");

    try {
        // 1. Establish Wallet Link
        const sessionResponse = await providerWallet.connect();
        const userAddress = sessionResponse.publicKey.toString();

        // 2. Security Check [2026-01-16]: Verify Governance Lock
        const { data: memberProfile } = await dbClient
            .from('tree_ownership')
            .select('has_voted')
            .eq('wallet_address', userAddress)
            .maybeSingle();

        if (memberProfile?.has_voted) {
            alert("ACCESS DENIED: Wallet locked per Rule [2026-01-16].");
            return;
        }

        // 3. UI Indicators (Visual Proof of "Ready")
        console.log("⚡ Uplink Synchronized");
        const light = document.getElementById('uplink-light');
        const term = document.getElementById('session-terminal');
        const trigger = document.getElementById('auth-trigger');

        if (light) light.className = "w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_15px_#10b981]";
        if (term) term.innerText = `Uplink: ${userAddress.slice(0,8)}... ACTIVE`;
        if (trigger) {
            trigger.innerText = "Uplink Secure";
            trigger.className = "bg-emerald-900/40 text-emerald-400 border border-emerald-500/30 px-8 py-2.5 rounded-full font-bold text-[10px] uppercase tracking-widest cursor-default";
        }

        // 4. Reveal Dashboard
        const mainPanel = document.getElementById('member-terminal');
        if (mainPanel) {
            mainPanel.style.opacity = "1";
            mainPanel.style.filter = "blur(0px)";
            mainPanel.style.pointerEvents = "auto";
        }

        // 5. Sync Balances (Safe access to connection)
        if (netConn) {
            const balanceLamports = await netConn.getBalance(sessionResponse.publicKey);
            const solOutput = document.getElementById('asset-sol');
            if (solOutput) solOutput.innerHTML = `${(balanceLamports / 1e9).toFixed(3)} <span class="text-xs opacity-20 not-italic">SOL</span>`;
        }

        // 6. Genesis Assets [2026-02-07]
        await syncGenesisMarket(userAddress);

    } catch (authError) {
        console.error("Session Init Failed:", authError);
    }
};
