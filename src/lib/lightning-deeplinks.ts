function normalizeBolt11(bolt11: string): string {
  return bolt11.trim();
}

export function getLightningUri(bolt11: string): string {
  return `lightning:${normalizeBolt11(bolt11)}`;
}

export function getBitcoinUri(bolt11: string): string {
  return `bitcoin:?lightning=${encodeURIComponent(normalizeBolt11(bolt11))}`;
}

export function getCashAppDeepLinks(bolt11: string): string[] {
  const normalizedBolt11 = normalizeBolt11(bolt11);
  const query = new URLSearchParams({
    lightning: normalizedBolt11,
    invoice: normalizedBolt11,
    bolt11: normalizedBolt11,
  }).toString();

  return [
    `cashme://bitcoin?${query}`,
    `squarecash://bitcoin?${query}`,
    `https://cash.app/launch/bitcoin?${query}`,
  ];
}
