import { audioMimeType } from "@t3tools/shared/audio.fork";
import { useMemo } from "react";
import type { EnvironmentId } from "@t3tools/contracts";

import { useAssetUrlRefresh, useAssetUrlState } from "../../assets/assetUrls";
import type { ChatFileAttachment } from "../../types";
import { ChatMarkdownAudio } from "../ChatMarkdownAudio.fork";
import type { MediaActionSource } from "../media/MediaActions";

/** The attachment asset resource, built like buildAttachmentVideoAsset but for audio. */
function buildAttachmentAudioAsset(
  environmentId: EnvironmentId,
  attachment: ChatFileAttachment,
): NonNullable<MediaActionSource["asset"]> {
  return {
    environmentId,
    resource: {
      _tag: "attachment" as const,
      attachmentId: attachment.id,
      fileName: attachment.name,
      mimeType: audioMimeType(attachment) ?? attachment.mimeType,
    },
  };
}

function UserAudioAttachment(props: {
  readonly environmentId: EnvironmentId;
  readonly file: ChatFileAttachment;
}) {
  const { environmentId, file } = props;
  const asset = useMemo(
    () => (file.downloadable === false ? null : buildAttachmentAudioAsset(environmentId, file)),
    [environmentId, file.downloadable, file.id, file.mimeType, file.name],
  );
  const resource = asset?.resource ?? null;
  const assetUrl = useAssetUrlState(environmentId, resource);
  const refreshAssetUrl = useAssetUrlRefresh(environmentId, resource);
  const src = assetUrl._tag === "Success" ? assetUrl.url : (file.previewUrl ?? null);

  if (asset === null && src === null) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg border border-border/80 bg-black px-2 py-3 text-center text-[11px] text-white/70">
        {file.name}
      </div>
    );
  }

  return (
    <ChatMarkdownAudio
      src={src}
      sourceFailed={
        file.previewUrl === undefined && resource !== null && assetUrl._tag === "Failure"
      }
      alt={file.name}
      copyMarkdown={undefined}
      onRetry={asset ? refreshAssetUrl : undefined}
      actionsSource={asset ? { kind: "audio", name: file.name, src, asset } : undefined}
    />
  );
}

/**
 * A user-sent audio attachment plays in place instead of falling into the
 * generic download row. Mirrors UserVideoAttachment: same signed asset
 * resolution, same failure handling, native browser controls only.
 */
export function UserAudioAttachments(props: {
  readonly environmentId: EnvironmentId;
  readonly files: ReadonlyArray<ChatFileAttachment>;
}) {
  return (
    <div className="mb-2 flex w-full max-w-[420px] flex-col gap-1">
      {props.files.map((file) => (
        <UserAudioAttachment key={file.id} environmentId={props.environmentId} file={file} />
      ))}
    </div>
  );
}
