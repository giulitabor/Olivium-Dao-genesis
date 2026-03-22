import './polyfill';

import { Buffer } from "buffer";

import { connectWallet, program, connection } from "./connection";
import { PublicKey } from "@solana/web3.js";
import * as fetchers from "./fetchers";
import { state } from "./state";
import { getConfigPda, getFieldPda, getTreePda } from "./pda";
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { createClient } from "@supabase/supabase-js";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";

const OLV_MINT = new PublicKey("DYmefEbHQXyQfGQDCKQfVwuR4ZvjXSkVv3N76NEJHaKa");

const provider = new anchor.AnchorProvider(connection, window.solana, { commitment: "confirmed" });
const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
(window as any).showOracleStats = async () => {
    const [envPda] = PublicKey.findProgramAddressSync([Buffer.from("env_data")], program.programId);

    try {
        const data = await program.account.environmentData.fetch(envPda);
        const container = document.getElementById("oracle-display");
        if (container) {
            container.innerHTML = `
                <div class="card">
                    <h4>Sensor Oracle Status</h4>
                    <p>CO2: ${data.co2Level} ppm</p>
                    <p>Temp: ${data.temperature}°C</p>
                    <p>Last Update: ${new Date(data.lastUpdated.toNumber() * 1000).toLocaleTimeString()}</p>
                </div>
            `;
        }
    } catch (e) {
        console.error("Could not fetch Oracle data");
    }
};
export async function runRevenueEpoch() {
    if (!program?.provider?.publicKey) {
        alert("Connect wallet first");
        return;
    }

    const authority = program.provider.publicKey;
    const tree = new PublicKey(TREE_PUBKEY);
    const field = new PublicKey(FIELD_PUBKEY);

    try {
        console.log("🚀 STARTING REVENUE EPOCH FLOW");

        // =========================
        // 1️⃣ FETCH TREE (for epoch id)
        // =========================
        const treeAccount = await program.account.tree.fetch(tree);
        const nextEpochId = treeAccount.lastEpochId + 1;

        console.log("Next Epoch ID:", nextEpochId);

        // =========================
        // 2️⃣ DERIVE PDAs
        // =========================

        const [configPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("config")],
            program.programId
        );

        const [revenueVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("revenue_vault"), tree.toBuffer()],
            program.programId
        );

        const epochIdBuffer = new anchor.BN(nextEpochId).toArrayLike(Buffer, "le", 8);

        const [revenueEpoch] = PublicKey.findProgramAddressSync(
            [Buffer.from("revenue_epoch"), tree.toBuffer(), epochIdBuffer],
            program.programId
        );

        const [escrowMeta] = PublicKey.findProgramAddressSync(
            [Buffer.from("escrow_meta"), revenueEpoch.toBuffer()],
            program.programId
        );

        const [escrowVault] = PublicKey.findProgramAddressSync(
            [Buffer.from("escrow_vault"), tree.toBuffer(), epochIdBuffer],
            program.programId
        );

        const [epochEscrow] = PublicKey.findProgramAddressSync(
            [Buffer.from("escrow"), tree.toBuffer(), epochIdBuffer],
            program.programId
        );

        console.log("PDAs ready");

        // =========================
        // 3️⃣ CREATE REVENUE EPOCH
        // =========================
        console.log("🌱 Creating Revenue Epoch...");

        await program.methods
            .createRevenueEpoch(new anchor.BN(nextEpochId))
            .accounts({
                config: configPda,
                field: field,
                tree: tree,
                revenueVault: revenueVault,
                revenueEpoch: revenueEpoch,
                escrowMeta: escrowMeta,
                escrowVault: escrowVault,
                authority: authority,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        console.log("✅ Epoch Created");

        // =========================
        // 4️⃣ REPORT HARVEST
        // =========================

        // 👉 You can change these dynamically
        const carbonRevenue = 100 * 1e9; // 100 SOL example
        const oilRevenue = 50 * 1e9;     // 50 SOL example

        const totalRevenue = carbonRevenue + oilRevenue;

        console.log("🌾 Reporting Harvest:", totalRevenue);

        const [envDataPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("env")],
            program.programId
        );

        await program.methods
            .reportHarvest(new anchor.BN(totalRevenue))
            .accounts({
                authority: authority,
                envData: envDataPda,
                config: configPda,
                tree: tree,
                field: field,
                treeRevenueVault: revenueVault,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        console.log("✅ Harvest Reported");

        // =========================
        // 5️⃣ FINALIZE EPOCH
        // =========================
        console.log("🏁 Finalizing Epoch...");

        const configAccount = await program.account.globalConfig.fetch(configPda);

        await program.methods
            .finalizeEpoch()
            .accounts({
                authority: authority,
                config: configPda,
                revenueEpoch: revenueEpoch,
                field: field,
                tree: tree,
                epochEscrow: epochEscrow,
                treasury: configAccount.treasury,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        console.log("🎉 EPOCH FINALIZED SUCCESSFULLY");

        alert("Revenue Epoch Completed 🚀");

    } catch (err: any) {
        console.error("❌ FULL ERROR:", err);
        alert("Error: " + (err.message || err));
    }
}
(window as any).adminWipeAllPositions = async () => {
    const [configPda] = getConfigPda();
    const adminWallet = program.provider.publicKey;

    console.log("Starting administrative chain wipe...");

    try {
        // 1. Fetch all positions from the program
        const allPositions = await program.account.treePosition.all();
        console.log(`Found ${allPositions.length} positions to close.`);

        // 2. Iterate through and close
        for (const pos of allPositions) {
            try {
                console.log(`Closing PDA: ${pos.publicKey.toBase58()} | Owner: ${pos.account.owner.toBase58()}`);

                await program.methods
                    .closePosition()
                    .accounts({
                        treePosition: pos.publicKey,
                        config: configPda,
                        admin: adminWallet,
                        owner: pos.account.owner, // Rent goes back here
                    })
                    .rpc();

                console.log("Successfully wiped.");
            } catch (err) {
                console.error(`Failed to wipe ${pos.publicKey.toBase58()}:`, err);
            }
        }

        alert("Chain wipe complete!");
        if ((window as any).renderPositionsTable) {
            await (window as any).renderPositionsTable();
        }
    } catch (err: any) {
        console.error("Wipe failed:", err);
        alert("Wipe failed: " + err.message);
    }
};
(window as any).adminUnblockEveryone = async () => {
    const [configPda] = getConfigPda();
    const adminWallet = program.provider.publicKey;
    const allPositions = await program.account.treePosition.all();

    for (const pos of allPositions) {
        console.log(`Unblocking PDA: ${pos.publicKey.toBase58()}`);
        await program.methods
            .forceResetTimestamp()
            .accounts({
                config: configPda,
                treePosition: pos.publicKey,
                admin: adminWallet,
            })
            .rpc();
    }
    alert("Everyone has been unblocked!");
};

// 1. Define the handler OUTSIDE the main function
const setupAdminTableEvents = () => {
    const tbody = document.getElementById("stakingTableBody");
    if (!tbody) return;

    tbody.onclick = (event) => {
        const target = (event.target as HTMLElement).closest("tr");
        if (target) {
            const treeId = target.getAttribute("data-tree-id");
            const input = document.getElementById("modalTreePdaStake") as HTMLInputElement;

            if (input && treeId) {
                input.value = treeId;
                console.log("Modal successfully synced to:", treeId);

                target.style.backgroundColor = "#e0ffe0";
                setTimeout(() => target.style.backgroundColor = "", 500);
            }
        }
    };
};

// 2. Call this once when your app initializes
setupAdminTableEvents();

// Add this to admin_new.ts
(window as any).runEnvSetup = async () => {
      const [envPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("env_data")],
        program.programId
    );

    // Assuming you have an Oracle Authority public key
    const oracleAuthority = program.provider.publicKey;

            if (!oracleAuthority) {
                throw new Error("Wallet not connected or provider.publicKey is null");
            }

            console.log("Initializing Env with Oracle:", oracleAuthority.toBase58());
    await program.methods
        .initializeEnv()
        .accounts({
            envData: envPda,
            admin: program.provider.publicKey,
          oracleAuthority: oracleAuthority,
        systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    console.log("Environment initialized at:", envPda.toBase58());
}

(window as any).showAdminStakes = async () => {
    console.log("--- Admin: Fetching All Stake Positions ---");
    try {
        const [allPositions, allTrees, config] = await Promise.all([
            program.account.treePosition.all(),
            program.account.tree.all(),
            program.account.globalConfig.all() // Fetch config to get minStakeDuration
        ]);

        const minDuration = config[0].account.minStakeDuration.toNumber();
        const now = Math.floor(Date.now() / 1000);

        const report = allPositions
            .filter(p => p.account.lockedShares.toNumber() > 0)
            .map(p => {
                const treeMatch = allTrees.find(t => t.publicKey.equals(p.account.tree));
                const lastStake = p.account.lastStakeTs.toNumber();
                const timeLeft = (lastStake + minDuration) - now;

                return {
                    Owner: p.account.owner.toBase58(),
                    TreeID: treeMatch ? treeMatch.account.treeId : "Unknown",
                    LockedShares: p.account.lockedShares.toNumber(),
                    TimeLeft: timeLeft > 0 ? `${Math.ceil(timeLeft / 60)}m` : "Unlocked"
                };
            });

        const tbody = document.getElementById("stakingTableBody");
        if (tbody) {
            tbody.innerHTML = "";
            report.forEach((item) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td style="font-family: monospace;">${item.Owner.slice(0, 6)}...</td>
                    <td>${item.TreeID}</td>
                    <td>${item.LockedShares}</td>
                    <td style="color: ${item.TimeLeft === 'Unlocked' ? '#74c69d' : '#e76f51'}">${item.TimeLeft}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (err) {
        console.error("ADMIN ERROR:", err);
    }
};
(window as any).renderOlvSummary = async () => {
    console.log("--- Admin: Refreshing Global OLV Stake Summary ---");

    try {
        // 1. Fetch only StakeAccount records
        const allStakes = await program.account.stakeAccount.all();
        const summaryMap = new Map();

        // 2. Aggregate OLV from StakeAccount only (No tree shares added)
        allStakes.forEach(s => {
            const owner = s.account.owner ? s.account.owner.toBase58() : "Unknown";
            // Use your provided formula
            const amt = (s.account.amount?.toNumber() || 0) / 1_000_000_000;
            summaryMap.set(owner, (summaryMap.get(owner) || 0) + amt);
        });

        // 3. Render
        const summaryTbody = document.getElementById("summaryTableBody");
        if (summaryTbody) {
            summaryTbody.innerHTML = "";
            summaryMap.forEach((total, owner) => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>${owner.slice(0, 8)}...</td>
                    <td>${total.toLocaleString(undefined, {minimumFractionDigits: 0})} OLV</td>
                `;
                summaryTbody.appendChild(tr);
            });
        }
        console.log("--- Admin: Summary Rendered Successfully ---");
    } catch (err) {
        console.error("ADMIN SUMMARY ERROR:", err);
    }
};
const updateAdminTable = async () => {
    const data = await fetchAllStakedPositions();
    const tbody = document.getElementById("stakingTableBody");
    tbody.innerHTML = ""; // Clear existing

    data.forEach(item => {
        const row = `<tr>
            <td>${item.owner.slice(0,6)}...</td>
            <td>${item.tree.slice(0,6)}...</td>
            <td>${item.lockedShares}</td>
            <td>${item.lastStakeTs}</td>
        </tr>`;
        tbody.innerHTML += row;
    });
};
async function initializeDao() {
    try {
        const admin = provider.wallet.publicKey;
const balance = await connection.getBalance(admin);
console.log("Current Balance:", balance / 1_000_000_000, "SOL");

if (balance === 0) {
    throw new Error("Your wallet is empty! Airdrop some SOL first.");
}

        const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("config")], program.programId
        );

        const [treasuryPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("treasury")], program.programId
        );

        console.log("Config PDA:", configPda.toBase58());
        console.log("Treasury PDA:", treasuryPda.toBase58());

        await program.methods
            .initializeGlobalConfig(
                OLV_MINT,
                500,
                new anchor.BN(86400)
            )
            .accounts({
                config: configPda,
                authority: admin,
                treasury: treasuryPda,
                olvMint: OLV_MINT, // Add this if in your Rust struct
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: anchor.utils.token.TOKEN_PROGRAM_ID, // Add this if in your Rust struct
                rent: anchor.web3.SYSVAR_RENT_PUBKEY, // Add this if in your Rust struct
            })
            .rpc();

        alert("DAO Initialized!");
    } catch (err) {
        console.error("Initialization failed:", err);
    }
}

async function checkStatus() {
    const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

    try {
        const data = await program.account.globalConfig.fetch(configPda);
        console.log("DAO is ALREADY initialized.");
    } catch (e) {
        console.log("DAO is NOT initialized yet.");
    }
}
async function inspectAccount(pda: PublicKey) {
    try {
        // Fetch the account using the program helper
        const accountData = await program.account.globalConfig.fetch(pda);
        console.log("--- Account Info ---");
        console.log("Admin:", accountData.admin.toBase58());
        console.log("Treasury:", accountData.treasury.toBase58());
        console.log("OLV Mint:", accountData.olvMint.toBase58());
        console.log("Protocol Fee:", accountData.protocolFeeBps);
        console.log("Paused:", accountData.paused);
        console.log("--------------------");
    } catch (e) {
        console.error("Account not initialized or not found:", e);
    }
}
(window as any).initializeVault = async () => {
    try {
        const admin = program.provider.wallet.publicKey;

        // 1. Derive the Vault PDA (The Authority)
        const [vaultPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("olv_vault")],
            program.programId
        );

        // 2. Derive the Vault's Token Account (The actual account that holds the tokens)
        const vaultAta = getAssociatedTokenAddressSync(OLV_MINT, vaultPda, true);

        console.log("Initializing DAO Vault...");
        console.log("Vault PDA:", vaultPda.toBase58());
        console.log("Vault ATA:", vaultAta.toBase58());

        // 3. RPC Call to the program
        await program.methods
            .initializeVault()
            .accounts({
                admin: admin,
                daoOlvVault: vaultAta,
                olvMint: OLV_MINT,
                daoVaultPda: vaultPda,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
            .rpc();

        alert("Vault Initialized Successfully!");
    } catch (err) {
        console.error("Initialization failed:", err);
        alert("Failed to initialize vault. Check console.");
    }
};
(window as any).renderPositionsTable = async () => {
    const tableBody = document.getElementById("positions-body") as HTMLTableSectionElement;
    if (!tableBody) return;

    tableBody.innerHTML = "<tr><td colspan='4'>Scanning...</td></tr>";

    try {
        // Fetch all positions from the program
        const allPositions = await program.account.treePosition.all();

        tableBody.innerHTML = ""; // Clear existing rows

        allPositions.forEach((pos) => {
            const row = document.createElement("tr");

            // Extract data (ensure these field names match your Rust struct)
            const owner = pos.account.owner.toBase58().substring(0, 8) + "...";
            const tree = pos.account.tree.toBase58().substring(0, 8) + "...";
            const shares = pos.account.shares.toNumber();

            const ts = pos.account.lastStakeTs.toNumber();

            // If TS is 0, it means it's a fresh Genesis tree that hasn't been staked yet
            const lastStakeDate = ts === 0
                ? "Genesis Initialized"
                : new Date(ts * 1000).toUTCString();
            row.innerHTML = `
                <td style="padding: 8px;">${owner}</td>
                <td style="padding: 8px;">${tree}</td>
                <td style="padding: 8px;">${shares}</td>
                <td style="padding: 8px;">${lastStakeDate}</td>
            `;
            tableBody.appendChild(row);
        });
    } catch (err) {
        console.error("Scanner failed:", err);
        tableBody.innerHTML = "<tr><td colspan='4'>Error loading stakes.</td></tr>";
    }
};
(window as any).scanAllPositions = async (filterByConnectedWallet = false) => {
    console.log("Scanning chain for TreePosition accounts...");

    // 1. Fetch ALL position accounts from the program
    const allPositions = await program.account.treePosition.all();
    console.log(`Found ${allPositions.length} total positions on-chain.`);

    const wallet = program.provider.publicKey;

    // 2. Filter/Process
    const results = allPositions.filter(pos => {
        if (filterByConnectedWallet && wallet) {
            return pos.account.owner.toBase58() === wallet.toBase58();
        }
        return true; // Return everything if not filtering
    });

    // 3. Display Data
    results.forEach((pos, i) => {
        const owner = pos.account.owner.toBase58();
        const tree = pos.account.tree.toBase58();
        const shares = pos.account.shares.toNumber();
        const lastStake = new Date(pos.account.lastStakeTs.toNumber() * 1000).toLocaleString();

        console.log(`--- Position ${i + 1} ---`);
        console.log(`Owner: ${owner}`);
        console.log(`Tree: ${tree}`);
        console.log(`Shares: ${shares}`);
        console.log(`Last Stake: ${lastStake}`);
        console.log(`PDA: ${pos.publicKey.toBase58()}`);
    });

    return results;
};
// --- Add this function ---
// --- 1. EMERGENCY RESET (The "Kill" Switch) ---
async function emergencyResetStake() {
    try {
        const [stakePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("stake"), program.provider.publicKey!.toBuffer()],
            program.programId
        );
        console.log("🛠️ Nuking malformed Stake Account:", stakePda.toBase58());

        const tx = await program.methods
            .resetStakeAccount()
            .accounts({
                authorityStake: stakePda,
                authority: program.provider.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            } as any)
            .rpc();

        console.log("💥 Account Nuked:", tx);
        alert("Success! The old account is gone. Now you can Sync Genesis.");
      //  await refreshDashboard();
    } catch (err: any) {
        console.error("Reset failed:", err);
        alert("Reset failed: " + err.message);
    }
}
// --- 2. CORE SYNC LOGIC (The Genesis Planting) ---
async function initializeFromSupabase() {
  try {
    console.log("🔍 --- STARTING GENESIS SYNC (LIMIT 3) --- ");

    const { data: fieldData } = await sb.from('fields').select('*').eq('field_id', 'FIELD_01').single();
    const { data: trees } = await sb.from('tree_metadata').select('*').eq('field_id', 'FIELD_01').order('tree_id', { ascending: true }).limit(3);

    if (!fieldData || !trees) throw new Error("Missing Supabase data");

    const [configPda] = getConfigPda();
    const [fieldPda] = getFieldPda(program.provider.publicKey!, fieldData.field_name);

    // FIX: Correctly defining authorityStakePda for the loop below
    const [authorityStakePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("stake"), program.provider.publicKey!.toBuffer()],
        program.programId
    );

    // Ensure Field exists
    const fieldAccount = await connection.getAccountInfo(fieldPda);
    if (!fieldAccount) {
        console.log("Initializing Field first...");
        await program.methods
            .initField(
                fieldData.field_name,
                new BN(fieldData.area_sq_meters),
                fieldData.metadata_url,
                fieldData.location,
                Math.round(fieldData.gps_lat * 1000000),
                Math.round(fieldData.gps_long * 1000000)
            )
            .accounts({
                config: configPda,
                field: fieldPda,
                authority: program.provider.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();
    }

    // Plant trees
    for (const tree of trees) {
      const [treePda] = getTreePda(fieldPda, tree.tree_id);
      const treeAccount = await connection.getAccountInfo(treePda);
      if (treeAccount) continue; // Skip if already on-chain

      const [posPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("position"), program.provider.publicKey!.toBuffer(), treePda.toBuffer()],
          program.programId
      );

      console.log(`🚀 Planting ${tree.tree_id}...`);
      await program.methods
        .addTreeToField(
          tree.tree_id,
          tree.cultivar || "Unknown",
          Math.round((tree.latitude || 0) * 1000000),
          Math.round((tree.longitude || 0) * 1000000),
          tree.age_years || 0
        )
        .accounts({
          tree: treePda,
          field: fieldPda,
          treePosition: posPda,
          authorityStake: authorityStakePda, // Using the variable we just defined
          authority: program.provider.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
    }

    alert("Genesis Planting Complete!");
    await refreshDashboard();
  } catch (err: any) {
    console.error("Sync failed", err);
    alert("Sync Error: " + err.message);
  }
}




// --- 3. REFRESH & RENDER ---
// --- Updated Refresh Logic for Global Visibility ---
async function refreshDashboard() {
  try {
    const allFields = await program.account.field.all();
    const allTrees = await program.account.tree.all();

    console.log("Fetching positions... filtering for 106-byte accounts only.");

    // 1. SAFE FETCH: Instead of .all(), we use getProgramAccounts with a size filter
    // This ignores the "ghosts" from Feb 2026 that have the wrong size.
    const rawPositions = await connection.getProgramAccounts(program.programId, {
        filters: [
            { dataSize: 66 }, // Only get accounts that match your current struct size
            { memcmp: {
                offset: 0,
                bytes: anchor.utils.bytes.bs58.encode(Buffer.from([77, 68, 220, 34, 158, 160, 142, 143])) // TreePosition Discriminator
            }}
        ]
    });

    const allPositions = rawPositions.map(acc => {
        try {
            return {
                publicKey: acc.pubkey,
                account: program.coder.accounts.decode("TreePosition", acc.account.data)
            };
        } catch (e) {
            console.warn("Skipping malformed ghost account:", acc.pubkey.toBase58());
            return null;
        }
    }).filter(p => p !== null);

    console.log(`Successfully synced ${allPositions.length} active positions.`);

    // 2. AGGREGATE DATA
    const globalStats = new Map();
    allPositions.forEach(p => {
      const treeStr = p.account.tree.toBase58();
      const current = globalStats.get(treeStr) || { liquid: 0, staked: 0, holders: 0 };

      globalStats.set(treeStr, {
        liquid: current.liquid + (p.account.shares?.toNumber() || 0),
        staked: current.staked + (p.account.lockedShares?.toNumber() || 0),
        holders: current.holders + 1
      });
    });

    // 3. RENDER
    const treeVal = document.getElementById('total-trees-val');
    if (treeVal) treeVal.innerText = allTrees.length.toString();

    const totalDaoStaked = Array.from(globalStats.values()).reduce((sum, s: any) => sum + s.staked, 0);
    const stakeVal = document.getElementById('total-stake-val');
    if (stakeVal) stakeVal.innerText = totalDaoStaked.toLocaleString();

    renderFields(allFields);
    renderTrees(allTrees, globalStats);

  } catch (err) {
    console.error("Critical Dashboard Failure:", err);
  }
}
function renderFields(fields: any[]) {
    const fieldList = document.getElementById('field-list-body');
    if (!fieldList) return;
    fieldList.innerHTML = fields.map(f => `
      <tr>
        <td><b>${f.account.name}</b></td>
        <td>${f.account.location}</td>
        <td>${f.account.totalTrees} Trees</td>
        <td><code>${f.publicKey.toBase58().slice(0,6)}...</code></td>
      </tr>`).join("");
}

async function loadMarketplace() {
    const allListings = await program.account.treeListing.all();
    const myAddress = program.provider.publicKey!.toBase58();

    const marketDiv = document.getElementById("marketplace-container");
    if (!marketDiv) return;
    marketDiv.innerHTML = "<h3>Olive Tree Marketplace</h3>";

    allListings.forEach(list => {
        const isMine = list.account.seller.toBase58() === myAddress;

        const card = document.createElement("div");
        card.style.border = "1px solid #ccc";
        card.style.padding = "10px";
        card.style.margin = "5px";

        card.innerHTML = `
            <strong>Tree:</strong> ${list.account.tree.toBase58().slice(0, 8)}...<br>
            <strong>Seller:</strong> ${isMine ? "You" : list.account.seller.toBase58().slice(0, 8)}<br>
            <strong>Shares:</strong> ${list.account.shares.toString()}<br>
            <strong>Price:</strong> ${list.account.price.toNumber() / 10**9} SOL<br>
        `;

        if (!isMine) {
            const buyBtn = document.createElement("button");
            buyBtn.innerText = "Buy These Fractions";
            buyBtn.onclick = () => purchaseFromListing(list.publicKey); // Your PurchaseShares function
            card.appendChild(buyBtn);
        } else {
            const cancelBtn = document.createElement("button");
            cancelBtn.innerText = "Cancel Listing";
            cancelBtn.onclick = () => cancelListing(list.publicKey); // Your CancelListing function
            card.appendChild(cancelBtn);
        }

        marketDiv.appendChild(card);
    });
}
async function cancelListing(listingPda: string) {
    try {
        const listingPubKey = new PublicKey(listingPda);
        const listingAccount = await program.account.treeListing.fetch(listingPubKey);

        const [configPda] = getConfigPda();

        // Derive the seller's position PDA to return the shares to
        const [sellerPosPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("position"), program.provider.publicKey!.toBuffer(), listingAccount.tree.toBuffer()],
            program.programId
        );

        console.log("🔄 Cancelling listing and returning shares to position...");

        await program.methods
            .cancelListing()
            .accounts({
                seller: program.provider.publicKey,
                config: configPda,
                treePosition: sellerPosPda,
                listing: listingPubKey,
            } as any)
            .rpc();

        alert("Listing cancelled! Shares have been returned to your locked balance.");
        await refreshDashboard();
    } catch (err: any) {
        console.error("Cancellation failed:", err);
        alert("Error: " + err.message);
    }
}

async function listSharesForSale() {
    const treeId = prompt("Enter Tree ID to sell shares from (e.g., F1-FR-001):");
    const shareAmount = prompt("How many shares to list?");
    const priceInSol = prompt("Total price in SOL for these shares:");

    if (!treeId || !shareAmount || !priceInSol) return;

    try {
        // 1. Find the Field and Tree PDAs
        const [configPda] = getConfigPda();
        // Assuming FIELD_01 for the Genesis trees
        const [fieldPda] = getFieldPda(new PublicKey("ADMIN_PUBKEY_HERE"), "Toscagialla Heritage Grove V2");
        const [treePda] = getTreePda(fieldPda, treeId);

        // 2. Derive the Listing PDA (Seeds: "listing", seller, tree)
        const [listingPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("listing"), program.provider.publicKey!.toBuffer(), treePda.toBuffer()],
            program.programId
        );

        // 3. Derive the Seller's Position (where the shares currently are)
        const [sellerPosPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("position"), program.provider.publicKey!.toBuffer(), treePda.toBuffer()],
            program.programId
        );

        console.log(`🏷️ Listing ${shareAmount} shares for ${priceInSol} SOL...`);

        await program.methods
            .listShares(
                new BN(parseFloat(priceInSol) * 10**9), // Price in lamports
                new BN(shareAmount)                    // Shares
            )
            .accounts({
                seller: program.provider.publicKey,
                config: configPda,
                treePosition: sellerPosPda,
                field: fieldPda,
                tree: treePda,
                listing: listingPda,
                systemProgram: anchor.web3.SystemProgram.programId,
            } as any)
            .rpc();

        alert("Listed! Other users can now buy these fractions.");
        await refreshDashboard();
    } catch (err: any) {
        console.error("Listing failed:", err);
        alert("Error: " + err.message);
    }
}
function renderTrees(onChainTrees: any[], globalStats: Map<string, any>) {
  const treeListBody = document.getElementById('tree-list-body');
  if (!treeListBody) return;

  const sorted = [...onChainTrees].sort((a, b) =>
    (a.account.treeId || "").localeCompare(b.account.treeId || "")
  );

  treeListBody.innerHTML = sorted.map(t => {
    const acc = t.account;
    const treePdaStr = t.publicKey.toBase58();
    const stats = globalStats.get(treePdaStr) || { liquid: 0, staked: 0, holders: 0 };

    // Calculate total supply (Max is usually 1000 per tree in your genesis)
    const totalMinted = stats.liquid + stats.staked;

    return `
      <tr>
        <td><span class="genesis-badge">${acc.treeId.includes('001') ? 'ORIGIN' : 'GENESIS'}</span></td>
        <td><code>${acc.treeId}</code></td>
        <td>${acc.cultivar}</td>
        <td>
          <div style="font-size: 0.85em; background: #f9f9f9; padding: 5px; border-radius: 4px;">
            <span style="color: #2ecc71;">📦 Total Liquid: <strong>${stats.liquid}</strong></span><br>
            <span style="color: #3498db;">🏛️ Total Staked: <strong>${stats.staked}</strong></span><br>
            <span style="color: #666;">👥 Unique Holders: ${stats.holders}</span>
          </div>
        </td>
        <td>
           <div class="progress-bar-bg" style="width: 100%; background: #eee; height: 8px; border-radius: 4px; margin-top: 5px;">
              <div class="progress-bar-fill" style="width: ${(totalMinted / 10).toFixed(0)}%; background: #4caf50; height: 100%; border-radius: 4px;"></div>
           </div>
           <small>${totalMinted}/1000 Circulating</small>
        </td>
      </tr>`;
  }).join("");
}

// --- 4. BOOTSTRAP ---
async function init() {
  const connectBtn = document.getElementById("connectBtn") as HTMLButtonElement;
  const initDaoBtn = document.getElementById("initDaoBtn") as HTMLButtonElement;
  // --- Add this inside your init() function to create the button ---
const resetStakeBtn = document.getElementById("resetStakeBtn") as HTMLButtonElement;
resetStakeBtn.innerText = "🚨 Reset Malformed Stake";
resetStakeBtn.style.backgroundColor = "#ff4444";
resetStakeBtn.style.color = "white";
resetStakeBtn.style.margin = "10px";
resetStakeBtn.onclick = emergencyResetStake;
document.getElementById("admin-actions")?.appendChild(resetStakeBtn);

  connectBtn.onclick = async () => {
    const { provider } = await connectWallet();
    document.getElementById("walletInfo")!.innerHTML = `Connected: ${provider.publicKey.toBase58()}`;
    await refreshDashboard();
  };

  initDaoBtn.onclick = initializeDao;
}

(window as any).initializeFromSupabase = initializeFromSupabase;
(window as any).refreshDashboard = refreshDashboard;
init();
