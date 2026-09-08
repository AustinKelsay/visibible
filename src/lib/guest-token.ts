import { parseGuestPublicKeys } from "../../convex/_helpers/guestKeys";
import { importJWK, SignJWT, type JWK } from "jose";

export const GUEST_TOKEN_LIFETIME_SECONDS = 300;

export function publicGuestKeys() {
  return parseGuestPublicKeys(process.env.GUEST_AUTH_JWKS ?? "{}");
}

export async function issueGuestToken(sid: string, sessionExpiresAt: number) {
  const issuer = process.env.GUEST_AUTH_ISSUER;
  const audience = process.env.GUEST_AUTH_AUDIENCE;
  const privateJwk = JSON.parse(process.env.GUEST_AUTH_PRIVATE_JWK ?? "{}") as JWK;
  const publicKey = publicGuestKeys().keys.find((key) => key.kid === privateJwk.kid);
  if (!issuer || !audience || !sid || !privateJwk.d || !publicKey ||
      publicKey.n !== privateJwk.n || publicKey.e !== privateJwk.e) {
    throw new Error("Guest signing configuration is invalid");
  }
  if (!Number.isSafeInteger(sessionExpiresAt)) throw new Error("Invalid session expiry");
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = Math.min(now + GUEST_TOKEN_LIFETIME_SECONDS, sessionExpiresAt);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) {
    throw new Error("Guest session has expired");
  }
  const key = await importJWK(privateJwk, "RS256");
  const token = await new SignJWT({ guestExpiresAt: sessionExpiresAt })
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: publicKey.kid })
    .setSubject(sid).setIssuer(issuer).setAudience(audience)
    // Convex requests a fresh token immediately after its initial validation.
    // A unique ID prevents same-second signatures from disabling refresh scheduling.
    .setJti(crypto.randomUUID()).setIssuedAt(now).setExpirationTime(expiresAt).sign(key);
  return { token, expiresAt };
}
