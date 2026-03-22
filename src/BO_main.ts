/* BO_main.ts - High-Fidelity Schema Sync [2026-02-09] */
import './polyfill';
import { Connection, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";

const ADMIN_WALLET = "8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54";
const solConn = new Connection(clusterApiUrl("devnet"), "confirmed");
const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

(window as any).initSecureSession = async () => {
    const wallet = (window as any).solana;
    if (!wallet) return alert("Phantom Required");
    try {
        const resp = await wallet.connect();
        const userAddress = resp.publicKey.toString();
        const isAdmin = userAddress === ADMIN_WALLET;

        if (!isAdmin) {
            const { data: profile } = await sb.from('tree_ownership').select('*').eq('wallet_address', userAddress).maybeSingle();
            if (profile && (profile as any).has_voted) return alert("ACCESS DENIED [2026-01-16]");
        }

        document.getElementById('admin-gate')?.classList.add('hidden');
        document.getElementById('admin-dashboard')?.classList.remove('hidden');
        await (window as any).handleAdminLogin();
    } catch (err) { console.error(err); }
};

(window as any).handleAdminLogin = async () => {
    const explorer = document.getElementById('schema-explorer-results');
    if (explorer) explorer.innerHTML = '<div id="fields-anchor"></div><div id="trees-anchor"></div>';

    await Promise.all([
        (window as any).renderTable('fields', 'emerald-500', 'fields-anchor'),
        (window as any).renderTable('tree_metadata', 'amber-600', 'trees-anchor'),
        (window as any).updateVaultBalance()
    ]);
};
/**
 * [2026-02-27] GENESIS DB ALIGNMENT
 * Forces the first 3 trees to point to the active Field PDA.
 */
(window as any).syncGenesisToField = async () => {
    // The verified on-chain Field PDA from our successful Step 2
    const VALID_FIELD_PDA = "6Pp8SpTqPchHiq8kRZxfDjpWT8KxpRs2NSXhinVAGwmT";
    const GENESIS_IDS = ["F1-FR-001", "F1-FR-002", "F1-FR-003"]; //

    console.log("🔄 Aligning Genesis Metadata...");

    try {
        const { data, error } = await sb
            .from('tree_metadata')
            .update({ field_pda: VALID_FIELD_PDA })
            .in('tree_id', GENESIS_IDS);

        if (error) throw error;

        alert("Database Aligned: Genesis trees now point to verified Field PDA.");
        await (window as any).handleAdminLogin(); // Refresh the tables
    } catch (err: any) {
        console.error("Sync Failed:", err);
        alert("Sync Error: " + err.message);
    }
};

/**
 * SCHEMA-SYNCED RENDERER
 * Maps your specific column names (field_name, pda_address, etc.)
 */
(window as any).renderTable = async (tableName: string, accentColor: string, anchorId: string) => {
    const anchor = document.getElementById(anchorId);
    if (!anchor) return;

    try {
        const { data, error } = await sb.from(tableName).select('*');
        if (error) throw error;
        if (!data || data.length === 0) return;

        const headers = Object.keys(data[0]);
        // PRIMARY KEY DETECTION: Prefers 'field_id' or 'id'
        const pk = headers.find(h => h === 'field_id' || h === 'id' || h.includes('_id')) || headers[0];

        anchor.innerHTML = `
            <div class="glass p-6 rounded border-l-2 border-${accentColor} mb-8 animate-in fade-in overflow-hidden">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-[10px] font-black text-white uppercase tracking-widest italic">TABLE_RAW: ${tableName}</h3>
                    <div class="flex gap-2">
                        <span class="text-[8px] bg-white/5 px-2 py-1 rounded text-zinc-500 font-mono italic">PK: ${pk}</span>
                    </div>
                </div>
                <div class="overflow-x-auto custom-scroll">
                    <table class="w-full text-left text-[9px] font-mono border-separate border-spacing-x-2">
                        <thead class="text-zinc-500 uppercase border-b border-white/10">
                            <tr>
                                ${headers.map(h => `<th class="pb-3 whitespace-nowrap">${h.replace('_', ' ')}</th>`).join('')}
                                <th class="pb-3 text-right">CMD</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-white/5">
                            ${data.map((row: any) => `
                                <tr class="hover:bg-white/5 transition-all group">
                                    ${headers.map(key => {
                                        const isHighlight = ['field_name', 'tree_id', 'price_sol'].includes(key);
                                        return `
                                        <td class="py-3 whitespace-nowrap ${isHighlight ? 'text-white font-bold' : 'text-zinc-500'}">
                                            <span
                                                class="cursor-pointer border-b border-transparent hover:border-emerald-500/50 transition-all"
                                                onclick="window.makeEditable(this, '${tableName}', '${pk}', '${row[pk]}', '${key}')"
                                            >${row[key] ?? 'NULL'}</span>
                                        </td>`;
                                    }).join('')}
                                    <td class="text-right">
                                        <button onclick="window.deleteRecord('${tableName}', '${pk}', '${row[pk]}')"
                                            class="text-red-900 group-hover:text-red-500 font-bold transition-colors">PURGE</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
    } catch (err) { console.error(err); }
};

/**
 * INLINE EDITING ENGINE
 */
(window as any).makeEditable = (el: HTMLElement, table: string, pkName: string, pkValue: string, column: string) => {
    const originalValue = el.innerText === 'NULL' ? '' : el.innerText;
    const input = document.createElement('input');
    input.value = originalValue;
    input.className = "bg-zinc-900 text-emerald-400 border border-emerald-500/50 text-[9px] px-1 rounded outline-none w-full min-w-[60px]";

    input.onkeydown = async (e) => {
        if (e.key === 'Enter') {
            const newValue = input.value;
            el.innerText = "...";
            const { error } = await sb.from(table).update({ [column]: newValue }).eq(pkName, pkValue);

            if (error) {
                alert("Update Error: " + error.message);
                el.innerText = originalValue;
            } else {
                el.innerText = newValue;
            }
        }
        if (e.key === 'Escape') el.innerText = originalValue;
    };

    el.innerHTML = '';
    el.appendChild(input);
    input.focus();
};

(window as any).deleteRecord = async (table: string, pkName: string, pkValue: string) => {
    if (confirm(`CRITICAL: Purge record ${pkValue}? This cannot be undone.`)) {
        await sb.from(table).delete().eq(pkName, pkValue);
        await (window as any).handleAdminLogin();
    }
};

(window as any).updateVaultBalance = async () => {
    try {
        // Only fetch balance if we aren't already being rate-limited
        const bal = await solConn.getBalance(new PublicKey(ADMIN_WALLET));
        const el = document.getElementById('asset-sol');
        if (el) el.innerHTML = `${(bal / LAMPORTS_PER_SOL).toFixed(3)} SOL`;
    } catch (err: any) {
        if (err.message.includes('429')) {
            console.warn("RPC Rate limit hit. Standing down balance refresh.");
            const el = document.getElementById('asset-sol');
            if (el) el.innerHTML = "RATE_LIMITED";
        }
    }
};
window.addEventListener('load', () => {
    if ((window as any).solana?.isConnected) (window as any).initSecureSession();
});
