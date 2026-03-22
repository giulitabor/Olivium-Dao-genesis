import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import idl from "../target/idl/olive_dao.json";
import { PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey(idl.address);

async function main() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new Program(idl as any, PROGRAM_ID, provider);

  const [configPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    PROGRAM_ID
  );

  console.log("Config PDA:", configPda.toBase58());

  // Change this in admin_new.ts and init_dao.ts
await program.methods
  .initialize_global_config(new BN(500), new BN(1000)) // Pass the required fee and min_stake args
  .accounts({
    config: configPda,
    treasury: program.provider.publicKey, // Add missing treasury account from IDL
    authority: program.provider.publicKey,
    systemProgram: anchor.web3.SystemProgram.programId,
  })
  .rpc();
main();
