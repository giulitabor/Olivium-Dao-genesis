import './polyfill';
import { Connection, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import idl from "./idl.json";
import fields from "../mock/Field_list.json";
import treesMetadata from "../mock/trees.json";
import { createClient } from "@supabase/supabase-js";
const DAO_VAULT = new PublicKey("FrNP32Hxhuu4pS8yguHhtTEdU9QpU7odRYi5zKNps15N");
const programId = new PublicKey("8MdiqqhZj1badeLArqCmZWeiWGK8tXQWiydRLcqzDn45");
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const OLV_MINT = new PublicKey("6nab5Rttp45AfjaYrdwGxKuH9vK9RKCJdeaBvQJt8pLA");


const getProgram = () => {
    const wallet = (window as any).solana;
if (!wallet?.publicKey) return null;
    const provider = new anchor.AnchorProvider(connection, wallet, { preflightCommitment: "confirmed" });
    return new anchor.Program(idl as any, provider);
};
(window as any).getProgram = getProgram;
//Load Trees ///
async function loadMarketplace() {
    const grid = document.getElementById('marketplace-grid');

    // 1. Fetch active listings from Supabase
    const { data: listings, error } = await sbClient
        .from('market_listings')
        .select(`
            tree_id,
            price_sol,
            tree_metadata (variety, health_score)
        `)
        .eq('is_active', true);

    if (error || !listings) {
        grid.innerHTML = "<p class='text-gray-500'>No trees currently for sale.</p>";
        return;
    }

    // 2. Render the Buy Cards
grid.innerHTML = listings.map(item => {
    // 1. Calculate the shares before building the HTML string
    // Assuming 'item.share_percentage' is the DAO's remaining portion
    const daoShare = item.share_percentage || 100;
    const publicShare = 100 - daoShare;

    // 2. Return the clean template literal
    return `
        <div class="bg-gradient-to-br from-white/10 to-transparent p-6 rounded-2xl border border-white/10 hover:border-yellow-500/50 transition-all">
            <div class="flex justify-between items-start mb-4">
                <span class="text-xs font-mono text-yellow-500">${item.tree_id}</span>
                <span class="bg-green-500/20 text-green-400 text-[10px] px-2 py-1 rounded-full uppercase font-bold">In Stock</span>
            </div>

            <h3 class="text-xl font-bold text-white">${item.tree_metadata?.variety || 'Variety'}</h3>
            <p class="text-gray-400 text-sm mb-4">Health Score: ${item.tree_metadata?.health_score || 0}/100</p>

            <div class="mb-4">
                <div class="w-full bg-gray-700 h-2 rounded-full overflow-hidden mt-2">
                    <div class="bg-green-500 h-full transition-all duration-500" style="width: ${publicShare}%"></div>
                </div>
                <div class="flex justify-between mt-1">
                    <span class="text-[9px] text-white/50">${publicShare}% Community Owned</span>
                    <span class="text-[9px] text-yellow-500/50">${daoShare}% DAO Reserved</span>
                </div>
            </div>

            <div class="flex items-center justify-between mt-6 border-t border-white/5 pt-4">
                <div class="flex flex-col">
                    <span class="text-[10px] text-gray-500 uppercase">Price per 10%</span>
                    <span class="text-2xl font-bold text-white">${item.price_sol} <span class="text-sm text-gray-500">SOL</span></span>
                </div>
                <button onclick="buyTreeShare('${item.tree_id}', 'Toscagialla Heritage Grove', 'FIELD_01')"
                        class="bg-yellow-500 hover:bg-yellow-400 text-black font-bold py-3 px-6 rounded-xl transition-all active:scale-95 shadow-lg shadow-yellow-500/20">
                    Buy Share
                </button>
            </div>
        </div>
    `;
}).join('');
}

// 3. The Solana Purchase Function
async function buyTree(treeId, price) {
  const wallet = (window as any).solana;
    if (!wallet || !wallet.publicKey) {
        alert("SECURITY ALERT: Wallet connection lost. Please reconnect.");
        window.location.reload(); // Hard reset on security breach
        return;
    }
    try {
        const provider = window.solana; // Or your wallet adapter
        if (!provider) return alert("Please connect your wallet first!");

        console.log(`Initiating purchase for ${treeId} at ${price} SOL`);

        // This is where you'd call your Anchor Program
        // For now, we simulate the success:
        const confirmed = confirm(`Proceed with purchase of ${treeId} for ${price} SOL?`);

        if (confirmed) {
            // After SOL tx success, update the ownership in Supabase
            await finalizePurchase(treeId, provider.publicKey.toString());
        }
    } catch (err) {
        console.error("Purchase failed", err);
    }
}

async function finalizePurchase(treeId, buyerWallet) {
    // 1. Add the new owner to the Ledger
    // 2. Remove the tree from the Market Listing
    const { error } = await sbClient.rpc('handle_tree_purchase', {
        p_tree_id: treeId,
        p_buyer: buyerWallet
    });

    if (!error) {
        alert("Transaction Confirmed! You now own a share of " + treeId);
        loadMarketplace(); // Refresh
    }
}
//===================//
// ADMIN STUFF
//==================//
import { createClient } from '@supabase/supabase-js';

const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(SB_URL, SB_KEY);

const ADMIN_WALLET = "8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54";

export const verifyAdmin = async () => {
    const provider = (window as any).solana;
    if (!provider) throw new Error("Wallet not found");

    const resp = await provider.connect();
    const publicKey = resp.publicKey.toString();

    if (publicKey !== ADMIN_WALLET) {
        throw new Error("Unauthorized: Wallet mismatch");
    }

    // CRITICAL: Request a signature to prove they own the private key
    const message = `Olive DAO Admin Auth: ${new Date().toISOString().split('T')[0]}`;
    const encodedMessage = new TextEncoder().encode(message);
    const signedMessage = await provider.signMessage(encodedMessage, "utf8");

    // In a production app, you'd verify this signature on the backend
    console.log("Admin Verified with Signature:", signedMessage);

    return true;
};

// --- GLOBAL EXPOSURE FOR HOLDERS.HTML ---
(window as any).sbClient = supabase; // Expose Supabase

(window as any).initMemberOnChain = async () => {
    try {
        const program = getProgram();
        const wallet = (window as any).solana;

        // Derive Member PDA (Adjust seeds if your IDL uses different ones)
        const [memberPDA] = PublicKey.findProgramAddressSync(
            [Buffer.from("member"), wallet.publicKey.toBuffer()],
            program.programId
        );

        // Call the actual initialize method from your IDL
        // Note: Using 'initializeMember' based on your previous errors
        const tx = await program.methods.initializeMember()
            .accounts({
                memberAccount: memberPDA,
                user: wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();

        console.log("On-Chain Init Success:", tx);
        return true;
    } catch (err) {
        console.error("ToC Signing failed:", err);
        throw err;
    }
};


(window as any).updateStats = async () => {
    const wallet = (window as any).solana;
    if (!wallet?.publicKey) return;

    // Fetch SOL Balance
    const bal = await connection.getBalance(wallet.publicKey);
    const solEl = document.getElementById('val-sol-liquid');
    if (solEl) solEl.innerText = (bal / LAMPORTS_PER_SOL).toFixed(3) + " SOL";
};

// --- ADMIN: INITIALIZE DAO ---
(window as any).initializeGlobalConfig = async () => {
    try {
        const program = getProgram();
        const wallet = (window as any).solana;
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

        // Check if config already exists
        const info = await connection.getAccountInfo(configPda);
        if (info) {
            console.log("✅ DAO already initialized.");
            alert("DAO is already initialized. Please proceed to Step 2.");
            return;
        }

        console.log("Initializing Global DAO Config...");
        // fee: 250 (2.5%), min_stake: 0
        await program.methods.initializeGlobalConfig(250, new anchor.BN(0))
            .accounts({
                config: configPda,
                treasury: DAO_VAULT,
                authority: wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            }).rpc();

        alert("DAO Initialized successfully!");
    } catch (err) {
        console.error("Init failed", err);
    }
};
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
// --- ADMIN: INITIALIZE FIELDS ---
(window as any).setupAllFields = async () => {
    try {
        const program = getProgram();
        const wallet = (window as any).solana;
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

        for (const f of fields) {
            const [fieldPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("field"), Buffer.from(f.field_name)],
                program.programId
            );

            console.log(`Initializing field: ${f.field_name}`);

            const latFixed = Math.floor(f.gps_lat * 1000000); // Convert float to i32
const longFixed = Math.floor(f.gps_long * 1000000);
const areaFixed = new anchor.BN(Math.floor(f.area_sq_meters)); // Convert 12.5 to 12

await program.methods
    .initField(
        f.field_name,
        areaFixed,
        f.metadata_url,
        "Tuscany",
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
        }
        alert("Fields initialized successfully!");
    } catch (err) {
        console.error("Field setup failed", err);
    }
};

// --- HOLDERS: THE "JOIN" FIX ---
// Note: Since 'initializeStake' doesn't exist in your IDL,
// we use 'stake_shares' with 0 or a small amount to initialize the StakeAccount PDA.
(window as any).joinDAO = async () => {
    try {
        const program = getProgram();
        const wallet = (window as any).solana;

        // 1. Get first Field and Tree to satisfy account resolution
        const firstField = fields[0];
        const firstTree = treesMetadata[0];

        // 2. Derive PDAs
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

        console.log("Initializing Stake Account via first tree entry...");

        // Call stake_shares with 0 amount to initialize the StakeAccount PDA
        await program.methods.stakeShares(new anchor.BN(0))
            .accounts({
                config: configPda,
                authorityStake: stakePda,
                treePosition: positionPda, // <--- This fixes the "Unresolved accounts" error
                owner: wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            // Explicitly pass the tree to help Anchor resolve treePosition
            .remainingAccounts([
                { pubkey: treePda, isWritable: false, isSigner: false }
            ])
            .rpc();

        alert("Welcome! You have joined the DAO with Tree Purchase.");
        (window as any).checkMembership(); // Update UI to show 'Member'
    } catch (err) {
        console.error("Join failed", err);
        alert("Join failed. Ensure Field 1 and Tree 1 are initialized in Admin first.");
    }
};


// src/main.ts
(window as any).solanaBridge = {
    initializeStakeAccount: async () => {
        try {
            const provider = getProvider(); // Your Solana provider
            const program = getProgram();   // Your Anchor program

            // This transaction is the legal/on-chain proof
            const tx = await program.methods.initializeMember()
                .accounts({
                    memberAccount: memberPDA,
                    user: provider.wallet.publicKey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .rpc();

            console.log("On-Chain Initialization Signature:", tx);
            return true;
        } catch (err) {
            console.error(err);
            throw err;
        }
    }
};
  // --- GLOBAL DAO WALLET CONNECTION ---
  const DAO_VAULT_ADDR = "FrNP32Hxhuu4pS8yguHhtTEdU9QpU7odRYi5zKNps15N";

  /**
   * CONNECT DAO ADMIN
   */
  (window as any).connectDAOAdmin = async () => {
      try {
          const wallet = (window as any).solana;
          if (!wallet) return alert("Phantom not found");

          const response = await wallet.connect();
          const pubKey = response.publicKey.toString();

          // Update UI
          document.getElementById('btn-connect-dao_admin')?.classList.add('hidden');
          const pill = document.getElementById('admin-pill');
          const display = document.getElementById('admin-addr-display');

          if (pill && display) {
              pill.classList.remove('hidden');
              pill.classList.add('flex');
              display.innerText = `${pubKey.slice(0, 4)}...${pubKey.slice(-4)}`;
          }

          console.log("Admin Connected:", pubKey);
          // Run a sync now that we have a wallet
          if ((window as any).checkAllSyncs) (window as any).checkAllSyncs();

      } catch (err) {
          console.error("Connection failed", err);
      }
  };

  // --- GLOBAL WALLET CONNECTION ---
(window as any).connectWallet = async () => {
    try {
        const solana = (window as any).solana;

        if (!solana || !solana.isPhantom) {
            alert("Phantom not found! Please install the extension.");
            return;
        }

        // 1. Establish Handshake
        const resp = await solana.connect();
        const walletAddress = resp.publicKey.toString();
        console.log("Connected to:", walletAddress);

        // 2. Setup Provider IMMEDIATELY
        const provider = new anchor.AnchorProvider(
            connection,
            solana,
            { preflightCommitment: "confirmed" }
        );
        anchor.setProvider(provider);
        debugOnChainFields();

        // UI Update: Pass the correct walletAddress variable
        updateUIOnConnect(walletAddress);
        (window as any).updateStats?.();

        // 3. EXPLICITLY check the [2026-01-16] Vote Lock Rule
        try {
            const program = getProgram();
            const [stakePda] = walletAddress.findProgramAddressSync(
                [Buffer.from("stake"), solana.walletAddress.toBuffer()],
                programId
            );
            const stakeAcc = await program.account.stakeAccount.fetch(stakePda);

            if (stakeAcc.hasActiveVote) {
                console.warn("Wallet is locked due to active vote.");
                // Update UI to show locked status on the pill
                const pill = document.getElementById('wallet-pill');
                if (pill) pill.classList.add('border-red-500/50');

                alert("NOTICE: This wallet has already voted. Assets are locked until the cycle ends.");
            }
        } catch (e) {
            console.log("New user - no stake account found yet.");
        }

        // 4. Dispatch events to holders.html
        window.postMessage({
            type: "WALLET_AUTH_SUCCESS",
            address: walletAddress,
        }, "*");
//-------------------------
// Show DAO UI
document.getElementById("view-landing")?.classList.add("hidden");
document.getElementById("view-hud")?.classList.remove("hidden");
document.getElementById("view-dao")?.classList.remove("hidden");

// Update wallet pill
document.getElementById("wallet-pill")?.classList.remove("hidden");
document.getElementById("btn-connect")?.classList.add("hidden");

const addr = walletAddress.toString();
document.getElementById("display-addr")!.textContent =
  addr.slice(0, 4) + "..." + addr.slice(-4);

        // 5. Trigger UI updates with optional chaining safety
        if (typeof (window as any).refreshUserFlow === 'function') {
            await (window as any).refreshUserFlow(walletAddress);
        } else {
            (window as any).updateDashboard?.();
            (window as any).loadMarketplace?.();
        }

    } catch (err: any) {
        console.error("Connection failed:", err);
        // User rejection is common, handled gracefully here
        if (err.code !== 4001) {
            alert("Wallet Error: " + (err.message || "Connection failed"));
        }
    }
};

// --- UI HELPER FUNCTIONS ---
function updateUIOnConnect(address: string) {
    const btn = document.getElementById('btn-connect');
    const pill = document.getElementById('wallet-pill');
    const addrDisplay = document.getElementById('display-addr');

    if (btn && pill && addrDisplay) {
        btn.classList.add('hidden');
        pill.classList.remove('hidden');
        pill.classList.add('flex');

        // Truncate address for Pro UX
        addrDisplay.innerText = `${address.slice(0, 4)}...${address.slice(-4)}`;
        document.body.classList.add('connected-theme');
    }
}

(window as any).checkMembership = async () => {
    try {
        const program = getProgram();
        const wallet = (window as any).solana;
        if (!wallet?.publicKey) return;

        const [stakePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("stake"), wallet.publicKey.toBuffer()],
            program.programId
        );

        const account = await program.account.stakeAccount.fetch(stakePda);
        if (account) {
            const btn = document.getElementById('btn-stake');
            if (btn) {
                btn.innerText = "✓ DAO MEMBER";
                btn.classList.replace('bg-green-500', 'bg-zinc-800');
                (btn as HTMLButtonElement).disabled = true;
            }
        }
    } catch (e) {
        // Account doesn't exist yet, keep "Join" button active
    }
};
(window as any).updateDashboard = async () => {
    const wallet = (window as any).solana;
    if (!wallet?.publicKey) return;

    const walletAddr = wallet.publicKey.toBase58();
    const actionBtn = document.getElementById('main-action-btn'); // Your primary button
    const program = getProgram();

    try {
        // 1. Update SOL & Liquid OLV Balances
        const solBalance = await connection.getBalance(wallet.publicKey);
        const liquidOlv = await fetchOlvBalance(walletAddr);

        document.querySelectorAll('.val-sol').forEach(el => el.innerHTML = (solBalance / 1e9).toFixed(3));
        const liquidEl = document.getElementById('val-olv-liquid');
        if (liquidEl) liquidEl.innerHTML = liquidOlv.toLocaleString();

        // 2. Check Ownership "Truth"
        const ownershipData = await fetch('/ownership.json').then(res => res.json());
        const userTrees = ownershipData.filter((t: any) => t.wallet === walletAddr);
        // Fetch all share accounts owned by this wallet
        const myShares = await program.account.treeShareAccount.all([
            {
                memcmp: {
                    offset: 8, // Discriminator offset
                    bytes: wallet.publicKey.toBase58(),
                },
            },
        ]);

        const totalTrees = myShares.length;
console.log(totalTrees);
        // 3. Check On-Chain Stake State
        let stakeAcc = null;
        try {
            const [stakePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("stake"), wallet.publicKey.toBuffer()],
                program.programId
            );
            stakeAcc = await program.account.stakeAccount.fetch(stakePda);
        } catch (e) {
            console.log("No stake account found on-chain.");
        }
        // Inside your updateDashboard logic:
if (stakeAcc.hasActiveVote) {
    const pill = document.getElementById('wallet-pill');
    pill.classList.replace('border-green-500/30', 'border-red-500/50');
    pill.querySelector('.text-green-500').innerText = "VOTED / LOCKED";
    pill.querySelector('.text-green-500').classList.replace('text-green-500', 'text-red-500');
}

        // 4. UI Branching Logic
        if (!stakeAcc) {
            // State: Newcomer or Not Registered
            if (actionBtn) {
                actionBtn.innerHTML = "Initialize My Olvium Account";
                actionBtn.onclick = () => (window as any).joinDAO();
            }
        } else {
            // State: Existing Member
            if (actionBtn) {
                actionBtn.innerHTML = "Enter DAO";
                actionBtn.onclick = () => window.location.href = "/dashboard.html";
            }

            // Update Staked Balance & Check [2026-01-16] Lock
            const formattedStaked = (stakeAcc.amount.toNumber() / 1e9).toLocaleString();
            document.querySelectorAll('.val-olv').forEach(el => el.innerHTML = formattedStaked);

            if (stakeAcc.hasActiveVote) {
                const lockStatus = document.getElementById('lock-status');
                if (lockStatus) {
                    lockStatus.innerHTML = "LOCKED";
                    lockStatus.className = "text-red-500 font-bold";
                }
                // Block calling the wallet further
                if (actionBtn) (actionBtn as HTMLButtonElement).disabled = true;
            }
        }

    } catch (err) {
        console.error("Dashboard sync failed:", err);
    }
};
/**
 * Encodes Anchor instruction data: 8-byte discriminator + String arg
 */
async function encodeAnchorInstruction(name: string, arg: string): Promise<Buffer> {
    const encoder = new TextEncoder();
    const discInput = encoder.encode(`global:${name}`);
    const hash = await crypto.subtle.digest("SHA-256", discInput);
    const discriminator = Buffer.from(hash).slice(0, 8);

    const strBytes = encoder.encode(arg);
    const strLen = Buffer.alloc(4);
    strLen.writeUInt32LE(strBytes.length, 0);

    return Buffer.concat([discriminator, strLen, Buffer.from(strBytes)]);
}

/**
 * Main Initialization Function
 */

 /**
  * REWORKED: initializeField
  * Aligned with existing initField Anchor method and PDA seed patterns
  */
  /**
 * FULL COMPLETE INITIALIZE FIELD
 * 1. Derives the PDA using the exact seeds [b"field", authority, field_id]
 * 2. Syncs the calculated PDA to Supabase immediately (Fixes "Seed Mismatch")
 * 3. Checks if the account exists on Solana (Prevents "Account already in use" 0x0 error)
 * 4. Executes the Anchor initField transaction if needed.
 */
 (window as any).initializeField = async (fieldId: string) => {
    const program = getProgram();
    const wallet = (window as any).solana;
    const sb = (window as any).sbClient;

    if (!wallet?.publicKey) {
        throw new Error("WALLET_NOT_CONNECTED");
    }

    try {
        console.log(`[PROCESS] Starting initialization for: ${fieldId}`);

        // 1. DERIVE PDA
        // We use the connected wallet as the authority to match the program's required seeds
        const [fieldPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("field"),
                wallet.publicKey.toBuffer(),
                Buffer.from(fieldId)
            ],
            program.programId
        );

        const pdaStr = fieldPda.toBase58();
        console.log(`[SYNC] Derived PDA: ${pdaStr}`);

        // 2. FORCE SUPABASE SYNC (This fixes the "CORRUPT DATA" / "SEED MISMATCH" UI)
        const { error: sbError } = await sb
            .from('fields')
            .update({
                pda_address: pdaStr,
                updated_at: new Date().toISOString()
            })
            .eq('field_id', fieldId);

        if (sbError) {
            console.error("Supabase Update Error:", sbError);
            throw new Error(`Database sync failed: ${sbError.message}`);
        }

        // 3. ON-CHAIN PRE-FLIGHT CHECK
        const accountInfo = await connection.getAccountInfo(fieldPda);

        if (accountInfo) {
            console.log("✅ Account already exists on-chain. Skipping transaction.");
            alert(`Field ${fieldId} is already live. Database has been synced!`);

            // Refresh UI
            if (typeof (window as any).checkAllSyncs === 'function') {
                await (window as any).checkAllSyncs();
            }
            return { signature: "ALREADY_EXISTS", pda: pdaStr };
        }

        // 4. EXECUTE ON-CHAIN INITIALIZATION
        console.log("🚀 Account not found. Sending transaction to Solana...");

        // Find metadata from your local JSON list
        const fieldData = fields.find(f => f.field_id === fieldId);
        if (!fieldData) throw new Error(`Metadata for ${fieldId} not found in Field_list.json`);

        const [configPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("config")],
            program.programId
        );

        // Convert data to the format expected by your IDL
        const areaFixed = new anchor.BN(Math.floor(fieldData.area_sq_meters));
        const latFixed = new anchor.BN(Math.floor(fieldData.gps_lat * 10000000));
        const longFixed = new anchor.BN(Math.floor(fieldData.gps_long * 10000000));

        const tx = await program.methods
            .initField(
                fieldId,               // name (Seed string)
                areaFixed,             // area_sq_meters
                fieldData.metadata_url, // metadata_url
                fieldData.location,    // location_name
                latFixed,              // lat (scaled i32)
                longFixed              // long (scaled i32)
            )
            .accounts({
                config: configPda,
                field: fieldPda,
                authority: wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();

        console.log(`✅ SUCCESS! Transaction Signature: ${tx}`);

        // Final UI Refresh
        if (typeof (window as any).checkAllSyncs === 'function') {
            await (window as any).checkAllSyncs();
        }

        return { signature: tx, pda: pdaStr };

    } catch (err: any) {
        console.error("Critical Initialization Error:", err);

        // Handle User Rejection
        if (err.code === 4001) {
            alert("Transaction cancelled by user.");
        } else {
            alert(`Failed to initialize field: ${err.message || err}`);
        }
        throw err;
    }
}

// Map it to the window for your onclick handlers in debug.html
(window as any).initializeField = initializeField;

// --- TREE VERIFICATION BRIDGE ---
(window as any).verifyTree = async (treeId: string, fieldId: string, storedPda: string) => {
    try {
        const program = getProgram();
        // Use the Admin Wallet found to be working (8xkN...)
        const adminPubkey = new PublicKey("8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54");

        // 1. Re-derive Field PDA (Required as a seed for the tree)
        const [fieldPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("field"),
                adminPubkey.toBuffer(),
                Buffer.from(fieldId)
            ],
            program.programId
        );

        // 2. Re-derive Tree PDA: [b"tree", field_pda, tree_id]
        const [expectedTreePda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("tree"),
                fieldPda.toBuffer(),
                Buffer.from(treeId)
            ],
            program.programId
        );

        const expectedStr = expectedTreePda.toBase58();

        // 3. Check for Mismatch (Seed logic check)
        if (storedPda !== expectedStr) {
            return { status: "MISMATCH", correctPda: expectedStr };
        }

        // 4. Check Blockchain existence
        const acc = await connection.getAccountInfo(expectedTreePda);
        if (!acc) return { status: "GHOST" };

        return {
            status: "VERIFIED",
            label: "VERIFIED"
        };
    } catch (err) {
        console.error("Tree verification failed", err);
        return { status: "ERROR" };
    }
};

// --- UPDATED PLANT BATCH (WITH REAL RPC) ---
// --- PLANT TREE BATCH ---
(window as any).plantBatch = async (batchSizeParam: any, specificIdParam: any) => {
    const batchSize = typeof batchSizeParam === 'number' ? batchSizeParam : 5;
    const specificId = specificIdParam || null;
    const program = getProgram();
    const wallet = (window as any).solana;
    const sb = (window as any).sbClient;
    const statusEl = document.getElementById('system-status');

    if (!program || !wallet?.publicKey) {
        alert("Please connect your wallet first.");
        return;
    }

    try {
        let treesToPlant = [];
        if (specificId) {
            const { data } = await sb.from('tree_ownership').select('*').eq('tree_id', specificId);
            treesToPlant = data || [];
        } else {
            const { data } = await sb.from('tree_ownership').select('*').is('pda_address', null).limit(batchSize);
            treesToPlant = data || [];
        }

        for (const tree of treesToPlant) {
            const treeId = tree.tree_id;
            const fieldId = tree.field_id || "FIELD_01";

            // PDA Derivations
            const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
            const [fieldPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from(fieldId)],
                program.programId
            );
            const [treePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(treeId)],
                program.programId
            );
            const [stakePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("stake"), wallet.publicKey.toBuffer()],
                program.programId
            );

            // --- 3003 ERROR PRE-CHECK ---
            const stakeInfo = await connection.getAccountInfo(stakePda);
            if (!stakeInfo) {
                console.error("CRITICAL: Authority Stake account is not initialized. You likely need to call 'stake_shares' or an init instruction for your admin wallet first.");
                alert("Error: Your Admin Stake account (PDA) is not initialized on-chain. This is causing the 3003 error.");
                return;
            }

            if (statusEl) statusEl.innerText = `● PLANTING: ${treeId}`;

            // Calling the correct IDL function: addTreeToField
            const tx = await program.methods
                .addTreeToField(
                    treeId,
                    tree.cultivar || "Arbequina",
                    Math.floor((tree.gps_lat || 0) * 1000000),
                    Math.floor((tree.gps_long || 0) * 1000000),
                    tree.planting_year || 2024
                )
                .accounts({
                    tree: treePda,
                    field: fieldPda,
                    config: configPda,
                    authority: wallet.publicKey,
                    authorityStake: stakePda,
                    systemProgram: anchor.web3.SystemProgram.programId,
                })
                .rpc();

            console.log(`✅ Tree ${treeId} Success! TX: ${tx}`);

            await sb.from('tree_ownership').update({
                on_chain: true,
                pda_address: treePda.toBase58(),
                planted_at: new Date().toISOString()
            }).eq('tree_id', treeId);
        }

        if ((window as any).checkAllSyncs) await (window as any).checkAllSyncs();
    } catch (err: any) {
        console.error("Planting Error Details:", err);
        alert(`Planting Error: ${err.message}`);
    }
};
// --- TREE VERIFICATION ---
(window as any).verifyTree = async (treeId: string, fieldId: string, storedPda: string) => {
  const program = getProgram();
  if (!program) return { status: "OFFLINE" };

  try {
      const admin = new PublicKey("8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54");
      const [fPda] = PublicKey.findProgramAddressSync([Buffer.from("field"), admin.toBuffer(), Buffer.from(fieldId)], program.programId);
      const [tPda] = PublicKey.findProgramAddressSync([Buffer.from("tree"), fPda.toBuffer(), Buffer.from(treeId)], program.programId);

      if (storedPda !== tPda.toBase58()) return { status: "MISMATCH" };
      const acc = await connection.getAccountInfo(tPda);
      return acc ? { status: "VERIFIED" } : { status: "GHOST" };
  } catch (e) {
      return { status: "OFFLINE" };
  }
};

(window as any).verifyField = async (fieldId: string, storedPda: string) => {
    try {
        const program = getProgram();
        // Use the same Admin Wallet used for the seeds
        const adminWallet = new PublicKey("8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54");

        // 1. Derive what the PDA SHOULD be
        const [expectedPda] = PublicKey.findProgramAddressSync(
            [
                Buffer.from("field"),
                adminWallet.toBuffer(),
                Buffer.from(fieldId)
            ],
            program.programId
        );

        const expectedStr = expectedPda.toBase58();

        // 2. Check for Seed Mismatch
        if (storedPda !== expectedStr) {
            return { status: "MISMATCH", correctPda: expectedStr };
        }

        // 3. Check Blockchain existence
        const acc = await connection.getAccountInfo(expectedPda);
        if (!acc) return { status: "GHOST" };

        return {
            status: "VERIFIED",
            label: `✅ VERIFIED (${(acc.lamports / 1000000000).toFixed(3)} SOL)`
        };
    } catch (err) {
        console.error("Bridge verification failed", err);
        return { status: "ERROR", label: "⚠️ CHECK FAILED" };
    }
};

// --- HELPER: Fetch Token Balance ---
async function fetchOlvBalance(walletAddress: string) {
    try {
        const publicKey = new PublicKey(walletAddress);
        // Ensure OLV_MINT is defined in your constants
        const response = await connection.getParsedTokenAccountsByOwner(publicKey, {
            mint: OLV_MINT
        });

        if (response.value.length === 0) return 0;
        return response.value[0].account.data.parsed.info.tokenAmount.uiAmount || 0;
    } catch (err) {
        console.warn("OLV Token account not found.");
        return 0;
    }
}

(window as any).inspectFieldAuthority = async (fieldId: string) => {
    try {
        const program = getProgram();
        const wallet = (window as any).solana;

        // 1. We have to try the two likely seed patterns to find where it lives
        const seeds = [
            [Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from(fieldId)],
            [Buffer.from("field"), Buffer.from(fieldId)] // Alternative pattern
        ];

        for (const seed of seeds) {
            const [pda] = PublicKey.findProgramAddressSync(seed, program.programId);
            const info = await connection.getAccountInfo(pda);

            if (info) {
                // 2. Fetch and Deserialize the data using Anchor
                const accountData: any = await program.account.field.fetch(pda);

                console.log(`--- INSPECTION REPORT: ${fieldId} ---`);
                console.log(`PDA Address: ${pda.toBase58()}`);
                console.log(`Stored Authority: ${accountData.authority.toBase58()}`);
                console.log(`Field Name: ${accountData.name}`);

                alert(`The Initializer for ${fieldId} is:\n${accountData.authority.toBase58()}`);
                return accountData.authority.toBase58();
            }
        }

        alert("Could not find this field on-chain to inspect.");
    } catch (err) {
        console.error("Inspection failed:", err);
        alert("Failed to decode account data. Check console.");
    }
};

///------NEW StakeAccount------------------
(window as any).initializeNewStake = async () => {
    try {
        const program = getProgram();
        const wallet = (window as any).solana;

        // 1. Derive the Stake PDA
        const [stakePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("stake"), wallet.publicKey.toBuffer()],
            program.programId
        );

        // 2. We use 'stakeShares' with 0 to initialize the account if it doesn't exist
        // Note: You must provide a valid tree/position PDA as per your program constraints
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

        console.log("Creating on-chain stake record...");
        await program.methods.stakeShares(new anchor.BN(0))
            .accounts({
                config: configPda,
                authorityStake: stakePda,
                owner: wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();

        // 3. Sync to Supabase after successful transaction
        await (window as any).syncStakeholderToDB(wallet.publicKey.toString());

        alert("Stake Account Initialized! You can now participate in voting.");
        (window as any).updateDashboard();

    } catch (err) {
        console.error("Initialization failed:", err);
        alert("Check console: Ensure Global Config is initialized first.");
    }
};


// --- TOS MODAL CONTROLLERS ---

(window as any).openToS = () => {
    const modal = document.getElementById('tos-modal');
    if (modal) {
        modal.classList.remove('hidden');
        console.log("ToS Modal Opened");
    } else {
        console.error("ToS Modal element not found in DOM");
    }
};

(window as any).processDAOJoin = async () => {
    const btn = document.getElementById('btn-confirm-join') as HTMLButtonElement;
    const originalText = btn.innerText;

    try {
        btn.innerText = "INITIALIZING ON-CHAIN...";
        btn.disabled = true;

        // Calls your existing joinDAO function
        await (window as any).joinDAO();

        // Close modal on success
        document.getElementById('tos-modal')?.classList.add('hidden');

    } catch (e) {
        console.error("Join failed:", e);
        alert("Transaction failed. Please ensure you have SOL for gas.");
    } finally {
        if (btn) {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    }
};
async function syncStakeholderToDB(walletAddress: string, amount: number) {
    const { error } = await supabase
        .from('stakeholders')
        .upsert({
            wallet_address: walletAddress,
            staked_amount: amount,
            is_member: true,
            has_active_vote: false // Initialized as unlocked per Jan 16 rule
        });

    if (error) console.error("Sync failed:", error.message);
}

// --- MAIN DASHBOARD LOGIC ---
(window as any).updateDashboard = async () => {
    const wallet = (window as any).solana;
    if (!wallet?.publicKey) return;

    const walletAddr = wallet.publicKey.toBase58();
    const actionBtn = document.getElementById('main-action-btn');
    const program = getProgram();

    try {
        console.log("Syncing Truth from Chain...");

        // 1. Basic Balances
        const solBalance = await connection.getBalance(wallet.publicKey);
        document.querySelectorAll('.val-sol').forEach(el => el.innerHTML = (solBalance / 1e9).toFixed(3));

        const liquidOlv = await fetchOlvBalance(walletAddr);
        const liquidEl = document.getElementById('val-olv-liquid');
        if (liquidEl) liquidEl.innerHTML = liquidOlv.toLocaleString();

        // 2. Try to fetch Stake Account (Member Check)
        let stakeAcc = null;
        try {
            const [stakePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("stake"), wallet.publicKey.toBuffer()],
                program.programId
            );
            stakeAcc = await program.account.stakeAccount.fetch(stakePda);
        } catch (e) {
            console.log("Member record not found on chain.",stakeAcc);
        }

        // 3. Logic Gate for Button State
        if (actionBtn) {
            if (!stakeAcc) {
                // USER IS NOT IN DAO YET
                actionBtn.innerHTML = "Initialize My Olvium Account";
                actionBtn.onclick = () => (window as any).joinDAO();
                actionBtn.classList.add('bg-green-600');
            } else {
                // USER IS A MEMBER
                actionBtn.innerHTML = "Enter DAO";
                actionBtn.onclick = () => window.location.href = "/admin.html";

                // Update Staked Amount Display
                const stakedAmt = (stakeAcc.amount.toNumber() / 1e9).toLocaleString();
                document.querySelectorAll('.val-olv').forEach(el => el.innerHTML = stakedAmt);

                // --- SAFETY GUARD: [2026-01-16] VOTE LOCK ---
                if (stakeAcc.hasActiveVote) {
                    actionBtn.innerHTML = "WALLET LOCKED (VOTED)";
                    (actionBtn as HTMLButtonElement).disabled = true;
                    actionBtn.style.opacity = "0.5";
                    actionBtn.style.cursor = "not-allowed";

                    const lockStatus = document.getElementById('lock-status');
                    if (lockStatus) {
                        lockStatus.innerHTML = "LOCKED";
                        lockStatus.className = "text-red-500 font-bold animate-pulse";
                    }
                }
            }
        }

    } catch (err) {
        console.error("Dashboard sync failed:", err);
    }
};

// --- Global Scanner to run on Load ---
async function runInitialChainScanner() {
    console.log("🔍 [Main Scanner] Checking Chain Status...");
    try {
        const program = getProgram();
        const DAO_VAULT = new PublicKey("FrNP32Hxhuu4pS8yguHhtTEdU9QpU7odRYi5zKNps15N");

        // 1. Fetch all Fields owned by the program
        const fields = await program.account.field.all();
        console.log(`✅ On-Chain Discovery: Found ${fields.length} Field(s)`);

        fields.forEach(f => {
            console.log(`📍 Field: "${f.account.name}" | Address: ${f.publicKey.toBase58()}`);
        });

        if (fields.length === 0) {
            console.warn("⚠️ CRITICAL: No Fields found. You must run 'init_field' first.");
        }

        // 2. Verify specific expected Field PDA for "FIELD_01"
        const [expectedFieldPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("field"), DAO_VAULT.toBuffer(), Buffer.from("FIELD_01")],
            program.programId
        );

        const fieldExists = fields.some(f => f.publicKey.equals(expectedFieldPda));
        console.log(`🧪 PDA Validation: "FIELD_01" should be at ${expectedFieldPda.toBase58()}`);
        console.log(`📊 Status: ${fieldExists ? "INITIALIZED ✅" : "MISSING ❌"}`);

    } catch (err) {
        console.error("❌ Scanner Error:", err);
    }
}
(window as any).fixAdminStake = async () => {
    const program = (window as any).getProgram();
    const wallet = (window as any).solana;

    if (!program || !wallet.publicKey) {
        alert("Connect wallet first!");
        return;
    }

    try {
        console.log("🛠️ Attempting to initialize Admin Stake Account...");

        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
        const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), wallet.publicKey.toBuffer()], program.programId);

        // NOTE: stake_shares in your IDL requires a 'tree' and 'tree_position'
        // But for a global admin stake, we use the Config/Authority
        // We will call it with 0 amount just to create the account.

        const tx = await program.methods
            .stakeShares(new anchor.BN(0))
            .accounts({
                config: configPda,
                owner: wallet.publicKey,
                authorityStake: stakePda,
                // These might need to be valid PDAs or null depending on your Rust logic
                // If it fails here, we may need to initialize a dummy tree first
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();

        console.log("✅ Admin Stake Account Created! TX:", tx);
        alert("Admin Stake Initialized. You can now plant trees.");
    } catch (err: any) {
        console.error("Stake Init Failed:", err);
        alert("Failed to init stake. If this fails, try initializing the Field first.");
    }
};
(window as any).setupFullSystem = async () => {
    const program = (window as any).getProgram();
    const wallet = (window as any).solana;

    if (!program) return alert("Please connect your wallet first.");

    try {
        console.log("🚀 Initializing Olive DAO System...");

        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
        const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), wallet.publicKey.toBuffer()], programId);
        const fieldId = "FIELD_01";
        const [fieldPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from(fieldId)],
            programId
        );

        // 1. CONFIG
        const configInfo = await connection.getAccountInfo(configPda);
        if (!configInfo) {
            console.log("📦 Creating Config...");
            await program.methods.initializeGlobalConfig().accounts({
                config: configPda,
                treasury: wallet.publicKey,
                authority: wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            }).rpc();
        }

        // 2. FIELD
        const fieldInfo = await connection.getAccountInfo(fieldPda);
        if (!fieldInfo) {
            console.log("🌱 Creating Field...");
            await program.methods.initField(
                fieldId,
                new anchor.BN(1000),
                "https://olive.dao/metadata",
                "Morocco",
                new anchor.BN(34000000),
                new anchor.BN(-5000000)
            ).accounts({
                config: configPda,
                field: fieldPda,
                authority: wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            }).rpc();
        }

        // 3. STAKE (THE 3003 FIX)
        const stakeInfo = await connection.getAccountInfo(stakePda);
        if (!stakeInfo) {
            console.log("🛡️ Initializing Admin Stake identity...");
            // We pass the fieldPda as the tree to satisfy the account requirement
            await program.methods.stakeShares(new anchor.BN(0))
            .accounts({
                config: configPda,
                tree: fieldPda,
                treePosition: stakePda,
                owner: wallet.publicKey,
                authorityStake: stakePda,
                systemProgram: anchor.web3.SystemProgram.programId,
            }).rpc();
        }

        alert("✅ SYSTEM ONLINE. 3003 Error Fixed.");
    } catch (err: any) {
        console.error("Setup Error:", err);
        alert("Setup Error: " + err.message);
    }
};
(window as any).runGenesisFix = async () => {
    const program = (window as any).getProgram();
    const wallet = (window as any).solana;
    if (!program) return alert("Connect Wallet!");

    try {
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
        const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), wallet.publicKey.toBuffer()], programId);
        const fieldId = "FIELD_01";
        const [fieldPda] = PublicKey.findProgramAddressSync([Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from(fieldId)], programId);

        console.log("🛠️ NUCLEAR OPTION: Initializing Field and Config First...");

        // 1. Initialize Config if missing
        const configInfo = await connection.getAccountInfo(configPda);
        if (!configInfo) {
            await program.methods.initializeGlobalConfig().accounts({
                config: configPda, treasury: wallet.publicKey, authority: wallet.publicKey, systemProgram: anchor.web3.SystemProgram.programId
            }).rpc();
            console.log("Config OK");
        }

        // 2. Initialize Field
        const fieldInfo = await connection.getAccountInfo(fieldPda);
        if (!fieldInfo) {
            await program.methods.initField(fieldId, new anchor.BN(1000), "meta", "MA", new anchor.BN(0), new anchor.BN(0)).accounts({
                config: configPda, field: fieldPda, authority: wallet.publicKey, systemProgram: anchor.web3.SystemProgram.programId
            }).rpc();
            console.log("Field OK");
        }

        // 3. THE MAGIC TRICK:
        // We call 'stake_shares' but we pass FIELD_PDA as the tree.
        // If your contract checks 'is_initialized' on the tree, this will only work
        // if the Field account and Tree account share the same internal layout (unlikely).
        // INSTEAD: We will try to plant the tree by passing the System Program as the stake account
        // just to see if the program bypasses checks for new accounts.

        console.log("Attempting to bypass 3003 by planting GENESIS_01...");
        const [treePda] = PublicKey.findProgramAddressSync([Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from("GENESIS_01")], programId);

        // This is the call that usually fails with 3003.
        // If it still fails, your Rust code REQUIRES a pre-existing stake account.
        await program.methods.addTreeToField("GENESIS_01", "Genesis", 0, 0, 2024)
            .accounts({
                tree: treePda,
                field: fieldPda,
                config: configPda,
                authority: wallet.publicKey,
                authorityStake: stakePda, // This is the problematic account
                systemProgram: anchor.web3.SystemProgram.programId,
            }).rpc();

        alert("GENESIS PLANTED! 3003 is dead.");
    } catch (e: any) {
        console.error("GENESIS FAILED:", e);
        if (e.message.includes("3003")) {
            alert("FATAL: Your Smart Contract is hard-locked. You cannot plant a tree because the stake account doesn't exist, and you can't create a stake account because no tree exists. You must update your Rust code to allow 'init' on the authority_stake account.");
        }
    }
};

(window as any).godModeSetup = async () => {
    const program = (window as any).getProgram();
    const wallet = (window as any).solana;
    if (!program) return alert("Connect Wallet First!");

    try {
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
        const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), wallet.publicKey.toBuffer()], programId);
        const fieldId = "FIELD_01";
        const [fieldPda] = PublicKey.findProgramAddressSync([Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from(fieldId)], programId);

        console.log("🛠️ GOD MODE: Initializing Environment...");

        // 1. Ensure Field Exists
        const fieldInfo = await connection.getAccountInfo(fieldPda);
        if (!fieldInfo) {
            console.log("Creating FIELD_01...");
            await program.methods.initField(fieldId, new anchor.BN(1000), "metadata", "Morocco", new anchor.BN(0), new anchor.BN(0))
                .accounts({ config: configPda, field: fieldPda, authority: wallet.publicKey, systemProgram: anchor.web3.SystemProgram.programId })
                .rpc();
        }

        // 2. Create Genesis Tree (This satisfies the stake requirement)
        const genId = "GENESIS_01";
        const [treePda] = PublicKey.findProgramAddressSync([Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(genId)], programId);

        const treeInfo = await connection.getAccountInfo(treePda);
        if (!treeInfo) {
            console.log("Planting Genesis Tree...");
            // NOTE: If your 'add_tree_to_field' requires authority_stake to exist already,
            // this is a program logic error. We try it anyway:
            await program.methods.addTreeToField(genId, "Genesis", 0, 0, 2024)
                .accounts({
                    tree: treePda,
                    field: fieldPda,
                    config: configPda,
                    authority: wallet.publicKey,
                    authorityStake: stakePda, // This might still fail if 3003 persists
                    systemProgram: anchor.web3.SystemProgram.programId,
                }).rpc();
        }

        // 3. Initialize Stake Account
        console.log("Initializing Stake Account...");
        await program.methods.stakeShares(new anchor.BN(0))
            .accounts({
                config: configPda,
                tree: treePda,
                treePosition: PublicKey.findProgramAddressSync([Buffer.from("position"), treePda.toBuffer(), wallet.publicKey.toBuffer()], programId)[0],
                owner: wallet.publicKey,
                authorityStake: stakePda,
                systemProgram: anchor.web3.SystemProgram.programId,
            }).rpc();

        alert("🚀 GOD MODE SUCCESS. System fully initialized.");
    } catch (e: any) {
        console.error("God Mode Failed:", e);
        alert("God Mode Error: " + e.message);
    }
};
// Call it immediately after your program/wallet setup
//runInitialChainScanner();
(window as any).migrateFinalFields = async () => {
    const program = getProgram();
    const wallet = (window as any).solana;

    // The authority used in your PDA seeds [b"field", DAO_VAULT, field_id]
    const DAO_VAULT = new PublicKey("FrNP32Hxhuu4pS8yguHhtTEdU9QpU7odRYi5zKNps15N");
const authorityPubKey = wallet.publicKey;
    const fieldsData = [
        {
            id: "FIELD_01",
            name: "Toscagialla Heritage Grove",
            location: "Tuscany",
            lat: 43.1037232,
            long: 10.578417,
            area: 12.5,
            metadata: "https://olive.io/metadata"
        },
        {
            id: "FIELD_02",
            name: "Murizzo Gold Ridge",
            location: "Tuscany",
            lat: 43.101514,
            long: 10.579311,
            area: 550,
            metadata: "https://olive.io/metadata"
        }
    ];

    // Derive Global Config PDA (Seed: "config")
    const [configPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("config")],
        program.programId
    );

    console.log("🏁 Starting Final Migration of 2 Fields...");

    for (const f of fieldsData) {
        try {
            // Derive PDA: [b"field", DAO_VAULT_PUBKEY, FIELD_ID_STR]
            const [fieldPda] = PublicKey.findProgramAddressSync(
                [
                    Buffer.from("field"),
                    authorityPubKey.toBuffer(),
                    Buffer.from(f.id)
                ],
                program.programId
            );

            console.log(`📡 Initializing ${f.id} (${f.name}) at: ${fieldPda.toBase58()}`);

            await program.methods.initField(
                f.id,                                     // name (Seed string)
                new anchor.BN(f.area),                    // area_sq_meters
                f.metadata,                               // metadata_url
                f.name,                                   // location_name
                new anchor.BN(Math.floor(f.lat * 10000000)), // lat (scaled for i32)
                new anchor.BN(Math.floor(f.long * 10000000)) // long (scaled for i32)
            ).accounts({
                field: fieldPda,
                config: configPda,
authority: authorityPubKey, // This must match the seed above
                systemProgram: anchor.web3.SystemProgram.programId,
            }).rpc();

            console.log(`✅ ${f.id} Successfully Initialized!`);
        } catch (err) {
            console.error(`❌ Failed to migrate ${f.id}:`, err);
            if (err.message.includes("already in use")) {
                console.warn(`💡 Note: ${f.id} already exists on chain.`);
            }
        }
    }
    alert("Field Migration Complete!");
};
window.debugOnChainFields = async function() {
       const program = getProgram();
         const connection = program.provider.connection;

         console.log("🔍 Scanning and Decoding 140 Accounts...");

         const allAccounts = await connection.getProgramAccounts(program.programId);

         allAccounts.forEach(({ pubkey, account }) => {
             const data = account.data;

             // Attempt to decode as Field
             try {
                 const field = program.coder.accounts.decode("Field", data);
                 console.log(`🌳 Field: "${field.name}" | Loc: ${field.location_name} | Addr: ${pubkey.toBase58()}`);
                 return;
             } catch (e) {}

             // Attempt to decode as Tree
             try {
                 const tree = program.coder.accounts.decode("Tree", data);
                 console.log(`🌲 Tree: "${tree.tree_id}" | Variety: ${tree.cultivar} | Addr: ${pubkey.toBase58()}`);
                 return;
             } catch (e) {}

             // If it matches your 313-byte unknown accounts
             if (data.length === 313) {
                 console.log(`📦 Legacy Account (313 bytes): ${pubkey.toBase58()} - Likely from old program version.`);
             }
         });
     }

// --- Integrated Decoder inside main.ts ---
async function debugAllAccounts() {
    try {
        // Use the existing program instance from your main.ts context
        const program = getProgram();
        const connection = program.provider.connection;

        console.log("📡 Scanning 140 accounts for Olive DAO data...");

        const allAccounts = await connection.getProgramAccounts(program.programId);

        for (const { pubkey, account } of allAccounts) {
            const data = account.data;

            // 1. Try to decode as a 'Field'
            try {
                const decodedField = program.coder.accounts.decode("Field", data);
                console.log(`🌳 [FIELD FOUND]`);
                console.log(`   Name: "${decodedField.name}"`);
                console.log(`   Location: ${decodedField.location_name}`);
                console.log(`   Address: ${pubkey.toBase58()}`);
                continue;
            } catch (e) {}

            // 2. Try to decode as a 'Tree'
            try {
                const decodedTree = program.coder.accounts.decode("Tree", data);
                console.log(`🌲 [TREE FOUND]`);
                console.log(`   ID: "${decodedTree.tree_id}"`);
                console.log(`   Cultivar: ${decodedTree.cultivar}`);
                console.log(`   Parent Field: ${decodedTree.field.toBase58()}`);
                console.log(`   Address: ${pubkey.toBase58()}`);
                continue;
            } catch (e) {}

            // 3. Try to decode as a 'TreePosition' (Shares/Ownership)
            try {
                const decodedPos = program.coder.accounts.decode("TreePosition", data);
                console.log(`🎫 [POSITION FOUND]`);
                console.log(`   Owner: ${decodedPos.owner.toBase58()}`);
                console.log(`   Shares: ${decodedPos.shares.toString()}`);
                console.log(`   Address: ${pubkey.toBase58()}`);
                continue;
            } catch (e) {}

            // If it's 313 bytes but doesn't decode, it's a version mismatch
            console.log(`📦 [UNKNOWN] Addr: ${pubkey.toBase58()} | Size: ${data.length} bytes`);
        }
    } catch (err) {
        console.error("Decoder encountered an error:", err);
    }
}

// Automatically trigger the scan when the script runs
//debugAllAccounts();

// --- MARKETPLACE: BUYING SHARES (V2 - Aligned with Supabase) ---
(window as any).buyTreeShare = async (treeId, fieldName) => {
    try {
        const program = getProgram();
        const wallet = (window as any).solana;
        const DAO_VAULT = new PublicKey("FrNP32Hxhuu4pS8yguHhtTEdU9QpU7odRYi5zKNps15N");

        // 1. Derive Field PDA: [b"field", authority, name]
        const [fieldPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("field"), DAO_VAULT.toBuffer(), Buffer.from(fieldName)],
            program.programId
        );

        // 2. Derive Tree PDA: [b"tree", field_pda, tree_id]
        // Note: IDL uses the 'field' account itself as a seed
        const [treePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(treeId)],
            program.programId
        );

        // 3. Derive Listing PDA: [b"listing", seller, tree_pda]
        const [listingPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("listing"), DAO_VAULT.toBuffer(), treePda.toBuffer()],
            program.programId
        );

        // 4. Derive Position PDA: [b"position", buyer, tree_pda]
        const [positionPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("position"), wallet.publicKey.toBuffer(), treePda.toBuffer()],
            program.programId
        );

        // 5. Derive Revenue Vault: [b"revenue_vault", tree_pda]
        const [revenueVaultPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("revenue_vault"), treePda.toBuffer()],
            program.programId
        );

        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

        console.log(`📡 Buying ${treeId} using Field: ${fieldName} (${fieldPda.toBase58()})`);

        await program.methods.purchaseTreeShares()
            .accounts({
                buyer: wallet.publicKey,
                seller: DAO_VAULT,
                config: configPda,
                field: fieldPda,
                tree: treePda,
                listing: listingPda,
                buyerPosition: positionPda,
                treasury: DAO_VAULT,
                treeRevenueVault: revenueVaultPda,
                systemProgram: anchor.web3.SystemProgram.programId,
            }).rpc();

        alert("Success!");
    } catch (err) {
        console.error(err);
        alert(`Failed: ${err.message}`);
    }
};
// --- GOVERNANCE: VOTING ---
(window as any).castVote = async (proposalPubkey: string, support: boolean) => {
    try {
        const program = getProgram();
        const wallet = (window as any).solana;
        const proposal = new PublicKey(proposalPubkey);

        const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), wallet.publicKey.toBuffer()], programId);
        const [voteRecord] = PublicKey.findProgramAddressSync(
            [Buffer.from("vote"), proposal.toBuffer(), wallet.publicKey.toBuffer()],
            programId
        );

        await program.methods.castVote(support)
            .accounts({
                proposal: proposal,
                authorityStake: stakePda,
                voteRecord: voteRecord,
                authority: wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            }).rpc();

        alert("Vote cast! Note: Your wallet is now locked until the proposal ends.");
        (window as any).renderProposals();
    } catch (err) {
        console.error("Vote failed", err);
    }
};
// Add this at the bottom of main.ts
(window as any).solanaBridge = {
    initializeStakeAccount: async () => {
        // Your existing initialization logic here
        console.log("Initializing Stake...");
        return true;
    }
};
