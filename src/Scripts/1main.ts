import './polyfill';

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL, Connection, clusterApiUrl } from "@solana/web3.js";
import {getAssociatedTokenAddress,createAssociatedTokenAccountInstruction,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,} from "@solana/spl-token";
import idl from "./olive_dao.json";

// --- CONFIG & SEEDS ---
const PROGRAM_ID = new PublicKey(idl.address);
const DAO_SEED = Buffer.from("dao");
const VAULT_SEED = Buffer.from("vault");
const STAKE_SEED = Buffer.from("stake");
const TREE_SEED = Buffer.from("tree");

const ADMIN_WALLET = "8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54";
const OLV_MINT = new PublicKey("6nab5Rttp45AfjaYrdwGxKuH9vK9RKCJdeaBvQJt8pLA");

import BN from "bn.js"; // if you use BN in blockchain calls
// other imports...

const API_BASE = "http://localhost:3000/api";

// Generate 248 trees programmatically for the example

async function fetchTrees() {
  const resp = await fetch("http://localhost:3000/api/trees");
  const trees = await resp.json();
  console.log("Fetched trees from DB:", trees);
  return trees;
}

// Initialize tree on chain
(window as any).initTreeOnChain = async (treeId: string) => {
  console.log(`🌳 [DEBUG] Initializing tree on-chain: ${treeId}`);

  try {
    const resp = await fetch(`${API_BASE}/trees/${treeId}`);
    if (!resp.ok) {
      console.error("❌ Tree not found in DB:", treeId);
      return;
    }

    const t = await resp.json();
    console.log("🌳 Tree data fetched:", t);

    const [treePDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("tree"), Buffer.from(treeId)],
      program.programId
    );

    const tx = await program.methods
      .initTree(
        treeId,
        new BN(t.total_co2),
        new BN(t.total_shares),
        t.plantingYear,
        t.cultivar,
        t.latitude,
        t.longitude
      )
      .accounts({
        treeAccount: treePDA,
        authority: wallet,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Tree initialized on-chain:", treeId, tx);
  } catch (err) {
    console.error("❌ Failed to init tree on-chain:", treeId, err);
  }
};

const connection = new Connection(clusterApiUrl("devnet"), "confirmed");
const tickerTrack = document.getElementById("tickerTrack") as HTMLDivElement;
// ----- TICKER STATE -----
const seen = new Set<string>();


const DEBUG_UI = true;


let program: Program;
let provider: anchor.AnchorProvider;

// --- USERTREE type
let walletPublicKey: string | null = null;

let portfolio = {
  sol: 0,
  olv: 0,
  tokens: [] as {
    mint: string;
    balance: number;
    symbol?: string;
  }[],
};

let userTrees: UserTree[] = [];

type UserTree = {
  id: string
  sharePct: number
}

type TreeNFT = {
  mint: string;
  amount: number;
};

pushTradeToTicker({
  type: "BUY",
  amount: 250,
  wallet: "3F5t…BPUv",
});

//---Helpers---//

function debugBadge(label: string, color = "gray") {
  if (!DEBUG_UI) return "";
  return `
    <span class="text-[9px] px-2 py-[2px] rounded bg-${color}-500/20 text-${color}-400 font-mono">
      ${label}
    </span>
  `;
}



// -----------------------------
// INIT 10 NEW TREES (F2-MO-0001 → F2-MO-0010)
// -----------------------------
// -----------------------------
// Batch Init Trees
// -----------------------------
(window as any).initNewTrees = async () => {
  try {
    const resp = await fetch(`${API_BASE}/trees`);
    const trees = await resp.json();
    const freshTrees = trees.slice(0, 10).map((t: any) => t.tree_id); // pick first 10

    console.log("🌱 Initializing 10 fresh trees:", freshTrees);

    for (const id of freshTrees) {
      await (window as any).initTreeOnChain(id);
    }
  } catch (err) {
    console.error("❌ Failed to batch init trees:", err);
  }
};

// 1. INITIALIZE & WALLET
(window as any).toggleWallet = async () => {
  try {
    const { solana } = window as any;
    if (!solana) return alert("Please install Phantom!");

    const response = await solana.connect();
    const walletAddress = response.publicKey.toString();

    // ✅ SET PROVIDER FIRST
    provider = new anchor.AnchorProvider(connection, solana, { commitment: "confirmed" });
    program = new Program(idl as any, provider);

    walletPublicKey = walletAddress;

    document.getElementById("wallet-btn")!.innerText =
      walletAddress.slice(0,4) + "..." + walletAddress.slice(-4);

    updateAdminVisibility(walletAddress);

    // ✅ SINGLE ENTRY POINT
    await onWalletConnected();

    (window as any).syncGlobalStats();
  } catch (err) {
    console.error("Wallet connection failed:", err);
  }
};

// 2. STAKING (JOIN DAO)
(window as any).stakeTokens = async (amount: number) => {
    console.log(`🚀 [DEBUG] Staking ${amount} OLV...`);
    try {
        const [daoPDA] = PublicKey.findProgramAddressSync([DAO_SEED], PROGRAM_ID);
        const [stakePDA] = PublicKey.findProgramAddressSync([STAKE_SEED, provider.wallet.publicKey.toBuffer()], PROGRAM_ID);
        const [vaultPDA] = PublicKey.findProgramAddressSync([VAULT_SEED], PROGRAM_ID);

        const tx = await program.methods.stake(new anchor.BN(amount * 1e9))
            .accounts({
                dao: daoPDA,
                stakeAccount: stakePDA,
                vault: vaultPDA,
                user: provider.wallet.publicKey,
                systemProgram: SystemProgram.programId,
            })
            .rpc();
        console.log("💰 [DEBUG] Stake Success! TX:", tx);
    } catch (err) {
        console.error("❌ [DEBUG] Stake Error:", err);
    }
};

// 3. TREE MARKET (INIT & BUY)
(window as any).initTreeOnChain = async (treeId: string) => {
  // Initialize a single tree on chain from the database
  console.log(`🌳 [DEBUG] Starting init for tree: ${treeId}`);

  // Fetch tree from database
  const tree = db
    .prepare("SELECT * FROM trees WHERE tree_id = ?")
    .get(treeId);

  if (!tree) {
    console.error(`❌ [DEBUG] Tree not found in DB: ${treeId}`);
    return;
  }

  console.log(`🌿 [DEBUG] Tree data fetched from DB:`, tree);

  try {
    // Derive PDA
    const [treePDA, treeBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("tree"), Buffer.from(treeId)],
      program.programId
    );
    console.log("🔑 [DEBUG] Derived tree PDA:", treePDA.toBase58(), "bump:", treeBump);

    // Optional: generate a new mint if your chain logic requires it
    const treeMint = anchor.web3.Keypair.generate();
    console.log("💰 [DEBUG] Generated new tree mint:", treeMint.publicKey.toBase58());

    // Call Anchor initTree RPC
    const tx = await program.methods
      .initTree(
        treeId,
        new BN(tree.co2_kg_per_cycle * 1e6), // convert to integer for blockchain if needed
        new BN(tree.ownership_percentage),    // total shares placeholder
        tree.planting_year,
        tree.variety,
        Math.floor(tree.latitude * 1e6),
        Math.floor(tree.longitude * 1e6)
      )
      .accounts({
        treeAccount: treePDA,
        authority: wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✅ [DEBUG] Tree initialized on chain:", treeId, "TX:", tx);
  } catch (err) {
    console.error("❌ [DEBUG] Tree init failed:", treeId, err);
  }
}

(window as any).executeBuy = async (treeId: string, shares: number, btn?: HTMLButtonElement) => {
  // Inside executeBuy
  const originalText = btn ? btn.innerText : "Buy 1 Share";

        if (btn) {
            btn.disabled = true;
            btn.innerText = "Processing Transaction...";
        }

  const connection = provider.connection;
    try {
        const [treePDA] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("tree"), Buffer.from(treeId)],
            program.programId
        );
        const [vaultPDA] = anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("vault")],
          program.programId
        );

        const treeData: any = await program.account.treeAccount.fetch(treePDA);
        const userAta = await getAssociatedTokenAddress(treeData.mint, provider.wallet.publicKey);

        // 4. Check if the user's token account exists
        const accountInfo = await connection.getAccountInfo(userAta);
        const transaction = new anchor.web3.Transaction();

        // 4a. If it doesn't exist, add the "Create ATA" instruction
        if (!accountInfo) {
            console.log("📦 Creating Associated Token Account for user...");
            transaction.add(
                createAssociatedTokenAccountInstruction(
                    provider.wallet.publicKey, // payer
                    userAta,                   // ata
                    provider.wallet.publicKey, // owner
                    treeData.mint              // mint
                )
            );
        }

        // 4b. Add the Buy instruction
        const buyInstruction = await program.methods
            .buyTreeShares(new anchor.BN(shares))
            .accounts({
                treeAccount: treePDA,
                treeMint: treeData.mint,
                userTokenAccount: userAta,
                buyer: provider.wallet.publicKey,
                vault: vaultPDA,
                tokenProgram: TOKEN_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.id,
            })
            .instruction();

        transaction.add(buyInstruction);

        // 4c. Send everything in one transaction
        const tx = await provider.sendAndConfirm(transaction);
        if (btn) btn.innerText = "Purchase Successful!";

        console.log("✅ Purchase Successful! TX:", tx);
        updateConsole(`Success! You now own ${shares} shares of ${treeId}.`);

        // PUSH TO TICKER IMMEDIATELY
        pushTradeToTicker({
          type: "BUY",
          wallet: walletPublicKey!,
          amount: shares,
        });


    } catch (err: any) {
        console.error("❌ Purchase Error:", err);
        updateConsole(`Error: ${err.message}`);
    }
    //--Reset Buttons and supdate UI
    if (btn) btn.innerText = "BUY SHARES";
    syncGlobalStats();
  //  syncGlobalStats();

};
// 5. SYNC DATA
// 1. Sync Global Stats (Treasury & CO2)
// -----------------------------
// Sync Global Stats
// -----------------------------
window.syncGlobalStats = async () => {
  try {
    if (!program || !connection) {
      console.warn("⏳ Program not ready yet, skipping stats sync");
      return;
    }

    console.log("🌱 Syncing global stats...");

    // 1️⃣ Fetch trees from backend
    const res = await fetch("http://localhost:3000/api/trees");
    const trees = await res.json();

    // 2️⃣ DAO vault PDA
    const [vaultPDA] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      program.programId
    );

    const vaultBalanceLamports = await connection.getBalance(vaultPDA);
    const vaultSol = vaultBalanceLamports / anchor.web3.LAMPORTS_PER_SOL;

    // Fetch vault balance (if needed)
    const vaultBalance = await provider.connection.getBalance(vaultPDA);
    document.getElementById("stat-vault")!.innerText = `${(vaultBalance / 1e9).toFixed(4)} SOL`;

    // 3️⃣ UI updates
    document.getElementById("stat-vault")!.innerText =
      `${vaultSol.toFixed(3)} SOL`;

    document.getElementById("stat-trees")!.innerText =
      `${trees.length} / 248`;

    console.log("📊 [DEBUG] Global stats updated successfully.");
  } catch (err) {
    console.error("❌ Failed to sync stats:", err);
  }
};


// 6. RENDER MARKET (Combined & Fixed)
// -----------------------------
// Render Trees
// -----------------------------
async function renderTrees(trees: any[]) {
  console.log("🌾 Rendering trees...", trees.length);
  const container = document.getElementById("tree-container")!;
  container.innerHTML = "";

  for (const t of trees) {
    try {
      const card = document.createElement("div");
      card.className = "bg-white/5 p-6 rounded-2xl border border-white/5";

      card.innerHTML = `
        <p class="text-[10px] text-gray-500 uppercase font-bold">${t.tree_id}</p>
        <h3 class="font-bold">${t.cultivar}</h3>
        <p>Total CO2: ${t.total_co2} kg</p>
        <p>Shares: ${t.total_shares}</p>
        <button onclick="initTreeOnChain('${t.tree_id}')" class="bg-green-600 px-4 py-2 rounded text-white mt-2">Init On-Chain</button>
      `;

      container.appendChild(card);
    } catch (err) {
      console.error("Error rendering tree:", t.tree_id, err);
    }
  }

  console.log("📊 Render Complete. Total trees processed:", trees.length);
}


//7.ADMIN CONSOLE LOGS
function updateConsole(msg: string) {
    const logDiv = document.getElementById("console-logs");
    if (logDiv) {
        const time = new Date().toLocaleTimeString();
        logDiv.innerHTML += `<div><span class="text-gray-500">[${time}]</span> ${msg}</div>`;
        logDiv.scrollTop = logDiv.scrollHeight; // Auto-scroll to bottom
    }
}


//8. LOAD TREEs

const select = document.getElementById("admin-tree-select");
//select.innerHTML = treeIds.map(id => `<option>${id}</option>`).join("");


//9. LIST ALL TREES
(window as any).listAllTrees = async () => {
    const allIds = Array.from({length: 248}, (_, i) => `F1-MO-${(i+1).toString().padStart(4, '0')}`);
    const liveTrees = (await program.account.treeAccount.all()).map(t => t.account.treeId);

    console.log("📊 TREE AUDIT:");
    allIds.forEach(id => {
        const status = liveTrees.includes(id) ? "✅ LIVE" : "❌ NOT INITIALIZED";
        console.log(`${id}: ${status}`);
    });
};

//10. Populate the dropdown with only non-initialized IDs
async function updateAdminDropdown() {
    const liveTrees = await program.account.treeAccount.all();
    const liveIds = liveTrees.map(t => t.account.tree_Id);
    console.log(liveTrees);
    const select = document.getElementById("admin-tree-select") as HTMLSelectElement;

    const allIds = Array.from({length: 248}, (_, i) => `F1-MO-${(i+1).toString().padStart(4, '0')}`);
    const missing = allIds.filter(id => !liveIds.includes(id));

    select.innerHTML = missing.map(id => `<option value="${id}">${id}</option>`).join('');
}

// Bulk Initialization Loop
(window as any).initAllMissing = async () => {
const allIds = Object.keys(TREE_DATABASE);
    const liveTrees = await program.account.treeAccount.all();
    const liveIds = liveTrees.map(t => t.account.treeId);
    const missing = allIds.filter(id => !liveIds.includes(id));

    const progress = document.getElementById("admin-progress")!;
    progress.classList.remove("hidden");

    for (const id of missing) {
          progress.innerText = `Processing ${id}... (${missing.indexOf(id) + 1}/${missing.length})`;
          try {
              await (window as any).initTreeOnChain(id);
              // Small delay to prevent RPC rate limiting
              await new Promise(r => setTimeout(r, 500));
          } catch (e) {
              updateConsole(`Stopped at ${id}. Check SOL balance.`);
              break;
          }
    }
    progress.innerText = "All missing trees initialized!";
    await (window as any).syncGlobalStats();
};

// Expose to window so the HTML 'onclick' can find it
(window as any).initSelectedTree = async () => {
    const select = document.getElementById("admin-tree-select") as HTMLSelectElement;
    const treeId = select.value;

    if (!treeId) {
        updateConsole("No tree selected.", "error");
        return;
    }

    try {
        updateConsole(`Initializing tree: ${treeId}...`, "info");
        // Call your existing function with default CO2 value
        await initTreeOnChain(treeId, 100);
        updateConsole("Tree initialized successfully!", "success");
    } catch (err) {
        updateConsole(`Failed: ${err}`, "error");
    }
};

//11. INITIALIZE_ALL_TREES_IN_FIELD
(window as any).initializeAllTreesInField = async () => {
    const allIds = Array.from({length: 248}, (_, i) => `F1-MO-${(i+1).toString().padStart(4, '0')}`);
    const liveTrees = await program.account.treeAccount.all();
    const existingIds = liveTrees.map(t => t.account.treeId);

    const missingIds = allIds.filter(id => !existingIds.includes(id));

    updateConsole(`🚀 Starting Bulk Init for ${missingIds.length} trees...`);

    for (const id of missingIds) {
        try {
            updateConsole(`Processing ${id}...`);
            await (window as any).initTreeOnChain(id); // Calls your existing init logic
            updateConsole(`✅ ${id} is now LIVE.`);
        } catch (err) {
            updateConsole(`🛑 Stopped at ${id}: Insufficient SOL or Timeout.`);
            break;
        }
    }
    await (window as any).syncGlobalStats();
};

/// -----TRADEEVENT -- TICKER ---
type TradeEvent = {
  type: "BUY" | "SELL"
  wallet: string
  amount: number
  treeId?: string
}

function getTicker() {
  return document.getElementById("trade-ticker");
}

function getTickerTrack() {
  return document.getElementById("ticker-track");
}

function shortWallet(pk: string) {
  return pk.slice(0, 4) + "…" + pk.slice(-4);
}

//function shortWallet(w: string) {
//  return `${w.slice(0, 4)}…${w.slice(-4)}`;
//}

function formatAmount(n: number) {
  return Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(n);
}


function pushTradeToTicker(t: TradeEvent) {
  if (!tickerTrack) return;
  const key = `${t.type}-${t.wallet}-${t.amount}`;
  if (seen.has(key)) return;
  seen.add(key);

  const el = document.createElement("div");
  el.className = `ticker-item ${t.type === "BUY" ? "ticker-buy" : "ticker-sell"} scale-up`;
  el.textContent = `${t.type} ${formatAmount(t.amount)} Fraction of ${t.treeId || "Olive Tree"} · ${shortWallet(t.wallet)}`;

tickerTrack.appendChild(el);

  void el.offsetWidth; // Force reflow
  el.classList.add("ticker-enter");

  while (tickerTrack.children.length > 50) {
    tickerTrack.removeChild(tickerTrack.firstChild as ChildNode);
  }
}

// show ticker only once wallet connected
function enableTicker() {
  const t = getTicker();
  if (t) t.classList.remove("hidden");
}


//--ADMIN----
function isAdmin(pubkey?: string) {
  return pubkey === ADMIN_WALLET;
}

function updateAdminVisibility(pubkey?: string) {
  document.querySelectorAll(".admin-only").forEach(el => {
    el.classList.toggle("hidden", !isAdmin(pubkey));
  });
}
// -----renderIf-----
function renderIf<T>(value: T | null | undefined, render: (v: T) => void) {
  if (value === null || value === undefined) return;
  render(value);
}


//12. RENDER USER TREES
function renderUserTrees(trees: UserTree[]) {
  if (!trees.length) return;

  const section = document.getElementById("user-trees")!;
  const list = document.getElementById("tree-list")!;
  section.classList.remove("hidden");
  list.innerHTML = "";

  trees.forEach(t => {
    const row = document.createElement("div");
    row.className = "hud-row";
    row.innerHTML = `
      <span class="label">Tree #${t.id}</span>
      <span class="value">${t.sharePct.toFixed(2)}%</span>
    `;
    list.appendChild(row);
  });
}
// 13. LOAD PORTFOLIO
async function loadPortfolio() {
  if (!provider || !provider.wallet?.publicKey) return;

  const connection = provider.connection;
  const wallet = provider.wallet.publicKey;
  walletPublicKey = wallet.toBase58();

  // -----------------------------
  // 1. SOL BALANCE
  // -----------------------------
  const solLamports = await connection.getBalance(wallet);
  const sol = solLamports / LAMPORTS_PER_SOL;

  // -----------------------------
  // 2. OLV TOKEN BALANCE
  // -----------------------------
  let olv = 0;
  try {
    // FIX: Define the variable BEFORE using it
    const userTokenAccount = await getAssociatedTokenAddress(OLV_MINT, wallet);

    // Fetch balance once and use uiAmount for easy display
    const info = await connection.getTokenAccountBalance(userTokenAccount);
    olv = info.value.uiAmount || 0;
  } catch (e) {
    console.log("User does not have an OLV account yet (no ATA found).");
    olv = 0;
  }

  // -----------------------------
  // 3. UPDATE PORTFOLIO STATE
  // -----------------------------
  portfolio.sol = sol;
  portfolio.olv = olv;
  portfolio.tokens = [
    {
      mint: OLV_MINT.toBase58(),
      balance: olv,
      symbol: "OLV",
    },
  ];

  // -----------------------------
  // 4. DERIVE USER TREES
  // -----------------------------
  userTrees = [];
  const trees = await program.account.treeAccount.all();

  for (const t of trees) {
    try {
      const ata = await getAssociatedTokenAddress(t.account.mint, wallet);
      const bal = await connection.getTokenAccountBalance(ata);

      // FIX: Remove / 1e9 because your Rust code uses raw integers (100,000)
    const owned = Number(bal.value.amount);
    if (owned === 0) continue;
    console.log("🌱 USER TREE DEBUG", {
      treeId: t.account.treeId,
      ownedRaw: bal.value.amount,
      owned,
    });


    // Math: (Your Shares / 100,000 Total Shares) * 100
    const pct = owned > 0 ? (owned / Math.max(1, t.account.totalShares.toNumber())) * 100 : 0;

    userTrees.push({
      id: t.account.tree_id, // Match the IDL field name
      sharePct: pct,
    });
      } catch {
        // user doesn't own this specific tree
      }
    }

  // -----------------------------
  // 5. UPDATE UI
  // -----------------------------
  updateWalletUI(walletPublicKey, sol, olv);

  if (userTrees.length > 0) {
    renderUserTrees(userTrees);
    renderPortfolioPercent(
      userTrees.reduce((s, t) => s + t.sharePct, 0),
      100
    );
  }

  hideIfEmpty("user-trees");
}

// UPDATE WALLET
function updateWalletUI(pubkey: string, sol: number, olv: number) {
  document.getElementById("wallet-short")!.innerText = shortWallet(pubkey);
  document.getElementById("balance-sol")!.innerText = sol.toFixed(3);
  document.getElementById("balance-olv")!.innerText = olv.toLocaleString();
}
// RENDER PORTFOLIO PERCENT
function renderPortfolioPercent(owned: number, total: number) {
  // const pct = total === 0 ? 0 : Math.round((owned / total) * 100);
    const pct = total === 0 ? (owned / Math.max(1, t.account.totalShares.toNumber())) * 100 : 0;

  const el = document.getElementById("portfolioChart");
  if (!el) return;

  el.innerHTML = `
    <div class="donut" style="--p:${pct}">
      <span>${pct}%</span>
    </div>
  `;
}

//------  HELPERS ------///
// Replace your existing helpers with these robust versions
function parseTradeLog(log: string) {
  // Check if it's our custom event first
  if (log.includes("TICKER_EVENT")) {
      return log.includes("BUY") ? "BUY" : "SELL";
  }
  // Fallback to Anchor default instruction logs
  if (log.includes("Instruction: BuyTreeShares")) return "BUY";
  if (log.includes("Instruction: SellTreeShares")) return "SELL";

  return null;
}

function extractTickerData(log: string, tx?: any) {
  const amountMatch = log.match(/amount=([0-9]+)/);
  const treeMatch = log.match(/tree_id=([A-Za-z0-9-]+)/);
  const walletMatch = log.match(/user=([A-Za-z0-9]+)/);

  return {
    type: parseTradeLog(log),
    amount: amountMatch ? amountMatch[1] : "1",
    treeId: treeMatch ? treeMatch[1] : "Olive Tree",
    wallet: walletMatch ? walletMatch[1] : (tx?.transaction?.message?.accountKeys[0]?.pubkey?.toBase58() || "Unknown")
  };
}

function extractWallet(log: string) {
  const match = log.match(/user=([A-Za-z0-9]+)/);
  return match?.[1];
}

function extractAmount(log: string) {
  const match = log.match(/amount=([0-9]+)/);
  return match ? Number(match[1]) : null;
}

async function loadTickerFromChain() {
  const sigs = await connection.getSignaturesForAddress(PROGRAM_ID, { limit: 20 });

  for (const s of sigs.reverse()) {
    const tx = await connection.getParsedTransaction(s.signature, {
      maxSupportedTransactionVersion: 0,
    });

    tx?.meta?.logMessages?.forEach(log => {
      const type = parseTradeLog(log);
      if (!type) return;

      const tradeData = extractTickerData(log, tx);
      const amount = extractAmount(log);
      const wallet = extractWallet(log);



      if (wallet && amount) {
        pushTradeToTicker(tradeData);
      }
    });
  }
}


function subscribeToTicker() {
  connection.onLogs(PROGRAM_ID, logs => {
    if (DEBUG_UI) {
      console.groupCollapsed("📡 ON-CHAIN LOG EVENT");
      console.log("Signature:", logs.signature);
    }

    logs.logs.forEach(log => {
      const type = parseTradeLog(log);
      if (!type) return;

      const wallet = extractWallet(log);
      const amount = extractAmount(log);

      if (DEBUG_UI) {
        console.log("RAW LOG:", log);
        console.log("PARSED:", { type, wallet, amount });
      }

      if (wallet && amount) {
        pushTradeToTicker({ type, wallet, amount });
      }
    });

    if (DEBUG_UI) console.groupEnd();
  });
}

async function closeBadTrees() {
  await closeTreeOnChain("F1-MO-0001");
  await closeTreeOnChain("F1-MO-0002");
  await closeTreeOnChain("F1-MO-0003");
  await closeTreeOnChain("F1-MO-0004");
}


(window as any).closeTreeOnChain = async (treeId) => {
  const [treePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("tree"), Buffer.from(treeId)],
    program.programId
  );

  try {
    const tx = await program.methods.closeTree()
      .accounts({
        treeAccount: treePDA,
        authority: provider.wallet.publicKey,
      })
      .rpc();

    console.log(`Closed ${treeId}`, tx);
  } catch (err) {
    console.error(`Failed to close ${treeId}`, err);
  }
}

(window as any).initTreeExampleOne = async () => {
  if (!walletPublicKey) {
    console.error("⚠️ Connect wallet first");
    return;
  }

  const id = "F1-MO-0011";
  const data = TREE_DATABASE[id];

  try {
    const tx = await program.methods.initTree(
      id,
      new anchor.BN(data.initialCo2),  // CO2
      data.lat,
      data.lng,
      data.cultivar,
      data.plantingYear
    )
    .rpc();

    console.log(`✅ Initialized ${id}`, tx);
  } catch (err) {
    console.error(`❌ Failed to init ${id}`, err);
  }

  await window.syncGlobalStats(); // refresh UI
}

async function initTenTrees() {
  if (!walletPublicKey) {
    console.error("Wallet not connected — cannot init trees.");
    return;
  }

  let count = 0;

  for (let i = 1; i <= 10; i++) {
    const id = `F1-MO-${i.toString().padStart(4, "0")}`;

    const params = TREE_DATABASE[id];

    try {
      const tx = await program.methods.initTree(
        id,
        new anchor.BN(params.initialCo2),
        params.lat,
        params.lng,
        params.cultivar,
        params.plantingYear
      ).rpc();

      console.log(`✅ Tree ${id} initialized! TX:`, tx);
      count++;
    } catch (err) {
      console.error(`❌ Failed to init ${id}:`, err);
    }
  }

  console.log(`🎉 Done! Initialized ${count} trees.`);
  await window.syncGlobalStats(); // Refresh UI
}


function hideIfEmpty(id: string) {
  const el = document.getElementById(id);
  if (!el || !el.innerHTML.trim()) {
    if (el) el.style.display = "none";
  }

}
async function onWalletConnected() {
  await loadPortfolio();
  //await closeBadTrees();


  // Ticker
  enableTicker();
  await loadTickerFromChain();
  subscribeToTicker();

  updateAdminVisibility(walletPublicKey!);
}

// -----------------------------
// APP BOOTSTRAP
// -----------------------------

// -----------------------------
// Initial load
// -----------------------------
window.addEventListener("load", () => {
  console.log("🚀 Frontend loaded");
  (window as any).syncGlobalStats();
});


document.addEventListener("DOMContentLoaded", async () => {

});
