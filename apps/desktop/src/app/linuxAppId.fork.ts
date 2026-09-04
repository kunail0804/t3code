/**
 * Linux desktop identity for a build installed beside the official one.
 *
 * The desktop shell groups windows by two values: the `.desktop` entry Electron
 * reports through `setDesktopName`, and the WM class passed to Chromium. Two
 * builds claiming the same pair are one application to the compositor, so a
 * fork installed next to the official build has to override both.
 *
 * Upstream resolves the two separately — the entry name is a reverse-DNS id,
 * the WM class is not — and reads them in two places: the pre-ready path that
 * calls `setDesktopName` and writes the URL-handler entry, and
 * `DesktopEnvironment`, which feeds the URL handler and the snapshot. Both have
 * to agree, or `xdg-mime default` points at an entry file that was never
 * written. Hence one resolver called from both.
 *
 * With no override the upstream values are returned untouched: the official
 * build behaves exactly as before.
 */
export interface ForkLinuxIdentity {
  readonly linuxDesktopEntryName: string;
  readonly linuxWmClass: string;
}

export const resolveForkLinuxIdentity = (input: {
  readonly override: string | null | undefined;
  readonly upstreamDesktopEntryName: string;
  readonly upstreamWmClass: string;
}): ForkLinuxIdentity => {
  const appId = input.override?.trim();
  if (appId === undefined || appId.length === 0) {
    return {
      linuxDesktopEntryName: input.upstreamDesktopEntryName,
      linuxWmClass: input.upstreamWmClass,
    };
  }

  return { linuxDesktopEntryName: `${appId}.desktop`, linuxWmClass: appId };
};
