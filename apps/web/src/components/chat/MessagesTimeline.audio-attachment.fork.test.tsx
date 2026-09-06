import { EnvironmentId, MessageId } from "@t3tools/contracts";
import { createRef, type ReactNode, type Ref } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vite-plus/test";
import type { LegendListRef, MaintainScrollAtEndOptions } from "@legendapp/list/react";

vi.mock("@legendapp/list/react", async () => {
  const LegendList = (props: {
    data: Array<{ id: string }>;
    keyExtractor: (item: { id: string }) => string;
    renderItem: (args: { item: { id: string } }) => ReactNode;
    ref?: Ref<LegendListRef>;
    maintainScrollAtEnd?: boolean | MaintainScrollAtEndOptions;
  }) => (
    <div data-testid="legend-list">
      {props.data.map((item) => (
        <div key={props.keyExtractor(item)}>{props.renderItem({ item })}</div>
      ))}
    </div>
  );

  return { LegendList };
});

vi.mock("@pierre/diffs/react", () => ({
  FileDiff: (props: { fileDiff: { name?: string | null } }) => (
    <div data-testid="file-diff">{props.fileDiff.name ?? "diff"}</div>
  ),
}));

let MessagesTimeline: typeof import("./MessagesTimeline").MessagesTimeline;

beforeAll(async () => {
  const classList = {
    add: () => {},
    remove: () => {},
    toggle: () => {},
    contains: () => false,
  };

  vi.stubGlobal("localStorage", {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
    clear: () => {},
  });
  vi.stubGlobal("window", {
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
    addEventListener: () => {},
    removeEventListener: () => {},
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    },
    cancelAnimationFrame: () => {},
    desktopBridge: undefined,
  });
  vi.stubGlobal("document", {
    documentElement: {
      classList,
      offsetHeight: 0,
    },
  });

  ({ MessagesTimeline } = await import("./MessagesTimeline"));
}, 30_000);

const MESSAGE_CREATED_AT = "2026-03-17T19:12:28.000Z";

function buildProps() {
  return {
    isWorking: false,
    activeTurnStartedAt: null,
    listRef: createRef<LegendListRef | null>(),
    latestTurn: null,
    runningTurnId: null,
    turnDiffSummaryByAssistantMessageId: new Map(),
    routeThreadKey: "environment-local:thread-1",
    onOpenTurnDiff: () => {},
    revertTurnCountByUserMessageId: new Map(),
    onRevertUserMessage: () => {},
    isRevertingCheckpoint: false,
    onImageExpand: () => {},
    activeThreadEnvironmentId: EnvironmentId.make("environment-local"),
    markdownCwd: undefined,
    resolvedTheme: "light" as const,
    timestampFormat: "locale" as const,
    workspaceRoot: undefined,
    anchorMessageId: null,
    onAnchorReady: () => {},
    contentInsetEndAdjustment: 0,
    liveFollowEnabled: true,
    onIsAtEndChange: () => {},
    onManualNavigation: () => {},
  };
}

describe("MessagesTimeline audio attachments", () => {
  it("plays a sent audio attachment in place instead of the generic download row", () => {
    const entry = {
      id: "entry-1",
      kind: "message" as const,
      createdAt: MESSAGE_CREATED_AT,
      message: {
        id: MessageId.make("message-1"),
        role: "user" as const,
        text: "Listen to this.",
        turnId: null,
        createdAt: MESSAGE_CREATED_AT,
        updatedAt: MESSAGE_CREATED_AT,
        streaming: false,
        attachments: [
          {
            type: "file" as const,
            id: "attachment-voice-mp3",
            name: "voice.mp3",
            mimeType: "audio/mpeg",
            sizeBytes: 42,
            previewUrl: "https://environment.test/api/assets/voice.mp3",
          },
        ],
      },
    };

    const markup = renderToStaticMarkup(
      <MessagesTimeline {...buildProps()} timelineEntries={[entry]} />,
    );

    expect(markup).toContain("<audio");
    expect(markup).toContain('aria-label="voice.mp3"');
    expect(markup).not.toContain('aria-label="Download voice.mp3"');
  });

  it("shows the filename while an optimistic audio attachment is unavailable", () => {
    const entry = {
      id: "entry-1",
      kind: "message" as const,
      createdAt: MESSAGE_CREATED_AT,
      message: {
        id: MessageId.make("message-1"),
        role: "user" as const,
        text: "Uploading the take.",
        turnId: null,
        createdAt: MESSAGE_CREATED_AT,
        updatedAt: MESSAGE_CREATED_AT,
        streaming: false,
        attachments: [
          {
            type: "file" as const,
            id: "composer-local-voice",
            name: "pending-voice.mp3",
            mimeType: "audio/mpeg",
            sizeBytes: 42,
            downloadable: false,
          },
        ],
      },
    };

    const markup = renderToStaticMarkup(
      <MessagesTimeline {...buildProps()} timelineEntries={[entry]} />,
    );

    expect(markup).not.toContain("<audio");
    expect(markup).toContain(">pending-voice.mp3</div>");
  });
});
