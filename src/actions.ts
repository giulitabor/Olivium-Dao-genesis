import { program, provider } from "./connection";
import { getConfigPda } from "./pda";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";



export async function setPaused(status: boolean) {
  const [configPda] = getConfigPda();

  await program.methods
    .setPaused(status)
    .accounts({
      config: configPda,
      admin: provider.wallet.publicKey,
    })
    .rpc();
}


export async function updateManager(newManager: string) {
  const [configPda] = getConfigPda();

  await program.methods
    .updateManager(new PublicKey(newManager))
    .accounts({
      config: configPda,
      admin: provider.wallet.publicKey,
    })
    .rpc();
}

export async function emergencyUnstake(
  field,
  tree,
  treePosition,
  amount
) {
  const [configPda] = getConfigPda();

  await program.methods
    .emergencyAdminUnstake(new BN(amount))
    .accounts({
      admin: provider.wallet.publicKey,
      field,
      tree,
      treePosition,
      config: configPda,
    })
    .rpc();
}
