export type ComposerFormat = "plain" | "markdown" | "json";

export interface ComposerFormatDefinition {
  id: ComposerFormat;
  label: string;
  partKind: "text" | "data";
  mediaType: "text/plain" | "text/markdown" | "application/json";
  placeholder: string;
}

export interface BinaryAttachment {
  name: string;
  mediaType: string;
  raw: string;
}

export type OutgoingPart =
  | { text: string; mediaType: string }
  | { data: unknown; mediaType: string }
  | { raw: string; mediaType: string; filename: string };

export const COMPOSER_FORMATS: readonly ComposerFormatDefinition[] = [
  {
    id: "plain",
    label: "Plain text",
    partKind: "text",
    mediaType: "text/plain",
    placeholder: "Send a plain-text message to the agent…",
  },
  {
    id: "markdown",
    label: "Markdown",
    partKind: "text",
    mediaType: "text/markdown",
    placeholder: "Write Markdown to send as a text/markdown part…",
  },
  {
    id: "json",
    label: "JSON",
    partKind: "data",
    mediaType: "application/json",
    placeholder: '{\n  "destination": "Kyoto",\n  "travelers": 2\n}',
  },
] as const;

export function composerFormatDefinition(format: ComposerFormat): ComposerFormatDefinition {
  return COMPOSER_FORMATS.find((candidate) => candidate.id === format) ?? COMPOSER_FORMATS[0];
}

export function createComposerPart(value: string, format: ComposerFormat): OutgoingPart | undefined {
  if (!value.trim()) return undefined;
  const definition = composerFormatDefinition(format);
  if (format === "json") {
    try {
      return { data: JSON.parse(value), mediaType: definition.mediaType };
    } catch (cause) {
      const detail = cause instanceof SyntaxError ? cause.message : "The value could not be parsed.";
      throw new Error(`JSON message is invalid: ${detail}`);
    }
  }
  return { text: value, mediaType: definition.mediaType };
}

export function createAttachmentPart(file: BinaryAttachment): OutgoingPart {
  return {
    raw: file.raw,
    mediaType: file.mediaType || "application/octet-stream",
    filename: file.name,
  };
}

export function mediaTypeIsAdvertised(mediaType: string, advertisedModes: readonly string[]): boolean {
  const candidate = mediaType.toLowerCase();
  return advertisedModes.some((mode) => {
    const advertised = mode.toLowerCase();
    if (advertised === "*/*" || advertised === candidate) return true;
    if (!advertised.endsWith("/*")) return false;
    return candidate.startsWith(`${advertised.slice(0, -1)}`);
  });
}

export function buildComposerParts(
  value: string,
  format: ComposerFormat,
  attachments: readonly BinaryAttachment[],
): OutgoingPart[] {
  const editorPart = createComposerPart(value, format);
  return [
    ...(editorPart ? [editorPart] : []),
    ...attachments.map(createAttachmentPart),
  ];
}
