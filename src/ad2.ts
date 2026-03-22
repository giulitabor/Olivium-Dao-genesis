/* server.ts - [2026-02-27] GOD MODE PROTOCOL CONSOLE */
import './polyfill';
import { Connection, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL, SystemProgram, Transaction } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";
import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import idl from "../idl/idl.json";

// PROTOCOL CONSTANTS
const ADMIN_WALLET = "8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54";
const PROGRAM_ID = new PublicKey("9ZmtBmwCBy2wvjr6DKBLmddRNu5AGd42S6mYg1thh9bV");
const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
// 1. Define the Helius URL once at the top of your file
const HELIUS_RPC = "https://devnet.helius-rpc.com/?api-key=122be0d1-b67c-49c7-ae73-266cb9b7a470";
//const solConn = new anchor.web3.Connection(HELIUS_RPC, "confirmed");
const solConn = new anchor.web3.Connection("http://127.0.0.1:8899", "confirmed");
// 2. Update your Connection setup (likely in App.tsx or your Provider)
export const connection = new anchor.web3.Connection(HELIUS_RPC, {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000, // Give it a full minute to fight congestion
});

// 3. Update your getProgram function to use this specific connection
const getProgram = () => {
    const wallet = (window as any).solana;
    if (!wallet || !wallet.publicKey) throw new Error("Connect Wallet First");
    const provider = new anchor.AnchorProvider(solConn, wallet, { commitment: "confirmed" });
        return new anchor.Program(idl as any, provider);};
const checkProvider = async () => {
    try {
        // Force a ping to the provider to re-establish the port
        await (window as any).solana.isConnected;
    } catch (e) {
        console.warn("🔄 Phantom port disconnected. Reconnecting...");
        await (window as any).solana.connect();
    }
};

/**
 * 1. AUTHENTICATION & UI SYNC
 * Mitigation: Removed immediate heavy calls to avoid 429 on boot
 */
(window as any).connectWallet = async () => {
    const { solana } = window as any;
    if (!solana) return alert("Phantom not found");

    try {
        const resp = await solana.connect();
        const userPubKey = resp.publicKey.toString();

        const addrDisplay = document.getElementById('admin-addr-display');
        if (addrDisplay) addrDisplay.innerText = userPubKey;

        const btn = document.getElementById('btn-connect');
        if (btn) btn.innerText = `● ${userPubKey.slice(0, 4)}...${userPubKey.slice(-4)}`;


        console.log("🟢 [GOD MODE] Authority Verified.");

    } catch (err) {
        console.error("❌ Auth Fail:", err);
    }
};

const debugGenesisInfo = async () => {
    // 1. Get First 3 Trees
    const { data: trees } = await sb.from('tree_metadata')
        .select('*')
        .order('tree_id', { ascending: true })
        .limit(3);

    // 2. Get Field Info
    const { data: field } = await sb.from('fields')
        .select('*')
        .eq('field_name', 'Genesis Grove') // Or whatever your field name is
        .single();

    console.log("🔍 DEBUG: TARGETING FIELD:", field?.field_name, field?.on_chain_address);
    console.log("🔍 DEBUG: TARGETING TREES:", trees?.map(t => t.tree_id));

    return { trees, field };
};

(window as any).runLocalGenesis = async () => {
      const program = getProgram();
      const auth = program.provider.publicKey;
      const PID = program.programId;

      // 1. Derive PDAs (Using standard seeds from your logic)
      const [configPda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("config")], PID);
      const [stakePda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("stake"), auth.toBuffer()], PID);

      const FIELD_NAME = "Local_Heritage_Grove_v1";
      const [fieldPda] = anchor.web3.PublicKey.findProgramAddressSync(
          [Buffer.from("field"), auth.toBuffer(), Buffer.from(FIELD_NAME)], PID
      );

      try {
          console.log("🛠️ Step 1: Initializing Global Config...");
          // fee: 500 (5%), min_stake: 0 (no lock for testing)
          await program.methods.initializeGlobalConfig(500, new anchor.BN(0)).accounts({
              config: configPda,
              authority: auth,
              treasury: auth, // Using auth as treasury for local test
              systemProgram: anchor.web3.SystemProgram.id
          }).rpc();

          console.log("🛡️ Step 2: Initializing Stake Account...");
          await program.methods.initializeStake().accounts({
              authorityStake: stakePda,
              authority: auth,
              systemProgram: anchor.web3.SystemProgram.id
          }).rpc();

          console.log("🌿 Step 3: Initializing Field...");
          await program.methods.initField(FIELD_NAME, new anchor.BN(5000), "http://local", "Italy", 0, 0).accounts({
              config: configPda,
              field: fieldPda,
              authority: auth,
              systemProgram: anchor.web3.SystemProgram.id
          }).rpc();

          console.log("🌲 Step 4: Planting the Genesis Trio...");
          const genesisTrees = ['F1-FR-001', 'F1-FR-002', 'F1-FR-003'];

          for (const treeId of genesisTrees) {
              const [treePda] = anchor.web3.PublicKey.findProgramAddressSync(
                  [Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(treeId)], PID
              );
              const [posPda] = anchor.web3.PublicKey.findProgramAddressSync(
                  [Buffer.from("position"), auth.toBuffer(), treePda.toBuffer()], PID
              );

              await program.methods.addTreeToField(treeId, "Frantoio", 0, 0, 2026).accounts({
                  tree: treePda,
                  treePosition: posPda,
                  field: fieldPda,
                  config: configPda,
                  authority: auth,
                  authorityStake: stakePda,
                  systemProgram: anchor.web3.SystemProgram.id
              }).rpc();

              console.log(`✅ ${treeId} planted successfully!`);
          }

          console.log("%c 🏆 LOCALHOST GENESIS COMPLETE", "color: #00ff00; font-weight: bold;");

      } catch (err: any) {
          console.error("❌ Rebirth Failed:");
          if (err.logs) console.log(err.logs.join("\n"));
          else console.log(err);
      }
  };
(window as any).auditGrove = async () => {
    const program = getProgram();
    const auth = program.provider.publicKey;
    const connection = program.provider.connection;

    console.log("🕵️ Starting Silent Batch Audit...");

    try {
        // 1. Get metadata from Supabase (0 Solana requests)
        const { data: fData } = await sb.from('fields').select('*').limit(1).single();
        const { data: treeData } = await sb.from('tree_metadata')
            .select('tree_id, on_chain_address')
            .in('tree_id', ['F1-FR-001', 'F1-FR-002', 'F1-FR-003'])
            .order('tree_id', { ascending: true });

        if (!fData || !treeData) throw new Error("Missing Supabase data.");

        // 2. Calculate PDAs locally (0 Solana requests)
        const [fieldPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("field"), auth.toBuffer(), Buffer.from(fData.field_name)],
            program.programId
        );

        const treePdas = treeData.map(t => {
            const [pda] = PublicKey.findProgramAddressSync(
                [Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(t.tree_id)],
                program.programId
            );
            return pda;
        });

        // 3. THE ONE KNOCK: Ask for all 4 accounts at once
        console.log("📡 Sending single batch request to Solana...");
        const allAccounts = [fieldPda, ...treePdas];
        const infos = await connection.getMultipleAccountsInfo(allAccounts);

        // 4. Analyze Results
        const fieldInfo = infos[0];
        const treeInfos = infos.slice(1);

        console.log("--- 🏗️ FIELD STATUS ---");
        console.log(`Name: "${fData.field_name}"`);
        console.log(`PDA: ${fieldPda.toBase58()}`);
        console.log(`Status: ${fieldInfo ? "✅ LIVE ON-CHAIN" : "❌ NOT INITIALIZED"}`);

        console.log("\n--- 🌳 TREE STATUS ---");
        const auditTable = treeData.map((t, i) => {
            const expectedPda = treePdas[i].toBase58();
            const actualInfo = treeInfos[i];

            return {
                "ID": t.tree_id,
                "Expected PDA": expectedPda,
                "On-Chain?": actualInfo ? "✅ YES" : "❌ NO",
                "DB Matches?": (t.on_chain_address === expectedPda) ? "MATCH" : "❌ MISMATCH"
            };
        });

        console.table(auditTable);

        // --- THE DIAGNOSIS ---
        if (!fieldInfo) {
            console.error("Critical: Your Field account does not exist. You must run 'initField' first.");
        } else if (auditTable.some(r => r["DB Matches?"] === "❌ MISMATCH")) {
            console.warn("Issue: Supabase is holding old/wrong addresses. We need to sync the 'Expected PDA' to Supabase.");
        } else {
            console.log("✨ All clear! Your DB and Math are in sync.");
        }

    } catch (err: any) {
        if (err.message.includes("429")) {
            console.error("⛔ Still rate-limited. Wait 60 seconds without clicking anything.");
        } else {
            console.error("Audit Error:", err.message);
        }
    }
};

(window as any).bundlePlanting = async () => {
      await checkProvider(); // Safety reconnect [2026-01-10]
          const HELIUS_URL = "https://devnet.helius-rpc.com/?api-key=122be0d1-b67c-49c7-ae73-266cb9b7a470";
          const connection = new anchor.web3.Connection(HELIUS_URL, "confirmed");
          const program = getProgram();
          const auth = program.provider.publicKey;
          const PID = program.programId;

          const FINAL_NAME = "Heritage Grove Genesis V7";
          const [fieldPda] = anchor.web3.PublicKey.findProgramAddressSync(
              [Buffer.from("field"), auth.toBuffer(), Buffer.from(FINAL_NAME)],
              PID
          );

          try {
              console.log(`%c 🛰️ STEP 1: INITIALIZING FIELD [${FINAL_NAME}]`, "color: #00ecff; font-weight: bold;");

              // 1. INIT FIELD ONLY
              const initTx = await program.methods.initField(
                  FINAL_NAME, new anchor.BN(5000), "https://toscagialla.com", "Italy", 43460000, 11120000
              ).accounts({
                  config: anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("config")], PID)[0],
                  field: fieldPda,
                  authority: auth,
                  systemProgram: anchor.web3.SystemProgram.id
              }).rpc();

              console.log(`✅ Field Initialized: ${initTx}`);
              console.log("⏳ Waiting 3 seconds for Helius to index the new Field...");
              await new Promise(r => setTimeout(r, 3000));

              // 2. PLANT TREES BUNDLE
              console.log(`%c 🛰️ STEP 2: PLANTING GENESIS 3 [2026-02-07]`, "color: #00ecff; font-weight: bold;");
              const treeIds = ['F1-FR-001', 'F1-FR-002', 'F1-FR-003'];
              const plantTx = new anchor.web3.Transaction();
              plantTx.add(anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000000 }));

              for (const tid of treeIds) {
                  const [treePda] = anchor.web3.PublicKey.findProgramAddressSync(
                      [Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(tid)], PID
                  );
                  const [posPda] = anchor.web3.PublicKey.findProgramAddressSync(
                      [Buffer.from("position"), auth.toBuffer(), treePda.toBuffer()], PID
                  );
                  const [stakePda] = anchor.web3.PublicKey.findProgramAddressSync(
                      [Buffer.from("stake"), auth.toBuffer()], PID
                  );

                  plantTx.add(await program.methods.addTreeToField(
                      tid, "Frantoio", 43460000, 11120000, 2024
                  ).accounts({
                      tree: treePda,
                      treePosition: posPda,
                      field: fieldPda,
                      config: anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("config")], PID)[0],
                      authority: auth,
                      authorityStake: stakePda,
                      systemProgram: anchor.web3.SystemProgram.id
                  }).instruction());
              }

              const { blockhash } = await connection.getLatestBlockhash('confirmed');
              plantTx.recentBlockhash = blockhash;
              plantTx.feePayer = auth;

              const signed = await (window as any).solana.signTransaction(plantTx);
              const sig = await connection.sendRawTransaction(signed.serialize());

              console.log(`🚀 Trees Planted! Tx: ${sig}`);
              await connection.confirmTransaction(sig);

              console.log(`%c 🏆 GENESIS V7 SUCCESSFUL`, "color: #00ff00; font-weight: bold;");
              alert("Success! Field and 3 Trees are live.");

              // FINAL SYNC
              await sb.from('fields').insert({ field_name: FINAL_NAME, pda_address: fieldPda.toBase58(), authority: auth.toBase58() });

          } catch (err: any) {
              console.error("❌ Two-Step Failed:");
              if (err.logs) err.logs.forEach(l => console.log(l));
              else console.log(err);
          }
      };
      (window as any).initializeSystemBase = async () => {
    try {
        const program = getProgram();
        const auth = program.provider.publicKey;
        const PID = program.programId;

        // 1. Derive PDAs
        const [configPda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("config")], PID);
        const [stakePda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("stake"), auth.toBuffer()], PID);

        console.log("🛠️ Building System Base with Helius...");

        const transaction = new anchor.web3.Transaction();
        transaction.add(anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000000 }));

        // 2. Init Global Config
        // args: fee (u16), min_stake (i64)
        const configIx = await program.methods.initializeGlobalConfig(
            500, // 5% fee (500 bps)
            new anchor.BN(0) // min_stake_duration (0 for now to avoid locks)
        )
        .accounts({
            config: configPda,
            treasury: auth, // Using your wallet as treasury for genesis
            authority: auth,
            systemProgram: anchor.web3.SystemProgram.id,
        })
        .instruction();
        transaction.add(configIx);

        // 3. Init Admin Stake
        // [2026-01-16] lock_until = 0 ensures we can call the wallet
        const stakeIx = await program.methods.initializeStake()
            .accounts({
                authority: auth,
                authorityStake: stakePda, // Ensure this matches your Context name 'authority_stake'
                config: configPda,
                systemProgram: anchor.web3.SystemProgram.id,
            })
            .instruction();
        transaction.add(stakeIx);

        // 4. Send with Helius
        const txSignature = await program.provider.sendAndConfirm!(transaction);

        console.log(`%c 🔥 PROTOCOL ONLINE: ${txSignature}`, "color: #00ff00; font-weight: bold;");
        alert("System Base Restored. Admin and Stake are live.");

    } catch (e: any) {
        console.error("❌ Restore Failed:");
        if (e.logs) e.logs.forEach(l => console.log(l));

        if (JSON.stringify(e).includes("already in use")) {
            alert("System base already exists. You are ready to plant.");
        } else {
            alert(`Error: ${e.message}`);
        }
    }
};
(window as any).discoveryGenesis = async () => {
    console.log("%c 🔍 DISCOVERING METADATA [EXACT SCHEMA MATCH]", "color: #f1c40f; font-weight: bold;");

    // The specific IDs for Genesis [2026-02-07]
    const targetIds = ['F1-FR-001', 'F1-FR-002', 'F1-FR-003'];

    try {
        const { data, error } = await sb
            .from('tree_metadata')
            .select('*')
            .in('tree_id', targetIds);

        if (error) throw error;

        // MAP TO YOUR EXACT SCHEMA
        const plantingData = data.map(tree => ({
            id: tree.tree_id,
            variety: tree.variety || "Frantoio",
            // Handle NULLs by providing grove defaults (converted to i32)
            lat: tree.latitude ? Math.floor(tree.latitude * 1000000) : 43460000,
            long: tree.longitude ? Math.floor(tree.longitude * 1000000) : 11120000,
            year: 2024 // Defaulting to 2024 for Genesis
        }));

        console.log("%c 📋 VERIFIED DATA PAYLOAD:", "color: #3498db; font-weight: bold;");
        console.table(plantingData);

        return plantingData;
    } catch (err: any) {
        console.error("❌ Discovery Failed:", err.message);
    }
};
(window as any).initGenesisField = async () => {
  const program = getProgram();
  const auth = program.provider.publicKey;
  const CONFIG_PDA = new anchor.web3.PublicKey("8zDPhPgsySQCHgN2HLiCwFytWqKRfe26H52sxcEvsM8E");
  const FIELD_NAME = "Toscagialla V2 grove";

  const [fieldPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("field"), auth.toBuffer(), Buffer.from(FIELD_NAME)], program.programId
  );

  console.log("🛰️ Step 1: Initializing Field V11...");
  try {
      const sig = await program.methods.initField(
          FIELD_NAME, new anchor.BN(5000), "https://toscagialla.com", "Italy", 43460000, 11120000
      ).accounts({
          config: CONFIG_PDA, field: fieldPda, authority: auth, systemProgram: anchor.web3.SystemProgram.id
      }).rpc();

      console.log(`%c ✅ FIELD V11 READY: ${sig}`, "color: #2ecc71; font-weight: bold;");
      return fieldPda;
  } catch (e: any) {
      console.error("Field Init Failed. If it says 'already in use', just proceed to Step 2.");
  }
};

(window as any).executeScientificGenesis = async () => {
    const program = getProgram();
    const auth = program.provider.publicKey;
    const PID = program.programId;
    const CONFIG_PDA = new anchor.web3.PublicKey("8zDPhPgsySQCHgN2HLiCwFytWqKRfe26H52sxcEvsM8E");

    // Using the Genesis Grove Field that we KNOW exists
    const FIELD_PDA = new anchor.web3.PublicKey("6Pp8SpTqPchHiq8kRZxfDjpWT8KxpRs2NSXhinVAGwmT");
    const [stakePda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("stake"), auth.toBuffer()], PID);

    try {
        console.log("%c 🔬 ANALYZING TREE SEED RECONSTRUCTION...", "color: #f1c40f; font-weight: bold;");

        const { data: trees } = await sb.from('tree_metadata')
            .select('*')
            .in('tree_id', ['F1-FR-001', 'F1-FR-002', 'F1-FR-003']);

        const tx = new anchor.web3.Transaction();
        tx.add(anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 2000000 }));

        for (const t of trees) {
            // STRIP EVERYTHING: Ensure tree_id has no hidden characters
            const cleanId = t.tree_id.trim();

            // DERIVE PDA
            const [treePda] = anchor.web3.PublicKey.findProgramAddressSync(
                [
                    Buffer.from("tree"),
                    FIELD_PDA.toBuffer(),
                    Buffer.from(cleanId) // This is the JS equivalent of .as_bytes()
                ],
                PID
            );

            const [posPda] = anchor.web3.PublicKey.findProgramAddressSync(
                [
                    Buffer.from("position"),
                    auth.toBuffer(),
                    treePda.toBuffer()
                ],
                PID
            );

            console.log(`Verifying: ${cleanId} -> ${treePda.toBase58()}`);

            tx.add(await program.methods.addTreeToField(
                cleanId,
                t.variety || "Frantoio",
                43460000, 11120000, 2024
            ).accounts({
                tree: treePda,
                treePosition: posPda,
                field: FIELD_PDA,
                config: CONFIG_PDA,
                authority: auth,
                authorityStake: stakePda,
                systemProgram: anchor.web3.SystemProgram.id
            }).instruction());
        }

        const sig = await program.provider.sendAndConfirm!(tx);
        console.log(`%c 🏆 GENESIS QUANTUM LEAP SUCCESS: ${sig}`, "color: #00ff00; font-weight: bold;");
        alert("Genesis Landed!");

    } catch (err: any) {
        console.error("❌ Scientific Sync Failed.");
        if (err.logs) {
            // CRITICAL CHECK: Look at the logs for "Expected" vs "Actual" keys
            err.logs.forEach((l: string) => console.log(l));
        }
    }
};
(window as any).probeTreeSeeds = async () => {
    const program = getProgram();
    const auth = program.provider.publicKey;
    const PID = program.programId;

    // The Field we just tried to use
    const FIELD_NAME = "Heritage_Genesis_Final_v9";
    const [fieldPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("field"), auth.toBuffer(), Buffer.from(FIELD_NAME)], PID
    );

    const treeId = "F1-FR-001";
    console.log(`%c 🕵️ PROBING SEEDS FOR TREE: ${treeId}`, "color: #f1c40f; font-weight: bold;");
    console.log(`Target Field PDA: ${fieldPda.toBase58()}`);

    const combinations = [
        { name: "Standard (Field Key)", seeds: [Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(treeId)] },
        { name: "Authority-Based", seeds: [Buffer.from("tree"), auth.toBuffer(), Buffer.from(treeId)] },
        { name: "Combined (Field + Auth)", seeds: [Buffer.from("tree"), fieldPda.toBuffer(), auth.toBuffer(), Buffer.from(treeId)] },
        { name: "Raw String (No Field)", seeds: [Buffer.from("tree"), Buffer.from(treeId)] }
    ];

    combinations.forEach(combo => {
        const [pda] = anchor.web3.PublicKey.findProgramAddressSync(combo.seeds, PID);
        console.log(`- ${combo.name}: ${pda.toBase58()}`);
    });

    console.log("%c 💡 Check your Rust 'AddTreeToField' struct. What does it say under 'seeds = [...]' for the tree account?", "color: #3498db;");
};


(window as any).executeFinalGenesis = async () => {
    const program = getProgram();
    const auth = program.provider.publicKey;
    const PID = program.programId;
    const CONFIG_PDA = new anchor.web3.PublicKey("8zDPhPgsySQCHgN2HLiCwFytWqKRfe26H52sxcEvsM8E");

    // THIS IS THE ONLY ADDRESS YOUR SCAN VERIFIED AS A GENESIS FIELD
    const FIELD_PDA = new anchor.web3.PublicKey("6Pp8SpTqPchHiq8kRZxfDjpWT8KxpRs2NSXhinVAGwmT");
    const [stakePda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("stake"), auth.toBuffer()], PID);

    try {
        console.log(`%c 🎯 LOCKING TO VERIFIED FIELD: ${FIELD_PDA.toBase58()}`, "color: #00ecff; font-weight: bold;");

        const { data: trees } = await sb.from('tree_metadata')
            .select('*')
            .in('tree_id', ['F1-FR-001', 'F1-FR-002', 'F1-FR-003']);

        const tx = new anchor.web3.Transaction();
        tx.add(anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 2000000 }));

        for (const t of trees) {
            const cleanId = t.tree_id.trim();

            // SEEDS: [b"tree", verified_field_key, tree_id_bytes]
            const [treePda] = anchor.web3.PublicKey.findProgramAddressSync(
                [Buffer.from("tree"), FIELD_PDA.toBuffer(), Buffer.from(cleanId)], PID
            );

            // SEEDS: [b"position", auth_key, tree_key]
            const [posPda] = anchor.web3.PublicKey.findProgramAddressSync(
                [Buffer.from("position"), auth.toBuffer(), treePda.toBuffer()], PID
            );

            console.log(`Mapped ${cleanId} -> Tree PDA: ${treePda.toBase58()}`);

            tx.add(await program.methods.addTreeToField(
                cleanId,
                t.variety || "Frantoio",
                43460000, 11120000, 2024
            ).accounts({
                tree: treePda,
                treePosition: posPda,
                field: FIELD_PDA,
                config: CONFIG_PDA,
                authority: auth,
                authorityStake: stakePda,
                systemProgram: anchor.web3.SystemProgram.id
            }).instruction());
        }

        const sig = await program.provider.sendAndConfirm!(tx);
        console.log(`%c 🏆 GENESIS SUCCESSFUL: ${sig}`, "color: #00ff00; font-weight: bold;");

        // Final Database Update with the ONLY valid Field PDA
        await sb.from('tree_metadata').update({
            on_chain: true,
            field_pda: FIELD_PDA.toBase58(),
            on_chain_address: "GenesisGrove_V1"
        }).in('tree_id', ['F1-FR-001', 'F1-FR-002', 'F1-FR-003']);

        alert("Genesis Landed in Genesis Grove!");

    } catch (err: any) {
        console.error("❌ Final Attempt Failed:");
        if (err.logs) err.logs.forEach((l: string) => console.log(l));
        else console.log(err.message);
    }
};

(window as any).executeGenesisV11 = async () => {
    const program = getProgram();
    const auth = program.provider.publicKey;
    const PID = program.programId;
    const CONFIG_PDA = new anchor.web3.PublicKey("8zDPhPgsySQCHgN2HLiCwFytWqKRfe26H52sxcEvsM8E");

    // 1. FRESH START: V11
    const FIELD_NAME = "Heritage_Genesis_Final_v11";
    const [fieldPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("field"), auth.toBuffer(), Buffer.from(FIELD_NAME)], PID
    );

    try {
        console.log(`%c 🛰️ STEP 1: INITIALIZING FIELD V11`, "color: #f1c40f; font-weight: bold;");

        // Initialize the field standalone to ensure it's written to the ledger
        const initSig = await program.methods.initField(
            FIELD_NAME, new anchor.BN(5000), "https://toscagialla.com", "Italy", 43460000, 11120000
        ).accounts({
            config: CONFIG_PDA, field: fieldPda, authority: auth, systemProgram: anchor.web3.SystemProgram.id
        }).rpc();

        console.log(`✅ Field Verified: ${initSig}`);
        console.log("⏳ Waiting 10s for Solana to commit the Field account data...");
        await new Promise(r => setTimeout(r, 10000));

        // 2. PLANTING THE FIRST 3 TREES
        console.log("%c 🌲 STEP 2: GENESIS PLANTING...", "color: #2ecc71; font-weight: bold;");
        const { data: trees } = await sb.from('tree_metadata').select('*').in('tree_id', ['F1-FR-001', 'F1-FR-002', 'F1-FR-003']);

        for (const t of trees) {
            const cleanId = t.tree_id.trim();
            const [treePda] = anchor.web3.PublicKey.findProgramAddressSync(
                [Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(cleanId)], PID
            );
            const [posPda] = anchor.web3.PublicKey.findProgramAddressSync(
                [Buffer.from("position"), auth.toBuffer(), treePda.toBuffer()], PID
            );
            const [stakePda] = anchor.web3.PublicKey.findProgramAddressSync(
                [Buffer.from("stake"), auth.toBuffer()], PID
            );

            console.log(`Planting ${cleanId} to Field ${fieldPda.toBase58()}`);

            // We do these one by one to isolate which one triggers the 0x1784
            const sig = await program.methods.addTreeToField(
                cleanId, t.variety || "Frantoio", 43460000, 11120000, 2024
            ).accounts({
                tree: treePda,
                treePosition: posPda,
                field: fieldPda,
                config: CONFIG_PDA,
                authority: auth,
                authorityStake: stakePda,
                systemProgram: anchor.web3.SystemProgram.id
            }).rpc();

            console.log(`✅ Tree ${cleanId} Planted: ${sig}`);
        }

        alert("V11 Genesis Successful!");

    } catch (err: any) {
        console.error("❌ Genesis Failed.");
        console.log(err.logs || err.message);

        if (err.message.includes("0x1784")) {
            console.log("%c 💡 ANALYTICS: The 0x1784 indicates the Rust struct is likely checking 'tree.field == field' before it is initialized. If so, the Rust code MUST be updated to remove that constraint during 'init'.", "color: #e74c3c;");
        }
    }
};
(window as any).executeSbGenesis = async () => {
    const program = getProgram();
    const auth = program.provider.publicKey;
    const PID = program.programId;
    const CONFIG_PDA = new anchor.web3.PublicKey("8zDPhPgsySQCHgN2HLiCwFytWqKRfe26H52sxcEvsM8E");

    // We are locking into the Genesis Grove field verified by your scan
    const FIELD_PDA = new anchor.web3.PublicKey("6Pp8SpTqPchHiq8kRZxfDjpWT8KxpRs2NSXhinVAGwmT");
    const [stakePda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("stake"), auth.toBuffer()], PID);

    try {
        console.log("%c 🛠️ EXECUTING ADMIN GENESIS REPAIR...", "color: #f1c40f; font-weight: bold;");

        // First 3 Trees as per Genesis Protocol
        const { data: trees } = await sb.from('tree_metadata')
            .select('*')
            .in('tree_id', ['F1-FR-001', 'F1-FR-002', 'F1-FR-003']);

        const tx = new anchor.web3.Transaction();
        // High priority for Genesis
        tx.add(anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 5000000 }));

        for (const t of trees) {
            const cleanId = t.tree_id.trim();

            // 1. Derive Tree PDA (Mirroring Rust Seeds)
            const [treePda] = anchor.web3.PublicKey.findProgramAddressSync(
                [Buffer.from("tree"), FIELD_PDA.toBuffer(), Buffer.from(cleanId)], PID
            );

            // 2. Derive Position PDA
            const [posPda] = anchor.web3.PublicKey.findProgramAddressSync(
                [Buffer.from("position"), auth.toBuffer(), treePda.toBuffer()], PID
            );

            console.log(`Linking Genesis Tree: ${cleanId} to ${treePda.toBase58()}`);

            // 3. Construct Instruction
            // NOTE: We pass the FIELD_PDA explicitly to the account constraint
            tx.add(await program.methods.addTreeToField(
                cleanId,
                t.variety || "Frantoio",
                43460000, 11120000, 2024
            ).accounts({
                tree: treePda,
                treePosition: posPda,
                field: FIELD_PDA,
                config: CONFIG_PDA,
                authority: auth,
                authorityStake: stakePda,
                systemProgram: anchor.web3.SystemProgram.id
            }).instruction());
        }

        const sig = await program.provider.sendAndConfirm!(tx, [], {
            skipPreflight: false,
            commitment: "confirmed"
        });

        console.log(`%c 🏆 GENESIS SUCCESS: ${sig}`, "color: #00ff00; font-weight: bold;");

        // Update Supabase Registry
        await sb.from('tree_metadata').update({
            on_chain: true,
            field_pda: FIELD_PDA.toBase58(),
            on_chain_address: "REGISTERED"
        }).in('tree_id', ['F1-FR-001', 'F1-FR-002', 'F1-FR-003']);

        alert("Genesis Success! Trees 1-3 are live.");

    } catch (err: any) {
        console.error("❌ Genesis Failed.");
        if (err.logs) {
            err.logs.forEach((l: string) => console.log(l));
        } else {
            console.log(err.message);
        }
    }
};
(window as any).debugProtocolState = async () => {
    const program = getProgram();
    const PID = program.programId;
    const auth = program.provider.publicKey;
    const CONFIG_ADDR = "8zDPhPgsySQCHgN2HLiCwFytWqKRfe26H52sxcEvsM8E";

    console.log(`%c 🕵️‍♂️ DEEP SCAN: ${CONFIG_ADDR}`, "color: #f1c40f; font-weight: bold;");

    try {
        // 1. Check Global Config
        const configData = await program.account.globalConfig.fetch(CONFIG_ADDR);
        const isAdmin = configData.admin.toBase58() === auth.toBase58();

        console.table({
            "Field": "Value",
            "Config Address": CONFIG_ADDR,
            "Admin On-Chain": configData.admin.toBase58(),
            "Manager On-Chain": configData.manager.toBase58(),
            "Your Wallet": auth.toBase58(),
            "Authority Match": isAdmin ? "✅ YES" : "❌ NO",
            "Total Trees Indexed": configData.totalTreesIndexed.toString()
        });

        // 2. Prepare Genesis Data (From "File" Logic)
        const genesisTrees = [
            { id: 'F1-FR-001', variety: 'Frantoio', lat: 43460000, long: 11120000, year: 2024 },
            { id: 'F1-FR-002', variety: 'Frantoio', lat: 43460010, long: 11120010, year: 2024 },
            { id: 'F1-FR-003', variety: 'Frantoio', lat: 43460020, long: 11120020, year: 2024 }
        ];

        console.log("%c 📋 PRE-FLIGHT TREE DATA:", "color: #3498db; font-weight: bold;");
        console.table(genesisTrees);

        if (!isAdmin) {
            console.error("⛔ STOP: You are not the Admin. Transactions will fail with 'Unauthorized'.");
        } else {
            console.log("%c ✅ READY FOR TAKEOFF: Authority verified.", "color: #2ecc71;");
        }

        return { isAdmin, configData, genesisTrees };
    } catch (err) {
        console.error("❌ Debug Failed: Account might not be a GlobalConfig type.", err);
    }
};
(window as any).directGenesisPlanting = async () => {
    const HELIUS_URL = "https://devnet.helius-rpc.com/?api-key=122be0d1-b67c-49c7-ae73-266cb9b7a470";
    const connection = new anchor.web3.Connection(HELIUS_URL, "confirmed");
    const program = getProgram();
    const auth = program.provider.publicKey;
    const PID = program.programId;

    // THE ACCOUNT WE JUST DISCOVERED IS THE CONFIG
    const CONFIG_PDA = new anchor.web3.PublicKey("8zDPhPgsySQCHgN2HLiCwFytWqKRfe26H52sxcEvsM8E");

    // NEW UNIQUE FIELD NAME
    const FIELD_NAME = "Heritage_Genesis_Final_v8";
    const [fieldPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("field"), auth.toBuffer(), Buffer.from(FIELD_NAME)], PID
    );

    console.log(`%c 🌿 ATTEMPTING GENESIS INTO FIELD: ${FIELD_NAME}`, "color: #00ff00; font-weight: bold;");

    try {
        const tx = new anchor.web3.Transaction();
        tx.add(anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000000 }));

        // 1. INIT FIELD
        tx.add(await program.methods.initField(
            FIELD_NAME, new anchor.BN(5000), "https://toscagialla.com", "Italy", 43460000, 11120000
        ).accounts({
            config: CONFIG_PDA,
            field: fieldPda,
            authority: auth,
            systemProgram: anchor.web3.SystemProgram.id
        }).instruction());

        // 2. PLANT THE FIRST 3 TREES [2026-02-07]
        const trees = ['F1-FR-001', 'F1-FR-002', 'F1-FR-003'];
        for (const tid of trees) {
            const [treePda] = anchor.web3.PublicKey.findProgramAddressSync(
                [Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(tid)], PID
            );
            const [posPda] = anchor.web3.PublicKey.findProgramAddressSync(
                [Buffer.from("position"), auth.toBuffer(), treePda.toBuffer()], PID
            );
            const [stakePda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("stake"), auth.toBuffer()], PID);

            tx.add(await program.methods.addTreeToField(
                tid, "Frantoio", 43460000, 11120000, 2024
            ).accounts({
                tree: treePda,
                treePosition: posPda,
                field: fieldPda,
                config: CONFIG_PDA,
                authority: auth,
                authorityStake: stakePda,
                systemProgram: anchor.web3.SystemProgram.id
            }).instruction());
        }

        const signed = await (window as any).solana.signTransaction(tx);
        const sig = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true });

        console.log(`🚀 Genesis Sent: ${sig}`);
        const confirm = await connection.confirmTransaction(sig);

        if (confirm.value.err) {
            console.error("❌ Program Rejected Transaction. Check logs for 'Unauthorized'.");
            alert("Unauthorized: You are likely not the Admin of the existing Config.");
        } else {
            console.log("%c 🏆 GENESIS SUCCESS!", "color: #00ff00; font-weight: bold;");
            alert("Genesis Complete! 3 Trees planted in V8 Field.");
        }

    } catch (err: any) {
        console.error("❌ Execution Error:", err);
    }
};
  (window as any).peekAtAccounts = async () => {
    const HELIUS_URL = "https://devnet.helius-rpc.com/?api-key=122be0d1-b67c-49c7-ae73-266cb9b7a470";
    const addresses = [
        '9QgCX7HQCzS2288waEqdUXr4KoyFVXM2UChZokENeaKK',
        '8zDPhPgsySQCHgN2HLiCwFytWqKRfe26H52sxcEvsM8E',
        'ETa7vhyW6nQYGCsKx358orZG2zaHbCac3f28XugRhiCV',
        '6Pp8SpTqPchHiq8kRZxfDjpWT8KxpRs2NSXhinVAGwmT'
    ];

    console.log("🕵️ Analyzing Account DNA...");

    for (const addr of addresses) {
        const resp = await fetch(HELIUS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: "2.0", id: 1, method: "getAccountInfo",
                params: [addr, { encoding: "base64" }]
            })
        });
        const { result } = await resp.json();
        const data = Buffer.from(result.value.data[0], 'base64');

        // Peek at the first few bytes (Discriminator) and string content
        const rawString = data.toString('utf8').replace(/[^\x20-\x7E]/g, '');
        console.log(`ADDR: ${addr}`);
        console.log(`RAW CONTENT (Parsed): "${rawString.substring(0, 50)}..."`);

        if (rawString.includes("Toscagialla")) console.log("🎯 FOUND THE FIELD!");
        if (rawString.includes("F1-FR")) console.log("🎯 FOUND A TREE!");
    }
};
  (window as any).deepScanProgram = async () => {
    const HELIUS_URL = "https://devnet.helius-rpc.com/?api-key=122be0d1-b67c-49c7-ae73-266cb9b7a470";
    const program = getProgram();
    const PROGRAM_ID = program.programId;

    console.log(`%c 🔍 DEEP SCANNING PROGRAM: ${PROGRAM_ID.toBase58()}`, "color: #ff00ff; font-weight: bold;");

    try {
        const response = await fetch(HELIUS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "getProgramAccounts",
                params: [
                    PROGRAM_ID.toBase58(),
                    { encoding: "base64" }
                ]
            })
        });

        const { result } = await response.json();

        if (!result || result.length === 0) {
            console.log("❌ No accounts found. The transaction likely didn't commit state.");
            return;
        }

        console.log(`%c Found ${result.length} accounts owned by program.`, "color: #00ff00;");

        const decodedAccounts = [];
        for (const account of result) {
            try {
                // Try to decode as a 'Field' account
                const fieldData = program.coder.accounts.decode("Field", Buffer.from(account.account.data[0], 'base64'));
                decodedAccounts.push({ type: 'FIELD', pubkey: account.pubkey, data: fieldData });
            } catch (e) {
                try {
                    // Try to decode as a 'Tree' account
                    const treeData = program.coder.accounts.decode("Tree", Buffer.from(account.account.data[0], 'base64'));
                    decodedAccounts.push({ type: 'TREE', pubkey: account.pubkey, data: treeData });
                } catch (e2) {
                    decodedAccounts.push({ type: 'UNKNOWN', pubkey: account.pubkey });
                }
            }
        }

        console.table(decodedAccounts.map(a => ({
            Type: a.type,
            Address: a.pubkey,
            Identifier: a.data?.name || a.data?.tree_id || "N/A",
            Trees: a.data?.total_trees?.toString() || "N/A"
        })));

        // [2026-02-07] Update Supabase with whatever we found
        for (const acc of decodedAccounts) {
            if (acc.type === 'TREE') {
                await sb.from('tree_metadata').update({ on_chain_address: acc.pubkey }).eq('tree_id', acc.data.tree_id);
            }
            if (acc.type === 'FIELD') {
                await sb.from('fields').update({ pda_address: acc.pubkey }).eq('field_name', acc.data.name);
            }
        }

        console.log("✅ Supabase Synced with On-Chain Realities.");

    } catch (err) {
        console.error("Deep Scan Failed:", err);
    }
};
(window as any).findEverythingOnChain = async () => {
    const HELIUS_URL = "https://devnet.helius-rpc.com/?api-key=122be0d1-b67c-49c7-ae73-266cb9b7a470";
    const connection = new anchor.web3.Connection(HELIUS_URL, "confirmed");
    const program = getProgram();

    console.log("🕵️‍♂️ Deep Scanning Program Accounts...");

    try {
        // 1. Fetch ALL Fields created by this program
        const fields = await program.account.field.all();
        console.log(`🏗️ Found ${fields.length} Field(s) on-chain:`);
        fields.forEach(f => {
            console.log(` - Name: "${f.account.name}"`);
            console.log(`   PDA: ${f.publicKey.toBase58()}`);
            console.log(`   Authority: ${f.account.authority.toBase58()}`);
        });

        // 2. Fetch ALL Trees created by this program
        const trees = await program.account.tree.all();
        console.log(`\n🌳 Found ${trees.length} Tree(s) on-chain:`);
        trees.forEach(t => {
            console.log(` - ID: ${t.account.id} (${t.account.variety})`);
            console.log(`   Parent Field: ${t.account.field.toBase58()}`);
        });

        if (fields.length > 0) {
            console.log("\n✅ THE TRUTH IS OUT THERE. If names don't match your script, update your NEW_NAME variable.");
        } else {
            console.log("\n⚠️ Still nothing? The transaction may have timed out before landing. Check the Helius signature in a browser.");
        }

    } catch (err) {
        console.error("Scan failed:", err);
    }
};
(window as any).inspectV2Grove = async () => {

    const HELIUS_URL = "https://devnet.helius-rpc.com/?api-key=122be0d1-b67c-49c7-ae73-266cb9b7a470";
    const connection = new anchor.web3.Connection(HELIUS_URL, "confirmed");
    const program = getProgram();
    const auth = program.provider.publicKey;

    const [fieldPda] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("field"), auth.toBuffer(), Buffer.from("Toscagialla Heritage Grove V2")],
        program.programId
    );

    console.log("📡 Querying Helius for Field V2 Data...");
    const account = await connection.getAccountInfo(fieldPda);

    if (account) {
        console.log("%c ✅ FIELD IS LIVE", "color: #00ff00; font-weight: bold;");
        console.log("Address:", fieldPda.toBase58());
        console.log("Owner Program:", account.owner.toBase58());
        console.log("Data Size:", account.data.length, "bytes");

        // Fetch the trees too
        const trees = await program.account.tree.all([
            { memcmp: { offset: 8 + 32, bytes: fieldPda.toBase58() } } // Filter by Field PDA
        ]);

        console.log(`🌳 Found ${trees.length} trees linked to this field on-chain.`);
        trees.forEach(t => console.log(` - ${t.account.id}: ${t.account.variety} (Age: ${t.account.ageYears})`));
    } else {
        console.log("❌ Field not found. Check if the PDA derivation matches your script.");
    }
};
(window as any).finalSync = async () => {
    const program = getProgram();
    const auth = program.provider.publicKey;
    const NEW_NAME = "Toscagialla Heritage Grove V2";

    // Re-calculate the PDAs we just created
    const [fieldPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("field"), auth.toBuffer(), Buffer.from(NEW_NAME)],
        program.programId
    );

    console.log("💾 Finalizing Supabase Sync for V2...");

    try {
        // 1. Update the Field (We'll use the name as the filter instead of ID)
        await sb.from('fields')
            .update({
                field_name: NEW_NAME,
                pda_address: fieldPda.toBase58()
            })
            .ilike('field_name', '%Toscagialla%'); // Flexible filter

        // 2. Update the Trees
        const treeIds = ['F1-FR-001', 'F1-FR-002', 'F1-FR-003'];
        for (const id of treeIds) {
            const [treePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(id)],
                program.programId
            );

            await sb.from('tree_metadata')
                .update({
                    on_chain_address: treePda.toBase58(),
                    field_pda: fieldPda.toBase58()
                })
                .eq('tree_id', id);
        }

        console.log("✨ DATABASE SYNCED.");
        alert("The Grove is officially Reborn. Database and Blockchain are 100% aligned.");
    } catch (err) {
        console.error("Supabase Sync Error:", err);
    }
};
(window as any).syncAndPlantGenesis = async () => {
    const program = getProgram();
    const auth = program.provider.publicKey;

    try {
        console.log("🔄 Step 1: Syncing Supabase to Expected PDAs...");

        // Define the Field again (ETa7v...)
        const [fieldPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("field"), auth.toBuffer(), Buffer.from("Toscagialla Heritage Grove")],
            program.programId
        );

        // Targeted trees [2026-02-07]
        const treeIds = ['F1-FR-001', 'F1-FR-002', 'F1-FR-003'];

        // Fetch metadata for coordinates/age
        const { data: treeData } = await sb.from('tree_metadata')
            .select('*')
            .in('tree_id', treeIds);

        for (const t of treeData!) {
            // Calculate the EXACT PDA the program expects
            const [expectedTreePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(t.tree_id)],
                program.programId
            );

            console.log(`📡 Syncing ${t.tree_id} to DB...`);
            await sb.from('tree_metadata')
                .update({
                    on_chain_address: expectedTreePda.toBase58(),
                    field_pda: fieldPda.toBase58()
                })
                .eq('tree_id', t.tree_id);

            // --- NOW PLANT ---
            console.log(`🌱 Planting ${t.tree_id} on-chain...`);

            const [posPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("position"), auth.toBuffer(), expectedTreePda.toBuffer()],
                program.programId
            );

            const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
            const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), auth.toBuffer()], program.programId);

            const tx = await program.methods
                .addTreeToField(
                    t.tree_id,
                    t.variety || "Frantoio",
                    Math.floor((t.latitude || 0) * 1000000),
                    Math.floor((t.longitude || 0) * 1000000),
                    Number(t.age_years || 2024)
                )
                .accounts({
                    tree: expectedTreePda,
                    treePosition: posPda,
                    field: fieldPda,
                    config: configPda,
                    authority: auth,
                    authorityStake: stakePda,
                    systemProgram: SystemProgram.programId,
                })
                .rpc({ skipPreflight: true });

            console.log(`✅ Success ${t.tree_id}! TX: ${tx.slice(0, 8)}`);

            console.log("⏳ Stealth Cooldown (30s)... Don't close tab.");
            await new Promise(r => setTimeout(r, 30000));
        }

        alert("Genesis Planting Complete! The DB and Blockchain are now perfectly synced.");

    } catch (err: any) {
        console.error("❌ Process Failed:", err);
        alert(`Error: ${err.message}`);
    }
};
(window as any).stealthPlanting = async () => {
    const program = getProgram();
    const auth = program.provider.publicKey;

    try {
        console.log("🌐 VPN Active. Initializing Genesis Sequence...");

        // 1. Get exact field name from Supabase (Local DB call, no RPC impact)
        const { data: fData } = await sb.from('fields').select('field_name').limit(1).single();
        if (!fData) throw new Error("Field name missing in Supabase.");

        const REAL_NAME = fData.field_name;
        console.log(`📝 Target Field: ${REAL_NAME}`);

        // 2. Derive PDAs (Mathematical derivation, 0 RPC requests)
        const [fieldPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("field"), auth.toBuffer(), Buffer.from(REAL_NAME)],
            program.programId
        );
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
        const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), auth.toBuffer()], program.programId);

        // 3. Target the Genesis 3 [2026-02-07]
        const { data: treeData } = await sb.from('tree_metadata')
            .select('*')
            .in('tree_id', ['F1-FR-001', 'F1-FR-002', 'F1-FR-003'])
            .order('tree_id', { ascending: true });

        if (!treeData || treeData.length === 0) throw new Error("Genesis trees not found in DB.");

        for (const t of treeData) {
            console.log(`🌱 Planting ${t.tree_id}...`);

            const [treePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(t.tree_id)],
                program.programId
            );
            const [posPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("position"), auth.toBuffer(), treePda.toBuffer()],
                program.programId
            );

            // 4. Execute Transaction
            // skipPreflight: true is essential to keep the new IP "clean"
            const sig = await program.methods
                .addTreeToField(
                    t.tree_id,
                    t.variety || "Frantoio",
                    Math.floor((t.latitude || 0) * 1000000),
                    Math.floor((t.longitude || 0) * 1000000),
                    Number(t.age_years || 2024)
                )
                .accounts({
                    tree: treePda,
                    treePosition: posPda,
                    field: fieldPda,
                    config: configPda,
                    authority: auth,
                    authorityStake: stakePda,
                    systemProgram: SystemProgram.programId,
                })
                .rpc({ skipPreflight: true });

            console.log(`✅ ${t.tree_id} Confirmed: ${sig.slice(0,8)}`);

            // 5. Update Supabase
            await sb.from('tree_metadata')
                .update({ on_chain_address: treePda.toBase58(), field_pda: fieldPda.toBase58() })
                .eq('tree_id', t.tree_id);

            // Even with a VPN, wait 10 seconds to stay under the "burst" limit
            console.log("⏳ 10s Pacing Delay...");
            await new Promise(r => setTimeout(r, 10000));
        }

        alert("Genesis Sequence Complete! VPN bypassed the limits successfully.");

    } catch (err: any) {
        console.error("❌ Planting Failed:", err);
        // If 6020 happens here, we need to check if the 'field' was initialized by a different wallet
        alert(`Error: ${err.message}`);
    }
};
/**
 * NUCLEAR RECOVERY: Purge GHOST buffers [2026-02-27]
 * Targets accounts that aren't the standard size (156b for Trees).
 */
 /* [2026-02-27] Genesis Deployment - IDL Corrected */

(window as any).runGenesisDeployment = async () => {
    const program = getProgram();
    const auth = program.provider.publicKey;

    try {
        console.log("🔍 STEP 1: Fetching metadata from Supabase...");

        // Fetch Field info
        const { data: fieldData } = await sb.from('fields').select('*').limit(1).single();
        // Fetch First 3 Trees [2026-02-07]
        const { data: treeData } = await sb.from('tree_metadata').select('*').order('tree_id', { ascending: true }).limit(3);

        if (!fieldData || !treeData) throw new Error("Could not find metadata in Supabase.");

        console.log("✅ DATA FOUND:", fieldData.field_name);
        console.log("🌲 TREES:", treeData.map(t => t.tree_id).join(", "));

        // 1. Derive Field PDA (Seeds: "field", authority, name)
        const [fieldPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("field"), auth.toBuffer(), Buffer.from(fieldData.field_name)],
            program.programId
        );

        const tx = new Transaction();
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

        // 2. ADD FIELD INITIALIZATION
        // IDL Args: name, area_sq_meters, metadata_url, location, lat, long
        tx.add(await program.methods
            .initField(
                fieldData.field_name,
                new BN(fieldData.area || 1000),
                fieldData.metadata_url || "",
                fieldData.location || "Tuscany",
                fieldData.lat || 0,
                fieldData.long || 0
            )
            .accounts({
                config: configPda,
                field: fieldPda,
                authority: auth,
                systemProgram: SystemProgram.programId,
            })
            .instruction()
        );

        // 3. ADD 3 TREES
        const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), auth.toBuffer()], program.programId);

        for (const t of treeData) {
            const [treePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(t.tree_id)],
                program.programId
            );

            // IDL Args: tree_id, cultivar, lat, long, year
            tx.add(await program.methods
                .addTreeToField(
                    t.tree_id,
                    t.cultivar || "Leccino",
                    t.lat || 0,
                    t.long || 0,
                    t.year || 2024
                )
                .accounts({
                    tree: treePda,
                    treePosition: (PublicKey.findProgramAddressSync([Buffer.from("position"), auth.toBuffer(), treePda.toBuffer()], program.programId))[0],
                    field: fieldPda,
                    config: configPda,
                    authority: auth,
                    authorityStake: stakePda,
                    systemProgram: SystemProgram.programId,
                })
                .instruction()
            );
        }

        console.log("🚀 SENDING ATOMIC TRANSACTION...");
        const sig = await program.provider.sendAndConfirm!(tx);

        console.log("🔥 GENESIS SUCCESSFUL:", sig);
        alert(`Success! Field and 3 Trees live. Sig: ${sig.slice(0, 8)}...`);

    } catch (err: any) {
        console.error("❌ Deployment Failed:", err);
        alert("Error: " + err.message);
    }
};
/**
 * 3. DEEP OWNERSHIP REGISTRY
 * Populates the table in admin.html and handles Admin Bypasses [2026-01-16]
 */
(window as any).loadDeepOwnershipRegistry = async () => {
    const container = document.getElementById('deep-registry-body');
    if (!container) return;

    container.innerHTML = `<tr><td colspan="4" class="p-10 text-center animate-pulse text-zinc-500 font-mono text-[9px]">>> SCANNING LEDGER...</td></tr>`;

    try {
        const program = getProgram();
        const isAdmin = program.provider.publicKey.toBase58() === ADMIN_WALLET;

        const [allPositions, allTrees] = await Promise.all([
            program.account.treePosition.all(),
            program.account.tree.all()
        ]);

        const treeMap = new Map();
        allTrees.forEach(t => treeMap.set(t.publicKey.toBase58(), t.account.treeId));

        let html = '';
        allPositions.forEach(pos => {
            const data = pos.account;
            const treePk = pos.publicKey.toBase58();
            const treeId = treeMap.get(data.tree.toBase58()) || "UNK";
            const isLocked = data.hasActiveVote; // [2026-01-16] Lock

            html += `
                <tr class="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td class="p-4"><span class="font-black text-white italic">#${treeId}</span></td>
                    <td class="p-4 font-mono text-zinc-400 text-[9px]">${data.owner.toBase58()}</td>
                    <td class="p-4 text-center font-black text-solana">${data.shares.toNumber()}</td>
                    <td class="p-4 text-right">
                        <div class="flex items-center justify-end gap-2">
                            <span class="px-2 py-0.5 rounded-[4px] text-[8px] font-black uppercase ${isLocked ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-400'}">
                                ${isLocked ? 'VOTED_LOCKED' : 'LIQUID'}
                            </span>
                            ${(isAdmin && isLocked) ? `<button onclick="window.emergencyUnstake('${treePk}')" class="bg-red-600 text-[8px] px-2 py-1 rounded font-bold">FORCE_UNLOCK</button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        });

        container.innerHTML = html || '<tr><td colspan="4" class="p-10 text-center">No positions found.</td></tr>';

    } catch (err: any) {
        container.innerHTML = `<tr><td colspan="4" class="p-10 text-center text-red-500">SCAN ERROR: ${err.message}</td></tr>`;
    }
};
(window as any).createGenesisFieldOnly = async () => {
    const program = getProgram();
    const auth = program.provider.publicKey;

    try {
        console.log("🔍 Fetching Field metadata...");
        const { data: fieldData } = await sb.from('fields').select('*').limit(1).single();
        if (!fieldData) throw new Error("No field in Supabase");

        const [fieldPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("field"), auth.toBuffer(), Buffer.from(fieldData.field_name)],
            program.programId
        );

        console.log("🛠️ Initializing Field:", fieldData.field_name);

        // Single light RPC call
        const sig = await program.methods
            .initField(
                fieldData.field_name,
                new BN(fieldData.area || 1000),
                fieldData.metadata_url || "",
                fieldData.location || "Tuscany",
                fieldData.lat || 0,
                fieldData.long || 0
            )
            .accounts({
                config: (PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId))[0],
                field: fieldPda,
                authority: auth,
                systemProgram: SystemProgram.programId,
            })
            .rpc();

        console.log("✨ FIELD LIVE:", sig);
        alert("Field created! Now run Step 2 (Plant Trees).");

        // Save field PDA to a global for Step 2
        (window as any).activeFieldPda = fieldPda;

    } catch (err: any) {
        console.error("❌ Field Fail:", err.message);
        alert("Error: " + err.message);
    }
};


(window as any).verifyAndPlant = async () => {
    const program = getProgram();
    const auth = program.provider.publicKey;

    try {
        const { data: fieldData } = await sb.from('fields').select('*').limit(1).single();
        const [fieldPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("field"), auth.toBuffer(), Buffer.from(fieldData.field_name)],
            program.programId
        );

        // [2026-02-07] Specifically targeting the first 3 by ID
        const { data: treeData } = await sb.from('tree_metadata')
            .select('*')
            .in('tree_id', ['F1-FR-001', 'F1-FR-002', 'F1-FR-003'])
            .order('tree_id', { ascending: true });

        if (!treeData) return;

        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
        const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), auth.toBuffer()], program.programId);

        console.log("🚀 STARTING RATE-LIMIT BREAKER SEQUENCE...");

        for (const t of treeData) {
            console.log(`📡 Sending Transaction for ${t.tree_id}...`);

            const [treePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(t.tree_id)],
                program.programId
            );

            const [posPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("position"), auth.toBuffer(), treePda.toBuffer()],
                program.programId
            );

            // Scaling for i32 precision
            const latFixed = Math.floor((t.latitude || 0) * 1000000);
            const longFixed = Math.floor((t.longitude || 0) * 1000000);

            // We use .rpc({ skipPreflight: true }) to avoid the "Retry Loop" that causes 429s
            const sig = await program.methods
                .addTreeToField(
                    t.tree_id,
                    t.variety || "Frantoio",
                    latFixed,
                    longFixed,
                    Number(t.age_years || 2024)
                )
                .accounts({
                    tree: treePda,
                    treePosition: posPda,
                    field: fieldPda,
                    config: configPda,
                    authority: auth,
                    authorityStake: stakePda,
                    systemProgram: SystemProgram.programId,
                })
                .rpc({ skipPreflight: true });

            console.log(`✅ TX SENT: ${sig}`);
            console.log("⏳ Mandatory 10-second RPC rest...");

            // Wait 10 seconds. Do not click anything.
            await new Promise(r => setTimeout(r, 10000));
        }

        alert("Sequence finished. Check explorer for confirmations.");

    } catch (err: any) {
        if (err.message.includes("429")) {
            console.error("🛑 STILL BLOCKED: Wait 60 seconds before trying again.");
        } else {
            console.error("❌ Error:", err.message);
        }
    }
};
(window as any).cleanSlatePlanting = async () => {
    const program = getProgram();
    const auth = program.provider.publicKey;

    try {
        console.log("🔍 Fetching Program State...");

        // 1. Get the Config PDA
const info = await connection.getAccountInfo(configPda);
        console.log(info);

        const configAccount: any = await program.account.config.fetch(configPda);

        // 2. Derive the Field PDA using the Authority seed (the standard Anchor way)
        // If your program uses the Config's field counter, we need to match that.
        const [fieldPda] = PublicKey.findProgramAddressSync(
            [Buffer.from("field"), auth.toBuffer(), Buffer.from("Toscagialla Heritage Grove")],
            program.programId
        );

        console.log("📍 Program Config Authority:", configAccount.authority.toBase58());
        console.log("📍 Using Field PDA:", fieldPda.toBase58());

        // 3. Fetch the Genesis 3
        const { data: treeData } = await sb.from('tree_metadata')
            .select('*')
            .in('tree_id', ['F1-FR-001', 'F1-FR-002', 'F1-FR-003'])
            .order('tree_id', { ascending: true });

        const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), auth.toBuffer()], program.programId);

        for (const t of treeData!) {
            console.log(`🌱 Planting ${t.tree_id}...`);

            // THE CRITICAL SEED: Ensure tree is tied to the fieldPda
            const [treePda] = PublicKey.findProgramAddressSync(
                [Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(t.tree_id)],
                program.programId
            );
            console.log(treePda);


            const [posPda] = PublicKey.findProgramAddressSync(
                [Buffer.from("position"), auth.toBuffer(), treePda.toBuffer()],
                program.programId
            );
console.log(posPda);

        /*    const sig = await program.methods
                .addTreeToField(
                    t.tree_id,
                    t.variety || "Frantoio",
                    Math.floor((t.latitude || 0) * 1000000),
                    Math.floor((t.longitude || 0) * 1000000),
                    Number(t.age_years || 2024)
                )
                .accounts({
                    tree: treePda,
                    treePosition: posPda,
                    field: fieldPda,
                    config: configPda,
                    authority: auth,
                    authorityStake: stakePda,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();
*/
            console.log(`✅ Success: ${t.tree_id}`);

            await sb.from('tree_metadata')
                .update({ on_chain_address: treePda.toBase58(), field_pda: fieldPda.toBase58() })
                .eq('tree_id', t.tree_id);

            await new Promise(r => setTimeout(r, 10000));
        }

        alert("Genesis Planting Complete.");

    } catch (err: any) {
        console.error("❌ Final Attempt Fail:", err);
        if (err.message.includes("6020")) {
            alert("Still getting 6020. This means the 'field' account on-chain has a different 'authority' stored inside it than your wallet.");
        }
    }
};
/**
 * 4. SYSTEM AUDIT & GHOST BUFFERS
 */
(window as any).runSystemAudit = async () => {
    const tray = document.getElementById('auditTray');
    const content = document.getElementById('auditContent');
    if (!tray || !content) return;

    tray.classList.remove('hidden');
    content.innerHTML = `<div class="animate-pulse">SCANNIG SOLANA LEDGER...</div>`;

    try {
        const program = getProgram();
        const accounts = await solConn.getProgramAccounts(PROGRAM_ID);

        const healthy = accounts.filter(a => a.account.data.length === 156).length;
        const legacy = accounts.filter(a => a.account.data.length !== 156).length;

        content.innerHTML = `
            <div class="space-y-2">
                <div class="flex justify-between"><span>Healthy Trees (156b):</span> <span class="text-solana font-bold">${healthy}</span></div>
                <div class="flex justify-between"><span>Legacy Buffers:</span> <span class="text-red-500 font-bold">${legacy}</span></div>
                <button onclick="window.surgicalNuclearRecovery()" class="w-full mt-4 py-2 bg-red-900/40 border border-red-500 text-red-500 text-[9px] font-bold uppercase rounded hover:bg-red-600 hover:text-white">
                    Execute Nuclear Recovery
                </button>
            </div>
        `;
    } catch (err: any) {
        content.innerHTML = `<div class="text-red-500 uppercase">Audit Failed: ${err.message}</div>`;
    }
};

/**
 * 5. ADMIN EMERGENCY BYPASS [2026-01-16]
 */
(window as any).emergencyUnstake = async (posPk: string) => {
    try {
        const program = getProgram();
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

        console.log("🚨 Admin Override: Forcing Unstake for", posPk);
        await program.methods.emergencyAdminUnstake(new BN(0)) // 0 = all
            .accounts({
                admin: program.provider.publicKey,
                treePosition: new PublicKey(posPk),
                config: configPda,
            }).rpc();

        alert("Sovereign Unlock Complete.");
        (window as any).loadDeepOwnershipRegistry();
    } catch (err: any) {
        alert("Bypass failed: " + err.message);
    }
};

(window as any).heliusPlanting = async () => {
    // 1. Setup the Private Helius Connection (Using HTTPS for RPC)
    const HELIUS_URL = "https://devnet.helius-rpc.com/?api-key=122be0d1-b67c-49c7-ae73-266cb9b7a470";
    const heliusConnection = new anchor.web3.Connection(HELIUS_URL, "confirmed");

    const program = getProgram();
    const auth = program.provider.publicKey;

    try {
        console.log("🚀 HELIUS SNIPER STARTING...");
        const NAME = "Toscagialla Heritage Grove V2";

        // 2. Derive PDAs
        const [fieldPda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("field"), auth.toBuffer(), Buffer.from(NAME)], program.programId);
        const [configPda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
        const [stakePda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("stake"), auth.toBuffer()], program.programId);

        // 3. Fetch Data from Supabase
        const { data: treeData } = await sb.from('tree_metadata').select('*').in('tree_id', ['F1-FR-001', 'F1-FR-002', 'F1-FR-003']);

        const transaction = new anchor.web3.Transaction();

        // 4. Check Field Status on Helius
        const fieldAccount = await heliusConnection.getAccountInfo(fieldPda);
        if (!fieldAccount) {
            console.log("🛠️ Adding Field Init to bundle...");
            transaction.add(await program.methods.initField(NAME, new anchor.BN(5000), "url", "Italy", 43460000, 11120000)
                .accounts({ config: configPda, field: fieldPda, authority: auth, systemProgram: anchor.web3.SystemProgram.id })
                .instruction());
        }

        // 5. Add Trees to bundle
        for (const t of treeData!) {
            const [treePda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(t.tree_id)], program.programId);
            const [posPda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("position"), auth.toBuffer(), treePda.toBuffer()], program.programId);

            const treeAccount = await heliusConnection.getAccountInfo(treePda);
            if (!treeAccount) {
                console.log(`🌱 Adding Tree ${t.tree_id} to bundle...`);
                transaction.add(await program.methods.addTreeToField(t.tree_id, t.variety || "Frantoio", 43460000, 11120000, 2024)
                    .accounts({ tree: treePda, treePosition: posPda, field: fieldPda, config: configPda, authority: auth, authorityStake: stakePda, systemProgram: anchor.web3.SystemProgram.id })
                    .instruction());
            }
        }

        if (transaction.instructions.length === 0) {
            console.log("🏁 Grove is already fully planted on Helius.");
            return;
        }

        // 6. Send Transaction
        console.log("📡 Requesting Blockhash from Helius...");
        const { blockhash } = await heliusConnection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = auth;

        console.log("✍️ Signing with Wallet...");
        const signedTx = await (window as any).solana.signTransaction(transaction);

        console.log("📤 Sending via Helius Private Pipeline...");
        const sig = await heliusConnection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true });

        console.log(`✅ DISPATCHED! Helius Sig: ${sig}`);

        // Final Supabase Sync
        await sb.from('fields').update({ field_name: NAME, pda_address: fieldPda.toBase58() }).eq('id', 1);
        for (const t of treeData!) {
             const [treePda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(t.tree_id)], program.programId);
             await sb.from('tree_metadata').update({ on_chain_address: treePda.toBase58(), field_pda: fieldPda.toBase58() }).eq('tree_id', t.tree_id);
        }

        alert("Helius Success! The Grove V2 is live.");

    } catch (err: any) {
        console.error("❌ Helius Sniper Failed:", err);
        alert(`Error: ${err.message}`);
    }
};
(window as any).finalSeal = async () => {
    const program = getProgram();
    const auth = program.provider.publicKey;
    const NAME = "Toscagialla Heritage Grove V2";

    // Re-derive the addresses we just birthed on-chain
    const [fieldPda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("field"), auth.toBuffer(), Buffer.from(NAME)], program.programId);

    console.log("💾 Sealing the records in Supabase...");

    try {
        // 1. Update Field (Using the Name instead of ID to be safe)
        await sb.from('fields')
            .update({ pda_address: fieldPda.toBase58() })
            .eq('field_name', NAME);

        // 2. Update Trees
        const treeIds = ['F1-FR-001', 'F1-FR-002', 'F1-FR-003'];
        for (const id of treeIds) {
            const [treePda] = anchor.web3.PublicKey.findProgramAddressSync([Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(id)], program.programId);

            await sb.from('tree_metadata')
                .update({
                    on_chain_address: treePda.toBase58(),
                    field_pda: fieldPda.toBase58()
                })
                .eq('tree_id', id);
        }

        console.log("%c ✨ ALL SYSTEMS SYNCHRONIZED.", "color: #00ff00; font-size: 16px; font-weight: bold;");
        alert("The Grove V2 is now fully documented in Supabase. You are finished!");
    } catch (err) {
        console.error("Sync failed:", err);
    }
};
(window as any).surgicalPlanting = async () => {
    const program = getProgram();
    const auth = program.provider.publicKey;
    const connection = program.provider.connection;

    try {
        console.log("🎯 SURGICAL STRIKE: Fixing the V2 Grove...");
        const NAME = "Toscagialla Heritage Grove V2";

        const [fieldPda] = PublicKey.findProgramAddressSync([Buffer.from("field"), auth.toBuffer(), Buffer.from(NAME)], program.programId);
        const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);
        const [stakePda] = PublicKey.findProgramAddressSync([Buffer.from("stake"), auth.toBuffer()], program.programId);

        // Check if Field already exists
        const fieldAccount = await connection.getAccountInfo(fieldPda);
        const transaction = new Transaction();

        if (!fieldAccount) {
            console.log("🛠️ Field doesn't exist. Adding init_field...");
            transaction.add(await program.methods.initField(NAME, new anchor.BN(5000), "url", "Italy", 43460000, 11120000)
                .accounts({ config: configPda, field: fieldPda, authority: auth, systemProgram: SystemProgram.programId })
                .instruction());
        } else {
            console.log("✅ Field already exists. Skipping init_field.");
        }

        // Add the 3 Trees [2026-02-07]
        const { data: treeData } = await sb.from('tree_metadata').select('*').in('tree_id', ['F1-FR-001', 'F1-FR-002', 'F1-FR-003']);

        for (const t of treeData!) {
            const [treePda] = PublicKey.findProgramAddressSync([Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(t.tree_id)], program.programId);
            const [posPda] = PublicKey.findProgramAddressSync([Buffer.from("position"), auth.toBuffer(), treePda.toBuffer()], program.programId);

            // Check if tree exists to avoid double-planting errors
            const treeAccount = await connection.getAccountInfo(treePda);
            if (!treeAccount) {
                console.log(`🌱 Adding tree ${t.tree_id}...`);
                transaction.add(await program.methods.addTreeToField(t.tree_id, t.variety || "Frantoio", 43460000, 11120000, 2024)
                    .accounts({ tree: treePda, treePosition: posPda, field: fieldPda, config: configPda, authority: auth, authorityStake: stakePda, systemProgram: SystemProgram.programId })
                    .instruction());
            } else {
                console.log(`🌵 Tree ${t.tree_id} already exists.`);
            }
        }

        if (transaction.instructions.length === 0) {
            console.log("🏁 Everything is already on-chain. Nothing to do.");
            return;
        }

        const { blockhash } = await connection.getLatestBlockhash("confirmed");
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = auth;

        const signedTx = await (window as any).solana.signTransaction(transaction);
        const sig = await connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: true });

        console.log(`🚀 DISPATCHED! Sig: ${sig}`);

        // Update Supabase to be sure
        await sb.from('fields').update({ field_name: NAME, pda_address: fieldPda.toBase58() }).eq('id', 1);
        for (const t of treeData!) {
            const [treePda] = PublicKey.findProgramAddressSync([Buffer.from("tree"), fieldPda.toBuffer(), Buffer.from(t.tree_id)], program.programId);
            await sb.from('tree_metadata').update({ on_chain_address: treePda.toBase58(), field_pda: fieldPda.toBase58() }).eq('tree_id', t.tree_id);
        }

        alert("Surgical Strike Complete. Check console.");

    } catch (err: any) {
        console.error("❌ Strike Failed:", err);
    }
};
console.log("🛡️ Protocol Console Engine Online.");
