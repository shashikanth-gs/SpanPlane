import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

const PRIVATE_V4 = [
  /^0\./,
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.0\.0\./,
  /^192\.168\./,
  /^198\.18\./,
  /^224\./,
  /^2(?:[3-4]\d|5[0-5])\./,
];

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) return PRIVATE_V4.some((pattern) => pattern.test(address));
  const value = address.toLowerCase().split("%")[0];
  return value === "::" || value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe8") || value.startsWith("fe9") || value.startsWith("fea") || value.startsWith("feb") || value.startsWith("::ffff:127.") || value.startsWith("::ffff:10.") || value.startsWith("::ffff:192.168.");
}

export function privateNetworksAllowed(): boolean {
  return process.env.A2A_ALLOW_PRIVATE_NETWORKS === "true" ||
    (process.env.A2A_ALLOW_PRIVATE_NETWORKS !== "false" && process.env.NODE_ENV !== "production");
}

export async function assertSafeUrl(input: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Enter a valid absolute agent URL.");
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Only HTTP and HTTPS agent URLs are supported.");
  if (url.username || url.password) throw new Error("Credentials in URLs are not allowed. Use the authentication controls.");
  if (url.port && Number(url.port) > 65535) throw new Error("The URL contains an invalid port.");

  const localNames = new Set(["localhost", "localhost.localdomain"]);
  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true }).catch(() => { throw new Error(`Could not resolve ${url.hostname}.`); });
  if (!privateNetworksAllowed() && (localNames.has(url.hostname.toLowerCase()) || addresses.some(({ address }) => isPrivateAddress(address)))) {
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
  await Promise.all(candidates.map(({ url, binding }) => assertSafeInterfaceUrl(url, binding)));
}
