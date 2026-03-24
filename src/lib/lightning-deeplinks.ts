function normalizeBolt11(bolt11: string): string {
  return bolt11.trim();
}

export function getLightningUri(bolt11: string): string {
  return `lightning:${normalizeBolt11(bolt11)}`;
}

export function getBitcoinUri(bolt11: string): string {
  return `bitcoin:?lightning=${encodeURIComponent(normalizeBolt11(bolt11))}`;
}

export function getCashAppSingleParamDeepLinks(bolt11: string): string[] {
  const normalizedBolt11 = normalizeBolt11(bolt11);
  const bases = [
    "cashme://pay",
    "squarecash://pay",
    "https://cash.app/pay/lightning",
    "https://cash.app/pay/bitcoin",
    "https://cash.app/launch/pay",
    "cashme://bitcoin",
    "squarecash://bitcoin",
    "https://cash.app/launch/bitcoin",
  ];
  const keys = ["invoice", "lightning", "bolt11"] as const;
  const deepLinks: string[] = [];

  for (const base of bases) {
    for (const key of keys) {
      deepLinks.push(`${base}?${new URLSearchParams({ [key]: normalizedBolt11 }).toString()}`);
    }
  }

  return deepLinks;
}

export function getCashAppPathDeepLinks(bolt11: string): string[] {
  const normalizedBolt11 = encodeURIComponent(normalizeBolt11(bolt11));

  return [
    `cashme://pay/${normalizedBolt11}`,
    `cashme://bitcoin/${normalizedBolt11}`,
    `squarecash://pay/${normalizedBolt11}`,
    `squarecash://bitcoin/${normalizedBolt11}`,
    `https://cash.app/pay/${normalizedBolt11}`,
    `https://cash.app/launch/pay/${normalizedBolt11}`,
    `https://cash.app/launch/bitcoin/${normalizedBolt11}`,
  ];
}

export function getCashAppWrappedUriDeepLinks(bolt11: string): string[] {
  const lightningUri = getLightningUri(bolt11);
  const bitcoinUri = getBitcoinUri(bolt11);
  const bases = [
    "cashme://pay",
    "squarecash://pay",
    "https://cash.app/pay/lightning",
    "https://cash.app/pay/bitcoin",
    "https://cash.app/launch/pay",
  ];
  const values = [
    { key: "uri", value: bitcoinUri },
    { key: "request", value: bitcoinUri },
    { key: "url", value: lightningUri },
  ] as const;
  const deepLinks: string[] = [];

  for (const base of bases) {
    for (const { key, value } of values) {
      deepLinks.push(`${base}?${new URLSearchParams({ [key]: value }).toString()}`);
    }
  }

  return deepLinks;
}
