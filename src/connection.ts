import { Buffer } from "buffer";

import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { AnchorProvider, Program, setProvider } from "@coral-xyz/anchor";
import idl from "/idl/idl.json";

// Polyfill Buffer for the browser
if (typeof (window as any).Buffer === "undefined") {
  (window as any).Buffer = Buffer;
}

// 1. Initialize and Export core variables
export const connection = new Connection("http://127.0.0.1:8899", "confirmed");
export const PROGRAM_ID = new PublicKey(idl.address);

export let provider: AnchorProvider;
export let program: Program;

// 2. The Exported Connect Function
export async function connectWallet() {
    try {
        const wallet = (window as any).solana;
        if (!wallet) {
            alert("Phantom wallet not found!");
            throw new Error("Wallet not found");
        }

        // Connect to Phantom
        await wallet.connect();

        // Setup Anchor provider & program
        provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
        setProvider(provider);
        program = new Program(idl as any, provider);

        // Attach globally for debugging
        (window as any).provider = provider;
        (window as any).program = program;
        (window as any).connection = connection;

        console.log("Wallet Connected:", wallet.publicKey.toBase58());
        showMainContent();

        // --- SAFE UI UPDATES ---
        const walletDisplayEl = document.getElementById("wallet-display");
        if (walletDisplayEl) walletDisplayEl.innerText = wallet.publicKey.toBase58();

        const walletContainerEl = document.getElementById("wallet-container");
        if (walletContainerEl) walletContainerEl.classList.remove("hidden");

        const connectBtnEl = document.getElementById("connectBtn");
        if (connectBtnEl) connectBtnEl.classList.add("hidden");

        // Gov.html: update the connect button text if present
        const btn = document.getElementById("btn-connect");
        if (btn) btn.innerText = wallet.publicKey.toBase58().slice(0, 4) + "..." + wallet.publicKey.toBase58().slice(-4);

        // --- Optional: Fetch balances, refresh UI ---
        if (typeof updateWalletBalances === "function") await updateWalletBalances();
        if (typeof refreshGovernance === "function") await refreshGovernance();

        return { provider, program };
    } catch (err) {
        console.error("Wallet connection failed:", err);
        throw err;
    }
}
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

    // DAO Feed
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
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

// Example async function
export async function fetchBalances() {
    if (!program || !provider?.publicKey) return;

    const walletPubKey = provider.publicKey;

    // --- 1. Initialize trackers ---
    let totalStakedOlv = 0;
    let totalStakedShares = 0;
    let liquidTreeShares = 0;
    let olvTokenBalance = "0";
    let solBalance = 0;

    try {
        // --- A. Fetch SOL balance ---
        solBalance = (await provider.connection.getBalance(walletPubKey)) / 1e9;

        // --- B. Fetch OLV SPL token balance ---
        try {
            const userAta = getAssociatedTokenAddressSync(OLV_MINT, walletPubKey);
            const bal = await program.provider.connection.getTokenAccountBalance(userAta);
            olvTokenBalance = bal.value.uiAmountString || "0";
        } catch (e) {
            console.log("No liquid OLV token account found.");
            olvTokenBalance = "0";
        }

        // --- C. Fetch staked OLV ---
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

        // --- D. Fetch tree position / liquid & locked shares ---
        try {
            const [posPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("position"), walletPubKey.toBuffer(), new Uint8Array(32)], // Replace with actual tree pubkey
                program.programId
            );

            const position = await program.account.treePosition.fetchNullable(posPda);

            liquidTreeShares = position?.shares.toNumber() ?? 0;
            totalStakedShares = position?.lockedShares.toNumber() ?? 0;
        } catch (e) {
            console.log("No tree position found for this user.");
            liquidTreeShares = 0;
            totalStakedShares = 0;
        }

        // --- 2. Update HTML ---
        (document.getElementById("balance-sol") as HTMLElement).innerText = solBalance.toFixed(2);
        (document.getElementById("balance-liquid") as HTMLElement).innerText = `${liquidTreeShares} Shares`;
        (document.getElementById("balance-staked") as HTMLElement).innerText = `${totalStakedShares} Locked`;
        (document.getElementById("global-weight") as HTMLElement).innerText = `${totalStakedOlv.toFixed(2)} OLV`; // Replace with DAO weight formula if needed

    } catch (err) {
        console.error("Failed to fetch balances", err);
    }
}
