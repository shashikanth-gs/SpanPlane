import type { AgentCard } from "@a2a-js/sdk";
import { sidebandExtensionUris } from "../runtime/runtime-config";

export function advertisedExtensionUris(card: AgentCard): string[] {
  return card.capabilities?.extensions?.map((extension) => extension.uri).filter(Boolean) ?? [];
}

export function negotiateSidebandExtensions(card: AgentCard): string[] {
  const understood = new Set(sidebandExtensionUris());
  return advertisedExtensionUris(card).filter((uri) => understood.has(uri));
}
