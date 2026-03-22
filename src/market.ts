import './polyfill';

import { Buffer } from 'buffer';
window.Buffer = Buffer;
import { program, connectWallet, connection } from "./connection";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { getConfigPda } from "./pda";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);




async function getPositionsByWallet(walletPubKey: PublicKey) {
    // 1. Define the offset:
    // Discriminator (8 bytes) + field position (e.g., owner is the first field = 0)
    // If 'owner' is the first field in TreePosition, offset = 8.
    const OWNER_OFFSET = 8;

    const positions = await program.account.treePosition.all([
        {
            memcmp: {
                offset: OWNER_OFFSET,
                bytes: walletPubKey.toBase58(),
            },
        },
    ]);

    return positions;
}

// --- 1. LIST SHARES (Admin & User) ---
async function executeListing() {
    const treePda = (document.getElementById("modalTreePda") as HTMLInputElement).value.trim();
    const shares = (document.getElementById("sellSharesCount") as HTMLInputElement).value;
    const price = (document.getElementById("sellPriceSol") as HTMLInputElement).value;

    try {
        const treePubKey = new PublicKey(treePda);
        const treeAccount = await program.account.tree.fetch(treePubKey);
        const [configPda] = getConfigPda();
        const [listingPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("listing"), program.provider.publicKey!.toBuffer(), treePubKey.toBuffer()],
            program.programId
        );
        const [posPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("position"), program.provider.publicKey!.toBuffer(), treePubKey.toBuffer()],
            program.programId
        );
console.log("Listing PDA:", listingPda.toBase58());
        await program.methods.listShares(
            new BN(parseFloat(price) * 1e9),
            new BN(shares)
        ).accounts({
            seller: program.provider.publicKey,
            config: configPda,
            treePosition: posPda,
            field: treeAccount.field,
            tree: treePubKey,
            listing: listingPda,
            systemProgram: anchor.web3.SystemProgram.programId, // ADD THIS
        } as any).rpc();

        alert("Shares Escrowed & Listed!");
        location.reload();
    } catch (err: any) { alert("Listing Error: " + err.message); }
}

// --- 2. BUY SHARES ---
async function buyShares(listingPdaStr: string) {
    try {
        const listingPda = new PublicKey(listingPdaStr);
        const listing = await program.account.treeListing.fetch(listingPda);
        const treeAcc = await program.account.tree.fetch(listing.tree);
        const [configPda] = getConfigPda();
        const configAcc = await program.account.globalConfig.fetch(configPda);

        const [buyerPosPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("position"), program.provider.publicKey!.toBuffer(), listing.tree.toBuffer()],
            program.programId
        );
        const [sellerPosPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("position"), listing.seller.toBuffer(), listing.tree.toBuffer()],
            program.programId
        );
        const [vaultPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("revenue_vault"), listing.tree.toBuffer()],
            program.programId
        );
        const [stakePda] = PublicKey.findProgramAddressSync(
          [Buffer.from("stake"), program.provider.publicKey!.toBuffer()],
          program.programId
        );
        // 1. Derive the Environment Data PDA
        const [envDataPda] = PublicKey.findProgramAddressSync(
          [Buffer.from("env_data")], // Ensure this matches the seed in your Rust struct
          program.programId
);
        // Add this before your program.methods.purchaseTreeShares(...) call
try {
    const buyerPosAccount = await program.account.treePosition.fetch(buyerPosPda);
    console.log("Buyer Position exists:", buyerPosAccount);
} catch (e) {
    console.log("Buyer Position account does not exist yet (expected if new buyer).");
}
const sellerPos = await program.account.treePosition.fetch(sellerPosPda);
console.log("Seller Shares:", sellerPos.shares.toString());
console.log("Listing Shares:", listing.shares.toString());

// Inside market.ts - update your .accounts({...}) call:
await program.methods.purchaseTreeShares().accounts({
          buyer: program.provider.publicKey,
          config: configPda,
          field: listing.field,
          tree: listing.tree,
          seller: listing.seller,
          sellerPosition: sellerPosPda,
          buyerPosition: buyerPosPda,
          authorityStake: stakePda,
          listing: listingPda,
          treeRevenueVault: vaultPda,
          treasury: configAcc.treasury,
          envData: envDataPda, // Ensure you are passing this!
          systemProgram: anchor.web3.SystemProgram.programId,// Add these if your struct expects them:
// rent: anchor.web3.SYSVAR_RENT_PUBKEY,
} as any).rpc();
        alert("Purchase Complete! Fees distributed.");
        location.reload();
    } catch (err: any) { alert("Buy Error: " + err.message); }
}
(window as any).showAdminStakes = async () => {
    const allPositions = await program.account.treePosition.all();
    const allTrees = await program.account.tree.all();

    console.log("--- STAKE REPORT ---");
    const report = allPositions
        .filter(p => p.account.lockedShares.toNumber() > 0)
        .map(p => {
            // Find the readable ID (e.g., F1-FR-001)
            const treeMatch = allTrees.find(t => t.publicKey.equals(p.account.tree));
            return {
                TreeName: treeMatch ? treeMatch.account.treeId : "Unknown",
                Owner: p.account.owner.toBase58(),
                LockedShares: p.account.lockedShares.toNumber(),
                LastStakeTs: new Date(p.account.lastStakeTs.toNumber() * 1000).toLocaleString()
            };
        });

    console.table(report);
};
// --- 3. CLAIM REVENUE ---
async function claimRevenue(treePdaStr: string) {
    try {
        const treePubKey = new PublicKey(treePdaStr);
        const [posPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("position"), program.provider.publicKey!.toBuffer(), treePubKey.toBuffer()],
            program.programId
        );
        const [vaultPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("revenue_vault"), treePubKey.toBuffer()],
            program.programId
        );

        await program.methods.claimRevenue().accounts({
            authority: program.provider.publicKey,
            treePosition: posPda,
            tree: treePubKey,
            treeRevenueVault: vaultPda,
        } as any).rpc();

        alert("SOL Revenue claimed to your wallet!");
    } catch (err: any) { alert("Claim Error: " + err.message); }
}
// --- 4. RENDER MARKETPLACE ---
async function refreshMarket() {
    const walletPubKey = program.provider.publicKey;
    const myKey = walletPubKey ? walletPubKey.toBase58() : null;

    try {
        // 1. Fetch all required data from the blockchain
        const listings = await program.account.treeListing.all();
        const positions = await program.account.treePosition.all();
        const allTrees = await program.account.tree.all();

        // 2. Initialize counters for the Top Stats Bar
        let totalLiquid = 0;
        let totalStaked = 0;
        let solAmount = "0.00";

        if (walletPubKey) {
            // Calculate SOL Balance
            const balance = await program.provider.connection.getBalance(walletPubKey);
            solAmount = (balance / 1e9).toFixed(2);

            // Filter positions belonging to the connected user
            const myPositions = positions.filter(p => p.account.owner.toBase58() === myKey);

            // Sum up the shares for the Top Stats Bar
            myPositions.forEach(p => {
                totalLiquid += p.account.shares.toNumber();
                totalStaked += p.account.lockedShares.toNumber();
            });

            console.log(`[Stats Update] Liquid: ${totalLiquid}, Staked: ${totalStaked}, SOL: ${solAmount}`);
        }

        // 3. UPDATE TOP STATS BAR UI
        const balanceEl = document.getElementById("balance-sol");
        const liquidEl = document.getElementById("balance-liquid");
        const stakedEl = document.getElementById("balance-staked");
        const weightEl = document.getElementById("global-weight");

        if (balanceEl) balanceEl.innerText = solAmount;
        if (liquidEl) liquidEl.innerText = `${totalLiquid.toLocaleString()} Shares`;
        if (stakedEl) stakedEl.innerText = `${totalStaked.toLocaleString()} Locked`;

        // Calculate DAO Weight dynamically based on total trees planted
        // Each tree = 1000 total shares (Genesis rule)
        if (weightEl && allTrees.length > 0) {
            const totalPossibleStakedSupply = allTrees.length * 1000;
            const weight = totalStaked > 0 ? (totalStaked / totalPossibleStakedSupply) * 100 : 0;
            weightEl.innerText = `${weight.toFixed(1)}%`;
        }

        // 4. RENDER USER PORTFOLIO (The Cards you OWN)
        const posContainer = document.getElementById("user-positions")!;
        const myPositionsData = positions.filter(p => p.account.owner.toBase58() === myKey);
        posContainer.innerHTML = myPositionsData.length > 0 ? myPositionsData.map(p => {
    const treeBase58 = p.account.tree.toBase58();
    const liq = p.account.shares.toNumber();      // Using toNumber() for easy math
    const lkd = p.account.lockedShares.toNumber();

    return `
        <div class="card" style="border: 2px solid #2ecc71; padding: 15px; margin: 10px; border-radius: 8px; background: #f9fffb;">
            <h3 style="margin-top: 0;">🌲 Tree: ${treeBase58.slice(0,6)}</h3>
            <p style="color: #27ae60;">💧 <strong>Liquid (Tradeable):</strong> ${liq}</p>
            <p style="color: #2980b9;">🔒 <strong>Staked (Voting):</strong> ${lkd}</p>

            <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
                ${liq > 0
                    ? `<button onclick="openSellModal('${treeBase58}')" style="background: #27ae60; color: white; border: none; padding: 8px 12px; cursor: pointer; border-radius: 4px; font-weight: bold;">List for Sale</button>`
                    : ''
                }

                ${liq > 0
                    ? `<button onclick="openStakeModal('${treeBase58}', ${liq})" style="background: #3498db; color: white; border: none; padding: 8px 12px; cursor: pointer; border-radius: 4px; font-weight: bold;">📥 Stake</button>`
                    : ''
                }

                ${lkd > 0
                    ? `<button onclick="unstakeShares('${treeBase58}', ${lkd})" style="background: #e74c3c; color: white; border: none; padding: 8px 12px; cursor: pointer; border-radius: 4px; font-weight: bold;">📤 Unstake</button>`
                    : ''
                }
                <button onclick="openTreeDetails('${treeBase58}')" style="background: #f1c40f; color: black; border: none; padding: 8px 12px; cursor: pointer; border-radius: 4px; font-weight: bold;"> Tree Details </button>

                <button onclick="claimRevenue('${treeBase58}')" style="background: #f1c40f; color: black; border: none; padding: 8px 12px; cursor: pointer; border-radius: 4px; font-weight: bold;">💰 Dividends</button>
            </div>
        </div>
    `;
}).join('') : "<p style='padding:10px;'>No shares owned yet. Go buy a tree!</p>";
        // 5. RENDER MARKETPLACE (Listings to BUY or CANCEL)
        const listContainer = document.getElementById("active-listings")!;
        if (!posContainer || !listContainer) {
            console.warn("Market containers not found. Check your HTML IDs.");
            return; // Exit early so it doesn't crash
        }

        listContainer.innerHTML = listings.length > 0 ? listings.map(l => {
            const isMine = l.account.seller.toBase58() === myKey;
            const treeBase58 = l.account.tree.toBase58();
            const priceSol = l.account.price.toNumber() / 1e9;

            return `
                <div class="card" style="border: 1px solid #ddd; padding: 15px; margin: 10px; border-radius: 8px; box-shadow: 2px 2px 5px rgba(0,0,0,0.05);">
                    <h3>Tree: ${treeBase58.slice(0,6)}</h3>
                    <p><strong>Seller:</strong> ${isMine ? "<span style='color: #e67e22;'>You</span>" : treeBase58.slice(0,8)}</p>
                    <p><strong>Shares:</strong> ${l.account.shares.toString()}</p>
                    <p><strong>Price:</strong> <span style="color: #27ae60; font-weight: bold;">${priceSol} SOL</span></p>
                    <div style="margin-top: 10px;">
                        ${isMine
                            ? `<button onclick="cancelListing('${l.publicKey.toBase58()}')" style="background: #e74c3c; color: white; border: none; padding: 10px; width: 100%; border-radius: 4px; cursor: pointer;">Cancel Listing</button>`
                            : `<button onclick="buyShares('${l.publicKey.toBase58()}')" style="background: #2ecc71; color: white; border: none; padding: 10px; width: 100%; border-radius: 4px; cursor: pointer;">Buy Fractions</button>`
                        }
                    </div>
                </div>
            `;
        }).join('') : "<p style='padding: 20px;'>No active listings on the market.</p>";

    } catch (err) {
        console.error("Critical Refresh Error:", err);
    }
}

// Define your reward rate constant
const REWARD_RATE = 0.15; // 15% Example yield

const calculateAPR = (staked: number, total: number) => {
    if (total === 0) return 0;
    // Basic yield formula: (Staked / Total) * Rate
    return ((staked / total) * REWARD_RATE * 100).toFixed(2);
};

// Close function (global)
window.closeDeepModal = () => {
    const modal = document.getElementById('deepTreeModal');
    if (!modal) return;
    modal.style.display = 'none';
    document.body.classList.remove('modal-open');
};

// Close modal on ESC key
document.addEventListener('keydown', (e) => {
    if (e.key === "Escape") window.closeDeepModal();
});

// Close modal by clicking overlay
const modalOverlay = document.getElementById('deepTreeModal');
modalOverlay?.addEventListener('click', (e) => {
    if (e.target === modalOverlay) window.closeDeepModal();
});

(window as any).openTreeDetails = async (treePublicKeyStr: string) => {
    const modal = document.getElementById('deepTreeModal');
    const content = document.getElementById('modal-content-deep');
    if (!modal || !content) return;

    // Use a short Tree ID (last 4 chars for display if you like)
    const treeId = treePublicKeyStr.slice(-6).toUpperCase(); // e.g., "AB12EF"

    // Show modal
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');

    // Skeleton loader
    content.innerHTML = `
        <div style="padding: 40px; text-align: center;">
            <div style="width:50px; height:50px; border:3px solid #1b4332; border-top:3px solid #74c69d; border-radius:50%; animation: spin 1s linear infinite; margin:0 auto;"></div>
            <p style="margin-top:20px; color:#74c69d; font-family:monospace; letter-spacing:2px;">INITIALIZING TELEMETRY...</p>
        </div>
    `;

    try {
        const treePublicKey = new PublicKey(treePublicKeyStr);

        // Fetch tree account
        const acc = await program.account.tree.fetch(treePublicKey);

        // Fetch user position
        let userLiquid = 0;
        let userStaked = 0;
        try {
            const [userPosPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("position"), program.provider.publicKey!.toBuffer(), treePublicKey.toBuffer()],
                program.programId
            );
            const myPos = await program.account.treePosition.fetch(userPosPda);
            userLiquid = myPos.shares.toNumber();
            userStaked = myPos.lockedShares.toNumber();
        } catch {
            console.log("No position found, defaulting to 0.");
        }

        // Fetch metadata
        const { data: meta } = await sb
            .from('tree_metadata')
            .select('*')
            .eq('tree_id', treePublicKeyStr)
            .maybeSingle();

        const staked = acc.totalLockedShares?.toNumber() ?? 0;
        const total = acc.totalMinted?.toNumber() ?? 0;
        const health = meta?.health_score || 0.98;

        // Inject modal content
        content.style.background = "#050704";
        content.style.border = "1px solid #1b4332";
        content.style.width = "700px";
        content.style.maxWidth = "95vw";

        content.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px; border-bottom:1px solid #1b4332; padding-bottom:10px;">
                <div>
                    <h2 style="font-size:2rem; font-weight:900; color:#fff; margin:0; font-style:italic; text-transform:uppercase; letter-spacing:-1px;">TREE ${treeId}</h2>
                    <p style="color:#74c69d; font-family:monospace; font-size:0.75rem; margin-top:5px;">GENESIS SERIES // ASSET-BACKED FRACTIONS</p>
                </div>
                <button onclick="window.closeDeepModal()" style="background:none; border:none; color:#40916c; font-size:2rem; cursor:pointer;">×</button>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1.5fr; gap:20px; margin-bottom:20px;">
                <div style="background: rgba(45,106,79,0.1); padding:20px; border-radius:20px; border:1px solid #2d6a4f;">
                    <h3 style="font-size:10px; color:#74c69d; text-transform:uppercase; margin-bottom:10px;">My Position</h3>
                    <p>💧 Liquid: <span style="font-weight:800; color:#fff;">${userLiquid}</span></p>
                    <p>🔒 Staked: <span style="font-weight:800; color:#52b788;">${userStaked}</span></p>
                </div>

                <div style="background: rgba(255,255,255,0.03); padding:20px; border-radius:20px; border:1px solid rgba(255,255,255,0.05);">
                    <h3 style="font-size:10px; color:#555; text-transform:uppercase; margin-bottom:10px;">Biological Status</h3>
                    <p>Cultivar: <span style="color:#fff; font-style:italic;">${meta?.cultivar || 'FRANTOIO'}</span></p>
                    <p>Diameter: <span style="color:#fff;">${meta?.diameter_cm || 0} cm</span></p>
                    <p>Field: <span style="color:#74c69d;">${meta?.field_id || 'N/A'}</span></p>
                    <p>Health: <span style="color:#52b788;">${(health*100).toFixed(0)}%</span></p>
                </div>
            </div>

            <button onclick="
                document.getElementById('modalTreePdaStake').value='${treePublicKeyStr}';
                window.closeDeepModal();
                window.openStakeModal('${treePublicKeyStr}');
            " style="width:100%; background:#2d6a4f; color:white; padding:15px; border:none; border-radius:15px; font-weight:900; text-transform:uppercase; letter-spacing:2px; cursor:pointer;">
                Stake Fractions
            </button>
        `;
    } catch (e) {
        console.error(e);
        content.innerHTML = `<div style="padding:40px; color:#e74c3c; text-align:center; font-weight:bold;">TELEMETRY CONNECTION FAILED</div>`;
    }
};
(window as any).closeDeepModal = () => {
    const modal = document.getElementById('deepTreeModal');
    if (modal) {
        modal.style.display = 'none'; // Overrides the inline style back to hidden
        document.body.classList.remove('modal-open');
    }
};
(window as any).closeBuyModal = () => {
    document.getElementById('buyModal')!.classList.add('hidden');
};

// Assuming you have an initialized 'anchor' provider instance
(window as any).stakeShares = async (treeBase58: string, amount: number) => {
    try {
        const wallet = program.provider.publicKey;
        if (!wallet) return alert("Connect Wallet!");

        const treePubkey = new anchor.web3.PublicKey(treeBase58);

        // 1. Derive PDAs
        const [treePosPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("position"), wallet.toBuffer(), treePubkey.toBuffer()],
            program.programId
        );

        const [stakePda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("stake"), wallet.toBuffer()],
            program.programId
        );

        const [configPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("config")],
            program.programId
        );

        // 2. DEBUG: Check if Stake Account exists
        console.log("--- STAKE DEBUG ---");
        console.log("Checking Stake PDA:", stakePda.toBase58());

        const stakeInfo = await program.provider.connection.getAccountInfo(stakePda);

        if (!stakeInfo) {
            console.log("Status: NOT INITIALIZED. Instruction will attempt 'init_if_needed'.");
        } else {
            console.log("Status: INITIALIZED. Data size:", stakeInfo.data.length);
            // Optional: Fetch and log current staked amount
            const accountData = await program.account.stakeAccount.fetch(stakePda);
            console.log("Current Staked Amount:", accountData.amount.toNumber());
        }

        // 3. Execute Transaction
        console.log("Executing stakeShares for amount:", amount);

        const tx = await program.methods
            .stakeShares(new anchor.BN(amount))
            .accounts({
                config: configPda,
                tree: treePubkey,
                treePosition: treePosPda,
                owner: wallet,
                authorityStake: stakePda,
                systemProgram: anchor.web3.SystemProgram.programId, // CRITICAL for init_if_needed
            })
            .rpc();

        console.log("Stake Successful! TX:", tx);
        alert("Staking Successful!");

    } catch (err: any) {
        console.error("Stake Attempt Failed:", err);
        // If it's a simulation error, it often hides the real reason
        if (err.logs) console.log("Transaction Logs:", err.logs);
        alert("Error: " + err.message);
    }
};
// Open the modal
(window as any).openStakeModal = (pda: string) => {
    const pdaInput = document.getElementById("modalTreePdaStake") as HTMLInputElement;
    const modal = document.getElementById("StakeModal");

    if (pdaInput) {
        pdaInput.value = pda; // Explicitly setting the value here
        console.log("PDA set to:", pdaInput.value); // Check the console for this!
    }

    if (modal) {
        modal.style.display = 'block';
    }
};
(window as any).closeStakeModal = () => {
    const modal = document.getElementById("StakeModal");
    if (modal) {
        modal.style.display = 'none';
    }
};

(window as any).confirmStake = async () => {
    console.log("--- START: confirmStake ---");
    const statusLabel = document.getElementById("stake-status-badge");

    try {
        const pdaInput = document.getElementById("modalTreePdaStake") as HTMLInputElement;
        const amountInput = document.getElementById("stakeAmountInput") as HTMLInputElement;

        if (!pdaInput || !amountInput) throw new Error("UI Elements missing");

        const allTrees = await program.account.tree.all();
        const rawValue = pdaInput.value;
        const amount = parseInt(amountInput.value);

        if (amount <= 0) { alert("Error: Invalid Amount"); return; }

        // 1. Resolve Tree
        const treeObj = rawValue.length > 32
            ? allTrees.find(t => t.publicKey.toBase58() === rawValue)
            : allTrees.find(t => t.account.treeId === rawValue.replace("GENESIS", "").trim());

        if (!treeObj) throw new Error("Tree not found");

        const wallet = program.provider.publicKey!;
        const treePda = treeObj.publicKey;

        // 2. Derive PDAs
        const [posPda] = PublicKey.findProgramAddressSync([Buffer.from("position"), wallet.toBuffer(), treePda.toBuffer()], program.programId);
        const [authStakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake_v1"), wallet.toBuffer()], program.programId);
        const [configPda] = getConfigPda();

        // 3. Check Lockout (Only if account exists)
        const posAcc = await program.account.treePosition.fetchNullable(posPda);
        if (posAcc) {
            const now = Math.floor(Date.now() / 1000);
            const lastStake = posAcc.lastStakeTs?.toNumber() || 0; // Ensure this matches your Rust field name
            const config = await program.account.globalConfig.fetch(configPda);
            const minDuration = config.minStakeDuration.toNumber();

            if (now - lastStake < minDuration) {
                const timeLeft = minDuration - (now - lastStake);
                throw new Error(`Stake too recent! Wait ${Math.ceil(timeLeft / 60)}m.`);
            }
        }

        // 4. Execute
        if (statusLabel) statusLabel.innerText = "Signing...";

        const tx = await program.methods
            .stakeShares(new anchor.BN(amount))
            .accounts({
                config: configPda,
                tree: treePda,
                treePosition: posPda,
                owner: wallet,
                authorityStake: authStakePda,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();

        console.log("Transaction Success:", tx);
        alert("Stake Successful!");

    } catch (err: any) {
        console.error("Stake Attempt Failed:", err);
        const msg = err.message || err.toString();

        if (statusLabel) statusLabel.innerText = "Error";

        // Handle specific errors
        if (msg.includes("StakeTooRecent") || msg.includes("6009") || msg.includes("Stake too recent")) {
            alert("🔒 Stake is locked! You must wait 5 minutes.");
        } else {
            alert("Transaction Failed: " + msg);
        }
    }
};

// Helper to map your UI strings to the actual on-chain IDs
// Replace your manual map with this:
const getTreeIdFromAddress = (address: string, allTrees: any[]): string => {
    // 1. Check if the address is a valid PDA in our list
    const found = allTrees.find(t => t.publicKey.toBase58() === address);

    // 2. If found, return the on-chain ID, otherwise return the input (assuming it IS an ID)
    return found ? found.account.treeId : address;
};
async function checkStakeStatus() {
    const wallet = program.provider.publicKey;
    const badgeContainer = document.getElementById("stake-status-badge");
    if (!badgeContainer || !wallet) return;

    const [authStakePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("stake"), wallet.toBuffer()],
        program.programId
    );


    try {
        // Try to fetch to see if the discriminator matches the current IDL
        await program.account.stakeAccount.fetch(authStakePda);
        badgeContainer.innerHTML = `<span style="background:#2ecc71; color:white; padding:5px 10px; border-radius:15px; font-size:0.8rem;">✅ Ready to Stake</span>`;
    } catch (err: any) {
        // Check if account exists at all
        const accountInfo = await program.provider.connection.getAccountInfo(authStakePda);

        if (accountInfo === null) {
            // Account truly doesn't exist
            badgeContainer.innerHTML = `<button onclick="initializeUserStake()" style="background:#e67e22; color:white; border:none; padding:5px 10px; border-radius:15px; cursor:pointer;">Initialize Staking</button>`;
        } else {
            // Account exists, but fetch failed (Discriminator Mismatch)
            badgeContainer.innerHTML = `<button onclick="initializeUserStake()" style="background:#e74c3c; color:white; border:none; padding:5px 10px; border-radius:15px; cursor:pointer;">Account Mismatch - Re-Init</button>`;
            console.error("Discriminator Mismatch: The on-chain account structure does not match your current Rust code.");
        }
    }
}

// THIS IS THE KEY: Expose it to the HTML
(window as any).stakeShares = stakeShares;
(window as any).showAdminStakes = showAdminStakes;





(window as any).program = program;


(window as any).initializeUserStake = async () => {
    const wallet = program.provider.publicKey!;
    const [authStakePda] = PublicKey.findProgramAddressSync(
        [Buffer.from("stake"), wallet.toBuffer()],
        program.programId
    );

    try {
        console.log("Attempting initialization...");
        await program.methods
            .initializeStake()
            .accounts({
                authorityStake: authStakePda,
                authority: wallet,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
        console.log("Account initialized successfully.");
    } catch (err: any) {
        const logs = err.logs ? err.logs.toString() : "";
        if (logs.includes("already in use")) {
            console.warn("Authority Stake account already exists. Proceeding...");
            return;
        }
        throw err;
    }
};
async function unstakeShares(treePdaStr: string, amount: number) {
    try {
        const treePda = new PublicKey(treePdaStr);
        const userPubkey = program.provider.publicKey!;

        const [positionPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("position"), userPubkey.toBuffer(), treePda.toBuffer()],
            program.programId
        );

        const [stakePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("stake"), userPubkey.toBuffer()],
            program.programId
        );

        const [configPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("config")],
            program.programId
        );

        console.log(`📤 Unstaking ${amount} shares...`);

        await program.methods
            .unstakeShares(new anchor.BN(amount))
            .accounts({
                config: configPda,
                tree: treePda,
                treePosition: positionPda,
                owner: userPubkey,
                authorityStake: stakePda,
                systemProgram: anchor.web3.SystemProgram.programId,
            } as any)
            .rpc();

        alert("Unstaked successfully! Shares are now Liquid.");
        await refreshMarket();
    } catch (err: any) {
        console.error("Unstaking failed:", err);
        alert("Error: " + err.message);
    }
}

// Make sure to export it to the window
(window as any).unstakeShares = unstakeShares;
// Add the Cancel function to the window object
(window as any).cancelListing = async (listingPdaStr: string) => {
    try {
        const listingPda = new PublicKey(listingPdaStr);
        const listingAcc = await program.account.treeListing.fetch(listingPda);
        const [configPda] = getConfigPda();
        const [posPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("position"), program.provider.publicKey!.toBuffer(), listingAcc.tree.toBuffer()],
            program.programId
        );

        await program.methods.cancelListing().accounts({
            seller: program.provider.publicKey,
            config: configPda,
            treePosition: posPda,
            listing: listingPda,
        } as any).rpc();

        alert("Listing Cancelled. Shares returned to portfolio.");
        location.reload();
    } catch (err: any) { alert("Cancel failed: " + err.message); }
};

// 1. UPDATED WALLET DISPLAY LOGIC
export async function updateWalletUI() {
    const pubkey = program.provider.publicKey;

    if (pubkey) {
        const addr = pubkey.toBase58();
        const container = document.getElementById("wallet-container");
        const display = document.getElementById("wallet-display");
        const connectBtn = document.getElementById("connectBtn");

        if (container && display && connectBtn) {
            // Unhide the address box and hide the connect button
            container.style.display = "flex";
            connectBtn.style.display = "none";

            // Show shortened address (e.g., "Ga5S...Z77")
            display.innerText = `${addr.slice(0, 4)}...${addr.slice(-4)}`;

            // Store the full address for the copy function
            container.dataset.fullAddress = addr;
        }
    }
}
// Ticker + DAO feed
function updateTickerPrices() {
    const solPrice = (110 + Math.random() * 5).toFixed(2);
    const olvPrice = "0.82";
    const oilPrice = (4.50 + Math.random() * 0.5).toFixed(2);

    const elements = {
        'tick-sol': `$${solPrice}`,
        'tick-olv': `$${olvPrice}`,
        'tick-oil': `$${oilPrice}`,
        'tick-co2': `$83.65`,
        'tick-usdc': `$1.00`
    };

    Object.entries(elements).forEach(([id, value]) => {
        const el = document.getElementById(id);
        const elCopy = document.getElementById(`${id}-copy`);
        if (el) el.innerText = value;
        if (elCopy) elCopy.innerText = value;
    });

    const feed = document.getElementById('dynamic-feed');
    if (feed) {
        const events = [
            "DAO AUTHORITY VERIFIED",
            "MARKET LIQUIDITY STABLE",
            "NEW HARVEST REPORTED",
            "GENESIS PLANTING ACTIVE [2026-02-07]"
        ];
        feed.style.opacity = "0";
        setTimeout(() => {
            feed.innerText = events[Math.floor(Math.random() * events.length)];
            feed.style.opacity = "1";
        }, 500);
    }
}

// Start ticker cycle
setInterval(updateTickerPrices, 5000);
updateTickerPrices();

// Unblur main content when wallet is connected
function showMainContent() {
    const main = document.getElementById('main-content');
    if (main) {
        main.classList.remove('opacity-10', 'pointer-events-none', 'blur-sm');
        main.classList.add('opacity-100');
    }
}
// Critical: Attach to window so other files can call it
(window as any).updateWalletUI = updateWalletUI;
// 2. COPY TO CLIPBOARD FUNCTION
window.copyAddress = async () => {
    const fullAddress = document.getElementById("wallet-container")!.dataset.fullAddress;
    if (fullAddress) {
        await navigator.clipboard.writeText(fullAddress);

        // Show Toast
        const toast = document.getElementById("copy-toast")!;
        toast.style.display = "block";
        setTimeout(() => { toast.style.display = "none"; }, 2000);
    }
};

// --- Add this to your page refresh/load logic ---
// program.provider.connection.on('connect', () => { updateWalletUI(); refreshMarket(); });
// Initialization
(window as any).buyShares = buyShares;
(window as any).claimRevenue = claimRevenue;

(window as any).openSellModal = (pda: string) => {
    (document.getElementById("modalTreePda") as HTMLInputElement).value = pda;
    document.getElementById("sellModal")!.style.display = 'block';
};
(window as any).executeListing = executeListing;

document.getElementById("connectBtn")!.onclick = async () => {
    await connectWallet();
    await refreshMarket();
};
// Add this to the bottom of market.ts
window.addEventListener('load', async () => {
    const wallet = (window as any).solana;

    // Check if Phantom is already connected from a previous session
    if (wallet && wallet.isPhantom) {
        try {
            // 'onlyIfTrusted' reconnects without showing the popup again
            await wallet.connect({ onlyIfTrusted: true });

            // Re-run the connection setup
            const { initConnection } = await import("./connection");
            await initConnection();

            // Refresh the UI
            (window as any).updateWalletUI();
            (window as any).refreshMarket();

            console.log("Auto-reconnected successfully.");
        } catch (err) {
            console.log("User must connect manually.");
        }
    }
});

(window as any).anchor = anchor; // This will help with debugging web3 stuff
