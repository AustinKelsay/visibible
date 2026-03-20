import { getClientIp } from "@/lib/client-ip";

type OpsAuthOptions = {
  tokenEnvVar: string;
  ipAllowlistEnvVar: string;
};

export type OpsAuthResult = {
  authorized: boolean;
  authPolicyConfigured: boolean;
  tokenPolicyEnabled: boolean;
  ipPolicyEnabled: boolean;
  requestIp: string;
};

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (!authorization) return null;

  const [scheme, token] = authorization.trim().split(/\s+/, 2);
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token;
}

function getIpAllowlist(envName: string): string[] {
  const raw = process.env[envName] ?? "";
  return raw
    .split(/[,\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function authorizeOpsRequest(
  request: Request,
  options: OpsAuthOptions
): OpsAuthResult {
  const configuredToken = (process.env[options.tokenEnvVar] ?? "").trim();
  const providedToken = getBearerToken(request);
  const tokenPolicyEnabled = configuredToken.length > 0;

  const ipAllowlist = getIpAllowlist(options.ipAllowlistEnvVar);
  const ipPolicyEnabled = ipAllowlist.length > 0;

  const tokenAuthorized =
    tokenPolicyEnabled &&
    typeof providedToken === "string" &&
    providedToken === configuredToken;

  const requestIp = getClientIp(request);
  const ipAuthorized =
    requestIp !== "unknown" &&
    requestIp.length > 0 &&
    ipAllowlist.includes(requestIp);

  const authPolicyConfigured = tokenPolicyEnabled || ipPolicyEnabled;
  const authorized = tokenPolicyEnabled
    ? tokenAuthorized && (!ipPolicyEnabled || ipAuthorized)
    : ipAuthorized;

  return {
    authorized,
    authPolicyConfigured,
    tokenPolicyEnabled,
    ipPolicyEnabled,
    requestIp,
  };
}
