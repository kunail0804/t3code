const AUDIO_MIME_TYPE_BY_EXTENSION = new Map([
  ["aac", "audio/aac"],
  ["flac", "audio/flac"],
  ["m4a", "audio/mp4"],
  ["mp3", "audio/mpeg"],
  ["oga", "audio/ogg"],
  ["ogg", "audio/ogg"],
  ["opus", "audio/ogg"],
  ["wav", "audio/wav"],
  ["weba", "audio/webm"],
]);

export const AUDIO_FILE_EXTENSIONS = Object.freeze([...AUDIO_MIME_TYPE_BY_EXTENSION.keys()]);

/** Recognizes audio even when the file picker omitted its MIME type. */
export function audioMimeType(attachment: {
  readonly name: string;
  readonly mimeType: string;
}): string | null {
  const mimeType = attachment.mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mimeType.startsWith("audio/")) return mimeType;
  const dotIndex = attachment.name.lastIndexOf(".");
  return dotIndex < 0
    ? null
    : (AUDIO_MIME_TYPE_BY_EXTENSION.get(attachment.name.slice(dotIndex + 1).toLowerCase()) ?? null);
}
