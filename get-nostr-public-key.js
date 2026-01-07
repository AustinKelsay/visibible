#!/usr/bin/env node

/**
 * Simple script to derive a Nostr public key from a private key hex
 * Usage: node get-nostr-public-key.js <private-key-hex>
 */

const { getPublicKey } = require("snstr");

function main() {
  const privateKeyHex = process.argv[2];

  if (!privateKeyHex) {
    console.error("Usage: node get-nostr-public-key.js <private-key-hex>");
    process.exit(1);
  }

  try {
    const publicKey = getPublicKey(privateKeyHex);
    console.log(publicKey);
  } catch (error) {
    console.error("Error deriving public key:", error.message);
    process.exit(1);
  }
}

main();

