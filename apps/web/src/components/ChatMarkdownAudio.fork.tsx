import { RotateCwIcon, TriangleAlertIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { cn } from "../lib/utils";
import { OpenMediaLink } from "./media/OpenMediaLink";
import { MediaActions, type MediaActionSource } from "./media/MediaActions";
import { Button } from "./ui/button";

const AUDIO_MAX_WIDTH_CLASS_NAME = "max-w-[min(100%,30rem)]";
const AUDIO_LAYOUT_CLASS_NAME = "inline-block!";

interface ChatMarkdownAudioProps {
  readonly src: string | null;
  readonly alt: string;
  readonly copyMarkdown: string | undefined;
  readonly originalUrl?: string | undefined;
  readonly sourceFailed?: boolean | undefined;
  readonly style?: CSSProperties | undefined;
  readonly mediaIdentity?: string | undefined;
  readonly actionsSource?: MediaActionSource | undefined;
  readonly onRetry?: (() => Promise<void>) | undefined;
}

/**
 * Markdown audio plays through the browser's native controls only. No drawn
 * waveform or progress bar: continuously repainting elements are banned.
 */
export function ChatMarkdownAudio({
  src: latestSrc,
  alt,
  copyMarkdown,
  originalUrl,
  sourceFailed = false,
  style,
  mediaIdentity,
  actionsSource,
  onRetry,
}: ChatMarkdownAudioProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [preloadedSrc, setPreloadedSrc] = useState<string | null>(null);
  const src = latestSrc;
  const failed = src !== null ? failedSrc === src : sourceFailed;

  // Long threads would otherwise fetch one metadata range per cited audio file.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || preloadedSrc === src) return;
    if (typeof IntersectionObserver === "undefined") {
      setPreloadedSrc(src);
      return;
    }
    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!active || !entries.some((entry) => entry.isIntersecting)) return;
        setPreloadedSrc(src);
        observer.disconnect();
      },
      { rootMargin: "200px" },
    );
    observer.observe(audio);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [src, preloadedSrc, failed, loadAttempt]);

  const retry = useCallback(async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await onRetry?.();
      setFailedSrc(null);
      setLoadAttempt((current) => current + 1);
    } catch {
      setFailedSrc(src);
    } finally {
      setRetrying(false);
    }
  }, [onRetry, retrying, src]);

  const player = (
    <span
      key={mediaIdentity ?? copyMarkdown ?? src}
      className={cn(AUDIO_LAYOUT_CLASS_NAME, AUDIO_MAX_WIDTH_CLASS_NAME, "w-full")}
      style={style}
      data-markdown-copy={copyMarkdown}
    >
      {failed ? (
        <span
          role="alert"
          className="flex min-h-28 flex-col items-center justify-center gap-3 rounded-lg border border-border/40 bg-muted/40 p-4 text-center text-sm text-muted-foreground"
        >
          <span className="inline-flex items-center gap-1.5">
            <TriangleAlertIcon aria-hidden className="size-3.5 shrink-0" />
            Audio unavailable{alt ? ` · ${alt}` : ""}
          </span>
          <span className="flex flex-wrap items-center justify-center gap-2">
            {latestSrc !== null || onRetry ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={retrying}
                onClick={() => void retry()}
              >
                <RotateCwIcon />
                {retrying ? "Retrying…" : "Retry audio"}
              </Button>
            ) : null}
            <OpenMediaLink originalUrl={originalUrl} src={latestSrc ?? src} fileName={alt} />
          </span>
        </span>
      ) : src !== null ? (
        <audio
          key={loadAttempt}
          ref={audioRef}
          src={src}
          aria-label={alt || "Audio preview"}
          controls
          preload={preloadedSrc === src ? "metadata" : "none"}
          className="w-full"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <span
          role="status"
          aria-label="Loading audio"
          className="block h-10 w-full rounded-lg bg-muted/60"
          style={style}
        />
      )}
    </span>
  );
  return actionsSource ? <MediaActions source={actionsSource}>{player}</MediaActions> : player;
}
