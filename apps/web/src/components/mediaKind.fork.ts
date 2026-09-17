import { audioMimeTypeFromExtension, mediaKindFromPath } from "@t3tools/shared/filePreview";

/**
 * Audio classification for the chat surface, built on upstream's tables.
 *
 * Upstream classifies audio in `filePreviewKind` and serves it inline with byte
 * ranges, but `mediaKindFromPath` still answers only image or video: audio sits
 * in a separate extension table that function does not read. The chat surface
 * needs the third kind to route a sound to its own player, and patching
 * `shared/filePreview.ts` would put the fork in a file every client reads. It
 * is resolved here instead, so the base-file cost stays at the call site.
 */
export type ForkMediaKind = "image" | "audio" | "video";

/** Extensions upstream's audio table omits. Keep this as short as it can be. */
const EXTRA_AUDIO_MIME_TYPE_BY_EXTENSION = new Map([[".weba", "audio/webm"]]);

const audioMimeTypeForExtension = (extension: string): string | null =>
  audioMimeTypeFromExtension(extension) ??
  EXTRA_AUDIO_MIME_TYPE_BY_EXTENSION.get(extension.toLowerCase()) ??
  null;

const extensionOf = (pathOrName: string): string | null => {
  const withoutQuery = pathOrName.split(/[?#]/, 1)[0] ?? "";
  const dotIndex = withoutQuery.lastIndexOf(".");
  return dotIndex < 0 ? null : withoutQuery.slice(dotIndex);
};

/** `mediaKindFromPath` widened to audio. Same null meaning: not media. */
export function forkMediaKindFromPath(path: string): ForkMediaKind | null {
  const kind = mediaKindFromPath(path);
  if (kind !== null) return kind;
  const extension = extensionOf(path);
  return extension !== null && audioMimeTypeForExtension(extension) !== null ? "audio" : null;
}

/** Recognizes audio even when the file picker omitted its MIME type. */
export function forkAudioMimeType(attachment: {
  readonly name: string;
  readonly mimeType: string;
}): string | null {
  const mimeType = attachment.mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mimeType.startsWith("audio/")) return mimeType;
  const extension = extensionOf(attachment.name);
  return extension === null ? null : audioMimeTypeForExtension(extension);
}
