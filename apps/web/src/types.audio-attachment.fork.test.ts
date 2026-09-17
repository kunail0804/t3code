import { describe, expect, it } from "vite-plus/test";

import { isAudioAttachment, isVideoAttachment, type ChatFileAttachment } from "./types";

function attachment(name: string, mimeType: string): ChatFileAttachment {
  return { type: "file", id: "attachment-1", name, mimeType, sizeBytes: 42 };
}

describe("isAudioAttachment", () => {
  it("recognizes an mp3 attachment", () => {
    expect(isAudioAttachment(attachment("voice.mp3", "audio/mpeg"))).toBe(true);
  });

  it("recognizes audio even when the picker omitted the MIME type", () => {
    expect(isAudioAttachment(attachment("voice.mp3", "application/octet-stream"))).toBe(true);
    expect(isAudioAttachment(attachment("take.ogg", "application/octet-stream"))).toBe(true);
  });

  it("rejects an mp4 attachment", () => {
    expect(isAudioAttachment(attachment("clip.mp4", "video/mp4"))).toBe(false);
    expect(isVideoAttachment(attachment("clip.mp4", "video/mp4"))).toBe(true);
  });

  it("rejects a pdf attachment", () => {
    expect(isAudioAttachment(attachment("report.pdf", "application/pdf"))).toBe(false);
  });
});
