import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { isDemoDeployment } from "./deployment";

const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.0\.0\./,
  /^192\.0\.2\./,
  /^192\.168\./,
  /^198\.18\./,
  /^198\.19\./,
  /^198\.51\.100\./,
  /^203\.0\.113\./,
  /^224\./,
  /^2(?:[3-4]\d|5[0-5])\./,
];

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) return PRIVATE_V4.some((pattern) => pattern.test(address));
  const value = address.toLowerCase().split("%")[0];
  const mappedV4 = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedV4) return isPrivateAddress(mappedV4);
  if (value.startsWith("::ffff:")) return true;
  return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") ||
    /^fe[89ab]/.test(value) || value.startsWith("ff");
}

export function privateNetworksAllowed(): boolean {
  // `npx spanplane` uses `next start`, so NODE_ENV is production even
  // though it is a loopback-only developer install. The public-demo flag,
  // rather than NODE_ENV, is the actual network boundary.
  return !isDemoDeployment() && process.env.A2A_ALLOW_PRIVATE_NETWORKS !== "false";
}

export async function assertSafeUrl(input: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Enter a valid absolute agent URL.");
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Only HTTP and HTTPS agent URLs are supported.");
  if (isDemoDeployment() && url.protocol !== "https:") throw new Error("The public demo accepts only HTTPS agent URLs. Run Workbench locally to test HTTP endpoints.");
  if (url.username || url.password) throw new Error("Credentials in URLs are not allowed. Use the authentication controls.");
  if (url.port && Number(url.port) > 65535) throw new Error("The URL contains an invalid port.");

  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  const isLocalName = hostname === "localhost" || hostname === "localhost.localdomain" || hostname.endsWith(".localhost") || hostname.endsWith(".local");
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true }).catch(() => { throw new Error(`Could not resolve ${hostname}.`); });
  // The public demo never permits a private target, even if a deployment has
  // mistakenly inherited the local-development override.
  if ((!privateNetworksAllowed() || isDemoDeployment()) && (isLocalName || addresses.some(({ address }) => isPrivateAddress(address)))) {
    throw new Error("Private, loopback, link-local, and metadata network targets are blocked. Set A2A_ALLOW_PRIVATE_NETWORKS=true only for a trusted local development environment.");
  }
  return url;
}

export async function assertSafeInterfaceUrl(input: string, protocolBinding?: string): Promise<void> {
  if (protocolBinding?.toUpperCase() === "GRPC" && !/^https?:\/\//i.test(input)) {
    const authority = input.replace(/^grpc:\/\//i, "");
    if (!/^[\[\]a-zA-Z0-9._:-]+$/.test(authority)) throw new Error("The gRPC interface contains an invalid authority.");
    await assertSafeUrl(`http://${authority}`);
    return;
  }
  await assertSafeUrl(input);
}

export async function assertSafeAgentCard(card: Record<string, unknown>): Promise<void> {
  const candidates: Array<{ url: string; binding?: string }> = [];
  if (typeof card.url === "string") candidates.push({ url: card.url, binding: typeof card.preferredTransport === "string" ? card.preferredTransport : undefined });
  if (Array.isArray(card.supportedInterfaces)) {
    for (const item of card.supportedInterfaces) {
      if (item && typeof item === "object" && typeof (item as { url?: unknown }).url === "string") {
        const entry = item as { url: string; protocolBinding?: unknown };
        candidates.push({ url: entry.url, binding: typeof entry.protocolBinding === "string" ? entry.protocolBinding : undefined });
      }
    }
  }
  await Promise.all(candidates
    .filter(({ binding }) => !(isDemoDeployment() && binding?.toUpperCase() === "GRPC"))
    .map(({ url, binding }) => assertSafeInterfaceUrl(url, binding)));
}
