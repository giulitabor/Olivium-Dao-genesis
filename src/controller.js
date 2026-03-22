import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";
import idl from "./idl.json";

// Config matches lib.rs and previous setup
const PROGRAM_ID = new PublicKey("8MdiqqhZj1badeLArqCmZWeiWGK8tXQWiydRLcqzDn45"); //
const connection = new Connection(clusterApiUrl("devnet"), "confirmed");

let provider: anchor.AnchorProvider;
let program: anchor.Program;

// --- INITIALIZATION ---
window.connectWallet = async () => {
    const solana = (window as any).solana;
    if (!solana) return alert("Wallet not found!");

    try {
        const resp = await solana.connect();
        provider = new anchor.AnchorProvider(connection, solana, { preflightCommitment: "confirmed" });
        program = new anchor.Program(idl as any, PROGRAM_ID, provider);

        document.getElementById('connect')!.innerText = "CONNECTED";
        document.getElementById('gov-gate')?.classList.add('hidden'); // Unlock UI
        refreshAllData();
    } catch (err) {
        console.error("Connection failed", err);
    }
};

// --- GOVERNANCE: VOTE ---
// Triggers the 'vote' instruction in lib.rs
window.castVote = async (proposalPubKey: string, support: boolean) => {
    const proposal = new PublicKey(proposalPubKey);
    const [stakeAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from("stake_account"), provider.wallet.publicKey.toBuffer()],
        PROGRAM_ID
    );

    try {
        await program.methods.vote(support).accounts({
            proposal: proposal,
            stakeAccount: stakeAccount,
            user: provider.wallet.publicKey,
            // voteRecord is usually a PDA based on user + proposal
        }).rpc();
        alert("Vote recorded on-chain.");
        refreshAllData();
    } catch (err: any) {
        alert("Voting failed: " + err.message);
    }
};

// --- ORCHARD: FETCH TREES ---
// Fetches tree_account data defined in lib.rs
async function refreshAllData() {
    // 1. Fetch Proposals
    const proposals = await program.account.proposal.all();
    const pContainer = document.getElementById('proposal-list')!;
    pContainer.innerHTML = proposals.map(p => `
        <div class="glass p-6 rounded-2xl border border-white/10">
            <h3 class="font-black uppercase text-sm mb-2">${p.account.description}</h3>
            <p class="text-xs text-gray-500">Payout: ${p.account.payout.toNumber() / LAMPORTS_PER_SOL} SOL</p>
            <div class="flex gap-4 mt-4">
                <button onclick="castVote('${p.publicKey.toBase58()}', true)" class="bg-green-500/20 text-green-400 px-4 py-2 rounded-lg text-[10px] font-bold">YES</button>
                <button onclick="castVote('${p.publicKey.toBase58()}', false)" class="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg text-[10px] font-bold">NO</button>
            </div>
        </div>
    `).join('');

    // 2. Fetch Trees
    const trees = await program.account.treeAccount.all();
    const tGrid = document.getElementById('tree-grid')!;
    tGrid.innerHTML = trees.map(t => `
        <div class="glass p-6 rounded-3xl">
            <h4 class="font-black uppercase">${t.account.treeId}</h4>
            <p class="text-[10px] text-gray-500">${t.account.cultivar} | Planted: ${t.account.plantingYear}</p>
            <p class="mt-4 text-green-400 font-mono text-sm">${t.account.totalCo2}kg CO2 Offset</p>
        </div>
    `).join('');
}

// --- NAVIGATION ---
window.showView = (viewId: string) => {
    ['home', 'orchard', 'governance'].forEach(v => {
        document.getElementById(`view-${v}`)?.classList.add('hidden');
    });
    document.getElementById(`view-${viewId}`)?.classList.remove('hidden');
};
