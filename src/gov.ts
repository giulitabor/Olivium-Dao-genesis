import './polyfill';


import { program, connectWallet } from "./connection";
import { PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { Buffer } from "buffer"; // <--- DO NOT LEAVE THIS OUT
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getAssociatedTokenAddress } from "@solana/spl-token";

const OLV_MINT = new PublicKey("DYmefEbHQXyQfGQDCKQfVwuR4ZvjXSkVv3N76NEJHaKa");

if (typeof window !== 'undefined') {
    window.Buffer = Buffer;
}
// --- 1. UI RENDERING ---
let allProposals: any[] = [];
let userStake: any = null;
let userVoteRecords: string[] = []; // Fixes the ReferenceError
let currentFilter: 'active' | 'history' = 'active';

function updateTabStyles() {

    const activeBtn = document.getElementById('tab-active');
    const historyBtn = document.getElementById('tab-history');

    if (currentFilter === 'active') {
        activeBtn?.classList.add('border-green-500', 'text-white');
        activeBtn?.classList.remove('text-gray-500');
        historyBtn?.classList.remove('border-green-500', 'text-white');
        historyBtn?.classList.add('text-gray-500');
    } else {
        historyBtn?.classList.add('border-green-500', 'text-white');
        historyBtn?.classList.remove('text-gray-500');
        activeBtn?.classList.remove('border-green-500', 'text-white');
        activeBtn?.classList.add('text-gray-500');
    }
}
// Attach listeners
document.getElementById('tab-active')?.addEventListener('click', () => {
    currentFilter = 'active';
    updateTabStyles('active'); // Update visuals
    renderProposals(allProposals, userStake, 'active');
});

document.getElementById('tab-history')?.addEventListener('click', () => {
    currentFilter = 'history';
    updateTabStyles('history'); // Update visuals
    renderProposals(allProposals, userStake, 'history');
});
let currentPage = 0;
const ITEMS_PER_PAGE = 10;

function renderProposals(proposals: any[], userStake: any, filterType: 'active' | 'history') {
    const listContainer = document.getElementById("proposal-list");
    if (!listContainer) return;

    const now = Math.floor(Date.now() / 1000);

    const filtered = proposals.filter(p => {
        const data = p.account;
        const isActive = data.endTs.toNumber() > now && !data.executed;
        return filterType === 'active' ? isActive : !isActive;
    });

    // Pagination slice
    const paginated = filtered.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);

    if (filtered.length === 0) {
        listContainer.innerHTML = `<div class="glass p-8 text-center text-gray-500">No proposals found.</div>`;
        return;
    }

    // Logic: Compare current proposal ID to the ID stored in userStake (if it exists)
    const votedId = userStake?.votedProposalId?.toNumber();

    listContainer.innerHTML = paginated.map(p => {
        const data = p.account;
        const proposalBase58 = p.publicKey.toBase58();
        const solAmount = data.payoutAmount ? (data.payoutAmount.toNumber() / 1e9).toFixed(2) : "0.00";
        const timeLeft = data.endTs.toNumber() - now;
        const timeDisplay = timeLeft > 0
            ? `${Math.floor(timeLeft / 86400)}d ${Math.floor((timeLeft % 86400) / 3600)}h`
            : "Expired";

        // Check if this specific proposal was voted on
        const hasVotedOnThis = userVoteRecords.includes(proposalBase58);

        const voteControls = filterType === 'history'
            ? `<div class="mt-6 p-4 rounded-xl bg-white/5 text-center text-[10px] text-gray-500 uppercase">Voting Ended</div>`
            : (hasVotedOnThis
                ? `<div class="mt-6 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-center">
                     <p class="text-[10px] font-bold text-yellow-500 uppercase">Vote Cast</p>
                   </div>`
                : `<div class="flex gap-4 mt-6">
                     <button onclick="window.castVote('${p.publicKey.toBase58()}', true)" class="flex-1 py-3 bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl font-black text-[10px] uppercase hover:bg-green-500 hover:text-black transition">Vote Yes</button>
                     <button onclick="window.castVote('${p.publicKey.toBase58()}', false)" class="flex-1 py-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl font-black text-[10px] uppercase hover:bg-red-500 hover:text-black transition">Vote No</button>
                   </div>`);

        return `
            <div class="glass p-6 rounded-[2rem] border border-white/5 mb-4">
                <div class="flex justify-between items-start">
                    <div>
                        <h3 class="text-xl font-black uppercase text-white">${data.description}</h3>
                        <p class="text-[10px] text-gray-500 mt-1 uppercase tracking-widest">
                            ID: ${data.id.toString()} | Time Left: ${timeDisplay}
                        </p>
                    </div>
                    <div class="text-right">
                        <p class="text-[9px] text-gray-500 uppercase">Payout</p>
                        <p class="text-md font-bold text-green-400">${solAmount} SOL</p>
                    </div>
                </div>
                ${voteControls}
            </div>
        `;
    }).join('') + (filtered.length > (currentPage + 1) * ITEMS_PER_PAGE ? `
        <button onclick="loadMore()" class="w-full py-4 bg-white/5 rounded-xl text-[10px] font-bold uppercase hover:bg-white/10">
            Load Next 10 Proposals
        </button>` : "");
}
(window as any).loadMore = () => {
    currentPage++;
    renderProposals(allProposals, userStake, currentFilter);
};
export async function refreshGovernance() {
    if (!program?.provider?.publicKey) return;

    const walletPubKey = program.provider.publicKey;

    // 1️⃣ Update wallet button display
    const btn = document.getElementById("btn-connect");
    if (btn) btn.innerText = walletPubKey.toBase58().slice(0, 4) + "..." + walletPubKey.toBase58().slice(-4);

    // 2️⃣ Initialize trackers
    let totalStakedOlv = 0;
    let totalStakedShares = 0;
    let liquidTreeShares = 0;
    let olvTokenBalance = "0";

    try {
        // --- A. Fetch Liquid OLV Token Balance ---
        try {
            const userAta = getAssociatedTokenAddressSync(OLV_MINT, walletPubKey);
            const bal = await program.provider.connection.getTokenAccountBalance(userAta);
            olvTokenBalance = bal.value.uiAmountString || "0";
        } catch (e) {
            console.log("No liquid OLV token account found.");
            olvTokenBalance = "0";
        }

        // --- B. Fetch Staked OLV from StakeAccount ---
        try {
            const [stakePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("stake"), walletPubKey.toBuffer()],
                program.programId
            );
            const stakeAccount = await program.account.stakeAccount.fetchNullable(stakePda);
            totalStakedOlv = (stakeAccount?.amount?.toNumber() || 0) / 1_000_000_000;
        } catch (e) {
            console.log("No StakeAccount found for this user.");
            totalStakedOlv = 0;
        }

        // --- C. Fetch Tree Positions (Shares) ---
        try {
            const positions = await program.account.treePosition.all([
                { memcmp: { offset: 8, bytes: walletPubKey.toBase58() } }
            ]);

            positions.forEach(p => {
                liquidTreeShares += p.account.shares.toNumber();
                totalStakedShares += p.account.lockedShares?.toNumber() || 0;
            });
        } catch (e) {
            console.log("No tree positions found.");
            liquidTreeShares = 0;
            totalStakedShares = 0;
        }

        // --- D. Fetch Proposals & User Votes ---
        try {
            allProposals = await program.account.proposal.all();
            const records = await program.account.voteRecord.all([
                { memcmp: { offset: 8, bytes: walletPubKey.toBase58() } }
            ]);
            userVoteRecords = records.map(r => r.account.proposal.toBase58());
        } catch (e) {
            console.log("No proposals or votes found yet.");
            allProposals = [];
            userVoteRecords = [];
        }

        // --- E. Update HTML Elements ---
        const setText = (id: string, value: string | number) => {
            const el = document.getElementById(id);
            if (el) el.innerText = typeof value === "number" ? value.toLocaleString() : value;
        };

        setText("display-olv", parseFloat(olvTokenBalance));
        setText("display-olv2", parseFloat(olvTokenBalance));
        setText("staked-olv-display", totalStakedOlv);
        setText("staked-shares-display", totalStakedShares);
        setText("user-staked-display", totalStakedOlv + totalStakedShares);
        setText("tree-shares-display", liquidTreeShares); // optional if you add this element

        // --- F. Render Proposals ---
        renderProposals(allProposals, userVoteRecords, currentFilter);

    } catch (err) {
        console.error("Governance refresh failed:", err);
    }
}
// --- 1. BALANCE & DATA REFRESH ---
async function updateWalletBalances() {
    if (!program?.provider?.publicKey) return;
    const user = program.provider.publicKey;

    // 1. Fetch SOL Balance
    const solBalance = await program.provider.connection.getBalance(user);
    const solDisplay = (solBalance / 1e9).toFixed(3);
    const solEl = document.getElementById("display-sol");
    if (solEl) solEl.innerText = solDisplay;

    // 2. Fetch OLV Token Balance (Rule [2026-01-10]: Field and Tree lists)
    try {
        const userAta = getAssociatedTokenAddressSync(OLV_MINT, user);
        const tokenInfo = await program.provider.connection.getTokenAccountBalance(userAta);
        const olvAmount = tokenInfo.value.uiAmountString || "0";

        const olvEl = document.getElementById("display-olv");
        if (olvEl) olvEl.innerText = parseFloat(olvAmount).toLocaleString();

        // Rule [2026-02-07]: If 0 OLV, trigger Buy Modal to fund Treasury
        if (parseFloat(olvAmount) <= 0) {
            showBuyModal();
        }
    } catch (e) {
        console.log("OLV Account not found. User needs to buy.");
        const olvEl = document.getElementById("display-olv");
        if (olvEl) olvEl.innerText = "0";
        showBuyModal();
    }
}

// --- 2. MODIFIED CONNECT ---
(window as any).connect = async () => {
    try {
        await connectWallet();

        // Update Address UI
        const user = program.provider.publicKey;
        const btn = document.getElementById("btn-connect");
        if (btn) btn.innerText = user.toBase58().slice(0, 4) + "..." + user.toBase58().slice(-4);

        // Core Refresh Sequence
        await updateWalletBalances(); // Get money first
        await refreshGovernance();   // Get proposals second

        console.log("DAO Interface Ready.");
    } catch (err) {
        console.error("Wallet connection failed", err);
    }
};

// --- Helper for the Modal ---
function showBuyModal() {
    const modal = document.getElementById("buyModal");
    if (modal) modal.classList.remove("hidden");
}

// Ensure you keep your existing renderProposals and refreshGovernance functions below this...

(window as any).createProposal = async () => {
    try {
        const desc = (document.getElementById("prop-desc") as HTMLInputElement).value;
        const pay = parseFloat((document.getElementById("prop-payout") as HTMLInputElement).value);
        const days = parseInt((document.getElementById("prop-days") as HTMLInputElement).value);

        if (!desc || isNaN(pay)) return alert("Fill in description and payout");

        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
        const config = await program.account.globalConfig.fetch(configPda);

        // --- FIXED SEED LOGIC ---
        // Instead of toArrayLike, we use toBuffer which is more stable in Anchor/Vite
        // and ensure it is exactly 8 bytes for a u64
        const idBuffer = config.proposalCount.toBuffer('le', 8);

        const [proposalPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("proposal"), idBuffer],
            program.programId
        );

        console.log("Creating Proposal PDA:", proposalPda.toBase58());

        await program.methods.createProposal(
            desc,
            new anchor.BN(pay * 1e9),
            new anchor.BN(days)
        )
        .accounts({
            config: configPda,
            proposal: proposalPda,
            proposer: program.provider.publicKey!,
            systemProgram: anchor.web3.SystemProgram.programId,
        } as any).rpc();

        alert("Proposal successfully created!");
        refreshGovernance();
    } catch (e: any) {
        console.error("Full Error:", e);
        alert("Error: " + e.message);
    }
};


(window as any).stakeOlvTokens = async () => {
    const amountInput = document.getElementById("stakeAmount") as HTMLInputElement;
    const amount = parseFloat(amountInput.value);

    if (isNaN(amount) || amount <= 0) {
        alert("Please enter a valid amount.");
        return;
    }

    try {
        const user = program.provider.wallet.publicKey;

        // 1. Derive PDAs
        const [stakePda] = PublicKey.findProgramAddressSync(
            [Buffer.from("stake"), user.toBuffer()],
            program.programId
        );
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
        // 1. Get the PDA (the authority)
const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("olv_vault")],
    program.programId
);

// 2. Derive the ATA of that PDA
const vaultAta = await getAssociatedTokenAddress(
    OLV_MINT, // The mint address
    vaultPda,         // The authority
    true              // allowOwnerOffCurve = true (required for PDAs)
);
const userAta = getAssociatedTokenAddressSync(OLV_MINT, user);

        console.log("Staking...",amount);
        console.log("Expected Vault ATA:", vaultAta.toBase58());

        // 3. The RPC Call
        // Make sure the key in .accounts matches exactly what your Rust code expects
        await program.methods
            .stakeOlv(new anchor.BN(amount * 1_000_000_000))
            .accounts({
                user: user,
                config: configPda,
                stakeAccount: stakePda,
                userTokenAccount: userAta,
                daoOlvVault: vaultAta, // <--- Fixed: Used the defined variable
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();

        alert("Stake Successful! Your voting power is active.");
        await refreshGovernance();
    } catch (err) {
        console.error("Staking failed:", err);
        // Try to extract a human-readable message
    const msg = err.msg || err.message || "Unknown error";
    alert("Staking failed: " + msg);
        alert("Staking failed. Check console for details.");
    }
};
async function updateOlvBalance(walletAddress: PublicKey) {
    const balanceElement = document.getElementById("olvBalanceDisplay");

    try {
        // 1. Derive the ATA address for this specific user
        const userAta = getAssociatedTokenAddressSync(OLV_MINT, walletAddress);

        // 2. Fetch the balance from the blockchain
        const tokenAccountInfo = await provider.connection.getTokenAccountBalance(userAta);

        // 3. Update the UI with the formatted amount
        if (tokenAccountInfo && tokenAccountInfo.value) {
            const amount = tokenAccountInfo.value.uiAmountString || "0.00";
            balanceElement.innerText = `${amount} OLV`;

            // If they have 0, prompt them to buy (Rule [2026-02-07] funding)
            if (parseFloat(amount) === 0) {
                console.log("User has 0 OLV. Showing purchase modal.");
                showBuyModal();
            }
        }
    } catch (err) {
        // If the account doesn't exist, it throws an error. We handle it gracefully.
        console.log("OLV Token Account not found. User has 0 balance.");
        balanceElement.innerText = "0.00 OLV";
        showBuyModal(); // Prompt to create account via buying
    }
}
async function checkOlvAndStake() {
    const userAta = getAssociatedTokenAddressSync(OLV_MINT, provider.wallet.publicKey);

    try {
        const accountInfo = await provider.connection.getAccountInfo(userAta);

        if (!accountInfo) {
            // SHOW MODAL: "You don't have OLV. Buy some now?"
            showBuyModal();
            return;
        }

        const balance = await provider.connection.getTokenAccountBalance(userAta);
        if (parseFloat(balance.value.amount) === 0) {
            showBuyModal();
            return;
        }

        // If they have OLV, proceed to stake
        stakeOlvTokens();
    } catch (e) {
        showBuyModal();
    }
}

async function executeBuyOlv(solAmount: number) {
    const lamports = new anchor.BN(solAmount * 1_000_000_000);

    try {
        await program.methods
            .buyOlv(lamports)
            .accounts({
                user: provider.wallet.publicKey,
                treasury: treasuryPda, // Get this from your config
                userAta: userAta,
                olvMint: OLV_MINT,
                daoOlvVault: vaultPda,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();

        alert("Success! OLV purchased and ATA created.");
        closeModal();
    } catch (err) {
        console.error("Purchase failed", err);
    }
}
(window as any).castVote = async (proposalPdaStr: string, side: boolean) => {
    try {
        const proposalPda = new PublicKey(proposalPdaStr);
        const user = program.provider.publicKey!;

        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
        const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), user.toBuffer()], program.programId);

        // Rule [2026-01-16]: Prevent double voting via VoteRecord PDA
        const [voteRecord] = PublicKey.findProgramAddressSync(
            [Buffer.from("vote"), proposalPda.toBuffer(), user.toBuffer()],
            program.programId
        );

        await program.methods.castVote(side).accounts({
            config: configPda,
            proposal: proposalPda,
            authorityStake: stakePda,
            voteRecord: voteRecord,
            authority: user,
            systemProgram: anchor.web3.SystemProgram.programId,
        } as any).rpc();

        alert("Vote Cast! Your staked OLV has been counted.");
        refreshGovernance();
    } catch (e: any) {
        console.error(e);
        alert("Voting failed: " + (e.message.includes("already in use") ? "You already voted!" : e.message));
    }
};

// --- 4. STARTUP ---
window.addEventListener('load', () => {
    // Attempt auto-connect if wallet is already linked
    if ((window as any).solana?.isConnected) {
        refreshGovernance();
    }
});
