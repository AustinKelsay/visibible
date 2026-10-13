/** Explicit public projection prevents RSA private parameters reaching clients. */
export function parseGuestPublicKeys(raw: string) {
  const input: unknown = JSON.parse(raw);
  if (!input || typeof input !== "object" || !("keys" in input) ||
      !Array.isArray(input.keys) || !input.keys.length) {
    throw new Error("Guest verification keys are not configured");
  }
  const kids = new Set<string>();
  return { keys: input.keys.map((key: unknown) => {
    if (!key || typeof key !== "object" || !("kty" in key) || key.kty !== "RSA" ||
        !("n" in key) || typeof key.n !== "string" || !key.n ||
        !("e" in key) || typeof key.e !== "string" || !key.e ||
        !("kid" in key) || typeof key.kid !== "string" || !key.kid || kids.has(key.kid)) {
      throw new Error("Invalid guest verification key");
    }
    kids.add(key.kid);
    return { kty: "RSA", n: key.n, e: key.e, kid: key.kid, alg: "RS256", use: "sig" };
  }) };
}
