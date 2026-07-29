import type { ComplianceIssue, ComplianceReport, ComplianceSeverity } from "./workbench-types";

type JsonObject = Record<string, unknown>;

function object(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonEmpty);
}

function isUrl(value: unknown): boolean {
  if (!nonEmpty(value)) return false;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}

function isInterfaceTarget(value: unknown, binding: unknown): boolean {
  if (String(binding).toUpperCase() !== "GRPC") return isUrl(value);
  if (!nonEmpty(value)) return false;
  try {
    const url = new URL(/^\w+:\/\//.test(value) ? value : `grpc://${value}`);
    return Boolean(url.hostname) && Boolean(url.port);
  } catch { return false; }
}

export function detectCardVersion(card: JsonObject): ComplianceReport["version"] {
  if (Array.isArray(card.supportedInterfaces)) return "1.0";
  if (typeof card.protocolVersion === "string" && card.protocolVersion.startsWith("0.3")) return "0.3";
  if (typeof card.url === "string") return "0.3";
  return "unknown";
}

export function validateAgentCard(card: unknown): ComplianceReport {
  const issues: ComplianceIssue[] = [];
  const passed: string[] = [];
  const add = (severity: ComplianceSeverity, id: string, path: string, message: string, spec?: string) =>
    issues.push({ severity, id, path, message, spec });
  if (!object(card)) {
    add("error", "card.object", "$", "Agent Card must be a JSON object.");
    return report("unknown", issues, passed);
  }

  const version = detectCardVersion(card);
  const requiredText = ["name", "description", "version"];
  for (const field of requiredText) {
    if (!nonEmpty(card[field])) add("error", `card.${field}`, `$.${field}`, `${field} is required and must be a non-empty string.`);
    else passed.push(`$.${field}`);
  }
  if (!object(card.capabilities)) add("error", "card.capabilities", "$.capabilities", "capabilities must be present as an object.");
  else passed.push("$.capabilities");
  for (const field of ["defaultInputModes", "defaultOutputModes"]) {
    if (!stringArray(card[field]) || (card[field] as string[]).length === 0) add("error", `card.${field}`, `$.${field}`, `${field} must contain at least one media type.`);
    else if (!(card[field] as string[]).every((mode) => mode.includes("/"))) add("warning", `card.${field}.mime`, `$.${field}`, "Modes should use registered media type syntax such as text/plain.");
    else passed.push(`$.${field}`);
  }
  if (!Array.isArray(card.skills) || card.skills.length === 0) {
    add("error", "card.skills", "$.skills", "At least one skill is required.");
  } else {
    const ids = new Set<string>();
    card.skills.forEach((skill, index) => {
      const path = `$.skills[${index}]`;
      if (!object(skill)) return add("error", "skill.object", path, "Skill must be an object.");
      for (const field of ["id", "name", "description"]) {
        if (!nonEmpty(skill[field])) add("error", `skill.${field}`, `${path}.${field}`, `${field} is required.`);
      }
      if (!stringArray(skill.tags) || skill.tags.length === 0) add("error", "skill.tags", `${path}.tags`, "Skill tags must contain at least one value.");
      if (nonEmpty(skill.id)) {
        if (ids.has(skill.id)) add("error", "skill.id.unique", `${path}.id`, "Skill IDs must be unique.");
        ids.add(skill.id);
      }
    });
    if (!issues.some((item) => item.path.startsWith("$.skills") && item.severity === "error")) passed.push("$.skills");
  }

  if (version === "1.0") validateV1(card, add, passed);
  else if (version === "0.3") validateV03(card, add, passed);
  else add("error", "card.version.detect", "$", "Card does not match A2A v1.0 or v0.3 discovery shape.");

  validateSecurity(card, add, passed);
  return report(version, issues, passed);
}

function validateV1(card: JsonObject, add: (severity: ComplianceSeverity, id: string, path: string, message: string, spec?: string) => void, passed: string[]) {
  if ("url" in card || "preferredTransport" in card || "protocolVersion" in card) {
    add("warning", "v1.legacy-fields", "$", "Top-level url, preferredTransport, and protocolVersion are v0.3 fields; v1.0 uses supportedInterfaces.", "A2A v1.0 AgentCard");
  }
  if (!Array.isArray(card.supportedInterfaces) || card.supportedInterfaces.length === 0) {
    add("error", "v1.interfaces", "$.supportedInterfaces", "v1.0 requires at least one supported interface.", "A2A v1.0 §5.5.1");
    return;
  }
  const keys = new Set<string>();
  card.supportedInterfaces.forEach((entry, index) => {
    const path = `$.supportedInterfaces[${index}]`;
    if (!object(entry)) return add("error", "v1.interface.object", path, "Interface must be an object.");
    if (!isInterfaceTarget(entry.url, entry.protocolBinding)) add("error", "v1.interface.url", `${path}.url`, "Interface target must be an absolute HTTP(S) URL, or a host:port authority for gRPC.");
    if (!nonEmpty(entry.protocolBinding)) add("error", "v1.interface.binding", `${path}.protocolBinding`, "protocolBinding is required.");
    else if (!["JSONRPC", "HTTP+JSON", "GRPC"].includes(entry.protocolBinding.toUpperCase())) add("info", "v1.interface.binding.custom", `${path}.protocolBinding`, "This is a custom protocol binding; core workbench transport support may not apply.");
    if (!nonEmpty(entry.protocolVersion)) add("error", "v1.interface.version", `${path}.protocolVersion`, "protocolVersion is required.");
    else if (!entry.protocolVersion.startsWith("1.")) add("warning", "v1.interface.version.mixed", `${path}.protocolVersion`, "A v1-shaped card advertises a non-v1 interface. Confirm intentional compatibility exposure.");
    const key = `${entry.protocolBinding}:${entry.protocolVersion}:${entry.url}:${entry.tenant ?? ""}`;
    if (keys.has(key)) add("warning", "v1.interface.duplicate", path, "Duplicate interface declaration.");
    keys.add(key);
  });
  if (!Array.isArray(card.signatures)) add("warning", "v1.signatures", "$.signatures", "signatures should be an array, even when empty.");
  else passed.push("$.supportedInterfaces");
}

function validateV03(card: JsonObject, add: (severity: ComplianceSeverity, id: string, path: string, message: string, spec?: string) => void, passed: string[]) {
  if (!isUrl(card.url)) add("error", "v03.url", "$.url", "v0.3 requires an absolute HTTP(S) endpoint URL.", "A2A v0.3 AgentCard");
  else passed.push("$.url");
  if (!nonEmpty(card.protocolVersion)) add("error", "v03.protocolVersion", "$.protocolVersion", "v0.3 requires protocolVersion.");
  else if (!card.protocolVersion.startsWith("0.3")) add("warning", "v03.protocolVersion.value", "$.protocolVersion", "Expected a 0.3 protocol version for this card shape.");
  if (card.preferredTransport && !nonEmpty(card.preferredTransport)) add("error", "v03.transport", "$.preferredTransport", "preferredTransport must be a non-empty string when present.");
  if ("supportedInterfaces" in card) add("warning", "v03.v1-fields", "$.supportedInterfaces", "supportedInterfaces is a v1.0 field on an otherwise v0.3-shaped card.");
}

function validateSecurity(card: JsonObject, add: (severity: ComplianceSeverity, id: string, path: string, message: string, spec?: string) => void, passed: string[]) {
  if (card.securitySchemes !== undefined && !object(card.securitySchemes)) add("error", "security.schemes", "$.securitySchemes", "securitySchemes must be an object keyed by scheme name.");
  if (card.security !== undefined && !Array.isArray(card.security)) add("error", "security.requirements.v03", "$.security", "v0.3 security must be an array of requirement objects.");
  if (card.securityRequirements !== undefined && !Array.isArray(card.securityRequirements)) add("error", "security.requirements.v1", "$.securityRequirements", "v1.0 securityRequirements must be an array.");
  const requirements = Array.isArray(card.securityRequirements) ? card.securityRequirements : Array.isArray(card.security) ? card.security : [];
  const schemes = object(card.securitySchemes) ? card.securitySchemes : {};
  for (const [index, requirement] of requirements.entries()) {
    if (!object(requirement)) add("error", "security.requirement.object", `$.securityRequirements[${index}]`, "Security requirement must be an object.");
    else for (const name of Object.keys(requirement)) if (!(name in schemes)) add("error", "security.requirement.reference", `$.securityRequirements[${index}].${name}`, `Security scheme '${name}' is not defined.`);
  }
  if (!requirements.length && Object.keys(schemes).length) add("info", "security.optional", "$.securityRequirements", "Security schemes are declared but no global requirement is set; authentication may be skill-specific or optional.");
  if (!requirements.length || requirements.every(object)) passed.push("$.security");
}

function report(version: ComplianceReport["version"], issues: ComplianceIssue[], passed: string[]): ComplianceReport {
  const counts = {
    error: issues.filter((item) => item.severity === "error").length,
    warning: issues.filter((item) => item.severity === "warning").length,
    info: issues.filter((item) => item.severity === "info").length,
  };
  const score = Math.max(0, Math.round(100 - counts.error * 18 - counts.warning * 6 - counts.info * 2));
  return { version, score, counts, issues, passed };
}

export function validateA2APayload(payload: unknown): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  if (!object(payload)) return [{ id: "payload.object", severity: "error", path: "$", message: "Payload must be an object." }];
  if (Array.isArray(payload.parts)) {
    payload.parts.forEach((part, index) => {
      if (!object(part)) return issues.push({ id: "part.object", severity: "error", path: `$.parts[${index}]`, message: "Part must be an object." });
      const v1Cases = ["text", "raw", "url", "data"].filter((key) => key in part);
      const v03Cases = ["text", "file", "data"].filter((key) => key === part.kind);
      if (v1Cases.length > 1) issues.push({ id: "part.oneof", severity: "error", path: `$.parts[${index}]`, message: "v1 Part must contain exactly one of text, raw, url, or data." });
      if (v1Cases.length === 0 && v03Cases.length === 0) issues.push({ id: "part.content", severity: "warning", path: `$.parts[${index}]`, message: "Unrecognized part content shape." });
    });
  }
  return issues;
}
