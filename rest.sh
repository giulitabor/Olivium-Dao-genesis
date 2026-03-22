#!/bin/bash

# 1. Reset Local Network
echo "--- Resetting Localnet ---"
anchor localnet down
# Remove old ledger data (optional, but ensures clean state)
rm -rf test-ledger

# 2. Setup Keypairs directory
mkdir -p .keys
# We assume the user has these keys already or will generate them.
# If these files don't exist, this creates them for you.
solana-keygen new --no-bip39-passphrase -o .keys/$name.json

done

# 3. Start Localnet
echo "--- Starting Localnet ---"
anchor localnet up &
sleep 5 # Wait for validator to start

# 4. Define Recipient Addresses
REC1="FrNP32Hxhuu4pS8yguHhtTEdU9QpU7odRYi5zKNps15N"
REC2="3F5twRseis3rmth3mEkyvHMtgTtHds52zCppqo5BBPUv"
ADMIN="8xkNHk2VpWBM6Nk3enitFCs7vwh2inCveTNintcXHc54"

# 5. Create OLV Token
echo "--- Creating OLV Token ---"
# Create token and capture the mint address
OLV_MINT=$(spl-token create-token --program-id TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA | grep "Creating token" | awk '{print $3}')
echo "Created OLV Mint: $OLV_MINT"

# 6. Fund Recipients (SOL & OLV)
# We use the default CLI wallet as the funding source
echo "--- Distributing Assets ---"

# Recipient 1: 200 SOL, 2400 OLV
solana transfer $REC1 200 --allow-unfunded-recipient
spl-token transfer $OLV_MINT 2400 $REC1 --fund-recipient

# Recipient 2: 50 SOL, 32000 OLV
solana transfer $REC2 50 --allow-unfunded-recipient
spl-token transfer $OLV_MINT 32000 $REC2 --fund-recipient

# Admin: 500 SOL, 45000 OLV
solana transfer $ADMIN 500 --allow-unfunded-recipient
spl-token transfer $OLV_MINT 45000 $ADMIN --fund-recipient

echo "--- Setup Complete ---"
echo "Deployment Ready. Use Mint Address: $OLV_MINT"
