import type { ReactNode } from "react";

import type { ScopedThreadRef } from "@t3tools/contracts";
import { mediaUrlReference } from "@t3tools/client-runtime/media-reference";
import {
  classifyMarkdownImageSource,
  markdownImageSourceFragment,
  type MarkdownImageSource,
} from "@t3tools/client-runtime/markdown-images";
import { mediaKindFromPath } from "@t3tools/shared/filePreview";

import { ChatMarkdownAssetImage, ChatMarkdownVideo } from "./ChatMarkdown";
import { ChatMarkdownAudio } from "./ChatMarkdownAudio.fork";
import { resolveExternalWebLinkHost } from "./chat/externalLinkContextMenu";
import { MediaActions, type MediaActionSource } from "./media/MediaActions";
import { resolveProtocolRelativeMediaUrl } from "./media/mediaContent";

/**
 * Whether a markdown link may render its media target inline. Deliberately
 * narrower than the img() renderer: only media the environment already hosts —
 * a workspace file or an attachment, loaded through the same signed asset URL
 * path as img() — qualifies. A link to a remote web media file stays a plain
 * clickable link, and the thread fetches nothing from outside its
 * environment. Lifting this restriction later means changing this predicate
 * alone: direct URL sources then render through the branch below, exactly
 * like img() does for remote media.
 */
export function isLocalMediaSource(source: MarkdownImageSource): boolean {
  return !(source._tag === "Direct" && resolveExternalWebLinkHost(source.uri) !== null);
}

const DIRECT_IMAGE_CLASS_NAME =
  "inline-block! h-auto w-auto object-contain max-h-[30rem] max-w-[min(100%,30rem)]";

interface MarkdownMediaLinkInlineProps {
  readonly href: string;
  readonly label: string;
  readonly copyMarkdown: string;
  readonly threadRef: ScopedThreadRef | undefined;
  readonly cwd: string | undefined;
  readonly imageBaseDir: string | undefined;
}

/**
 * The inline player for a markdown link pointing at media, or null when the
 * link must stay a link. Mirrors the img() renderer: environment files go
 * through the signed asset URL path, direct URIs render from the URL itself.
 * Which sources qualify is decided by isLocalMediaSource above; a source with
 * no inline path here (blocked schemes, or no thread to sign asset URLs
 * against) keeps the ordinary link or file chip.
 */
export function markdownMediaLinkInline(props: MarkdownMediaLinkInlineProps): ReactNode | null {
  const kind = mediaKindFromPath(props.href);
  if (kind === null) return null;
  const source = classifyMarkdownImageSource(props.href, props.imageBaseDir ?? props.cwd);
  if (!isLocalMediaSource(source)) return null;
  const alt = props.label || kind;

  if (source._tag === "WorkspaceFile") {
    if (!props.threadRef) return null;
    return (
      <ChatMarkdownAssetImage
        environmentId={props.threadRef.environmentId}
        resource={{ _tag: "media-file", threadId: props.threadRef.threadId, path: source.path }}
        alt={alt}
        kind={kind}
        copyMarkdown={props.copyMarkdown}
        srcFragment={markdownImageSourceFragment(props.href)}
        workspaceRoot={props.cwd}
      />
    );
  }
  if (source._tag !== "Direct") return null;

  const mediaSrc = resolveProtocolRelativeMediaUrl(source.uri);
  const reference = mediaUrlReference(source.uri);
  const actionsSource: MediaActionSource = {
    kind,
    name: alt,
    src: mediaSrc,
    ...(reference ? { reference } : {}),
  };
  if (kind === "video") {
    return (
      <ChatMarkdownVideo
        src={mediaSrc}
        alt={alt}
        copyMarkdown={props.copyMarkdown}
        actionsSource={actionsSource}
      />
    );
  }
  if (kind === "audio") {
    return (
      <ChatMarkdownAudio
        src={mediaSrc}
        alt={alt}
        copyMarkdown={props.copyMarkdown}
        actionsSource={actionsSource}
      />
    );
  }
  return (
    <MediaActions source={actionsSource}>
      <img src={mediaSrc} alt={alt} loading="lazy" className={DIRECT_IMAGE_CLASS_NAME} />
    </MediaActions>
  );
}
