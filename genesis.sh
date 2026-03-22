#!/bin/bash

# 1. Extract the OLV_MINT address from your TypeScript file
# This looks for the line containing OLV_MINT and pulls out the string inside quotes
OLV_MINT=$(grep "OLV_MINT" admin_new.ts | sed -E 's/.*"([^"]+)".*/\1/')

echo "--- 🛡️ GENESIS PROTOCOL STARTING ---"
echo "Detected OLV_MINT: $OLV_MINT"

# 2. Check if the validator is running
if ! solana ping -ul > /dev/null 2>&1; then
    echo "❌ Error: Local validator is not running! Run 'solana-test-validator --reset' in another tab."
    exit 1
fi

# 3. Fund the Admin Wallet (The address from your console)
ADMIN_PUBKEY="8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54"
echo "💰 Airdropping 10 SOL to Admin..."
solana airdrop 10 $ADMIN_PUBKEY -ul

# 4. Create the Mint on-chain using your hardcoded address
# This requires you to have the mint-keypair.json. 
# If you don't have it, we create the mint and the script will tell you the new address.
echo "🪙 Initializing OLV Token Mint..."
spl-token create-token --decimals 9 -ul

# 5. Create Admin Token Account and Mint 1M Tokens
echo "📥 Setting up Admin Token Wallet..."
spl-token create-account $OLV_MINT -ul
spl-token mint $OLV_MINT 1000000 -ul

# 6. Distribute to Test Wallets
RECIPIENTS=(
    "FrNP32Hxhuu4pS8yguHhtTEdU9QpU7odRYi5zKNps15N"
    "HamTYmFcmw5qzBFFKiuBECw6CKaJ8j3Xm3TPp3U8Vdou"
)

for WALLET in "${RECIPIENTS[@]}"
do
    echo "✈️  Sending 1,000 SOL and 100k OLV to $WALLET..."
    solana transfer $WALLET 1000 --allow-unfunded-recipient -ul
    spl-token transfer $OLV_MINT 100000 $WALLET --fund-recipient -ul
done

echo "--- ✅ GENESIS COMPLETE ---"
echo "Admin Balance:"
solana balance $ADMIN_PUBKEY -ul
spl-token balance --address $ADMIN_PUBKEY -ul
#!/bin/bash

# 1. FIND THE FILE AUTOMATICALLY
# This searches for admin_new.ts starting from the current directory
FILE_PATH=$(find . -name "admin_new.ts" | head -n 1)

if [ -z "$FILE_PATH" ]; then
    echo "❌ ERROR: Could not find admin_new.ts in any subfolder!"
    exit 1
fi

# 2. EXTRACT THE MINT ADDRESS
# We look for the line with OLV_MINT and pull the string between quotes
OLV_MINT=$(grep "OLV_MINT" "$FILE_PATH" | sed -E 's/.*"([^"]+)".*/\1/')

echo "--- 🛡️ GENESIS PROTOCOL STARTING ---"
echo "📂 Found file at: $FILE_PATH"
echo "🪙 Detected OLV_MINT: $OLV_MINT"

# Check if we actually got a valid-looking address (approx 44 chars)
if [[ ${#OLV_MINT} -lt 32 ]]; then
    echo "❌ ERROR: Could not extract a valid Mint Address from $FILE_PATH"
    echo "Check if your line looks like: const OLV_MINT = \"your_address\";"
    exit 1
fi

# 3. CHECK VALIDATOR
if ! solana ping -ul > /dev/null 2>&1; then
    echo "❌ ERROR: Local validator is not running! Run 'solana-test-validator --reset' first."
    exit 1
fi

# 4. START THE TRANSFERS
ADMIN_PUBKEY="8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54"
echo "💰 Funding Admin: $ADMIN_PUBKEY"
solana airdrop 10 $ADMIN_PUBKEY -ul --status

# 5. TEST WALLETS
RECIPIENTS=(
    "FrNP32Hxhuu4pS8yguHhtTEdU9QpU7odRYi5zKNps15N"
    "HamTYmFcmw5qzBFFKiuBECw6CKaJ8j3Xm3TPp3U8Vdou"
)

for WALLET in "${RECIPIENTS[@]}"
do
    echo "--------------------------------------"
    echo "✈️  Processing: $WALLET"
    
    # Transfer 1000 SOL
    solana transfer $WALLET 1000 --allow-unfunded-recipient -ul --status
    
    # Try to fund OLV tokens (This will only work if the mint is already created)
    echo "📦 Attempting to fund OLV Tokens..."
    spl-token transfer $OLV_MINT 100000 $WALLET --fund-recipient -ul
done

echo ""
echo "--- ✅ GENESIS COMPLETE ---"
solana balance $ADMIN_PUBKEY -ul
