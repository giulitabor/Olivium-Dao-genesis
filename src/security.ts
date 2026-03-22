import { provider } from "./connection";
import { fetchConfig } from "./fetchers";

export async function verifyAdmin(): Promise<boolean> {
  const config = await fetchConfig();
  const wallet = provider.wallet.publicKey;

  return wallet.equals(config.admin);
}
