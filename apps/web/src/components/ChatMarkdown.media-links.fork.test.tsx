import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const testState = vi.hoisted(() => ({
  resources: [] as Array<unknown>,
  assetState: "success" as "success" | "loading" | "failure",
}));

vi.mock("@effect/atom-react", () => ({ useAtomValue: () => null }));
vi.mock("../assets/assetUrls", () => ({
  useAssetUrlRefresh: () => vi.fn(),
  useAssetUrlState: (_environmentId: unknown, resource: unknown) => {
    testState.resources.push(resource);
    if (testState.assetState === "loading") return { _tag: "Loading" };
    if (testState.assetState === "failure") return { _tag: "Failure" };
    return { _tag: "Success", url: "https://signed.test/linked-media" };
  },
}));
vi.mock("../hooks/useTheme", () => ({ useTheme: () => ({ resolvedTheme: "dark" }) }));
vi.mock("../state/use-atom-query-runner", () => ({ useAtomQueryRunner: () => vi.fn() }));
vi.mock("../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../state/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/session")>()),
  usePreparedConnection: () => ({ _tag: "Loading" }),
}));
vi.mock("../state/entities", () => ({
  readThreadShell: () => null,
  useProjects: () => [],
}));
vi.mock("../remoteOpen", () => ({
  useRemoteOpenResolution: () => ({ state: { mode: "local-exec" }, isResolved: true }),
}));
vi.mock("../editorPreferences", () => ({
  useOpenInPreferredEditor: () => vi.fn(),
  usePreferredEditor: () => [null, vi.fn()],
}));
vi.mock("~/lib/openPullRequestLink", () => ({
  findProjectForChangeRequest: () => undefined,
  matchesLinkedPullRequestUrl: () => false,
  parseChangeRequestUrl: () => null,
  useOpenChangeRequestLink: () => vi.fn(),
}));

import ChatMarkdown from "./ChatMarkdown";

const threadRef = {
  environmentId: EnvironmentId.make("env-media-links"),
  threadId: ThreadId.make("thread-media-links"),
};

function render(markdown: string): string {
  return renderToStaticMarkup(
    <ChatMarkdown cwd="/tmp/project" threadRef={threadRef} text={markdown} />,
  );
}

describe("ChatMarkdown media links", () => {
  beforeEach(() => {
    testState.resources = [];
    testState.assetState = "success";
  });

  it("renders a markdown link to a local audio file as an inline player", () => {
    const html = render("[voix](voix.mp3)");

    expect(testState.resources).toEqual([
      { _tag: "media-file", threadId: threadRef.threadId, path: "/tmp/project/voix.mp3" },
    ]);
    expect(html).toContain("<audio");
    expect(html).not.toContain("chat-markdown-file-link");
  });

  it("renders a markdown link to a local video file as an inline player", () => {
    const html = render("[clip](./demo.mp4)");

    expect(testState.resources).toEqual([
      // `./` is joined verbatim, like every img() source — pinned upstream in
      // packages/client-runtime/src/markdownImages.test.ts.
      { _tag: "media-file", threadId: threadRef.threadId, path: "/tmp/project/./demo.mp4" },
    ]);
    expect(html).toContain("<video");
    expect(html).not.toContain("chat-markdown-file-link");
  });

  it("keeps a link to a remote media file a plain clickable link", () => {
    const html = render("[photo](https://site.com/photo.png)");

    expect(html).toContain('href="https://site.com/photo.png"');
    expect(html).not.toContain('src="https://site.com/photo.png"');
    expect(html).not.toContain("<audio");
    expect(html).not.toContain("<video");
    expect(testState.resources).toEqual([]);
  });

  it("keeps a link to a local non-media file a file chip", () => {
    const html = render("[entry](src/main.ts)");

    expect(html).toContain("chat-markdown-file-link");
    expect(testState.resources).toEqual([]);
  });
});
