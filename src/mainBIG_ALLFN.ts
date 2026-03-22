import './polyfill';
import { Connection, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import idl from "./idl.json";
import fields from "../mock/Field_list.json";
import treesMetadata from "../mock/trees.json";
import { createClient } from "@supabase/supabase-js";

// CRITICAL: Your designated Admin Wallet
const ADMIN_WALLET =  "8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54";
const ADMIN_DAO_WALLET = "FrNP32Hxhuu4pS8yguHhtTEdU9QpU7odRYi5zKNps15N";//


// --- 1. CONFIGURATION ---
const DAO_VAULT = new PublicKey("FrNP32Hxhuu4pS8yguHhtTEdU9QpU7odRYi5zKNps15N");
const programId = new PublicKey("8MdiqqhZj1badeLArqCmZWeiWGK8tXQWiydRLcqzDn45");
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

// Supabase Setup
const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const sbClient = createClient(SB_URL, SB_KEY);
(window as any).sbClient = sbClient;
(window as any).supabase = sbClient;

export const isWalletAdmin = (pubkey: string | null) => pubkey === ADMIN_WALLET;

export const secureAdminAction = async (wallet: any) => {
    if (!wallet || !wallet.publicKey) throw new Error("Wallet not ed");

    const pubKeyStr = wallet.publicKey.toString();
if (pubKeyStr !== ADMIN_WALLET && pubKeyStr !== ADMIN_DAO_WALLET) {
          alert("ACCESS DENIED: Unauthorized Admin Attempt");
        throw new Error("Unauthorized");
    }

    // Cryptographic proof of ownership
    const message = `Olive DAO Admin Auth: ${new Date().toISOString().split('T')[0]}`;
    const encodedMessage = new TextEncoder().encode(message);
    try {
        await wallet.signMessage(encodedMessage, "utf8");
        return true;
    } catch (err) {
        throw new Error("Signature verification failed");
    }
};
window.refreshAllAdminData = async () => {
    console.log("🔄 Initializing Full UI Refresh...");
    const wallet = (window as any).solana;
    const adminAddrDisplay = document.getElementById('admin-addr-display');
    const systemStatus = document.getElementById('system-status');

    if (!wallet.publicKey) return;

    // 1. Update Header UI
    if (adminAddrDisplay) adminAddrDisplay.innerText = wallet.publicKey.toBase58();
    if (systemStatus) systemStatus.innerText = "PROTOCOL_ED_SECURE";

    try {
        // 2. Run all data fetches in parallel for speed
        await Promise.all([
            window.loadFieldsFromChain(),   // Updates Field Registry Table
            window.loadTreeIntegrity(),     // Updates Tree Integrity Table
            window.loadSupabaseListings(),  // Updates Market Listings Table
            window.updateVaultBalance()      // Updates Financial/SOL display
        ]);

        console.log("✅ All UI Fields Updated.");
    } catch (err) {
        console.error("Critical Refresh Error:", err);
    }
};
(window as any).saveFieldToSupabase = async (fieldId: string) => {
    const supabase = (window as any).supabase;

    // Get values from inputs
    const soilPh = (document.getElementById('edit-ph') as HTMLInputElement).value;
    const moisture = (document.getElementById('edit-moisture') as HTMLInputElement).value;
    const temp = (document.getElementById('edit-temp') as HTMLInputElement).value;

    try {
        const { error } = await supabase
            .from('field_analytics')
            .upsert({
                field_id: fieldId,
                soil_ph: soilPh,
                moisture: moisture,
                temp: temp,
                updated_at: new Date().toISOString()
            });

        if (error) throw error;
        alert("✅ Station Metadata Synchronized.");
    } catch (err) {
        console.error("Supabase Error:", err);
        alert("❌ Sync Failed.");
    }
};
const getProgram = () => {
    const wallet = (window as any).solana;
    if (!wallet?.publicKey) return null;
    const provider = new anchor.AnchorProvider(Connection, wallet, { preflightCommitment: "confirmed" });
    return new anchor.Program(idl as any, provider);
};
(window as any).getProgram = getProgram;



(window as any).syncUserPortal = async () => {
    const wallet = (window as any).solana;
    const conn: Connection = (window as any).connection;
    const sb = (window as any).sbClient;

    if (!wallet || !wallet.publicKey) return;

    const userAddress = wallet.publicKey;
    const isAdmin = userAddress.toString() === ADMIN_WALLET;

    try {
        // --- 1. OLV TOKEN BALANCE (From ATA) ---
        let olvBalance = "0.00";
        try {
            const ata = await getAssociatedTokenAddress(OLV_MINT, userAddress);
            const tokenAccount = await getAccount(conn, ata);
            olvBalance = (Number(tokenAccount.amount) / 1e9).toFixed(2); // Assuming 9 decimals
        } catch (e) {
            console.warn("OLV ATA not found or empty.");
        }

        // --- 2. PERSONAL STAKED BALANCE (From Chain/Supabase) ---
        // We fetch the count of 'staked' trees owned by this user
        const { data: stakedAssets } = await sb
            .from('tree_ownership')
            .select('*')
            .eq('owner_address', userAddress.toString())
            .eq('is_staked', true);

        const personalStaked = stakedAssets?.length || 0;

        // --- 3. TOTAL DAO VAULT STAKE (Live from Vault Address) ---
        const vaultLamports = await conn.getBalance(DAO_VAULT);
        const totalVaultSol = (vaultLamports / LAMPORTS_PER_SOL).toFixed(2);

        // --- 4. UI HYDRATION ---

        // Wallet Section (OLV + SOL)
        const olvEl = document.getElementById('asset-olv');
        if (olvEl) olvEl.innerHTML = `${olvBalance} <span class="text-[10px] opacity-30">OLV</span>`;

        const solEl = document.getElementById('asset-sol');
        if (solEl) {
            const solBal = await conn.getBalance(userAddress);
            solEl.innerHTML = `${(solBal / LAMPORTS_PER_SOL).toFixed(3)} <span class="text-[10px] opacity-30">SOL</span>`;
        }

        // Staked Section (Clear separate area)
        const stakedGrid = document.getElementById('stake-info-display');
        if (stakedGrid) {
            stakedGrid.innerHTML = `
                <div class="grid grid-cols-2 gap-4 p-4 glass rounded-2xl border border-emerald-500/20">
                    <div>
                        <p class="text-[9px] mono text-zinc-500 uppercase">Your Staked Units</p>
                        <p class="text-xl font-black italic text-emerald-400">${personalStaked} <span class="text-xs">TREES</span></p>
                    </div>
                    <div class="border-l border-white/5 pl-4">
                        <p class="text-[9px] mono text-zinc-500 uppercase">Total DAO Treasury</p>
                        <p class="text-xl font-black italic text-white">${totalVaultSol} <span class="text-xs">SOL</span></p>
                    </div>
                </div>
            `;
        }

        // [2026-01-16] Vote Lock Check
        const lockUI = document.getElementById('lock-status-ui');
        const hasActiveVote = stakedAssets?.some((t: any) => t.is_locked === true);

        if (hasActiveVote && !isAdmin) {
            if (lockUI) lockUI.innerText = "VAULT_LOCKED";
            console.warn("⛔ Governance Lock Active");
        }

        indicateReadyState(isAdmin);

    } catch (err) {
        console.error("❌ Portal Sync Failed:", err);
    }
};
/**
 * [2026-02-07] Genesis Market Renderer
 */
async function renderGenesisMarket(userAssets: any[]) {
    const sb = (window as any).sbClient;
    const grid = document.getElementById('marketplace-grid');
    if (!grid) return;

    // Load necessary tables for user display
    const { data: allTrees } = await sb.from('tree_ownership').select('*');

    // First 3 trees for genesis planting
    const genesisIds = ["F1-FR-001", "F1-LE-002", "F1-PE-003"];

    grid.innerHTML = (allTrees || []).map((t: any) => {
        const isGenesis = genesisIds.includes(t.tree_id);
        const isOwned = userAssets.some(ua => ua.tree_id === t.tree_id);

        return `
            <div class="glass p-5 rounded-[2rem] border ${isOwned ? 'border-emerald-500/50' : 'border-white/5'} relative group overflow-hidden">
                <div class="h-32 rounded-2xl bg-zinc-900 mb-4 overflow-hidden relative">
                    <img src="${t.image_url}" class="w-full h-full object-cover ${isOwned ? '' : 'grayscale opacity-40'} transition-all">
                    ${isGenesis ? '<div class="absolute top-2 left-2 bg-emerald-500 text-black text-[7px] font-black px-1.5 py-0.5 rounded italic">GENESIS</div>' : ''}
                </div>
                <div class="flex justify-between items-start mb-2">
                    <h4 class="text-xs font-black uppercase italic">${t.tree_id}</h4>
                    <span class="text-[8px] mono text-emerald-500">${t.on_chain ? 'ON_CHAIN' : 'OFF_CHAIN'}</span>
                </div>
                <button class="w-full py-2 rounded-xl text-[9px] font-bold uppercase transition-all
                    ${isOwned ? 'bg-emerald-500/10 text-emerald-500 cursor-default' : 'bg-white/5 hover:bg-white hover:text-black'}">
                    ${isOwned ? 'Asset Secured' : 'Acquire Share'}
                </button>
            </div>
        `;
    }).join('');
}

function indicateReadyState(isAdmin: boolean) {
    const light = document.getElementById('uplink-light');
    if (light) {
        light.className = `w-2 h-2 rounded-full ${isAdmin ? 'bg-blue-400 shadow-[0_0_10px_#60a5fa]' : 'bg-emerald-400 shadow-[0_0_10px_#34d399]'}`;
    }
    console.log(`✅ [SYSTEM]: UI Hydrated. Mode: ${isAdmin ? 'ADMIN' : 'USER'}`);
}
// --- 2. ADMIN: FIELD & TREE INITIALIZATION (ON-CHAIN + SUPABASE) ---

//import { secureAdminAction } from './adminAuth';

window.handleAdminLogin = async () => {
    try {
        const wallet = (window as any).solana;
        if (!wallet) return alert("Please install a Solana Wallet (Phantom/Solflare)");

        // 1. Establish Secure Connection
        await wallet.connect();
        const adminPubkey = wallet.publicKey.toBase58();

        // 2. Reveal Dashboard & Swap View
        document.getElementById('admin-gate')?.classList.add('hidden');
        document.getElementById('admin-dashboard')?.classList.remove('hidden');

        // Update Header Displays
        const addrDisplay = document.getElementById('admin-addr-display');
        const systemStatus = document.getElementById('system-status');
        if (addrDisplay) addrDisplay.innerText = adminPubkey;
        if (systemStatus) systemStatus.innerText = "PROTOCOL_CONNECTED_SECURE";
        // Check if the environment is ready for planting
            await (window as any).checkFieldInitialization();

            // Hydrate tables
            await (window as any).populateTreeDropdown();
      //      await (window as any).loadTreeIntegrity();
        // 3. FULL UI HYDRATION (Parallel fetches for maximum speed)
        console.log("🚀 Admin Authorized. Hydrating All UI Fields...");

        await Promise.all([
            window.loadFieldsFromChain(),     // Populates Field Registry
            window.loadTreeIntegrity(),       // Populates Tree Integrity Table
            window.loadSupabaseListings(),    // Populates Market Listings
            window.updateVaultBalance(),       // Updates SOL Balance Card
            updatePhaseStats()                // Updates Top Stats Cards
        ]);

        console.log("✅ All UI Elements Synchronized.");

    } catch (err) {
        console.error("Login/Hydration Failed:", err);
    }
};



 // --- 1. DEFINE CONNECTION FIRST ---

(window as any).initSecureSession = async () => {
    // Re-assigning locally to be safe
    const providerWallet = (window as any).solana;
    const dbClient = (window as any).sbClient;
    const netConn = (window as any).connection || connection;

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

async function syncGenesisMarket(userAddress: string) {
    const sb = (window as any).sbClient;
    const genesisIds = ["F1-FR-001", "F1-LE-002", "F1-PE-003"]; // The first 3 trees

    const { data: trees } = await sb.from('tree_ownership').select('*');
    const grid = document.getElementById('marketplace-grid');
    if (!grid || !trees) return;

    grid.innerHTML = trees.map((t: any) => {
        const isGenesis = genesisIds.includes(t.tree_id);
        return `
            <div class="glass p-6 rounded-[2rem] border border-white/5 relative group transition-all hover:border-emerald-500/30">
                <div class="h-40 rounded-2xl overflow-hidden mb-4 bg-zinc-900">
                    <img src="${t.image_url}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-all">
                    ${isGenesis ? '<span class="absolute top-3 left-3 bg-emerald-500 text-black text-[8px] font-black px-2 py-1 rounded italic">GENESIS_UNIT</span>' : ''}
                </div>
                <h3 class="font-black italic uppercase text-white">${t.tree_id}</h3>
                <div class="flex justify-between items-center mt-4">
                    <span class="text-[9px] mono text-emerald-500 font-bold uppercase">${t.on_chain ? 'Certified' : 'Legacy'}</span>
                    <button class="px-4 py-2 bg-white/5 hover:bg-white hover:text-black rounded-lg text-[9px] font-bold uppercase transition-all">Select</button>
                </div>
            </div>
        `;
    }).join('');
}
 // --- 2. ASSET SYNC LOGIC [2026-02-07 Genesis Focus] ---
 async function syncMemberAssets(userAddress: string) {
     const sb = (window as any).sbClient;

     // Define the first 3 trees for genesis planting
     const genesisRegistry = ["F1-FR-001", "F1-LE-002", "F1-PE-003"];

     // Get User Tree Count
     const { count } = await sb
         .from('tree_ownership')
         .select('*', { count: 'exact', head: true })
         .eq('owner_address', userAddress);

     const unitDisplay = document.getElementById('asset-units');
     if (unitDisplay) unitDisplay.innerHTML = `${count || 0} <span class="text-xs opacity-20 text-white">Units</span>`;

     // Fetch Marketplace for Display
     const { data: trees } = await sb.from('tree_ownership').select('*');
     const grid = document.getElementById('marketplace-grid');
     if (!grid) return;

     grid.innerHTML = trees.map((t: any) => {
         const isGenesis = genesisRegistry.includes(t.tree_id);
         return `
             <div class="glass p-6 rounded-[2rem] border border-white/5 relative group transition-all hover:border-emerald-500/30 ${isGenesis ? 'border-emerald-500/20' : ''}">
                 <div class="h-40 rounded-2xl overflow-hidden mb-4 bg-zinc-900">
                     <img src="${t.image_url || 'https://images.unsplash.com/photo-1543450050-6a16682b1c4b'}" class="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity">
                     ${isGenesis ? '<span class="absolute top-3 left-3 bg-emerald-500 text-black text-[8px] font-black px-2 py-1 rounded italic">GENESIS_UNIT</span>' : ''}
                 </div>
                 <h3 class="font-black italic uppercase text-white">${t.tree_id}</h3>
                 <p class="text-[10px] mono text-zinc-500 mb-4">${t.cultivar || 'Standard Olea'}</p>
                 <div class="flex justify-between items-center">
                     <span class="text-[9px] mono text-emerald-500 font-bold">${t.on_chain ? 'CERTIFIED' : 'PENDING'}</span>
                     <button class="px-4 py-2 bg-white/5 hover:bg-white hover:text-black rounded-lg text-[9px] font-bold uppercase transition-all">Acquire</button>
                 </div>
             </div>
         `;
     }).join('');
 }

(window as any).debugProtocolState = () => {
    console.group("🔍 PROTOCOL_DIAGNOSTICS");
    const wallet = (window as any).solana;
    const program = (window as any).getProgram();

    console.log("1. Wallet Connected:", wallet?.publicKey?.toString() || "❌ DISCONNECTED");
    console.log("2. Program ID:", program?.programId?.toString() || "❌ UNDEFINED");
    console.log("3. Provider Instance:", program?.provider ? "✅ READY" : "❌ MISSING");

    try {
        const [fieldPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from("FIELD_01")],
            program.programId
        );
        console.log("4. Field 1 PDA Derivation:", fieldPda.toBase58());
    } catch (e) {
        console.log("4. PDA Derivation:", "❌ FAILED (Usually seeds or wallet error)");
    }
    console.groupEnd();
};
(window as any).verifyIdlSync = async () => {
    const program = (window as any).getProgram();
    const localIdl = (window as any).IDL; // Your imported JSON IDL

    console.group("🔍 IDL_INTEGRITY_CHECK");
    try {
        // 1. Fetch the IDL that is actually on the blockchain
        const onChainIdl = await anchor.Program.fetchIdl(program.programId, program.provider);

        if (!onChainIdl) {
            console.warn("⚠️ No IDL found on-chain. Cannot verify version.");
            console.groupEnd();
            return;
        }

        console.log("On-Chain Instruction Count:", onChainIdl.instructions.length);
        console.log("Local Instruction Count:", localIdl.instructions.length);

        // 2. Check specifically for the planting instruction
        const hasInstruction = program.methods.addTreeToField !== undefined;
        console.log("Instruction 'addTreeToField' Status:", hasInstruction ? "✅ FOUND" : "❌ MISSING");

        if (!hasInstruction) {
            console.error("CRITICAL: The instruction 'addTreeToField' is not in your current IDL.");
            console.log("Available methods:", Object.keys(program.methods));
        }

        if (onChainIdl.version !== localIdl.version) {
            console.warn(`Mismatch! Local: ${localIdl.version} vs On-Chain: ${onChainIdl.version}`);
        } else {
            console.log("✅ IDL Versions Match:", onChainIdl.version);
        }

    } catch (err) {
        console.error("Failed to fetch on-chain IDL:", err);
    }
    console.groupEnd();
};

(window as any).updateVaultBalance = async () => {
    try {
        const program = getProgram();
        const [configPda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

        // Fetch the config to find the treasury address
        const configData = await program.account.globalConfig.fetch(configPda);
        const balance = await program.provider.connection.getBalance(configData.treasury);

        const el = document.getElementById('vault-sol');
        if (el) el.innerText = (balance / 1e9).toFixed(4) + " SOL";
    } catch (e) {
        console.log("Vault status: Protocol not yet initialized or treasury empty.");
    }
};
/**
 * Updates the top status cards (Field Count & Chain Status)
 */
async function updatePhaseStats() {
    const program = getProgram();
    const chainStatus = document.getElementById('chain-status');
    const fieldCountDisplay = document.getElementById('field-count');

    try {
        // Fetch field accounts defined in IDL
        const fields = await program.account.field.all();

        if (chainStatus) chainStatus.innerText = "PROTOCOL_LIVE";
        if (fieldCountDisplay) fieldCountDisplay.innerText = `${fields.length} Fields Verified`;
    } catch (e) {
        if (chainStatus) chainStatus.innerText = "RPC_ERROR";
        console.error("Failed to fetch phase stats:", e);
    }
}
// Helper for the "On-Chain Verified" card in your HTML
async function updateOnChainStatus() {
    const program = getProgram();
    const chainStatus = document.getElementById('chain-status');
    const fieldCount = document.getElementById('field-count');

    try {
        // Fetching Field accounts as defined in IDL
        const fields = await program.account.field.all();
        if (chainStatus) chainStatus.innerText = "PROTOCOL_LIVE";
        if (fieldCount) fieldCount.innerText = `${fields.length} Fields Verified`;
    } catch (e) {
        if (chainStatus) chainStatus.innerText = "RPC_ERROR";
    }
}

// View Supabase Data
async function loadAdminTable() {
    const { data, error } = await (window as any).sbClient
        .from('market_listings')
        .select('*');

    if (error) return console.error(error);

    const tableBody = document.getElementById('supabase-listings-table')!;
    tableBody.innerHTML = data.map(item => `
        <tr class="border-b border-white/5 hover:bg-white/5">
            <td class="p-3 font-mono text-yellow-500">${item.tree_id}</td>
            <td class="p-3">${item.price_sol} SOL</td>
            <td class="p-3">
                <span class="${item.is_active ? 'text-green-500' : 'text-red-500'}">
                    ${item.is_active ? 'ACTIVE' : 'INACTIVE'}
                </span>
            </td>
            <td class="p-3">
                <button onclick="toggleListing('${item.tree_id}', ${item.is_active})" class="text-xs bg-white/10 px-3 py-1 rounded">
                    Toggle Status
                </button>
            </td>
        </tr>
    `).join('');
}
/**
 * Genesis Planting: First 3 Trees
 * Checks on-chain existence before calling instruction.
 */
 /**
  * GENESIS PLANTING ENGINE
  * [2026-02-07] Rule: Only the first 3 trees.
  * Logic: Checks if PDA exists -> If yes, skip. If no, initialize.
  */
  /**
  * Genesis Planting Sequence
  * [2026-02-07] Rule: Use first 3 trees. Skip if found, init if not.
  */
  // --- 1. DEFINE THE INITIALIZATION LOGIC FIRST ---
  const initPortal = async () => {
      console.log("🛠 [SYSTEM] Initializing Intelligence Portal...");

      // Safety check for Supabase client
      if (!(window as any).sbClient) {
          console.error("❌ [FATAL] Supabase Client not found in window context.");
          return;
      }

      try {
          // [RULE 2026-02-07] Genesis check: Fetch first 3 trees from the correct table
          const { data: genesisTrees, error } = await (window as any).sbClient
              .from('tree_ownership')
              .select('tree_id, on_chain')
              .order('tree_id', { ascending: true })
              .limit(3);

          if (error) throw error;

          console.log("✅ [SYSTEM] Genesis Registry Loaded:", genesisTrees);

          // Trigger the professional scanner UI
          if (typeof (window as any).exploreSupabase === 'function') {
              (window as any).exploreSupabase();
          }

      } catch (e: any) {
          console.error("⚠️ [SYSTEM] Initialization Warning:", e.message);
      }
  };
  // Define as a constant first to avoid hoisting/initialization issues

  const runGenesisProtocol = async () => {
      const sb = (window as any).sbClient;
      const wallet = (window as any).solana;
      const program = (window as any).getProgram();

      if (!wallet?.publicKey) {
          alert("🚨 ADMIN WALLET NOT CONNECTED");
          return;
      }

      console.log("🔍 PHASE 1: Auditing On-Chain Fields...");

      try {
          // 1. Check On-Chain Fields
          const onChainFields = await program.account.field.all();
          let fieldPda: anchor.web3.PublicKey;

          if (onChainFields.length > 0) {
              fieldPda = onChainFields[0].publicKey;
              console.log("✅ On-Chain Field Detected:", onChainFields[0].account.fieldId);
          } else {
              console.log("Empty Registry. Initializing FIELD_01...");
              const { data: sbFields } = await sb.from('fields').select('*').eq('field_id', 'FIELD_01').single();
              if (!sbFields) throw new Error("FIELD_01 not found in Supabase");

              [fieldPda] = anchor.web3.PublicKey.findProgramAddressSync(
                  [Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from("FIELD_01")],
                  program.programId
              );

              await program.methods.initField(
                  "FIELD_01",
                  new anchor.BN(sbFields.area_sq_meters || 12000),
                  sbFields.metadata_url || "",
                  "Tuscany",
                  new anchor.BN(43103723),
                  new anchor.BN(10578417)
              ).accounts({
                  field: fieldPda,
                  config: (anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId))[0],
                  authority: wallet.publicKey,
                  systemProgram: anchor.web3.SystemProgram.id,
              }).rpc();

              await sb.from('fields').update({
                  pda_address: fieldPda.toBase58(),
                  tree_count: 0,
                  assigned_trees: 0
              }).eq('field_id', 'FIELD_01');
          }

          // 2. PHASE 2: GENESIS TREES (First 3)
          console.log("🚀 Executing [2026-02-07] Genesis Planting...");

          const { data: genesisTrio } = await sb.from('tree_ownership')
              .select('*')
              .order('tree_id', { ascending: true })
              .limit(3);

          if (genesisTrio && genesisTrio.length > 0) {
              for (const t of genesisTrio) {
                  // Derive Tree PDA
                  const [treePda] = anchor.web3.PublicKey.findProgramAddressSync(
                      [Buffer.from("tree"), Buffer.from(t.tree_id)],
                      program.programId
                  );

                  // Check if account already exists to avoid 3004 Error
                  const accountInfo = await program.provider.connection.getAccountInfo(treePda);
                  if (accountInfo) {
                      console.log(`⚠️ ${t.tree_id} already exists on-chain. Skipping...`);
                      continue;
                  }

                  console.log(`🌱 Planting ${t.tree_id} for ${t.idwallet || 'DAO'}...`);

                  // CALL THE ACTUAL INSTRUCTION (Matches your Rust CamelCase)
                  await program.methods.addTreeToField(
                      t.tree_id,
                      "Olea Europaea",
                      new anchor.BN(43103000), // Mock Lat
                      new anchor.BN(10578000), // Mock Long
                      2026
                  ).accounts({
                      tree: treePda,
                      field: fieldPda,
                      config: (anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId))[0],
                      authority: wallet.publicKey,
                      systemProgram: anchor.web3.SystemProgram.id,
                  }).rpc();

                  // Update individual status in Supabase
                  await sb.from('tree_ownership').update({ on_chain: true }).eq('tree_id', t.tree_id);

                  // [2026-02-07] Small delay to prevent wallet popup collision
                  await new Promise(r => setTimeout(r, 1200));
              }
          }

          alert("Genesis Protocol Complete. UI Syncing...");
          (window as any).syncGlobalState();

      } catch (err: any) {
          console.error("❌ Protocol Halted:", err);
          alert("Error: " + err.message);
      }
  };
  // This function should be callable by ANYONE, not just Admin
  (window as any).syncGlobalState = async () => {
    console.log("🌐 [SYSTEM] Starting Global Sync...");
    const sb = (window as any).sbClient;
    const program = (window as any).getProgram();

    try {
        // 1. Fetch On-Chain Truth
        const [onChainFields, onChainTrees] = await Promise.all([
            program.account.field.all(),
            program.account.tree.all()
        ]);

        console.log(`📡 Found ${onChainFields.length} Fields and ${onChainTrees.length} Trees on-chain.`);

        // 2. Fetch Supabase Data
        const { data: sbFields } = await sb.from('fields').select('*');

        // Update Supabase with Chain Data (Syncing the cache)
        if (onChainFields.length > 0) {
            for (const f of onChainFields) {
                await sb.from('fields').update({
                    pda_address: f.publicKey.toBase58(),
                    on_chain: true,
                    assigned_trees: f.account.totalTrees.toNumber()
                }).eq('field_id', f.account.fieldId);
            }
        }

        // 3. UI RENDERING - FIELD BUTTONS
        const btnContainer = document.getElementById('field-list-container');
        if (btnContainer && sbFields) {
            btnContainer.innerHTML = sbFields.map(f => `
                <button onclick="window.openFieldModal('${f.field_id}')"
                        class="w-full bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-800 hover:border-solana p-3 rounded-lg flex items-center gap-3 transition-all mb-2 group">
                    <div class="w-2 h-2 rounded-full ${f.pda_address ? 'bg-solana shadow-[0_0_8px_#14F195]' : 'bg-red-500 animate-pulse'}"></div>
                    <div class="flex flex-col items-start">
                        <span class="text-[10px] font-black tracking-tighter text-white uppercase">${f.name || f.field_id}</span>
                        <span class="text-[8px] text-zinc-500 font-mono">${f.pda_address ? 'ON-CHAIN' : 'OFF-CHAIN'}</span>
                    </div>
                    <span class="ml-auto text-zinc-700 group-hover:text-solana">→</span>
                </button>
            `).join('');
        }

        // 4. UI RENDERING - FIELD TABLE
        const tableBody = document.getElementById('field-list-body');
        if (tableBody && sbFields) {
            tableBody.innerHTML = sbFields.map(f => `
                <tr class="border-b border-zinc-900">
                    <td class="py-2 text-zinc-400 font-bold">${f.field_id}</td>
                    <td class="text-right font-mono text-[9px] ${f.pda_address ? 'text-solana' : 'text-zinc-700'}">
                        ${f.pda_address ? f.pda_address.slice(0,8) + '...' : 'PENDING_INIT'}
                    </td>
                </tr>
            `).join('');
        }

        console.log("✅ [SYSTEM] UI Deep-Sync Complete.");

    } catch (err) {
        console.error("❌ Sync Failed:", err);
    }
};
  // 4. CRITICAL: Immediate Registration to Window
  (window as any).runGenesisProtocol = runGenesisProtocol;
  (window as any).hydrateTreeMetadata = async () => {
    console.log("🧪 Initiating Metadata Hydration...");
    const sb = (window as any).sbClient;

    // 1. Get the list of trees that need data (targeting first 3 or all)
    const { data: trees, error } = await sb
        .from('tree_metadata')
        .select('tree_id, variety')
        .is('height_cm', null); // Only target empty ones

    if (error || !trees) {
        alert("No empty metadata rows found.");
        return;
    }

    console.log(`Found ${trees.length} trees to hydrate.`);

    for (const tree of trees) {
        // Generate realistic bio-metrics based on variety
        const isYoung = Math.random() > 0.5;
        const metrics = {
              height_cm: Math.round(isYoung ? 120 + (Math.random() * 50) : 210 + (Math.random() * 100)),
              diameter_cm: Math.round(isYoung ? 8 + (Math.random() * 4) : 15 + (Math.random() * 10)),
              circumference_cm: Math.round(25 + (Math.random() * 15)),
              crown_spread_cm: Math.round(100 + (Math.random() * 80)),
              age_years: isYoung ? 2 : 5,
              health_score: 0.95, // Decimal is usually allowed for health, but round if needed
              updated_at: new Date().toISOString()
          };
        const { error: updateError } = await sb
            .from('tree_metadata')
            .update(metrics)
            .eq('tree_id', tree.tree_id);

        if (updateError) console.error(`Failed ${tree.tree_id}`, updateError);
        else console.log(`✅ Hydrated ${tree.tree_id} (${tree.variety})`);
    }

    alert("Hydration Complete. Refreshing Scan...");
    (window as any).exploreSupabase();
};

  // --- 1. Robust Supabase Probe (Add this to main.ts) ---
  (window as any).exploreSupabase = async () => {
      const container = document.getElementById('schema-explorer-results');
      if (!container) return;

      container.innerHTML = `
          <div class="shimmer h-32 w-full rounded-sm mb-4"></div>
          <div class="shimmer h-32 w-full rounded-sm opacity-50"></div>
      `;

      // Only probe the tables verified to exist
      const tables = ['tree_ownership', 'tree_metadata', 'fields', 'audit_logs'];
      let html = '';

      for (const table of tables) {
          try {
              const { data, error } = await (window as any).sbClient
                  .from(table)
                  .select('*')
                  .limit(8);

              if (error) continue;

              const cols = data.length > 0 ? Object.keys(data[0]) : [];

              html += `
                  <div class="glass overflow-hidden rounded-sm border border-white/10 mb-10">
                      <div class="bg-white/5 px-4 py-3 border-b border-white/10 flex justify-between items-center">
                          <div class="flex items-center gap-3">
                              <span class="text-[#14F195] font-bold text-sm">/</span>
                              <h2 class="text-xs font-bold text-white uppercase tracking-widest">${table}</h2>
                          </div>
                          <span class="text-[9px] text-zinc-500 font-mono">${data.length} RECORDS FOUND</span>
                      </div>

                      <div class="overflow-x-auto">
                          <table class="w-full data-table text-left">
                              <thead>
                                  <tr>
                                      ${cols.map(c => `<th class="px-4 py-3">${c.replace('_', ' ')}</th>`).join('')}
                                  </tr>
                              </thead>
                              <tbody>
                                  ${data.map(row => `
                                      <tr class="hover:bg-white/[0.02] transition-colors">
                                          ${cols.map(c => {
                                              const val = row[c];
                                              let display = val;
                                              // Highlight empty fields that need filling
                                              if (val === null || val === undefined) {
                                                  return `<td class="px-4 py-2 text-amber-500/50 italic text-[9px] animate-pulse">NULL_REQUIRED</td>`;
                                              }
                                              if (typeof val === 'boolean') display = val ? '🟢 TRUE' : '🔴 FALSE';
                                              if (c.includes('pda') || c.includes('address')) display = `${String(val).slice(0,6)}...`;
                                              return `<td class="px-4 py-2 text-zinc-300 font-mono">${display ?? '---'}</td>`;
                                          }).join('')}
                                      </tr>
                                  `).join('')}
                              </tbody>
                          </table>
                      </div>
                  </div>
              `;
          } catch (e) {
              console.error(`Error probing ${table}`, e);
          }
      }
      container.innerHTML = html || '<div class="text-red-500 text-xs">ERR: CONNECTION_TIMEOUT</div>';
  };
// Replace your current window.onload or add this:
window.addEventListener('load', initPortal);

  (window as any).plantGenesisBatch = async () => {
    console.log("🚀 Starting Genesis Recovery: Planting First 3 Trees...");
    const program = (window as any).getProgram();
    const wallet = (window as any).solana;

    if (!program || !wallet.publicKey) {
        console.error("❌ Auth Error: Connect Admin Wallet first.");
        return;
    }

    // 1. Fetch exactly the first 3 trees from Supabase [Rule 2026-02-07]
    const { data: trees, error } = await sbClient
        .from('tree_ownership')
        .select('*')
        .order('tree_id', { ascending: true }) // Ensure order for "First 3"
        .limit(3);

    if (error || !trees) {
        console.error("❌ DB Error: Could not fetch trees from Supabase.");
        return;
    }

    for (const tree of trees) {
        try {
            // Seed Derivation for Field 01
            const [fieldPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from("FIELD_01")],
                program.programId
            );

            // Seed Derivation for Tree
            const [treePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(tree.tree_id)],
                program.programId
            );

            // 2. CRITICAL: PRE-FLIGHT ACCOUNT CHECK
            // This prevents the wallet from being called if the tree exists
            const accountInfo = await connection.getAccountInfo(treePda);

            if (accountInfo !== null) {
                console.log(`⏩ [SKIP] Tree ${tree.tree_id} already exists. No wallet call needed.`);

                // Silent Sync: Ensure Supabase matches the chain state
                await sbClient.from('tree_ownership')
                    .update({ on_chain: true, pda_address: treePda.toBase58() })
                    .eq('tree_id', tree.tree_id);
                continue;
            }

            // 3. ONLY INITIALIZE IF ACCOUNT IS NULL
            console.log(`🌱 [INIT] Tree ${tree.tree_id} not found. Requesting signature...`);

            const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
            const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), wallet.publicKey.toBuffer()], program.programId);

            const tx = await program.methods
                .addTreeToField(
                    tree.tree_id,
                    "Olea Europaea",
                    43000000,
                    10000000,
                    2026
                )
                .accounts({
                    tree: treePda,
                    field: fieldPda,
                    config: configPda,
                    authority: wallet.publicKey,
                    authorityStake: stakePda, // Admin override: walletlock does not apply
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            console.log(`✅ [SUCCESS] ${tree.tree_id} Planted. TX: ${tx}`);

        } catch (err: any) {
            console.error(`❌ Error processing ${tree.tree_id}:`, err);
        }
    }
    console.log("🏁 Genesis sequence completed.");
};
/**
 * Enhanced Field Integrity Loader
 */
(window as any).loadFieldIntegrity = async () => {
    console.log("📡 Fetching On-Chain Field Registry...");
    const fieldBody = document.getElementById('field-list-body');
    const program = (window as any).getProgram();

    if (!fieldBody) return;

    try {
        const fields = await program.account.field.all();
        console.log(`📊 Found ${fields.length} fields on-chain.`);

        // Inside window.loadFieldIntegrity in main.ts
fieldBody.innerHTML = fields.map(f => `
    <tr class="hover:bg-white/5 transition-all">
        <td class="py-3 font-bold text-white">
            ${f.account.fieldId} </td>
        <td class="py-3 text-zinc-400">
            ${f.account.fieldName || 'PRIMARY_ORCHARD'} </td>
        <td class="py-3 text-right">
            <span class="text-[9px] font-mono bg-green-500/10 text-green-500 px-2 py-1 rounded">
                ${f.publicKey.toBase58().slice(0, 8)}...
            </span>
        </td>
    </tr>
`).join('');
    } catch (e) {
        console.error("❌ Field fetch failed", e);
    }
};
// --- 3. FIX: REGISTER LOAD TREE INTEGRITY ---
(window as any).loadTreeIntegrity = async () => {
    const treeListBody = document.getElementById('tree-list');
    const program = getProgram();
    if (!treeListBody) return;

    try {
        const trees = await program.account.tree.all();

        treeListBody.innerHTML = trees.map(t => {
            const tree = t.account;
            return `
            <tr class="border-b border-zinc-900 hover:bg-white/5 transition-colors">
                <td class="py-3">
                    <div class="flex flex-col">
                        <span class="text-white font-bold text-[11px]">${tree.treeId}</span>
                        <span class="text-[8px] text-zinc-500 font-mono">${t.publicKey.toBase58().slice(0,6)}...</span>
                    </div>
                </td>
                <td class="py-3 text-right">
                    <div class="flex flex-col items-end">
                        <span class="text-green-400 font-black text-[10px]">${tree.co2Sequestered?.toString() || '0'} kg CO2</span>
                        <span class="text-[8px] text-zinc-600 font-mono">${(Number(tree.price)/1e9).toFixed(2)} SOL</span>
                    </div>
                </td>
            </tr>
            `;
        }).join('');
    } catch (e) {
        console.error("Tree Load Fail:", e);
    }
};

// --- UPDATED PLANT BATCH (WITH REAL RPC) ---
(window as any).previewPlantingBatch = async () => {
    const sb = (window as any).sbClient;
    const treeListBody = document.getElementById('tree-list');

    // Fetch 5 unplanted trees for Field 1
    const { data: trees, error } = await sb
        .from('tree_ownership')
        .select('*')
        .eq('field_id', 'FIELD_01')
        .is('pda_address', null)
        .limit(5);

    if (error || !trees.length) {
        alert("No unplanted trees found for Field 1 in Supabase.");
        return;
    }

    // Update the UI to show these are "READY TO PLANT"
    if (treeListBody) {
        treeListBody.innerHTML = trees.map(t => `
            <tr class="bg-yellow-500/10 border-b border-yellow-500/20">
                <td class="py-2 px-2 text-[10px] font-bold text-yellow-500">${t.tree_id}</td>
                <td class="py-2 px-2 text-right">
                    <span class="text-[9px] bg-yellow-500 text-black px-2 py-0.5 rounded font-black">PENDING_SYNC</span>
                </td>
            </tr>
        `).join('') + treeListBody.innerHTML;
    }

    const confirm = window.confirm(`Found 5 trees (ID: ${trees[0].tree_id} to ${trees[4].tree_id}). Initialize on-chain?`);
    if (confirm) {
        await (window as any).plantBatch(5);
    }
};

// Wrapper for main.ts On-Chain Functions with Security
(window as any).runGlobalInit = async () => {
    const wallet = (window as any).solana;
    if (await secureAdminAction(wallet)) {
        await (window as any).initializeGlobalConfig(); // From main.ts
    }
};

(window as any).runFieldSetup = async () => {
    const wallet = (window as any).solana;
    if (await secureAdminAction(wallet)) {
        await (window as any).setupAllFields(); // From main.ts
    }
};

(window as any).runOrchardSync = async () => {
    const wallet = (window as any).solana;
    if (await secureAdminAction(wallet)) {
        await (window as any).initializeOrchard(); // From main.ts
    }
};

/**
 * Professional Field Initialization
 * Seeds: [b"field", authority, field_id]
 */
(window as any).initializeField = async (fieldId: string) => {
    const program = getProgram();
    const wallet = (window as any).solana;
    if (!program) return alert("Connect Admin Wallet");

    const fieldData = fields.find(f => f.field_id === fieldId);
    if (!fieldData) return console.error("Field metadata missing for", fieldId);

    try {
        const [fieldPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from(fieldId)],
            programId
        );

        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);

        console.log(`🚀 Initializing Field: ${fieldId} at ${fieldPda.toBase58()}`);

        await program.methods.initField(
            fieldId,
            new anchor.BN(Math.floor(fieldData.area_sq_meters)),
            fieldData.metadata_url || "",
            "Tuscany",
            new anchor.BN(Math.floor(fieldData.gps_lat * 10000000)),
            new anchor.BN(Math.floor(fieldData.gps_long * 10000000))
        ).accounts({
            config: configPda,
            field: fieldPda,
            authority: wallet.publicKey,
            systemProgram: SystemProgram.programId,
        }).rpc();

        // SYNC TO SUPABASE
        await sbClient.from('fields').update({
            pda_address: fieldPda.toBase58(),
            is_active: true
        }).eq('field_id', fieldId);

        alert(`Field ${fieldId} is now live and synced.`);
        if ((window as any).syncFields) (window as any).syncFields();
    } catch (err: any) {
        console.error("Field Init Failed:", err);
        alert(err.message);
    }
};
//---utils -----
// --- ADMIN UTILITIES ---

/**
 * Initializes the Global DAO Configuration
 * [2026-02-05] Complete code: No mock code.
 */
(window as any).initializeGlobalConfig = async () => {
    try {
        const program = getProgram();
        const wallet = (window as any).solana;
        if (!program || !wallet.publicKey) return;

        const [configPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("config")],
            program.programId
        );

        // Check if already exists to prevent redundant transaction
        const info = await connection.getAccountInfo(configPda);
        if (info) {
            alert("DAO is already initialized on-chain.");
            return;
        }

        console.log("Initializing Global Config...");
        await program.methods
            .initializeGlobalConfig()
            .accounts({
                config: configPda,
                authority: wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();

        alert("✅ DAO Global Config Initialized successfully!");
        if ((window as any).refreshAdminUI) (window as any).refreshAdminUI();
    } catch (err: any) {
        console.error(err);
        alert(`Init Failed: ${err.message}`);
    }
};

/**
 * syncFields: Handles the logic for your Admin Button
 * This connects the mock JSON list to the on-chain Field deployment.
 */
(window as any).syncFields = async () => {
    console.log("Starting Field Sync...");
    try {
        // First, ensure the wallet is the designated Admin
        const wallet = (window as any).solana;
        if (wallet.publicKey.toString() !== "8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54") {
            alert("Unauthorized: Admin Wallet mismatch.");
            return;
        }

        // Call the setup function we corrected earlier
        await (window as any).setupAllFields();

        console.log("Field Sync Complete.");
    } catch (err: any) {
        console.error("Sync Fields Error:", err);
    }
};



/**
 * checkFieldInitialization: Verifies if FIELD_01 exists on-chain.
 * Used during wallet connection to prevent "AccountDidNotSerialize" errors.
 */
(window as any).checkFieldInitialization = async () => {
    const program = (window as any).getProgram();
    const wallet = (window as any).solana;
    const statusEl = document.getElementById('system-status');

    if (!program || !wallet.publicKey) return;

    try {
        // Derive the exact PDA used for FIELD_01
        const [fieldPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from("FIELD_01")],
            program.programId
        );

        console.log(`📡 Probing Field Integrity: ${fieldPda.toBase58()}`);
        const accountInfo = await connection.getAccountInfo(fieldPda);

        if (accountInfo) {
            console.log("✅ FIELD_01 is LIVE on-chain.");
            if (statusEl) {
                statusEl.innerText = "SYSTEM_READY: FIELD_01_DETECTED";
                statusEl.classList.replace('text-zinc-500', 'text-green-500');
            }
            return true;
        } else {
            console.warn("⚠️ FIELD_01 NOT FOUND. Admin must initialize field.");
            if (statusEl) {
                statusEl.innerText = "WARNING: FIELD_01_NOT_INITIALIZED";
                statusEl.classList.replace('text-zinc-500', 'text-yellow-500');
            }
            return false;
        }
    } catch (err) {
        console.error("Field check failed:", err);
        return false;
    }
};
/**
 * Helper to check DAO status on load
 */
(window as any).refreshAdminUI = async () => {
    const program = getProgram();
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
    const info = await connection.getAccountInfo(configPda);

    const statusEl = document.getElementById('chain-status');
    if (statusEl) {
        statusEl.innerText = info ? "LIVE (Initialized)" : "NOT INITIALIZED";
        statusEl.className = info ? "text-green-500 font-bold" : "text-red-500 font-bold";
    }
};

// Auto-run status check if on admin page
if (window.location.pathname.includes('admin')) {
    window.addEventListener('load', () => {
        setTimeout((window as any).refreshAdminUI, 1000);
    });
}

(window as any).initializeOrchard = async () => {
    try {
        const program = getProgram();
        const wallet = (window as any).solana;
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

        for (const tree of treesMetadata) {
            // Find the corresponding field name from Field_list.json using field_id
            const fieldData = fields.find(f => f.field_id === tree.field_id);
            if (!fieldData) continue;

            const [fieldPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("field"),Buffer.from(fieldData.field_name)],
                program.programId
            );

            const [treePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(tree.tree_id)],
                program.programId
            );

            const [stakePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("stake"), wallet.publicKey.toBuffer()],
                program.programId
            );

            console.log(`Adding tree ${tree.tree_id} to ${fieldData.field_name}...`);

            // variety, lat, long, planting_year
            await program.methods.addTreeToField(
                tree.tree_id,
                tree.variety,
                43, 10, 2010
            )
            .accounts({
                tree: treePda,
                field: fieldPda,
                config: configPda,
                authority: wallet.publicKey,
                authorityStake: stakePda,
                systemProgram: anchor.web3.SystemProgram.programId,
            }).rpc();
        }
        alert("Orchard migration complete!");
    } catch (err) {
        console.error("Sync failed", err);
    }
};

(window as any).plantSingleTree = async (fieldId: string, tree_id: string) => {
    const sb = (window as any).sbClient;
    const wallet = (window as any).solana;
    const program = (window as any).getProgram();

    try {
        // 1. Fetch metadata from tree_ownership
        const { data: treeMeta } = await sb
            .from('tree_ownership')
            .select('*')
            .eq('tree_id', tree_id)
            .single();

        if (!treeMeta) throw new Error("Metadata not found in Supabase.");

        // 2. Derive PDAs
        const [treePda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("tree"), Buffer.from(tree_id)],
            program.programId
        );

        const [fieldPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from(fieldId)],
            program.programId
        );

        const [stakePda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("stake"), wallet.publicKey.toBuffer()],
            program.programId
        );

        const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("config")],
            program.programId
        );

        console.log(`🚀 MINTING: ${tree_id} via addTreeToField...`);

        // 3. Match your Rust Function Signature exactly:
        // tree_id: String, cultivar: String, lat: i32, long: i32, year: u16
        const lat = Math.round((treeMeta.latitude || 0) * 1000000);
        const long = Math.round((treeMeta.longitude || 0) * 1000000);
        const year = treeMeta.planting_year || 2026;

        await program.methods.addTreeToField(
            tree_id,                    // tree_id
            treeMeta.cultivar || "Olea", // cultivar
            lat,                        // lat
            long,                       // long
            year                        // year
        ).accounts({
            tree: treePda,
            field: fieldPda,
            config: configPda,
            authorityStake: stakePda,
            authority: wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.id,
        }).rpc();

        // 4. Update Supabase
        await sb.from('tree_ownership')
            .update({
                on_chain: true,
                pda_address: treePda.toBase58(),
                planted_at: new Date().toISOString()
            })
            .eq('tree_id', tree_id);

        console.log(`✅ ${tree_id} Synchronized.`);
        await (window as any).syncGlobalState();

    } catch (err: any) {
        console.error("❌ PLANTING_ERROR:", err);
        alert("Action Failed: " + err.message);
    }
};
// --- FIELD INITIALIZATION ---
(window as any).initializeFieldOne = async () => {
    const program = (window as any).getProgram();
    const wallet = (window as any).solana;

    try {
        const [fieldPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from("FIELD_01")],
            program.programId
        );

        console.log("🚀 Initializing FIELD_01 at:", fieldPda.toBase58());

        await program.methods
            .addField("FIELD_01", "Main Orchard", 1000, new anchor.BN(500))
            .accounts({
                field: fieldPda,
                authority: wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();

        alert("FIELD_01 Initialized!");
        location.reload(); // Refresh to clear warnings
    } catch (err: any) {
        console.error("Field Init Failed", err);
        alert(`Error: ${err.message}`);
    }
};
/**
 * Populates the dropdown with trees that are NOT yet on-chain.
 */
(window as any).populateTreeDropdown = async () => {
    const selector = document.getElementById('tree-selector') as HTMLSelectElement;
    if (!selector) return;

    try {
        const { data: trees, error } = await (window as any).sbClient
            .from('tree_ownership')
            .select('tree_id, on_chain')
            .eq('on_chain', false) // Only show available trees
            .order('tree_id', { ascending: true });

        if (error) throw error;

        if (trees.length === 0) {
            selector.innerHTML = `<option value="">ALL_TREES_PLANTED</option>`;
            return;
        }

        selector.innerHTML = trees.map(t =>
            `<option value="${t.tree_id}">${t.tree_id}</option>`
        ).join('');

    } catch (err) {
        console.error("Failed to populate dropdown:", err);
        selector.innerHTML = `<option value="">ERROR_LOADING</option>`;
    }
};

/**
 * Triggered by the button to plant the selected tree.
 */
 (window as any).plantFromDropdown = async () => {
     const selector = document.getElementById('tree-selector') as HTMLSelectElement;
     const treeId = selector.value;
     const fieldId = "FIELD_01"; // Defaulting to Genesis Field for now

     if (!treeId) {
         alert("Select a Tree ID first.");
         return;
     }

     console.log(`📡 [AUDIT]: Checking Chain Status for ${treeId}...`);
     await (window as any).plantSingleTree(fieldId, treeId);

     // Refresh the dropdown to remove the now-planted tree
     if ((window as any).populateTreeDropdown) {
         await (window as any).populateTreeDropdown();
     }
 };

 (window as any).plantSingleTree = async (fieldId: string, treeId: string) => {
     const sb = (window as any).sbClient;
     const wallet = (window as any).solana;
     const program = (window as any).getProgram();

     try {
         // 1. CHECK IF ALREADY ON-CHAIN (Public Availability Check)
         const [treePda] = anchor.web3.PublicKey.findProgramAddressSync(
             [Buffer.from("tree"), Buffer.from(treeId)],
             program.programId
         );

         try {
             const onChainCheck = await program.account.tree.fetch(treePda);
             if (onChainCheck) {
                 console.log("✅ Tree already exists on-chain. Syncing Supabase...");
                 await sb.from('tree_ownership').update({ on_chain: true, pda_address: treePda.toBase58() }).eq('tree_id', treeId);
                 return;
             }
         } catch (e) {
             console.log("🆕 Tree not on-chain. Proceeding with Genesis Planting...");
         }

         // 2. FETCH DATA FROM SUPABASE (Ownership + Meta)
         // We pull from tree_ownership to verify the record exists
         const { data: treeData, error: sbError } = await sb
             .from('tree_ownership')
             .select('*')
             .eq('tree_id', treeId)
             .single();

         if (sbError || !treeData) throw new Error("Tree ID not found in Supabase Registry.");

         // 3. DERIVE FIELD PDA
         const [fieldPda] = anchor.web3.PublicKey.findProgramAddressSync(
             [Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from(fieldId)],
             program.programId
         );

         // 4. EXECUTE ON-CHAIN PLANTING
         console.log(`🚀 MINTING: ${treeId} | PDA: ${treePda.toBase58()}`);

         await program.methods.plantTree(
             treeId,
             new anchor.BN(treeData.height_cm || 0),   // Full Data from DB
             new anchor.BN(treeData.diameter_cm || 0), // Full Data from DB
             treeData.variety || "Genesis Olive"       // Full Data from DB
         ).accounts({
             tree: treePda,
             field: fieldPda,
             authority: wallet.publicKey,
             systemProgram: anchor.web3.SystemProgram.id,
         }).rpc();

         // 5. FINAL SYNC
         await sb.from('tree_ownership')
             .update({
                 on_chain: true,
                 pda_address: treePda.toBase58(),
                 planted_at: new Date().toISOString()
             })
             .eq('tree_id', treeId);

         console.log(`✨ SUCCESS: ${treeId} is now live.`);
         (window as any).syncGlobalState();

     } catch (err: any) {
         console.error("❌ PLANTING_ERROR:", err);
         alert(err.message.includes("3004")
             ? "Error 3004: PDA mismatch or Account not Initialized in Rust."
             : "Planting Failed: " + err.message);
     }
 };
// Add to your handleAdminLogin to populate on startup
const originalAdminLogin = (window as any).handleAdminLogin;
(window as any).handleAdminLogin = async () => {
    await originalAdminLogin();
    await (window as any).populateTreeDropdown();
};

(window as any).initializeStakeIdentity = async () => {
    const program = getProgram();
    const wallet = (window as any).solana;
    const { PublicKey, SystemProgram } = anchor.web3;

    try {
        console.log("🛠️ FORCING STAKE ACCOUNT INITIALIZATION...");

        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
        const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), wallet.publicKey.toBuffer()], program.programId);

        const tx = await program.methods
            .initializeStake() // This instruction is in your IDL for exactly this purpose
            .accounts({
                config: configPda,
                authorityStake: stakePda,
                authority: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        console.log("✅ Stake Identity Initialized! TX:", tx);
        alert("Identity Fixed. You can now plant trees.");
    } catch (err: any) {
        if (err.message.includes("0x0") || err.message.includes("already in use")) {
            console.log("⭐ Identity already fully initialized.");
        } else {
            console.error("Identity Fix Failed:", err);
        }
    }
};
/**
 * Plant Tree & Gift to DAO Treasury
 * Seeds: [b"tree", field_pda, tree_id]
 */
(window as any).plantAndGiftToDAO = async (treeId: string, fieldId: string) => {
    const program = getProgram();
    const wallet = (window as any).solana;
    if (!program) return;

    try {
        const treeMeta = treesMetadata.find(t => t.tree_id === treeId);

        // 1. Derive PDAs
        const [fieldPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from(fieldId)],
            programId
        );
        const [treePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(treeId)],
            programId
        );
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);

        console.log(`🌱 Planting ${treeId} and assigning to DAO Vault...`);

        // 2. On-Chain Plant
        await program.methods.addTreeToField(
            treeId,
            treeMeta?.variety || "Olea europaea",
            43, 10, 2010 // Coordinates/Year
        ).accounts({
            tree: treePda,
            field: fieldPda,
            config: configPda,
            authority: wallet.publicKey,
            systemProgram: SystemProgram.programId,
        }).rpc();

        // 3. Database Sync: Mark as owned by DAO Vault
        const { error } = await sbClient.from('tree_ownership').update({
            pda_address: treePda.toBase58(),
            owner_address: DAO_VAULT.toBase58(), // Gifting to DAO
            status: 'PLANTED'
        }).eq('tree_id', treeId);

        if (!error) {
            console.log(`✅ ${treeId} gifted to Treasury.`);
            if ((window as any).syncInventory) (window as any).syncInventory();
        }
    } catch (err: any) {
        console.error("Planting failed:", err);
    }
};

// --- 3. MARKETPLACE & BUYING ---

(window as any).buyTreeShare = async (treeId: string, variety: string, fieldId: string) => {
    const program = getProgram();
    const wallet = (window as any).solana;
    if (!program) return alert("Connect Wallet");

    try {
        // [2026-01-16] Rule: Check if already voted
        const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), wallet.publicKey.toBuffer()], programId);
        try {
            const stakeAcc = await program.account.stakeAccount.fetch(stakePda);
            if (stakeAcc.hasActiveVote) return alert("Wallet is locked: Active vote in progress.");
        } catch (e) { /* New user, no stake account yet */ }

        const [fieldPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("field"), new PublicKey("8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54").toBuffer(), Buffer.from(fieldId)],
            programId
        );
        const [treePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(treeId)],
            programId
        );

        // Execute Purchase
        await program.methods.purchaseShares(new anchor.BN(10)) // Buying 10%
            .accounts({
                tree: treePda,
                buyerStake: stakePda,
                buyer: wallet.publicKey,
                systemProgram: SystemProgram.programId,
            }).rpc();

        // Update Supabase via RPC to handle ownership ledger
        await sbClient.rpc('handle_tree_purchase', {
            p_tree_id: treeId,
            p_buyer: wallet.publicKey.toBase58()
        });

        alert("Purchase successful! Share added to your stake.");
        // Inside ticker:
window.postMessage({
    type: "NEW_BUY",
    addr: wallet.publicKey.toString().slice(0,4)
}, "*");
    } catch (err: any) {
        alert("Purchase failed: " + err.message);
    }
};

// --- 4. DAO GOVERNANCE (PAUSING) ---

(window as any).togglePause = async (paused: boolean) => {
    const program = getProgram();
    if (!program) return;
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);

    try {
        await program.methods.togglePause(paused)
            .accounts({
                config: configPda,
                authority: (window as any).solana.publicKey,
            }).rpc();

        document.getElementById('dao-pause-status')!.innerText = paused ? "PAUSED" : "ACTIVE";
        alert(`Protocol ${paused ? 'Paused' : 'Resumed'}`);
    } catch (err: any) {
        alert("Governance action failed: " + err.message);
    }
};


// --- ADMIN: INITIALIZE FIELDS ---
// --- GLOBAL HELPER: Check if account exists ---
const accountExists = async (pubkey: PublicKey) => {
    const info = await connection.getAccountInfo(pubkey);
    return info !== null;
};

(window as any).setupAllFields = async () => {
    try {
        const program = getProgram();
        const wallet = (window as any).solana;
        if (!program || !wallet.publicKey) return;

        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

        console.log("Starting Field Deployment...");

        for (const f of fields) {
            // FIX: The IDL seeds for 'field' are ["field", authority, field_id]
            const [fieldPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("field"),
                    wallet.publicKey.toBuffer(), // This is the key change
                    Buffer.from(f.field_id)
                ],
                program.programId
            );

            console.log(`Checking PDA for ${f.field_id}: ${fieldPda.toString()}`);

            // Skip check to avoid 0x0 error
            const exists = await connection.getAccountInfo(fieldPda);
            if (exists) {
                console.log(`⏩ ${f.field_id} already exists. Skipping.`);
                continue;
            }

            // Prep numbers for Anchor
            const latFixed = new anchor.BN(Math.floor(f.gps_lat * 10000000));
            const longFixed = new anchor.BN(Math.floor(f.gps_long * 10000000));
            const areaFixed = new anchor.BN(Math.floor(f.area_sq_meters));

            await program.methods
                .initField(
                    f.field_id,
                    areaFixed,
                    f.metadata_url,
                    f.field_name,
                    latFixed,
                    longFixed
                )
                .accounts({
                    config: configPda,
                    field: fieldPda,
                    authority: wallet.publicKey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .rpc();

            console.log(`✅ ${f.field_id} Initialized.`);
        }
        alert("Fields setup complete.");
    } catch (err: any) {
        console.error("Field setup failed", err);
        throw err;
    }
};
// --- 2. THE ADMIN PROTOCOL INIT (Fixes the initialize is not a function error) ---
(window as any).initAdminProtocol = async () => {
    const program = getProgram();
    const wallet = (window as any).solana;
    const { PublicKey, SystemProgram } = anchor.web3;

    try {
        console.log("🛠️ Initializing Global Protocol Config...");

        // Derive the Config PDA as defined in IDL seeds: ["config"]
        const [configPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("config")],
            program.programId
        );

        // Execute the exact instruction from your IDL
        const tx = await program.methods
            .initializeGlobalConfig(
                500,             // fee: 500 basis points (5%)
                new anchor.BN(0) // min_stake: 0 for initial setup
            )
            .accounts({
                config: configPda,
                treasury: wallet.publicKey, // Admin wallet acts as treasury initially
                authority: wallet.publicKey,
                systemProgram: SystemProgram.address, // "11111111111111111111111111111111"
            })
            .rpc();

        console.log("✅ Protocol Initialized! TX:", tx);
        alert("Success: Protocol Config and Admin Authority established.");

    } catch (err: any) {
        console.error("Initialization Failed:", err);
        if (err.message.includes("already in use")) {
            alert("Protocol is already initialized on-chain.");
        } else {
            alert(`Init Error: ${err.message}`);
        }
    }
};
(window as any).loadSupabaseListings = async () => {
    const tableBody = document.getElementById('supabase-listings-table');
    const supabase = (window as any).supabase;

    if (!tableBody) return;

    try {
        console.log("📡 Fetching trees from Supabase...");
        const { data: trees, error } = await supabase
            .from('tree_ownership')
            .select('*')
            .order('tree_id', { ascending: true });

        if (error) throw error;

        tableBody.innerHTML = trees.map(t => {
            const isOnChain = t.on_chain === true || t.pda_address !== null;

            return `
            <tr class="border-b border-white/5 hover:bg-white/5 transition-colors group">
                <td class="p-3">
                    <div class="flex flex-col">
                        <span class="font-mono text-xs text-yellow-500 font-bold">${t.tree_id}</span>
                        <span class="text-[9px] text-zinc-500">${t.field_id || 'FIELD_01'}</span>
                    </div>
                </td>
                <td class="p-3 text-sm font-bold text-zinc-300">
                    ${t.price_sol || '0.10'} SOL
                </td>
                <td class="p-3">
                    <span class="px-2 py-0.5 rounded text-[10px] font-black ${isOnChain ? 'bg-green-500/10 text-green-400' : 'bg-zinc-800 text-zinc-500'}">
                        ${isOnChain ? '● LIVE' : '○ PENDING'}
                    </span>
                </td>
                <td class="p-3 text-right">
                    ${!isOnChain ? `
                        <button onclick="window.plantSingleTree('${t.tree_id}')"
                                class="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-black px-3 py-1 rounded uppercase transition-all">
                            Plant Tree
                        </button>
                    ` : `
                        <button onclick="window.openFieldDashboard('${t.tree_id}', '${t.pda_address}')"
                                class="text-[10px] text-zinc-400 hover:text-white underline">
                            Audit
                        </button>
                    `}
                </td>
            </tr>
            `;
        }).join('');

    } catch (err) {
        console.error("Supabase Load Error:", err);
        tableBody.innerHTML = `<tr><td colspan="4" class="p-10 text-center text-red-500 font-mono text-xs">FAILED TO CONNECT TO SUPABASE</td></tr>`;
    }
};
// --- FIX 3: Safe Stake Initialization (The "Authority Stake" fix) ---
(window as any).fixAdminStake = async () => {
    const program = getProgram();
    const wallet = (window as any).solana;

    try {
        const [stakePda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("stake"), wallet.publicKey.toBuffer()],
            program.programId
        );

        console.log("🛠️ Ensuring Admin Stake Account exists...");

        // Check if it already exists to avoid the 0x0 error
        const accountInfo = await program.provider.connection.getAccountInfo(stakePda);
        if (accountInfo) {
            console.log("✅ Admin Stake account already exists.");
            return;
        }

        // We use a dummy stake call of 0 to initialize the account
        // Note: You must have at least one Tree/Position initialized to use stake_shares
        // IF YOU HAVE NO TREES YET: Skip this and just use 'add_tree_to_field'
        // which creates the tree AND references the stake account.
    } catch (e) {
        console.error("Stake check failed", e);
    }
};
/**
 * Fetches all 'Field' accounts from the blockchain to populate the registry.
 */
 (window as any).loadFieldsFromChain = async () => {
    const program = (window as any).getProgram();

    // Safety Guard: If program isn't ready yet, wait or exit
    if (!program || !program.programId) {
        console.warn("⏳ Program not initialized yet. Skipping chain load...");
        return;
    }

    try {
        console.log("📡 Probing Field Integrity...");
        const fields = await program.account.field.all();
        console.log(`✅ Successfully loaded ${fields.length} fields from chain.`);
        // Render fields logic here...
    } catch (err) {
        console.error("Chain Load Error:", err);
    }
};
window.renderFields = (fields: any[]) => {
    const tableBody = document.getElementById('field-list-body');
    const countDisplay = document.getElementById('field-count');

    if (countDisplay) {
        countDisplay.innerText = `${fields.length} Fields Verified`;
    }

    if (!tableBody) return;

    if (fields.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="2" class="py-8 text-center text-zinc-600 italic">No On-Chain Fields Found</td></tr>`;
        return;
    }

    tableBody.innerHTML = fields.map(field => {
        // FIX: Check for 'fieldName' (On-Chain) or 'name' (Mock)
        const displayName = field.fieldName || field.name || "Unnamed Field";
        const addr = field.publicKey ? field.publicKey.toBase58() : 'Unknown Address';

        return `
            <tr class="hover:bg-white/5 transition-all group">
                <td class="py-3 pr-4">
                    <div class="flex flex-col">
                        <span class="text-white font-bold tracking-tight">${displayName}</span>
                        <span class="text-[9px] text-zinc-500 font-mono">${addr.slice(0, 8)}...${addr.slice(-8)}</span>
                    </div>
                </td>
                <td class="py-3 text-right">
                    <div class="flex flex-col items-end">
                        <span class="status-live text-[9px] font-black">● LIVE_NODE</span>
                        <div class="flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button onclick="window.openFieldDashboard('${displayName}', '${addr}')"
                                    class="text-blue-400 hover:text-white underline">
                                AUDIT
                            </button>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
};
// --- GLOBAL EXPOSURE FOR HTML BUTTONS ---
(window as any).openFieldModal = async (fieldId: string) => {
    console.log("🔍 [AUDIT]: Requesting data for", fieldId);

    const modal = document.getElementById('field-modal');
    const sb = (window as any).sbClient;

    if (!modal) {
        console.error("❌ UI ERROR: Element #field-modal not found in HTML");
        return;
    }

    try {
        // 1. Show the modal immediately (improves perceived speed)
        modal.classList.remove('hidden');
        const specsGrid = document.getElementById('modal-tech-specs');
        if (specsGrid) specsGrid.innerHTML = '<p class="text-solana animate-pulse">DECRYPTING SUPABASE REGISTRY...</p>';

        // 2. Fetch all columns from the 'fields' table
        const { data: fieldData, error } = await sb
            .from('fields')
            .select('*')
            .eq('field_id', fieldId)
            .single();

        if (error || !fieldData) throw new Error("Field data not found in Database.");

        // 3. Update Name and tech specs
        document.getElementById('modal-field-name')!.innerText = fieldData.name || fieldData.field_id;

        if (specsGrid) {
            specsGrid.innerHTML = Object.entries(fieldData).map(([key, val]) => `
                <div class="flex justify-between items-center border-b border-zinc-900 py-3">
                    <span class="text-zinc-500 uppercase text-[9px] font-bold tracking-widest">${key.replace(/_/g, ' ')}</span>
                    <span class="text-solana font-mono text-[10px] text-right break-all ml-4">
                        ${val === true ? '✅ TRUE' : val === false ? '❌ FALSE' : (val ?? '---')}
                    </span>
                </div>
            `).join('');
        }

        // 4. Trigger Live Sensor Mock (As per BO_index theme)
        document.getElementById('live-temp')!.innerText = "24°C";
        document.getElementById('live-humidity')!.innerText = "42%";
        document.getElementById('live-condition')!.innerText = "NOMINAL";

    } catch (err: any) {
        console.error("❌ MODAL_FETCH_ERROR:", err.message);
        alert("Failed to load audit data: " + err.message);
    }
};

(window as any).closeFieldModal = () => {
    document.getElementById('field-modal')?.classList.add('hidden');
};

console.log("✅ [SYSTEM]: Audit Modal Handlers Registered.");

(window as any).openFieldModal = openFieldModal;
(window as any).closeFieldModal = () => {
    document.getElementById('field-modal')?.classList.add('hidden');
};
import * as anchor from "@coral-xyz/anchor";

// EXPLICITLY ATTACH TO WINDOW
// --- 1. THE WALLET FLOW (Fixes "Not a Function") ---
// --- 1. GLOBAL REGISTRATION ---
// We attach it to window immediately to fix the "not a function" error
(window as any).handleWalletFlow = async () => {
    console.log("🔐 Initializing Secure Link...");

    // Safety check for Phantom/Solana
    const wallet = (window as any).solana;
    if (!wallet) {
        alert("Solana wallet not found. Please install Phantom.");
        return;
    }

    try {
        // FIXED: Syntax error fix from earlier
        const resp = await wallet.connect();
        const pubKey = resp.publicKey.toString();

        // Use the global Supabase client
        const sb = (window as any).sbClient;

        // [2026-01-16] Wallet Lock Rule Implementation
        // If the wallet has already voted, do not allow further calls
        const { data: member } = await sb
            .from('members')
            .select('has_voted')
            .eq('wallet_address', pubKey)
            .maybeSingle(); // maybeSingle prevents errors if member doesn't exist yet

        if (member?.has_voted) {
            alert("SECURITY ALERT: Wallet locked due to active vote [Rule 2026-01-16].");
            return;
        }

        // Logic for first-time vs returning members
        if (!member) {
            document.getElementById('compliance-modal')?.classList.remove('hidden');
        } else {
            // Success: Enter Portal
            console.log("✅ Access Granted:", pubKey);
            const portal = document.getElementById('portal-ui');
            if (portal) portal.style.opacity = "1";

            // Update UI Button with shortened address
            const btn = document.getElementById('btn-connect');
            if (btn) btn.innerText = `${pubKey.slice(0, 4)}...${pubKey.slice(-4)}`;
        }

    } catch (err: any) {
        console.error("Connection Failed:", err);
    }
};
// Also attach enterPortal if you call it from elsewhere
(window as any).enterPortal = async (pubKey: string) => {
    const portal = document.getElementById('portal-ui');
    if (portal) portal.style.opacity = "1";

    const btn = document.getElementById('btn-connect');
    if (btn) btn.innerText = `${pubKey.slice(0, 4)}...${pubKey.slice(-4)}`;

    // Refresh Market with Genesis Indicators [2026-02-07]
    if ((window as any).refreshMarketplace) await (window as any).refreshMarketplace();
};
// --- 2. COMPLIANCE SIGNING (First Time Setup) ---
(window as any).signCompliance = async () => {
    const wallet = (window as any).solana;
    const sb = (window as any).sbClient;
    const msg = "Olive DAO Compliance [2026-01-16]: I accept asset locking for voting and the non-liabilities clause.";

    try {
        const encoded = new TextEncoder().encode(msg);
        await wallet.signMessage(encoded, "utf8");

        // Register in Supabase
        await sb.from('members').insert([{
            wallet_address: wallet.publicKey.toString(),
            joined_at: new Date().toISOString(),
            has_voted: false
        }]);

        document.getElementById('compliance-modal')?.classList.add('hidden');
        enterPortal(wallet.publicKey.toString());
    } catch (e) {
        alert("Signature required to enter DAO.");
    }
};

// --- Inside your main.ts ---

async function enterPortal(pubKey: string) {
    const portal = document.getElementById('portal-ui');
    if (portal) {
        portal.style.opacity = "1";
        portal.classList.remove('opacity-0');
    }

    const btn = document.getElementById('btn-connect');
    if (btn) btn.innerText = `${pubKey.slice(0, 4)}...${pubKey.slice(-4)}`;

    // 1. Update Balances (SOL + Tree Count)
    await updateBalances();

    // 2. Refresh Market with [2026-02-07] Genesis Rules
    await refreshMarketplace();

    // 3. RETRY CHAIN LOAD NOW THAT PROGRAM IS READY
    console.log("🔄 Re-attempting On-Chain Field Sync...");
    await (window as any).loadFieldsFromChain();
}
async function refreshMarketplace() {
    const sb = (window as any).sbClient;
    const grid = document.getElementById('marketplace-grid');
    if (!grid) return;

    const { data: trees } = await sb.from('tree_ownership').select('*');

    // [2026-02-07] Please use the first 3 trees for genesis planting
    const genesisIds = ["F1-FR-001", "F1-LE-002", "F1-PE-003"];

    grid.innerHTML = trees.map((t: any) => {
        const isGenesis = genesisIds.includes(t.tree_id);
        return `
            <div class="glass p-5 rounded-[2rem] border border-white/5 relative group transition-all hover:border-green-500/30 ${isGenesis ? 'genesis-glow' : ''}">
                <div class="h-48 rounded-2xl overflow-hidden mb-4 relative">
                    <img src="${t.image_url || 'https://images.unsplash.com/photo-1543450050-6a16682b1c4b'}" class="w-full h-full object-cover">
                    ${isGenesis ? '<div class="absolute top-3 left-3 bg-green-500 text-black text-[8px] font-black px-2 py-0.5 rounded italic">GENESIS_UNIT</div>' : ''}
                </div>
                <h3 class="font-black italic uppercase text-lg">${t.tree_id}</h3>
                <p class="text-[10px] mono text-zinc-500 mb-4">${t.cultivar || 'Olea Europaea'}</p>
                <div class="flex justify-between items-center">
                    <span class="text-xs font-bold text-green-500">${t.on_chain ? 'ON_CHAIN' : 'RESERVED'}</span>
                    <button class="px-6 py-2 bg-white/5 hover:bg-white hover:text-black rounded-lg text-[10px] font-black uppercase transition-all">
                        Buy Share
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function applyWalletLock() {
    document.getElementById('portal-ui')?.classList.add('locked-state');
    const indicator = document.getElementById('lock-indicator');
    indicator?.classList.add('border-red-500');
    document.getElementById('lock-label')!.innerText = "VAULT_LOCKED";
    document.getElementById('lock-label')!.classList.add('text-red-500');
}
(window as any).openFieldDashboard = async (fieldId: string, pda: string) => {
    const modal = document.getElementById('field-modal');
    const content = document.getElementById('modal-content');
    const program = getProgram();
    const supabase = (window as any).supabase;

    if (!modal || !content) return;

    modal.classList.remove('hidden');
    content.innerHTML = `<div class="p-20 text-center animate-pulse text-zinc-500 font-mono">ESTABLISHING SECURE LINK...</div>`;

    try {
        const fieldPubkey = new anchor.web3.PublicKey(pda);

        // Fetch On-Chain Field data + Supabase Analytics
        const [fieldAccount, supabaseRes] = await Promise.all([
            program.account.field.fetch(fieldPubkey),
            supabase.from('field_analytics').select('*').eq('field_id', fieldId).single()
        ]);

        const envData = supabaseRes.data;

        content.innerHTML = `
            <div class="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
                <div class="relative h-32 rounded-xl overflow-hidden border border-white/10">
                    <img src="${envData?.photo_url || 'https://images.unsplash.com/photo-1500382017468-9049fed747ef'}" class="w-full h-full object-cover opacity-50">
                    <div class="absolute inset-0 bg-gradient-to-t from-black flex items-end p-4">
                        <h2 class="text-2xl font-black text-white italic uppercase">${fieldId}</h2>
                    </div>
                </div>
                <div>
                  <p class="text-[9px] text-green-500 uppercase font-black tracking-widest">Total CO2 Offset</p>
                  <p class="text-2xl font-black text-white">
                      ${fieldAccount.totalCo2Sequestered?.toString() || '0'} <span class="text-xs font-normal opacity-50">kg</span>
                  </p>
                <div class="grid grid-cols-3 gap-3">
                    <div class="bg-zinc-900 p-3 rounded-lg border border-white/5">
                        <label class="text-[9px] text-zinc-500 uppercase font-bold">Soil PH</label>
                        <input id="edit-ph" type="text" value="${envData?.soil_ph || '6.8'}"
                               class="bg-transparent text-green-400 font-mono w-full outline-none focus:text-white">
                    </div>
                    <div class="bg-zinc-900 p-3 rounded-lg border border-white/5">
                        <label class="text-[9px] text-zinc-500 uppercase font-bold">Moisture %</label>
                        <input id="edit-moisture" type="text" value="${envData?.moisture || '42'}"
                               class="bg-transparent text-blue-400 font-mono w-full outline-none focus:text-white">
                    </div>
                    <div class="bg-zinc-900 p-3 rounded-lg border border-white/5">
                        <label class="text-[9px] text-zinc-500 uppercase font-bold">Temp °C</label>
                        <input id="edit-temp" type="text" value="${envData?.temp || '24'}"
                               class="bg-transparent text-yellow-400 font-mono w-full outline-none focus:text-white">
                    </div>
                </div>

                <div class="p-4 bg-white/5 rounded-xl border border-white/10">
                    <p class="text-[10px] text-zinc-500 uppercase mb-2">On-Chain Registry Data</p>
                    <div class="flex justify-between text-xs font-mono">
                        <span class="text-zinc-400">Total Trees:</span>
                        <span class="text-white">${fieldAccount.totalTrees.toString()}</span>
                    </div>
                    <div class="flex justify-between text-xs font-mono mt-1">
                        <span class="text-zinc-400">Area (m²):</span>
                        <span class="text-white">${fieldAccount.areaSqMeters.toString()}</span>
                    </div>
                </div>

                <div class="flex gap-2">
                    <button onclick="window.saveFieldToSupabase('${fieldId}')"
                            class="flex-1 bg-green-600 hover:bg-green-500 text-black font-black py-3 rounded-xl text-[10px] uppercase tracking-tighter">
                        Sync Changes to Supabase
                    </button>
                    <button onclick="document.getElementById('field-modal').classList.add('hidden')"
                            class="px-6 bg-zinc-800 text-white font-bold rounded-xl text-[10px] uppercase">
                        Cancel
                    </button>
                </div>
            </div>
        `;
    } catch (err) {
        console.error("Dashboard Load Error:", err);
        content.innerHTML = `<div class="p-10 text-red-500 font-mono text-xs text-center">FAILED TO FETCH DATA</div>`;
    }
};
// Add this new function to deploy the first tree needed for the stake identity
(window as any).deploySeedTree = async () => {
    const program = getProgram(); // Ensure this helper handles nulls/waiting
    if (!program) {
        console.error("Program not initialized yet");
        return null;
    }
    const wallet = (window as any).solana;
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

    // Using your first field (FIELD_01) and first tree metadata
    const f = fields[0];
    const t = treesMetadata[0];

    const [fieldPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from(f.field_id)],
        program.programId
    );

    const [treePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(t.tree_id)],
        program.programId
    );

    const exists = await connection.getAccountInfo(treePda);
    if (exists) return treePda;

    console.log("🌱 Deploying Seed Tree for Stake Identity...");
    await program.methods
        .addTreeToField(
            t.tree_id,
            "Arbequina",
            new anchor.BN(Math.floor(f.gps_lat * 10000000)),
            new anchor.BN(Math.floor(f.gps_long * 10000000)),
            2024
        )
        .accounts({
            tree: treePda,
            field: fieldPda,
            config: configPda,
            authority: wallet.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();

    return treePda;
};



/**
 * Verifies if a Supabase Field record matches the On-Chain PDA.
 * [2026-02-05] Complete code - handles 'MISMATCH', 'GHOST', or 'VERIFIED'.
 */
(window as any).verifyField = async (fieldId: string, supabasePda: string) => {
    try {
        const program = (window as any).getProgram();
        const wallet = (window as any).solana;
        if (!program || !wallet.publicKey) return { status: "PENDING", label: "SCANNING..." };

        // 1. Derive what the PDA *should* be based on current IDL seeds: ["field", authority, name]
        const [expectedPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [
                Buffer.from("field"),
                wallet.publicKey.toBuffer(),
                Buffer.from(fieldId)
            ],
            program.programId
        );

        const expectedPdaStr = expectedPda.toBase58();

        // 2. Check for Seed Mismatch (Supabase has an old/wrong PDA address)
        if (supabasePda && supabasePda !== expectedPdaStr) {
            console.warn(`PDA Mismatch for ${fieldId}. Supabase: ${supabasePda}, Chain: ${expectedPdaStr}`);
            return { status: "MISMATCH", label: "SEED MISMATCH" };
        }

        // 3. Check if it actually exists on the blockchain
        const accountInfo = await connection.getAccountInfo(expectedPda);

        if (!accountInfo) {
            return { status: "GHOST", label: "NOT MINTED" };
        }

        // 4. Success - verified and on-chain
        return { status: "VERIFIED", label: "LIVE ON-CHAIN" };

    } catch (err) {
        console.error("Verification error:", err);
        return { status: "ERROR", label: "SYS ERR" };
    }
};
// --- UPDATED PHASE 3 IN YOUR freshGenesisStart ---
// Replace Phase 3 logic with this:
//console.log("🚀 PHASE 3: Deploying Seed Tree & Initializing Admin Stake...");
//await (window as any).deploySeedTree();
//await (window as any).fixAdminStake();
/**
 * [2026-02-05] START FRESH PROTOCOL
 * 1. Checks current Admin/DAO Vault balances.
 * 2. Provides a "Sweep" logic to ignore old 313-byte accounts.
 */
(window as any).auditAndSweep = async () => {
    const program = getProgram();
    const wallet = (window as any).solana;
    if (!program || !wallet.publicKey) return alert("Connect Admin Wallet");

    console.log("🔍 AUDITING OLD ON-CHAIN RECORDS...");

    try {
        // 1. Check SOL Balance for Deployment Gas
        const balance = await connection.getBalance(wallet.publicKey);
        console.log(`Admin Balance: ${(balance / 1e9).toFixed(4)} SOL`);

        // 2. Scan for "Ghost" accounts (the 313-byte ones causing the RangeError)
        const allAccounts = await connection.getProgramAccounts(program.programId);
        console.log(`Found ${allAccounts.length} total accounts on-chain.`);

        const legacyAccounts = allAccounts.filter(acc => acc.account.data.length === 313);
        console.log(`Detected ${legacyAccounts.length} legacy (313-byte) accounts to be ignored.`);

        // 3. TRIGGER FRESH INITIALIZATION FLOW
        const proceed = confirm(`Audit Complete. Found ${allAccounts.length} accounts. Ready to start fresh with Field & Tree Initialization?`);

        if (proceed) {
            await (window as any).freshGenesisStart();
        }
    } catch (err) {
        console.error("Audit failed:", err);
    }
};

/**
 * FRESH GENESIS START
 * Re-initializes Config -> Fields -> Admin Stake
 */
(window as any).freshGenesisStart = async () => {
    try {
        console.log("🚀 PHASE 1: Initializing Global Config...");
        await (window as any).initializeGlobalConfig();

        console.log("🚀 PHASE 2: Re-deploying Fields from Field_list.json...");
        // This uses the corrected logic to handle strings properly
        await (window as any).setupAllFields();

        console.log("🚀 PHASE 3: Initializing Admin Stake identity (Fixes 3003)...");
        await (window as any).fixAdminStake();

        alert("GENESIS COMPLETE: System is now fresh and ready for Orchard Migration.");
        (window as any).loadFieldsFromChain(); // Update the registry
    } catch (err: any) {
        console.error("Genesis failed at Phase:", err);
        alert(`Genesis Error: ${err.message}`);
    }
};
/**
 * Checks if the DAO Global Config PDA exists on-chain.
 * [2026-02-05] Complete code for production check.
 */
(window as any).checkDAOStatus = async () => {
    try {
        const program = (window as any).getProgram();
        if (!program) return "DISCONNECTED";

        // Derive the Config PDA using the 'config' seed
        const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("config")],
            program.programId
        );

        // Fetch account info from the blockchain
        const info = await connection.getAccountInfo(configPda);

        if (info) {
            console.log("DAO State: Initialized", configPda.toBase58());

            // Optional: Fetch the actual data to see the authority/fees
            const configData = await program.account.globalConfig.fetch(configPda);
            console.log("DAO Admin:", configData.authority.toBase58());

            return "INITIALIZED";
        } else {
            console.log("DAO State: Not Initialized");
            return "UNINITIALIZED";
        }
    } catch (err) {
        console.error("Failed to check DAO status:", err);
        return "ERROR";
    }
};

(window as any).recoverLegacySol = async () => {
    const program = getProgram();
    const wallet = (window as any).solana;
    const { PublicKey } = anchor.web3;

    try {
        console.log("🧹 Starting Batched Recovery...");

        // Find all accounts owned by your program
        const accounts = await program.provider.connection.getProgramAccounts(program.programId);
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

        // Filter for legacy accounts (those that fail to decode or aren't the Config)
        const legacy = accounts.filter(acc => acc.pubkey.toString() !== configPda.toString());

        console.log(`🎯 Found ${legacy.length} potential legacy accounts.`);

        // Process in batches of 5 to stay safe within size limits
        for (let i = 0; i < legacy.length; i += 5) {
            const batch = legacy.slice(i, i + 5);
            const transaction = new anchor.web3.Transaction();

            for (const acc of batch) {
                transaction.add(
                    await program.methods
                        .cleanupLegacyAccount() // Instruction from your IDL
                        .accounts({
                            legacyAccount: acc.pubkey,
                            config: configPda,
                            authority: wallet.publicKey,
                            systemProgram: anchor.web3.SystemProgram.programId,
                        })
                        .instruction()
                );
            }

            const tx = await program.provider.sendAndConfirm(transaction);
            console.log(`✅ Batch ${i/5 + 1} cleared. TX: ${tx}`);
        }
        alert("Recovery Complete! Buffer errors should be gone.");
    } catch (err: any) {
        console.error("Sweep Failed:", err);
    }
};
(window as any).runGenesisSequence = async () => {
    console.log("🚀 Starting Genesis Recovery: Planting First 3 Trees...");
    const sb = (window as any).sbClient;
    const program = (window as any).getProgram();
    const wallet = (window as any).solana;

    try {
        // [2026-02-07] Please use the first 3 trees for genesis planting.
        const { data: trees, error } = await sb
            .from('tree_ownership')
            .select('*')
            .order('id', { ascending: true })
            .limit(3);

        if (error) throw error;

        for (const t of trees) {
            console.log(`🌱 Attempting to plant ${t.tree_id}...`);

            // Derive PDA
            const [treePda] = anchor.web3.PublicKey.findProgramAddressSync(
                [Buffer.from("tree"), Buffer.from(t.tree_id)],
                program.programId
            );

            // 1. CHECK IF ALREADY EXISTS (Prevents Error 3004)
            const info = await program.provider.connection.getAccountInfo(treePda);
            if (info) {
                console.log(`⚠️ Tree ${t.tree_id} already exists on-chain. Skipping.`);
                continue;
            }

            // 2. PREPARE DATA
            // Assuming your Rust lat/long are i32 (fixed point)
            const lat = Math.round((t.latitude || 0) * 1000000);
            const long = Math.round((t.longitude || 0) * 1000000);
            const year = t.planting_year || 2026;

            // Derive Field PDA (Ensure this matches your Rust seeds)
            const [fieldPda] = anchor.web3.PublicKey.findProgramAddressSync(
                [Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from("FIELD_01")],
                program.programId
            );

            const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
                [Buffer.from("config")],
                program.programId
            );

            // 3. EXECUTE (Using addTreeToField)
            try {
                await program.methods.addTreeToField(
                    t.tree_id,
                    t.cultivar || "Olea",
                    lat,
                    long,
                    year
                ).accounts({
                    tree: treePda,
                    field: fieldPda,
                    config: configPda,
                    authority: wallet.publicKey,
                    systemProgram: anchor.web3.SystemProgram.id,
                }).rpc();

                console.log(`✅ Successfully planted ${t.tree_id}`);

                // Update Supabase so UI reflects the change
                await sb.from('tree_ownership').update({ on_chain: true }).eq('tree_id', t.tree_id);
            } catch (innerErr: any) {
                console.error(`❌ Failed to plant ${t.tree_id}:`, innerErr.message);
            }
        }

        await (window as any).syncGlobalState();
    } catch (err: any) {
        console.error("❌ Genesis Sequence Critical Failure:", err);
    }
};
// --- BATCH PLANTING LOGIC ---
/**
 * Plants trees in specific batches (1, 3, or 5)
 * Pulls unplanted trees from Supabase and pushes to Solana.
 */
(window as any).plantBatch = async (batchSize: 1 | 3 | 5) => {
    const wallet = (window as any).solana;
    if (!await secureAdminAction(wallet)) return;

    const sb = (window as any).supabase;
    const program = getProgram();

    // 1. Get unplanted trees from Supabase
    const { data: trees, error } = await sb
        .from('tree_ownership')
        .select('*')
        .is('pda_address', null)
        .limit(batchSize);

    if (error || !trees.length) return alert("No pending trees in Supabase.");

    try {
        console.log(`🚀 Processing Batch of ${trees.length}...`);

        for (const tree of trees) {
            // Derive PDAs for Field 1 (or relevant field)
            const [fieldPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from(tree.field_id)],
                program.programId
            );
            const [treePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(tree.tree_id)],
                program.programId
            );

            // 2. Execute On-Chain Instruction
            await program.methods.addTreeToField(
                tree.tree_id,
                tree.variety || "Frantoio",
                43, 10, 2024 // Default location/year
            ).accounts({
                tree: treePda,
                field: fieldPda,
                config: (PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId))[0],
                authority: wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            }).rpc();

            // 3. Update Supabase with the new PDA
            await sb.from('tree_ownership')
                .update({ pda_address: treePda.toBase58(), status: 'PLANTED' })
                .eq('tree_id', tree.tree_id);
        }

        alert(`Successfully planted ${trees.length} trees.`);
        window.refreshAllAdminData();
    } catch (err) {
        console.error("Batch fail:", err);
    }
};

// --- GOVERNANCE: PAUSE SYSTEM ---
(window as any).setDaoPause = async (shouldPause: boolean) => {
    const program = getProgram();
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

    try {
        await program.methods.togglePause(shouldPause)
            .accounts({
                config: configPda,
                authority: (window as any).solana.publicKey,
            }).rpc();

        alert(`DAO Protocol is now ${shouldPause ? 'PAUSED' : 'ACTIVE'}`);
        window.refreshAllAdminData();
    } catch (err: any) {
        alert("Governance error: " + err.message);
    }
};

// --- TREE MANAGEMENT: MANUAL EDIT ---
(window as any).editTreeMeta = async (treeId: string) => {
    const newVariety = prompt("Enter new variety name:");
    if (!newVariety) return;

    const { error } = await (window as any).supabase
        .from('tree_ownership')
        .update({ variety: newVariety })
        .eq('tree_id', treeId);

    if (!error) alert("Tree variety updated in Supabase.");
};
(window as any).executeMasterGenesis = async () => {
    // 1. Wait for program to be ready
    const program = (window as any).program || (typeof getProgram === 'function' ? getProgram() : null);
    if (!program) {
        console.error("⏳ Program not ready. Retrying in 1s...");
      //  setTimeout(() => (window as any).executeMasterGenesis(), 1000);
        return;
    }

    const wallet = (window as any).solana;
    const { PublicKey, SystemProgram } = anchor.web3;

    try {
        console.log("🎬 Starting Final Genesis Sequence...");

        // PDAs
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
        const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), wallet.publicKey.toBuffer()], program.programId);

        const transaction = new anchor.web3.Transaction();

        // STEP A: Initialize Global Config
        transaction.add(
            await program.methods.initializeGlobalConfig(500, new anchor.BN(0))
                .accounts({
                    config: configPda,
                    treasury: wallet.publicKey,
                    authority: wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .instruction()
        );

        // STEP B: Initialize Admin Stake (Admin Exempt [cite: 2026-02-07])
        transaction.add(
            await program.methods.initializeStake()
                .accounts({
                    config: configPda,
                    authorityStake: stakePda,
                    authority: wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .instruction()
        );

        // STEP C: Fetch first 3 trees from tree_metadata [cite: 2026-02-07]
        const { data: treeMetadata, error } = await window.supabase
            .from('tree_metadata')
            .select('*')
            .limit(3);

        if (error || !treeMetadata) throw new Error("Supabase Fetch Failed: Check tree_metadata table");

        for (const t of treeMetadata) {
            const treeId = t.tree_id || `TREE_${Math.floor(Math.random()*1000)}`;
            const fieldId = t.field_id || "FIELD_01";

            const [fPda] = PublicKey.findProgramAddressSync([Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from(fieldId)], program.programId);
            const [tPda] = PublicKey.findProgramAddressSync([Buffer.from("tree"), fPda.toBuffer(), Buffer.from(treeId)], program.programId);

            // Mandatory: Every instruction must explicitly name 'config'
            transaction.add(
                await program.methods.initField(fieldId, new anchor.BN(5000), "", "Murizzo, Spain")
                    .accounts({
                        config: configPda,
                        field: fPda,
                        authority: wallet.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .instruction()
            );

            transaction.add(
                await program.methods.addTreeToField(
                    treeId,
                    t.cultivar || "Arbequina",
                    parseInt(t.latitude || t.lat || 404140),
                    parseInt(t.longitude || t.lng || -37020),
                    2026
                )
                .accounts({
                    config: configPda,
                    tree: tPda,
                    field: fPda,
                    authority: wallet.publicKey,
                    authorityStake: stakePda,
                    systemProgram: SystemProgram.programId,
                })
                .instruction()
            );
        }

        const tx = await program.provider.sendAndConfirm(transaction);
        console.log("✅ GENESIS SUCCESS! TX:", tx);
        alert("Protocol Live! Refreshing Dashboard...");
        window.location.reload();

    } catch (err) {
        console.error("❌ Genesis Failed:", err);
        alert(`Setup Error: ${err.message}`);
    }
};

// 📊 NEAT VIEW DASHBOARD (Fixed Data Mismatch)
(window as any).renderNeatAdminUI = async () => {
    console.log("📊 Refreshing Neat View...");

    // Graceful fetches for potentially missing tables
    const fetchTable = async (name) => {
        const { data, error } = await window.supabase.from(name).select('*');
        return error ? [] : data;
    };

    const trees = await fetchTable('tree_metadata');
    const fields = await fetchTable('fields');
    const stakeholders = await fetchTable('stakeholders');
    const stakes = await fetchTable('stakes'); // This was 404ing

    const container = document.getElementById('admin-display') || document.body;

    container.innerHTML = `
        <div style="background: #000; color: #fff; font-family: sans-serif; padding: 25px; border: 1px solid #222; border-radius: 12px;">
            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #333; padding-bottom: 15px; margin-bottom: 20px;">
                <h2 style="margin:0; color: #10b981;">🌳 Olive Protocol Admin</h2>
                <button onclick="window.executeMasterGenesis()" style="background:#10b981; border:none; color:white; padding:8px 16px; border-radius:4px; cursor:pointer; font-weight:bold;">Run Genesis (3 Trees)</button>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <section>
                    <h3 style="color: #666; font-size: 12px; text-transform: uppercase;">Tree Metadata</h3>
                    <div style="background:#111; padding: 10px; border-radius: 6px; max-height: 300px; overflow-y: auto;">
                        ${trees.length ? trees.map(t => `<div style="padding:5px 0; border-bottom:1px solid #222; font-size:13px;">${t.tree_id} - <span style="color:#fbbf24;">❤️ ${t.health_score || 100}%</span></div>`).join('') : 'No trees found'}
                    </div>
                </section>

                <section>
                    <h3 style="color: #666; font-size: 12px; text-transform: uppercase;">Stakeholders & Stakes</h3>
                    <div style="background:#111; padding: 10px; border-radius: 6px;">
                        ${stakeholders.length ? stakeholders.map(s => `<div style="font-size:12px; font-family:monospace; margin-bottom:4px;">${s.wallet_address.slice(0,10)}... [${s.role || 'User'}]</div>`).join('') : 'No stakeholders found'}
                    </div>
                </section>
            </div>
        </div>
    `;
};

// Auto-Render
//window.renderNeatAdminUI();
//window.executeMasterGenesis();

(window as any).OliveProtocolMaster = {
    // 1. DASHBOARD HYDRATION (Including Ownership)
    async hydrateDashboard() {
        console.log("📊 Syncing Complete Blueprint...");
        const program = getProgram();
        const wallet = (window as any).solana;

        const { data: dbTrees } = await window.supabase.from('tree_metadata').select('*');
        const { data: dbFields } = await window.supabase.from('fields').select('*');
        const { data: dbOwners } = await window.supabase.from('tree_ownership').select('*');
        const { data: dbStakes } = await window.supabase.from('stakes').select('*');

        const container = document.getElementById('admin-display') || document.body;

        container.innerHTML = `
            <div style="background: #050505; color: #fff; font-family: monospace; padding: 25px; border: 1px solid #1a1a1a; border-radius: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #10b981; padding-bottom: 15px; margin-bottom: 25px;">
                    <div>
                        <h1 style="margin:0; color: #10b981; font-size: 22px;">OLIVE_MASTER_V2</h1>
                        <p style="margin:0; font-size:10px; color:#666;">AUTHORITY: ${wallet.publicKey.toBase58().slice(0,8)}... (ADMIN_EXEMPT)</p>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button onclick="window.OliveProtocolMaster.runGenesis()" style="background:#10b981; color:#000; border:none; padding:10px 15px; font-weight:bold; cursor:pointer; border-radius:4px;">🚀 RUN GENESIS</button>
                        <button onclick="window.OliveProtocolMaster.syncOwnership()" style="background:#3b82f6; color:#fff; border:none; padding:10px 15px; font-weight:bold; cursor:pointer; border-radius:4px;">🔗 SYNC OWNERSHIP</button>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                    <div style="background: #0f0f0f; padding: 15px; border: 1px solid #222;">
                        <h4 style="color: #10b981; margin:0 0 10px 0;">DB_BLUEPRINT</h4>
                        <div style="font-size:12px; line-height:1.6;">
                            FIELDS: ${dbFields?.length || 0}<br/>
                            METADATA: ${dbTrees?.length || 0}<br/>
                            OWNERS: ${dbOwners?.length || 0}
                        </div>
                    </div>
                    <div style="background: #0f0f0f; padding: 15px; border: 1px solid #222;">
                        <h4 style="color: #fbbf24; margin:0 0 10px 0;">ON_CHAIN_STATUS</h4>
                        <div id="chain-status-box" style="font-size:12px;">Checking...</div>
                    </div>
                    <div style="background: #0f0f0f; padding: 15px; border: 1px solid #222;">
                        <h4 style="color: #3b82f6; margin:0 0 10px 0;">WALLET_LOCKS</h4>
                        <div style="font-size:11px; max-height:60px; overflow-y:auto;">
                            ${dbStakes?.map(s => `<div>${s.wallet_address.slice(0,6)}: ${s.has_active_vote ? '🔒' : '🔓'}</div>`).join('') || 'No Stakes'}
                        </div>
                    </div>
                </div>

                <div style="background: #0f0f0f; border: 1px solid #222; padding: 15px;">
                    <h4 style="color: #888; margin:0 0 10px 0; font-size:12px;">OWNERSHIP_LEDGER (SUPABASE)</h4>
                    <div style="max-height: 200px; overflow-y: auto; font-size: 11px;">
                        <table style="width: 100%; text-align: left;">
                            <tr style="color:#555;"><th>TREE</th><th>OWNER_WALLET</th><th>STATUS</th></tr>
                            ${dbOwners?.map(o => `
                                <tr style="border-bottom:1px solid #111;">
                                    <td style="padding:4px 0;">${o.tree_id}</td>
                                    <td>${o.owner_address?.slice(0,12)}...</td>
                                    <td style="color:#3b82f6;">PENDING_TX</td>
                                </tr>
                            `).join('') || '<tr><td>No records</td></tr>'}
                        </table>
                    </div>
                </div>
            </div>
        `;
        this.checkChainStatus();
    },

    // 2. DAO & STAKE CHECK
    async checkChainStatus() {
        const program = getProgram();
        const wallet = (window as any).solana;
        const [configPda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
        const [stakePda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("stake"), wallet.publicKey.toBuffer()], program.programId);

        const box = document.getElementById('chain-status-box');
        try {
            const config = await program.account.globalConfig.fetch(configPda);
            const stake = await program.account.stakeAccount.fetch(stakePda);
            box.innerHTML = `<span style="color:#10b981;">● DAO ACTIVE</span><br/><span style="color:#10b981;">● STAKE FOUND</span><br/>Epoch: ${config.currentEpoch}`;
        } catch(e) {
            box.innerHTML = `<span style="color:#ef4444;">● INITIALIZATION REQUIRED</span>`;
        }
    },

    // 3. GENESIS (First 3 Trees with Full Data)
    async runGenesis() {
        const program = getProgram();
        const wallet = (window as any).solana;
        const { PublicKey, SystemProgram } = anchor.web3;
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
        const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), wallet.publicKey.toBuffer()], program.programId);

        try {
            let tx = new anchor.web3.Transaction();

            // Explicit Config Inits
            tx.add(await program.methods.initializeGlobalConfig(500, new anchor.BN(0)).accounts({ config: configPda, treasury: wallet.publicKey, authority: wallet.publicKey, systemProgram: SystemProgram.programId }).instruction());
            tx.add(await program.methods.initializeStake().accounts({ config: configPda, authorityStake: stakePda, authority: wallet.publicKey, systemProgram: SystemProgram.programId }).instruction());

            const { data: dbTrees } = await window.supabase.from('tree_metadata').select('*').limit(3);

            for (const t of dbTrees) {
                const [fPda] = PublicKey.findProgramAddressSync([Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from(t.field_id || "FIELD_01")], program.programId);
                const [tPda] = PublicKey.findProgramAddressSync([Buffer.from("tree"), fPda.toBuffer(), Buffer.from(t.tree_id)], program.programId);

                tx.add(await program.methods.initField(t.field_id || "FIELD_01", new anchor.BN(5000), "", "Murizzo").accounts({ config: configPda, field: fPda, authority: wallet.publicKey, systemProgram: SystemProgram.programId }).instruction());
                tx.add(await program.methods.addTreeToField(t.tree_id, t.cultivar || "Arbequina", parseInt(t.latitude || 404140), parseInt(t.longitude || -37020), 2026)
                    .accounts({ config: configPda, tree: tPda, field: fPda, authority: wallet.publicKey, authorityStake: stakePda, systemProgram: SystemProgram.programId }).instruction());
            }

            const sig = await program.provider.sendAndConfirm(tx);
            console.log("✅ Genesis Signature:", sig);
            this.hydrateDashboard();
        } catch (e) { alert(e.message); }
    },

    // 4. SYNC OWNERSHIP (Bridge Supabase -> Chain)
    async syncOwnership() {
        const program = getProgram();
        const wallet = (window as any).solana;
        const [configPda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

        try {
            const { data: owners } = await window.supabase.from('tree_ownership').select('*').limit(5);
            if (!owners) return;

            const tx = new anchor.web3.Transaction();
            for (const o of owners) {
                // Assuming your program has an updateTreeOwner instruction
                // We derive the tree PDA based on the field recorded in metadata
                const { data: meta } = await window.supabase.from('tree_metadata').select('field_id').eq('tree_id', o.tree_id).single();

                const [fPda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from(meta.field_id)], program.programId);
                const [tPda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("tree"), fPda.toBuffer(), Buffer.from(o.tree_id)], program.programId);

                tx.add(await program.methods.updateTreeOwner(new anchor.web3.PublicKey(o.owner_address))
                    .accounts({ config: configPda, tree: tPda, authority: wallet.publicKey })
                    .instruction());
            }
            await program.provider.sendAndConfirm(tx);
            alert("Ownership Synced Successfully");
        } catch (e) { console.error(e); }
    }
};

// 🛑 GHOST KILLER: Stop all legacy calls to the non-existent 'stakes' table
if (window.supabase) {
    const originalFrom = window.supabase.from;
    window.supabase.from = function(tableName) {
        if (tableName === 'stakes' || tableName === 'field_analytics') {
            return {
                select: () => ({
                    eq: () => Promise.resolve({ data: [], error: null }),
                    promise: () => Promise.resolve({ data: [], error: null })
                }),
                insert: () => Promise.resolve({ error: null })
            };
        }
        return originalFrom.apply(this, arguments);
    };
}

window.runGenesisSequence = async () => {
    const program = getProgram();
    const wallet = (window as any).solana;
    const { PublicKey, SystemProgram } = anchor.web3;

    try {
        console.log("🚀 Starting Genesis Recovery: Planting First 3 Trees...");

        // 1. Derive Global PDAs
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
        const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), wallet.publicKey.toBuffer()], program.programId);

        // 2. Define Master Trees [cite: 2026-02-07]
        const masterTrees = [
            { id: "F1-FR-001", cultivar: "Frantoio", field: "FIELD_01", lat: 43103723, long: 10578417 },
            { id: "F1-LE-002", cultivar: "Leccino", field: "FIELD_01", lat: 43103724, long: 10578418 },
            { id: "F1-PE-003", cultivar: "Pendolino", field: "FIELD_01", lat: 43103725, long: 10578419 }
        ];

        // 3. Ensure Stake exists first (using a standalone check)
        const stakeInfo = await program.provider.connection.getAccountInfo(stakePda);
        if (!stakeInfo) {
            console.log("🚧 Admin Stake missing. Initializing...");
            await program.methods.initializeStake()
                .accounts({
                    authorityStake: stakePda,
                    authority: wallet.publicKey,
                    systemProgram: SystemProgram.programId
                }).rpc();
            console.log("✅ Admin Stake Initialized.");
        }

        for (const t of masterTrees) {
            // Field PDA: ["field", admin_pubkey, "FIELD_01"]
            const [fPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from(t.field)],
                program.programId
            );

            // Tree PDA: ["tree", field_pda_pubkey, "TREE_ID"]
            const [tPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("tree"), fPda.toBuffer(), Buffer.from(t.id)],
                program.programId
            );

            console.log(`🌱 Attempting to plant ${t.id}...`);

            try {
                // Planting logic
                await program.methods.addTreeToField(
                    t.id,
                    t.cultivar,
                    t.lat,
                    t.long,
                    2026
                ).accounts({
                    tree: tPda,
                    field: fPda,
                    config: configPda,
                    authority: wallet.publicKey,
                    authorityStake: stakePda,
                    systemProgram: SystemProgram.programId
                }).rpc();

                console.log(`✨ Successfully planted ${t.id}`);
            } catch (err) {
                if (err.message.includes("already in use") || err.logs?.some(l => l.includes("already in use"))) {
                    console.log(`🌲 ${t.id} already exists.`);
                } else {
                    console.error(`❌ Failed to plant ${t.id}:`, err);
                }
            }
        }

        alert("✅ Genesis Recovery Complete. First 3 trees processed.");
        window.location.reload();

    } catch (err) {
        console.error("❌ Recovery Failed:", err);
        alert(`Genesis Recovery Error: ${err.message}`);
    }
};

// Cleanup UI Hydration to stop looking for 'stakes'
window.loadAdminDashboard = async () => {
    const { data: fields } = await window.supabase.from('fields').select('*');
    const display = document.getElementById('admin-display');
    if (display) {
        display.innerHTML = `<div class="p-2 text-green-400">FIELDS: ${fields?.length || 0} | TREES: READY</div>`;
    }
};
// --- CLEAN UI SYNC (SCRUBBED ALL STAKES TABLE CALLS) ---
window.loadAdminDashboard = async () => {
    console.log("📊 Refreshing UI (Stakes table calls removed)...");
    try {
        // We only fetch what exists
        const { data: trees } = await window.supabase.from('tree_metadata').select('*').limit(5);
        const { data: fields } = await window.supabase.from('fields').select('*');

        const display = document.getElementById('admin-display');
        if (display) {
            display.innerHTML = `
                <div class="p-4 bg-gray-900 border border-gray-800 rounded">
                    <h4 class="text-green-500 font-bold mb-2">SUPABASE SYNC</h4>
                    <p class="text-xs">Fields: ${fields?.length || 0}</p>
                    <p class="text-xs">Tree Metadata: ${trees?.length || 0}</p>
                </div>
            `;
        }
    } catch (e) {
        console.warn("UI Hydration restricted to available tables.");
    }
};

// Cleanup initialization
window.loadFullAdminDashboard = window.loadAdminDashboard;
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('run-genesis-btn');
    if (btn) btn.onclick = window.runGenesisSequence;
    window.loadAdminDashboard();
});
// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('run-genesis-btn');
    if (btn) btn.onclick = runGenesisSequence;
    loadFullAdminDashboard();
});
(window as any).OliveProtocolMaster.runGenesis = async () => {
    const program = getProgram();
    const wallet = (window as any).solana;
    const { PublicKey, SystemProgram, Transaction } = anchor.web3;

    try {
        console.log("🛠️ Starting Sequential Genesis...");
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
        const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), wallet.publicKey.toBuffer()], program.programId);

        // --- STEP 1: INITIALIZE DAO & ADMIN STAKE ---
        // We do this first to ensure 'config' exists for subsequent calls
        const initTx = new Transaction();

        console.log("📡 Checking DAO/Stake presence...");
        let needsInit = false;

        try {
            await program.account.globalConfig.fetch(configPda);
            console.log("✅ DAO already exists.");
        } catch {
            console.log("🆕 Adding InitializeGlobalConfig to TX...");
            initTx.add(await program.methods.initializeGlobalConfig(500, new anchor.BN(0))
                .accounts({ config: configPda, treasury: wallet.publicKey, authority: wallet.publicKey, systemProgram: SystemProgram.id })
                .instruction());
            needsInit = true;
        }

        try {
            await program.account.stakeAccount.fetch(stakePda);
            console.log("✅ Stake already exists.");
        } catch {
            console.log("🆕 Adding InitializeStake to TX...");
            initTx.add(await program.methods.initializeStake()
                .accounts({ config: configPda, authorityStake: stakePda, authority: wallet.publicKey, systemProgram: SystemProgram.id })
                .instruction());
            needsInit = true;
        }

        if (needsInit) {
            console.log("📤 Sending Initialization Transaction...");
            await program.provider.sendAndConfirm(initTx);
            console.log("🚀 DAO and Stake are now LIVE on-chain.");
        }

        // --- STEP 2: PLANT THE FIRST 3 TREES ---
        const { data: dbTrees, error } = await window.supabase
            .from('tree_metadata')
            .select('*')
            .limit(3); // [cite: 2026-02-07]

        if (error || !dbTrees) throw new Error("Could not fetch tree_metadata from Supabase.");

        const plantTx = new Transaction();
        console.log(`🌱 Preparing to plant ${dbTrees.length} trees...`);

        for (const t of dbTrees) {
            const fieldId = t.field_id || "FIELD_01";
            const [fPda] = PublicKey.findProgramAddressSync([Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from(fieldId)], program.programId);
            const [tPda] = PublicKey.findProgramAddressSync([Buffer.from("tree"), fPda.toBuffer(), Buffer.from(t.tree_id)], program.programId);

            // 1. Initialize Field (Explicitly pass config)
            try {
                await program.account.field.fetch(fPda);
            } catch {
                plantTx.add(await program.methods.initField(fieldId, new anchor.BN(5000), "", "Murizzo")
                    .accounts({
                        config: configPda, // MUST PROVIDE EXPLICITLY
                        field: fPda,
                        authority: wallet.publicKey,
                        systemProgram: SystemProgram.id
                    }).instruction());
            }

            // 2. Add Tree (Explicitly pass config and stake)
            // Admin is exempt from voting locks [cite: 2026-02-07]
            plantTx.add(await program.methods.addTreeToField(
                t.tree_id,
                t.cultivar || "Arbequina",
                parseInt(t.latitude || 404140),
                parseInt(t.longitude || -37020),
                2026
            ).accounts({
                config: configPda, // EXPLICIT
                tree: tPda,
                field: fPda,
                authority: wallet.publicKey,
                authorityStake: stakePda, // ADMIN EXEMPTION BYPASS
                systemProgram: SystemProgram.id,
            }).instruction());
        }

        if (plantTx.instructions.length > 0) {
            console.log("📤 Sending Planting Transaction...");
            const sig = await program.provider.sendAndConfirm(plantTx);
            console.log("✅ GENESIS SUCCESSFUL! TX:", sig);
            alert("Genesis Complete: 3 Trees are on-chain.");
        }

        window.OliveProtocolMaster.hydrateDashboard();

    } catch (err) {
        console.error("❌ Genesis Error:", err);
        alert(`Failed: ${err.message}`);
    }
};

(window as any).renderNeatAdminUI = async () => {
    console.log("📊 Fetching all table data for Neat View...");

    // Fetch from all relevant tables
    const { data: trees } = await window.supabase.from('tree_metadata').select('*').limit(50);
    const { data: fields } = await window.supabase.from('fields').select('*');
    const { data: stakes } = await window.supabase.from('stakes').select('*');
    const { data: stakeholders } = await window.supabase.from('stakeholders').select('*');

    // Find the main dashboard container or use body
    const container = document.getElementById('admin-display') || document.body;

    container.innerHTML = `
        <div style="background-color: #0c0c0c; color: #e5e7eb; font-family: 'Inter', sans-serif; padding: 2rem; border-radius: 1rem; border: 1px solid #1f2937; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);">

            <header style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #064e3b; padding-bottom: 1rem; margin-bottom: 2rem;">
                <div>
                    <h1 style="color: #10b981; font-size: 1.875rem; font-weight: 800; margin: 0;">Olive Protocol Admin</h1>
                    <p style="color: #6b7280; font-size: 0.875rem; margin-top: 0.25rem;">Genesis Status: <span style="color: #34d399;">Active</span> | Environment: <span style="color: #34d399;">Mainnet-Beta</span></p>
                </div>
                <div style="background: #064e3b; padding: 0.5rem 1rem; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; color: #34d399; letter-spacing: 0.05em;">ADMIN MODE ACTIVE</div>
            </header>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem;">

                <section style="background: #111827; padding: 1.5rem; border-radius: 0.75rem; border: 1px solid #374151;">
                    <h3 style="color: #9ca3af; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 1rem;">Tree Metadata (First 50)</h3>
                    <div style="max-height: 400px; overflow-y: auto;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
                            <thead style="position: sticky; top: 0; background: #111827; color: #6b7280;">
                                <tr style="text-align: left;">
                                    <th style="padding: 0.5rem;">ID</th><th style="padding: 0.5rem;">Cultivar</th><th style="padding: 0.5rem;">Health</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${trees?.map(t => `
                                    <tr style="border-top: 1px solid #1f2937;">
                                        <td style="padding: 0.75rem 0.5rem; font-family: monospace; color: #10b981;">${t.tree_id || 'N/A'}</td>
                                        <td style="padding: 0.75rem 0.5rem;">${t.cultivar || 'Arbequina'}</td>
                                        <td style="padding: 0.75rem 0.5rem; color: #fbbf24;">❤️ ${t.health_score || 100}%</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section style="background: #111827; padding: 1.5rem; border-radius: 0.75rem; border: 1px solid #374151;">
                    <h3 style="color: #9ca3af; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 1rem;">Wallet Stake Status</h3>
                    <div style="space-y-3">
                        ${stakes?.map(s => `
                            <div style="display: flex; justify-content: space-between; align-items: center; background: #030712; padding: 0.75rem; border-radius: 0.5rem; margin-bottom: 0.5rem; border: 1px solid #1f2937;">
                                <div>
                                    <div style="font-family: monospace; font-size: 0.75rem; color: #9ca3af;">${s.wallet_address.slice(0,12)}...</div>
                                    <div style="font-weight: 700; color: #fff;">${s.amount || 0} OLY</div>
                                </div>
                                <span style="padding: 0.25rem 0.625rem; border-radius: 0.375rem; font-size: 0.625rem; font-weight: 800; background: ${s.has_active_vote ? '#7f1d1d' : '#064e3b'}; color: ${s.has_active_vote ? '#fecaca' : '#34d399'};">
                                    ${s.has_active_vote ? '🔒 LOCKED' : '🔓 READY'}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </section>

                <section style="background: #111827; padding: 1.5rem; border-radius: 0.75rem; border: 1px solid #374151;">
                    <h3 style="color: #9ca3af; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 1rem;">Field Infrastructure</h3>
                    ${fields?.map(f => `
                        <div style="border-left: 4px solid #10b981; background: #030712; padding: 1rem; margin-bottom: 1rem; border-radius: 0 0.5rem 0.5rem 0;">
                            <div style="font-weight: 800; color: #10b981;">${f.field_id}</div>
                            <div style="font-size: 0.75rem; color: #6b7280; margin-top: 0.25rem;">📍 ${f.location}</div>
                            <div style="display: flex; gap: 1rem; margin-top: 0.75rem; font-size: 0.7rem; color: #9ca3af;">
                                <span>📐 ${f.area_sq_meters} m²</span>
                                <span>🌳 ${f.total_trees || 0} Trees</span>
                            </div>
                        </div>
                    `).join('')}
                </section>

            </div>

            <footer style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #1f2937; text-align: center;">
                <button onclick="window.executeMasterGenesis()" style="background: #10b981; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 700; cursor: pointer; transition: background 0.2s;">
                    ♻️ Re-run Genesis (First 3 Trees)
                </button>
            </footer>
        </div>
    `;
};

// Auto-run on load
//window.renderNeatAdminUI();

(window as any).OliveAdmin = {
    // 1. NEAT UI RENDERER
    async renderFullDashboard() {
        console.log("📊 Fetching all table data for Admin View...");
        const { data: fields } = await window.supabase.from('fields').select('*');
        const { data: trees } = await window.supabase.from('trees').select('*');
        const { data: stakes } = await window.supabase.from('stakes').select('*');
        const { data: stakeholders } = await window.supabase.from('stakeholders').select('*');

        const container = document.getElementById('admin-dashboard');
        if (!container) return;

        container.innerHTML = `
            <div class="p-6 space-y-8 bg-black text-white">
                <h1 class="text-3xl font-bold text-green-500">Olive Protocol Admin Control</h1>

                <section>
                    <h2 class="text-xl font-semibold mb-3 border-b border-green-900 pb-2">On-Chain Trees</h2>
                    <div class="overflow-x-auto rounded-lg border border-gray-800">
                        <table class="w-full text-left text-sm">
                            <thead class="bg-gray-900 text-gray-400">
                                <tr>
                                    <th class="p-3">Tree ID</th><th class="p-3">Field</th><th class="p-3">Cultivar</th><th class="p-3">Health</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${trees?.map(t => `
                                    <tr class="border-t border-gray-800 hover:bg-gray-900/50">
                                        <td class="p-3 font-mono text-green-400">${t.tree_id}</td>
                                        <td class="p-3">${t.field_id}</td>
                                        <td class="p-3">${t.cultivar}</td>
                                        <td class="p-3">❤️ ${t.health_score}%</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </section>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <section>
                        <h2 class="text-xl font-semibold mb-3 border-b border-green-900 pb-2">Stakeholders</h2>
                        <div class="bg-gray-900 p-4 rounded-lg space-y-2">
                            ${stakeholders?.map(s => `
                                <div class="flex justify-between border-b border-gray-800 py-1">
                                    <span class="text-gray-400 text-xs">${s.wallet_address}</span>
                                    <span class="text-green-500 font-bold">${s.role || 'Investor'}</span>
                                </div>
                            `).join('')}
                        </div>
                    </section>
                    <section>
                        <h2 class="text-xl font-semibold mb-3 border-b border-green-900 pb-2">Stakes Status</h2>
                        <div class="bg-gray-900 p-4 rounded-lg space-y-2">
                            ${stakes?.map(s => `
                                <div class="flex justify-between border-b border-gray-800 py-1">
                                    <span class="text-gray-400 text-xs">${s.wallet_address}</span>
                                    <span class="${s.has_active_vote ? 'text-red-500' : 'text-blue-400'}">
                                        ${s.has_active_vote ? '🔒 Locked' : '🔓 Ready'}
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    </section>
                </div>
            </div>
        `;
    },

    // 2. GENESIS PLANTING (Uses first 3 Trees from Supabase)
    async runGenesis() {
        const program = getProgram();
        const wallet = (window as any).solana;
        const { PublicKey, SystemProgram } = anchor.web3;

        try {
            console.log("🚀 Initializing Genesis (First 3 Trees)...");

            const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
            const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), wallet.publicKey.toBuffer()], program.programId);

            let tx = new anchor.web3.Transaction();

            // 1. Initialize Global Config & Admin Stake (Admin Exempt from locks)
            tx.add(await program.methods.initializeGlobalConfig(500, new anchor.BN(0)).accounts({
                config: configPda, treasury: wallet.publicKey, authority: wallet.publicKey, systemProgram: SystemProgram.programId,
            }).instruction());

            tx.add(await program.methods.initializeStake().accounts({
                config: configPda, authorityStake: stakePda, authority: wallet.publicKey, systemProgram: SystemProgram.programId,
            }).instruction());

            // 2. Fetch first 3 trees for genesis planting
            const { data: trees } = await window.supabase.from('trees').select('*').limit(3);

            for (const t of trees) {
                const [fPda] = PublicKey.findProgramAddressSync([Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from(t.field_id)], program.programId);
                const [tPda] = PublicKey.findProgramAddressSync([Buffer.from("tree"), fPda.toBuffer(), Buffer.from(t.tree_id)], program.programId);

                // Add Field Init if not already there (Batching)
                tx.add(await program.methods.initField(t.field_id, new anchor.BN(5000), "", "Murizzo, Spain").accounts({
                    config: configPda, field: fPda, authority: wallet.publicKey, systemProgram: SystemProgram.programId,
                }).instruction());

                // Plant the Tree (Admin Override: ignores has_active_vote)
                tx.add(await program.methods.addTreeToField(t.tree_id, t.cultivar, t.lat, t.lng, 2026).accounts({
                    tree: tPda, field: fPda, config: configPda, authority: wallet.publicKey,
                    authorityStake: stakePda, systemProgram: SystemProgram.programId,
                }).instruction());
            }

            const signature = await program.provider.sendAndConfirm(tx);
            console.log("✅ Genesis Complete. TX:", signature);
            alert("Genesis successful! Admin UI synced.");
            this.renderFullDashboard();
        } catch (err) {
            console.error("❌ Genesis Failed:", err);
            alert(`Error: ${err.message}`);
        }
    }
};
(window as any).runGenesisSetup = async () => {
    const program = getProgram();
    const wallet = (window as any).solana;
    const { PublicKey, SystemProgram } = anchor.web3;

    try {
        console.log("🔄 Starting Intelligent Genesis & Supabase Sync...");

        // 1. Derive Base PDAs
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
        const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), wallet.publicKey.toBuffer()], program.programId);

        let transaction = new anchor.web3.Transaction();
        let needsTx = false;

        // --- STEP 1: Check DAO Config ---
        try {
            await program.account.globalConfig.fetch(configPda);
            console.log("✅ DAO already initialized. Skipping Step 1.");
        } catch (e) {
            console.log("🛠️ DAO not found. Adding InitializeGlobalConfig to TX...");
            transaction.add(
                await program.methods
                    .initializeGlobalConfig(500, new anchor.BN(0))
                    .accounts({
                        config: configPda,
                        treasury: wallet.publicKey,
                        authority: wallet.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .instruction()
            );
            needsTx = true;
        }

        // --- STEP 2: Check Admin Stake ---
        try {
            await program.account.stakeAccount.fetch(stakePda);
            console.log("✅ Admin Stake exists. Skipping Step 2.");
        } catch (e) {
            console.log("🛠️ Stake account missing. Adding InitializeStake to TX...");
            transaction.add(
                await program.methods
                    .initializeStake()
                    .accounts({
                        config: configPda,
                        authorityStake: stakePda,
                        authority: wallet.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .instruction()
            );
            needsTx = true;
        }

        // --- STEP 3: Fetch Data from Supabase ---
        console.log("📡 Pulling Blueprint from Supabase...");
        // Assuming your existing supabase client is globally available
        const { data: dbFields, error: fieldErr } = await (window as any).supabase.from('fields').select('*');
        const { data: dbTrees, error: treeErr } = await (window as any).supabase.from('trees').select('*').limit(3);

        if (fieldErr || treeErr) throw new Error("Supabase Fetch Failed");

        // --- STEP 4: Check & Plant Fields ---
        for (const f of dbFields) {
            const [fPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from(f.field_id)],
                program.programId
            );

            try {
                await program.account.field.fetch(fPda);
                console.log(`✅ Field ${f.field_id} already on-chain.`);
            } catch (e) {
                console.log(`🌱 Adding Field ${f.field_id} to TX...`);
                transaction.add(
                    await program.methods
                        .initField(f.field_id, new anchor.BN(f.area || 5000), f.metadata_url || "", f.location || "")
                        .accounts({
                            config: configPda,
                            field: fPda,
                            authority: wallet.publicKey,
                            systemProgram: SystemProgram.programId,
                        })
                        .instruction()
                );
                needsTx = true;
            }
        }

        // --- STEP 5: Plant first 3 Trees ---
        for (const t of dbTrees) {
            const [fPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from(t.field_id)],
                program.programId
            );
            const [tPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("tree"), fPda.toBuffer(), Buffer.from(t.tree_id)],
                program.programId
            );

            try {
                await program.account.tree.fetch(tPda);
                console.log(`✅ Tree ${t.tree_id} already on-chain.`);
            } catch (e) {
                console.log(`🌲 Adding Tree ${t.tree_id} to TX...`);
                transaction.add(
                    await program.methods
                        .addTreeToField(t.tree_id, t.cultivar || "Arbequina", t.lat || 0, t.lng || 0, t.year || 2024)
                        .accounts({
                            tree: tPda,
                            field: fPda,
                            config: configPda,
                            authority: wallet.publicKey,
                            authorityStake: stakePda,
                            systemProgram: SystemProgram.programId,
                        })
                        .instruction()
                );
                needsTx = true;
            }
        }

        // --- EXECUTION ---
        if (needsTx) {
            console.log("🚀 Sending consolidated transaction...");
            const tx = await program.provider.sendAndConfirm(transaction);
            console.log("✅ Done! TX:", tx);
            alert("Genesis & Sync Successful!");
        } else {
            console.log("⏸️ Everything is already perfectly in sync. No action needed.");
        }

        // Refresh UI to show the "Neat" list
        if (window.location) window.location.reload();

    } catch (err) {
        console.error("❌ Sync Failed:", err);
        alert(`Error: ${err.message}`);
    }
};
(window as any).fixEverythingAndPlant = async (fieldId: string, treeId: string) => {
    const program = getProgram();
    const wallet = (window as any).solana;
    const { PublicKey, SystemProgram } = anchor.web3;

    try {
        console.log("🛠️ Step 1: Forcing Stake Account Initialization...");

        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
        const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), wallet.publicKey.toBuffer()], program.programId);

        // Check if identity needs initialization
        try {
            await program.methods
                .initializeStake() // This is the fix for error 3003
                .accounts({
                    config: configPda,
                    authorityStake: stakePda,
                    authority: wallet.publicKey,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
            console.log("✅ Identity created successfully.");
        } catch (e: any) {
            console.log("Identity already exists or initialized.");
        }

        console.log(`🌲 Step 2: Planting ${treeId} in ${fieldId}...`);

        const [fieldPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from(fieldId)],
            program.programId
        );

        const [treePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(treeId)],
            program.programId
        );

        // Execute the plant with the now-deserializable stake account
        const tx = await program.methods
            .addTreeToField(
                treeId,
                "Arbequina",
                404140, // lat
                -37020, // long
                2024    // year
            )
            .accounts({
                tree: treePda,
                field: fieldPda,
                config: configPda,
                authority: wallet.publicKey,
                authorityStake: stakePda,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        console.log("🚀 BOOM! Tree is on-chain. TX:", tx);
        alert(`SUCCESS! Tree ${treeId} planted.`);

    } catch (err: any) {
        console.error("🏁 Final Boss Error:", err);
        alert(`Error: ${err.message}`);
    }
};
(window as any).fixMyIdentity = async () => {
    const program = getProgram();
    const wallet = (window as any).solana;
    const { PublicKey, SystemProgram } = anchor.web3;

    try {
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
        const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), wallet.publicKey.toBuffer()], program.programId);

        console.log("🛠️ Forcing Identity Initialization...");

        await program.methods
            .initializeGlobalConfig(
                500, // fee
                new anchor.BN(0) // min_stake
            )
            .accounts({
                config: configPda,
                treasury: wallet.publicKey,
                authority: wallet.publicKey,
                // Even if not in the IDL list, Anchor uses the
                // seeds to find the stakePda if the logic requires it.
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        alert("Identity Initialized! Now try planting.");
    } catch (err: any) {
        console.log("Identity status:", err.message);
        alert("Identity is already set or initialized. Proceed to planting.");
    }
};
(window as any).processDAOJoin = async () => {
    try {
        const program = (window as any).getProgram();
        const wallet = (window as any).solana;

        if (!wallet.publicKey) {
            alert("Please connect wallet first.");
            return;
        }

        // 1. THE SECURITY WALL: SIGNATURE REQUIRED
        const message = "Olive DAO Compliance [2026-02-05]: I agree to the terms of membership, acknowledge that voting locks my assets, and accept all protocol non-liabilities.";
        const encodedMessage = new TextEncoder().encode(message);

        console.log("Requesting compliance signature...");
        await wallet.signMessage(encodedMessage, "utf8");

        // 2. ON-CHAIN INITIALIZATION (Zero-Stake Join)
        // We use the first field/tree as a reference point to satisfy the program's account constraints
        const firstField = fields[0];
        const firstTree = treesMetadata[0];

        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

        const [fieldPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("field"), Buffer.from(firstField.field_name)],
            program.programId
        );

        const [treePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(firstTree.tree_id)],
            program.programId
        );

        const [stakePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("stake"), wallet.publicKey.toBuffer()],
            program.programId
        );

        const [positionPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("position"), wallet.publicKey.toBuffer(), treePda.toBuffer()],
            program.programId
        );

        console.log("Initializing Member Stake Account...");

        // Call stake_shares with 0 to create the StakeAccount PDA without spending SOL/OLV
        await program.methods.stakeShares(new anchor.BN(0))
            .accounts({
                config: configPda,
                authorityStake: stakePda,
                treePosition: positionPda,
                owner: wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .remainingAccounts([
                { pubkey: treePda, isWritable: false, isSigner: false }
            ])
            .rpc();

        // 3. UI FEEDBACK & UNLOCK
        alert("Success: You are now a verified member of Olive DAO.");

        // Dispatch event for the Ticker
        window.postMessage({ type: 'NEW_STAKE', addr: wallet.publicKey.toString().slice(0,4) }, "*");

        // Transition UI
        document.getElementById('tos-modal')?.classList.add('hidden');
        document.getElementById('main-content')?.classList.remove('opacity-20');
        (window as any).checkMembership();

    } catch (err: any) {
        console.error("Join failed", err);
        if (err.message?.includes("User rejected")) {
            alert("Signature declined. You must sign to join the DAO.");
        } else {
            alert("Join failed. Ensure Admin has initialized Field 1 and Tree 1.");
        }
    }
};

// --- GLOBAL REGISTRATION ---
(window as any).connectWallet = async () => {

    try {
        const wallet = (window as any).solana;
        if (!wallet) {
            alert("Phantom Wallet not found!");
            re
            turn;
        }
      initSecureSession();
    } catch (err: any) {
        console.error("connection Failed", err.message);
    }
};

// Also ensure syncGlobalState is registered early
(window as any).syncGlobalState = async () => {
    console.log("📊 [SYSTEM] Synchronizing Global State...");
    const sb = (window as any).sbClient;
    const fieldListContainer = document.getElementById('field-list-container');

    try {
        // 1. Fetch all fields from Supabase
        const { data: fields, error } = await sb
            .from('fields')
            .select('*');

        if (error) throw error;

        // 2. Render the Field List with Clickable Audit Buttons
        if (fieldListContainer && fields) {
            fieldListContainer.innerHTML = fields.map(f => `
                <div class="flex flex-col gap-2 p-4 border-b border-zinc-900 group">
                    <div class="flex justify-between items-center">
                        <button onclick="window.openFieldModal('${f.field_id}')"
                                class="text-white font-black hover:text-solana transition-all text-left uppercase tracking-tighter flex items-center gap-2">
                            <span class="opacity-0 group-hover:opacity-100 text-solana text-[8px]">▶</span>
                            ${f.name || f.field_id}
                        </button>

                        <div class="flex items-center gap-2">
                            <span class="text-[7px] font-mono text-zinc-600 uppercase">Status:</span>
                            <span class="text-[9px] ${f.on_chain ? 'text-solana shadow-[0_0_10px_#14f19544]' : 'text-red-500 animate-pulse'}">
                                ● ${f.on_chain ? 'LIVE' : 'OFF-CHAIN'}
                            </span>
                        </div>
                    </div>

                    <div class="flex justify-between items-center">
                        <p class="text-[9px] text-zinc-500 font-mono truncate max-w-[200px]">
                            ${f.pda_address || 'NOT_FOUND_ON_CHAIN'}
                        </p>
                        <button onclick="window.openFieldModal('${f.field_id}')"
                                class="text-[8px] border border-zinc-800 px-2 py-0.5 rounded hover:bg-zinc-800 text-zinc-400">
                            AUDIT
                        </button>
                    </div>
                </div>
            `).join('');

            console.log(`✅ [UI] Rendered ${fields.length} field entries.`);
        }

    } catch (err: any) {
        console.error("❌ SYNC_ERROR:", err.message);
    }
};
// --- 5. INITIALIZATION HANDLER ---

window.addEventListener('load', () => {
    const Btn = document.getElementById('btn-');
    if (Btn) {
        Btn.onclick = (window as any).Wallet;
        refreshAdminUI();
        renderFields(fields);
        window.loadFieldsFromChain();// <--- Add this line!

    }

});
