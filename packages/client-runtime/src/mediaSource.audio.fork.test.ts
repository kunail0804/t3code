import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { resolveMediaSource } from "./mediaSource.ts";

const threadId = ThreadId.make("thread-1");

/**
 * The chat surface plays audio in its own player, so resolveMediaSource must
 * not hand an audio path back as a media source — a resolved audio source
 * routes a plain link into the image viewer.
 *
 * Upstream already behaves this way, because mediaMimeType and
 * mediaMimeTypeFromExtension only know image and video. The fork used to force
 * it with an explicit guard, which was needed only while the fork also taught
 * shared/filePreview.ts about audio. It no longer does, so this test is what
 * keeps the property honest instead.
 */
describe("resolveMediaSource audio", () => {
  it("returns null so a cited audio file keeps its ordinary link behavior", () => {
    expect(resolveMediaSource("https://cdn.example.com/voix.mp3", { threadId })).toBeNull();
    expect(resolveMediaSource("/repo/voix.mp3", { threadId, workspaceRoot: "/repo" })).toBeNull();
    expect(resolveMediaSource("data:audio/mpeg;base64,QUJD", { threadId })).toBeNull();
  });

  it("still resolves video and image sources the way it did before audio", () => {
    expect(resolveMediaSource("https://cdn.example.com/clip.mp4", { threadId })).toMatchObject({
      kind: "video",
      mimeType: "video/mp4",
      access: "direct",
    });
    expect(resolveMediaSource("/repo/photo.png", { threadId, workspaceRoot: "/repo" })).toEqual({
      kind: "image",
      mimeType: "image/png",
      name: "photo.png",
      reference: { kind: "file", path: "/repo/photo.png", relativePath: "photo.png" },
      srcFragment: "",
      access: "environment",
      resource: { _tag: "media-file", threadId, path: "/repo/photo.png" },
    });
  });
});
