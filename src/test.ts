import * as anchor from "@coral-xyz/anchor";
import { createClient } from '@supabase/supabase-js';

// 1. Setup Supabase & Constants
const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY);
const PROGRAM_ID = new anchor.web3.PublicKey("6HjkwwiKSkr8YCtR9HchVZQ97CmjbBbrW2SeE2U8T6rj");

let localTrees: any[] = [];
let localFields: any[] = [];

/**
 * Audit-Ready Registry Loader
 */
window.loadRegistry = async () => {
    // Fetch from Supabase (Source of truth for metadata)
    const { data: treeData } = await supabase.from('trees').select('*').order('tree_id', { ascending: true });
    const { data: fieldData } = await supabase.from('fields').select('*');

    localTrees = treeData || [];
    localFields = fieldData || [];

    renderTable();
};

/**
 * The "Planting" Engine (Solana + Supabase Sync)
 */
window.plantTree = async (treeId: string) => {
    const program = getProgram();
    const wallet = (window as any).solana;

    try {
        const tree = localTrees.find(t => t.tree_id === treeId);
        const field = localFields.find(f => f.field_id === tree.field_id);

        console.log(`📡 Launching plant sequence for ${treeId}...`);

        // PDAs with correct alignment [cite: 2026-02-07]
        const [configPda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
        const [fPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("field"), wallet.publicKey.toBuffer(), Buffer.from(tree.field_id)],
            PROGRAM_ID
        );
        const [tPda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("tree"), fPda.toBuffer(), Buffer.from(treeId)],
            PROGRAM_ID
        );
        const [stakePda] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("stake"), wallet.publicKey.toBuffer()],
            PROGRAM_ID
        );

        // Pre-flight: Ensure Admin Stake is initialized (Solves 3004 serialization issues)
        const stakeInfo = await program.provider.connection.getAccountInfo(stakePda);
        if (!stakeInfo) {
            console.log("🚧 Admin Stake required. Initializing...");
            await program.methods.initializeStake().accounts({
                authorityStake: stakePda,
                authority: wallet.publicKey,
                systemProgram: anchor.web3.SystemProgram.id
            }).rpc();
        }

        // Execute On-Chain Planting
        const tx = await program.methods.addTreeToField(
            treeId,
            tree.variety,
            Math.floor(field.gps_lat * 1000000), // Scale GPS
            Math.floor(field.gps_long * 1000000),
            2026
        ).accounts({
            tree: tPda,
            field: fPda,
            config: configPda,
            authority: wallet.publicKey,
            authorityStake: stakePda, // Admin Bypass [cite: 2026-02-07]
            systemProgram: anchor.web3.SystemProgram.id
        }).rpc();

        // Sync back to Supabase
        await supabase.from('trees').update({
            status: 'PLANTED',
            on_chain_address: tPda.toBase58(),
            last_sync_tx: tx
        }).eq('tree_id', treeId);

        console.log(`✨ Success! Tree ${treeId} is now live.`);
        window.loadRegistry();

    } catch (err) {
        console.error("❌ Transaction Failed:", err);
        alert(`Audit Failure: ${err.message}`);
    }
};

/**
 * UI Rendering Logic
 */
const renderTable = () => {
    const tbody = document.getElementById('registry-body');
    const search = (document.getElementById('tree-search') as HTMLInputElement).value.toLowerCase();

    const filtered = localTrees.filter(t =>
        t.tree_id.toLowerCase().includes(search) ||
        t.variety.toLowerCase().includes(search)
    );

    tbody.innerHTML = filtered.map(t => `
        <tr class="hover:bg-zinc-900/80 transition-colors group">
            <td class="p-4 font-bold text-emerald-500 font-mono">${t.tree_id}</td>
            <td class="text-zinc-500">${t.field_id}</td>
            <td class="text-zinc-300">${t.variety}</td>
            <td>
                <span class="px-2 py-0.5 rounded text-[10px] ${t.status === 'PLANTED' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-zinc-800 text-zinc-500'}">
                    ${t.status || 'READY'}
                </span>
            </td>
            <td class="p-4 space-x-3">
                <button onclick="window.openAuditModal('${t.tree_id}')" class="text-zinc-500 hover:text-white underline text-xs">VIEW</button>
                ${t.status !== 'PLANTED' ?
                    `<button onclick="window.plantTree('${t.tree_id}')" class="bg-emerald-600/10 text-emerald-500 px-3 py-1 rounded text-xs font-bold hover:bg-emerald-600 hover:text-black">PLANT</button>` :
                    `<span class="text-zinc-700 italic text-xs">ON-CHAIN</span>`}
            </td>
        </tr>
    `).join('');
};

window.openAuditModal = (treeId: string) => {
    const tree = localTrees.find(t => t.tree_id === treeId);
    const modal = document.getElementById('audit-modal');
    const body = document.getElementById('modal-body');

    body.innerHTML = `
        <div class="p-8 space-y-6">
            <div class="flex justify-between items-start">
                <div>
                    <h2 class="text-3xl font-black text-white">${tree.tree_id}</h2>
                    <p class="text-emerald-500 font-bold uppercase tracking-widest text-xs">${tree.variety} • ${tree.field_id}</p>
                </div>
                <div class="text-right">
                    <p class="text-zinc-500 text-[10px]">SUPABASE_UID</p>
                    <p class="text-zinc-300 font-mono text-xs">${tree.id}</p>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div class="p-4 rounded-xl bg-black/40 border border-zinc-800">
                    <h4 class="text-zinc-600 text-[10px] font-bold uppercase mb-2">Physical Specs</h4>
                    <p class="text-sm">Health: <span class="text-emerald-400">${tree.physical.health_score * 100}%</span></p>
                    <p class="text-sm">Height: ${tree.physical.tree_height_cm}cm</p>
                </div>
                <div class="p-4 rounded-xl bg-black/40 border border-zinc-800">
                    <h4 class="text-zinc-600 text-[10px] font-bold uppercase mb-2">Economics</h4>
                    <p class="text-sm">Estimated ROI: ${tree.economics.estimated_roi_percent}%</p>
                    <p class="text-sm">Field Share: ${tree.field_id === 'FIELD_01' ? '1/250' : '1/3000'}</p>
                </div>
            </div>

            <div class="p-4 rounded-xl bg-emerald-950/10 border border-emerald-500/20">
                <h4 class="text-emerald-500 text-[10px] font-bold uppercase mb-2">Blockchain Audit Trail</h4>
                <p class="text-[10px] font-mono break-all text-zinc-400">PDA: ${t.on_chain_address || 'UNINITIALIZED'}</p>
                <p class="text-[10px] font-mono break-all text-zinc-400 mt-1">LAST_TX: ${t.last_sync_tx || 'N/A'}</p>
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
};

window.closeModal = () => document.getElementById('audit-modal').classList.add('hidden');

// Initialize
window.loadRegistry();
document.getElementById('tree-search').oninput = renderTable;
