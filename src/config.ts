

import { createClient } from '@supabase/supabase-js';
import { Connection, PublicKey } from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import idl from "./idl.json";

// --- [SUPABASE CONFIG] ---
export const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

export const supabase = sb;
// Constants from your requirements
export const PROGRAM_ID = new PublicKey("6HjkwwiKSkr8YCtR9HchVZQ97CmjbBbrW2SeE2U8T6rj");
export const ADMIN_WALLET = "8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54";

/**
 * DEBUG-HEAVY PROVIDER
 * Ensures we catch wallet mismatches immediately
 */// config.ts
export const getProgram = () => {
    console.log("[DEBUG] Validating Wallet Connection...");

    // Check if Solana (Phantom/Solflare) is present
    const solana = (window as any).solana;
    // Crucial: If the wallet isn't fully connected, don't try to build the provider
    if (!solana || !solana.isConnected || !solana.publicKey) {
        throw new Error("WALLET_NOT_READY");
    }
    console.log("trying connect...");


    const connection = new Connection("https://api.devnet.solana.com", "confirmed");

    // We create a mock wallet object to guarantee publicKey is present
    const wallet = {
        publicKey: solana.publicKey,
        signTransaction: solana.signTransaction.bind(solana),
        signAllTransactions: solana.signAllTransactions.bind(solana),
    };
  const provider = new AnchorProvider(connection, wallet as any, AnchorProvider.defaultOptions());

    // Now it is safe to read toBase58()
    console.log(`[DEBUG] Wallet Authenticated: ${wallet}`);

      console.log(`[DEBUG] Admin Status: ${provider.wallet.publicKey.toBase58() === ADMIN_WALLET}`);

      return new Program(idl as any, provider);
  };

/**
 * GLOBAL STATE TRACKER
 * Prevents UI from falling out of sync with blockchain truth
 */
export const GlobalState = {
    isLocked: false,
    isGenesisHolder: false,
    activeVotes: [] as string[]
};
