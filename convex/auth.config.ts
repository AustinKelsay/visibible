import { parseGuestPublicKeys } from "./_helpers/guestKeys";
import type { AuthConfig } from "convex/server";

const jwks = process.env.GUEST_AUTH_JWKS;
const issuer = process.env.GUEST_AUTH_ISSUER;
const audience = process.env.GUEST_AUTH_AUDIENCE;
if (jwks && (!issuer || !audience)) {
  throw new Error("Guest auth requires issuer and audience");
}

// Deployment configuration contains public keys only. Missing configuration
// leaves public browsing available while this integration is rolled out.
export default {
  providers: jwks ? [{
    type: "customJwt",
    issuer: issuer!,
    applicationID: audience!,
    algorithm: "RS256",
    jwks: `data:application/json,${encodeURIComponent(JSON.stringify(parseGuestPublicKeys(jwks)))}`,
  }] : [],
} satisfies AuthConfig;
