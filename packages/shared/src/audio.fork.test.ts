import { describe, expect, it } from "vite-plus/test";

import { AUDIO_FILE_EXTENSIONS, audioMimeType } from "./audio.fork.ts";

describe("audioMimeType", () => {
  it("recognizes a saved audio file with a generic picker MIME type", () => {
    expect(audioMimeType({ name: "Voice Memo.MP3", mimeType: "application/octet-stream" })).toBe(
      "audio/mpeg",
    );
  });

  it("keeps an explicit audio MIME type authoritative and removes parameters", () => {
    expect(audioMimeType({ name: "tone.wav", mimeType: " AUDIO/FlAC; rate=44100 " })).toBe(
      "audio/flac",
    );
  });

  it.each([
    ["memo.m4a", "audio/mp4"],
    ["lecture.aac", "audio/aac"],
    ["take.wav", "audio/wav"],
    ["album.flac", "audio/flac"],
    ["track.ogg", "audio/ogg"],
    ["track.oga", "audio/ogg"],
    ["note.opus", "audio/ogg"],
    ["clip.weba", "audio/webm"],
  ])("recognizes %s without a picker MIME type", (name, mimeType) => {
    expect(audioMimeType({ name, mimeType: "" })).toBe(mimeType);
  });

  it.each(["README", "report.pdf", "movie.mp4", "clip.ogv", "image.png"])(
    "does not mistake %s for audio",
    (name) => {
      expect(audioMimeType({ name, mimeType: "application/octet-stream" })).toBeNull();
    },
  );

  it("covers the extensions the audio player renders from markdown", () => {
    for (const extension of ["mp3", "m4a", "aac", "wav", "flac", "ogg", "oga", "opus", "weba"]) {
      expect(AUDIO_FILE_EXTENSIONS).toContain(extension);
    }
  });
});
