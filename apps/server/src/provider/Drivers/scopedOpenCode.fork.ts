/**
 * Scoped OpenCode drivers — fork-only drivers that reuse the OpenCode
 * runtime but expose a filtered slice of its model catalog.
 *
 * The OpenCode CLI aggregates every upstream vendor (openrouter, ollama,
 * meta, …) into a single provider entry. Each driver built here keeps the
 * exact same adapter / server-owner / text-generation / probe plumbing as
 * `OpenCodeDriver`, but narrows the `models` array of the provider snapshot
 * to slugs sharing a prefix (e.g. `openrouter/z-ai/glm-5.3-flash`).
 *
 * The `create` body is deliberately a copy of `OpenCodeDriver.create`
 * rather than a refactor: keeping the fork additive means upstream changes
 * to `OpenCodeDriver.ts` never produce merge conflicts here.
 *
 * Each instance launches its own OpenCode server because the `ProviderDriver`
 * SPI (`ProviderDriver.ts:129-132`) forbids instances from sharing mutable
 * state. The entries keep the OpenCode icon because `Icons.tsx` ships no
 * vendor icon for OpenRouter or Ollama.
 *
 * @module provider/Drivers/scopedOpenCode.fork
 */
import { OpenCodeSettings, ProviderDriverKind } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClient } from "effect/unstable/http";

import { makeOpenCodeTextGeneration } from "../../textGeneration/OpenCodeTextGeneration.ts";
import { ServerConfig } from "../../config.ts";
import { ServerSettingsService } from "../../serverSettings.ts";
import { ProviderDriverError } from "../Errors.ts";
import { makeOpenCodeAdapter } from "../Layers/OpenCodeAdapter.ts";
import {
  checkOpenCodeProviderStatus,
  makePendingOpenCodeProvider,
  openCodeSkillsToServerProviderSkills,
} from "../Layers/OpenCodeProvider.ts";
import { ProviderEventLoggers } from "../Layers/ProviderEventLoggers.ts";
import { makeManagedServerProvider } from "../makeManagedServerProvider.ts";
import { OpenCodeRuntime } from "../opencodeRuntime.ts";
import * as OpenCodeServerOwner from "../OpenCodeServerOwner.ts";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "../ProviderDriver.ts";
import { withInstanceIdentity } from "./instanceIdentity.ts";
import { mergeProviderInstanceEnvironment } from "../ProviderInstanceEnvironment.ts";
import {
  enrichProviderSnapshotWithVersionAdvisory,
  makeManualOnlyProviderMaintenanceCapabilities,
} from "../providerMaintenance.ts";
import {
  haveProviderSnapshotSettingsChanged,
  makeProviderSnapshotSettingsSource,
  type ProviderSnapshotSettings,
} from "../providerUpdateSettings.ts";
import type { ServerProviderDraft } from "../providerSnapshot.ts";
import type { OpenCodeDriverEnv } from "./OpenCodeDriver.ts";

const decodeOpenCodeSettings = Schema.decodeSync(OpenCodeSettings);

export type ScopedOpenCodeDriverEnv = OpenCodeDriverEnv;

export interface ScopedOpenCodeDriverOptions {
  readonly driverKind: ProviderDriverKind;
  readonly displayName: string;
  /**
   * Slug prefix keeping a model in the snapshot, e.g. `"openrouter/"`.
   * Matched against the full model slug (`"<vendor>/<model-id>"` as built
   * by `flattenOpenCodeModels`).
   */
  readonly slugPrefix: string;
}

/**
 * Pure, standalone-testable filter: returns the same draft with `models`
 * reduced to the entries whose slug starts with `slugPrefix`. Custom models
 * (`isCustom: true`) belong to the instance where the user typed them and are
 * kept whatever their slug — only catalog models are scoped by vendor prefix.
 * Every other field of the draft is carried over untouched.
 */
export const filterDraftModelsBySlugPrefix = (
  draft: ServerProviderDraft,
  slugPrefix: string,
): ServerProviderDraft => ({
  ...draft,
  models: draft.models.filter((model) => model.isCustom || model.slug.startsWith(slugPrefix)),
});

export interface ScopedOpenCodeDraftOptions {
  readonly slugPrefix: string;
  /**
   * Name of the vendor slice (`"OpenRouter"`, `"Ollama"`): base display name
   * of the snapshot and vendor named in user-facing messages.
   */
  readonly vendorName: string;
  /**
   * Label the user typed for this instance; empty or undefined when they only
   * set an explicit instance ID. Wins over `vendorName` when non-empty.
   */
  readonly instanceLabel?: string | undefined;
}

/**
 * Pure, standalone-testable scoping of a probed OpenCode draft down to this
 * driver's vendor slice: model filtering, display-name priority (instance
 * label > vendor name > whatever the draft carried), and degradation of an
 * empty slice.
 *
 * The degradation exists because `checkOpenCodeProviderStatus` derives
 * `ready`/`authenticated` from the total count of connected upstream vendors,
 * which says nothing about this slice's vendor: with only `meta` connected,
 * the OpenRouter entry would otherwise present itself as green with zero
 * models. An empty slice is downgraded to `warning`/`unknown` with a message
 * naming the vendor — unless the draft was already degraded (warning/error),
 * whose original diagnostic is more useful and is preserved.
 */
export const scopeOpenCodeDraft = (
  draft: ServerProviderDraft,
  options: ScopedOpenCodeDraftOptions,
): ServerProviderDraft => {
  const filtered = filterDraftModelsBySlugPrefix(draft, options.slugPrefix);
  const instanceLabel = options.instanceLabel?.trim();
  const displayName = instanceLabel ? instanceLabel : options.vendorName;

  const sliceEmptied = draft.models.length > 0 && filtered.models.length === 0;
  if (draft.status !== "ready" || !sliceEmptied) {
    return { ...filtered, displayName };
  }

  return {
    ...filtered,
    displayName,
    status: "warning",
    auth: { status: "unknown" },
    message: `OpenCode is connected but exposes no ${options.vendorName} models. Configure the ${options.vendorName} provider in OpenCode.`,
  };
};

export const makeScopedOpenCodeDriver = ({
  driverKind,
  displayName,
  slugPrefix,
}: ScopedOpenCodeDriverOptions): ProviderDriver<OpenCodeSettings, ScopedOpenCodeDriverEnv> => {
  return {
    driverKind,
    metadata: {
      displayName,
      supportsMultipleInstances: true,
    },
    configSchema: OpenCodeSettings,
    defaultConfig: (): OpenCodeSettings => decodeOpenCodeSettings({}),
    create: ({
      instanceId,
      displayName: instanceLabel,
      accentColor,
      environment,
      enabled,
      config,
    }) =>
      Effect.gen(function* () {
        const openCodeRuntime = yield* OpenCodeRuntime;
        const serverConfig = yield* ServerConfig;
        const httpClient = yield* HttpClient.HttpClient;
        const serverSettings = yield* ServerSettingsService;
        const eventLoggers = yield* ProviderEventLoggers;
        const processEnv = mergeProviderInstanceEnvironment(environment);
        const continuationIdentity = defaultProviderContinuationIdentity({
          driverKind,
          instanceId,
        });
        const stampIdentity = withInstanceIdentity({
          instanceId,
          driverKind,
          displayName: instanceLabel,
          accentColor,
          continuationGroupKey: continuationIdentity.continuationKey,
        });
        const scopeDraft = (draft: ServerProviderDraft) =>
          scopeOpenCodeDraft(draft, {
            slugPrefix,
            vendorName: displayName,
            instanceLabel,
          });
        const effectiveConfig = { ...config, enabled } satisfies OpenCodeSettings;
        // The scoped entries do not own the `opencode` binary — the original
        // OpenCode entry does — so they advertise no update capability and
        // leave `opencode upgrade` to it, instead of triple-prompting for the
        // same binary.
        const maintenanceCapabilities = makeManualOnlyProviderMaintenanceCapabilities({
          provider: driverKind,
          packageName: null,
        });

        const adapter = yield* makeOpenCodeAdapter(effectiveConfig, {
          instanceId,
          environment: processEnv,
          ...(eventLoggers.native ? { nativeEventLogger: eventLoggers.native } : {}),
        });
        const serverOwner = yield* OpenCodeServerOwner.make({
          binaryPath: effectiveConfig.binaryPath,
          directory: serverConfig.cwd,
          ...(effectiveConfig.serverPassword
            ? { serverPassword: effectiveConfig.serverPassword }
            : {}),
          environment: processEnv,
        });
        const textGeneration = yield* makeOpenCodeTextGeneration(effectiveConfig).pipe(
          Effect.provideService(OpenCodeServerOwner.OpenCodeServerOwner, serverOwner),
        );

        const checkProvider = checkOpenCodeProviderStatus(
          effectiveConfig,
          serverConfig.cwd,
          processEnv,
        ).pipe(
          Effect.map((draft) => stampIdentity(scopeDraft(draft))),
          Effect.provideService(OpenCodeServerOwner.OpenCodeServerOwner, serverOwner),
          Effect.provideService(OpenCodeRuntime, openCodeRuntime),
        );
        // NOTE: the local branch intentionally uses the shared SDK server
        // instead of `opencode debug skill` (loadSkillsFromCli). The CLI writes
        // its full JSON inventory to stdout, but the Bun-compiled binary does
        // not flush more than one 64KB pipe buffer to a non-TTY stdout, so the
        // piped output arrives truncated and unparseable — which degrades to an
        // empty skill list and poisons the workspace snapshot the `$` picker
        // reads. The SDK `app.skills` endpoint honors the per-request directory
        // and returns complete results regardless of size.
        const loadSkillsForCwd = (cwd: string) =>
          effectiveConfig.serverUrl.trim().length > 0
            ? Effect.scoped(
                Effect.gen(function* () {
                  const server = yield* openCodeRuntime.connectToOpenCodeServer({
                    binaryPath: effectiveConfig.binaryPath,
                    directory: cwd,
                    serverUrl: effectiveConfig.serverUrl,
                    ...(effectiveConfig.serverPassword
                      ? { serverPassword: effectiveConfig.serverPassword }
                      : {}),
                    environment: processEnv,
                  });
                  const client = openCodeRuntime.createOpenCodeSdkClient({
                    baseUrl: server.url,
                    directory: cwd,
                    ...(effectiveConfig.serverPassword
                      ? { serverPassword: effectiveConfig.serverPassword }
                      : {}),
                  });
                  return yield* openCodeRuntime.loadOpenCodeSkills(client);
                }),
              )
            : serverOwner.withServer((server) =>
                openCodeRuntime.loadOpenCodeSkills(
                  openCodeRuntime.createOpenCodeSdkClient({
                    baseUrl: server.url,
                    directory: cwd,
                    ...(server.serverPassword !== undefined
                      ? { serverPassword: server.serverPassword }
                      : {}),
                  }),
                ),
              );

        const snapshotSettings = makeProviderSnapshotSettingsSource(
          effectiveConfig,
          serverSettings,
        );
        const snapshot = yield* makeManagedServerProvider<
          ProviderSnapshotSettings<OpenCodeSettings>
        >({
          maintenanceCapabilities,
          getSettings: snapshotSettings.getSettings,
          streamSettings: snapshotSettings.streamSettings,
          haveSettingsChanged: haveProviderSnapshotSettingsChanged,
          checkProviderOnSettingsChange: () => false,
          refreshOnInterval: false,
          initialSnapshot: (settings) =>
            makePendingOpenCodeProvider(settings.provider).pipe(
              Effect.map((draft) => stampIdentity(scopeDraft(draft))),
            ),
          checkProvider,
          enrichSnapshot: ({ settings, snapshot, publishSnapshot }) =>
            enrichProviderSnapshotWithVersionAdvisory(snapshot, maintenanceCapabilities, {
              enableProviderUpdateChecks: settings.enableProviderUpdateChecks,
            }).pipe(
              Effect.provideService(HttpClient.HttpClient, httpClient),
              Effect.flatMap((enrichedSnapshot) => publishSnapshot(enrichedSnapshot)),
            ),
        }).pipe(
          Effect.mapError(
            (cause) =>
              new ProviderDriverError({
                driver: driverKind,
                instanceId,
                detail: `Failed to build ${displayName} snapshot: ${cause.message ?? String(cause)}`,
                cause,
              }),
          ),
        );

        return {
          instanceId,
          driverKind,
          continuationIdentity,
          displayName: instanceLabel,
          accentColor,
          enabled,
          snapshot,
          snapshotForCwd: (cwd) =>
            !effectiveConfig.enabled
              ? snapshot.getSnapshot
              : Effect.all([
                  snapshot.getSnapshot,
                  loadSkillsForCwd(cwd).pipe(Effect.timeout("20 seconds")),
                ]).pipe(
                  Effect.map(([machineSnapshot, skills]) => ({
                    ...machineSnapshot,
                    skills: openCodeSkillsToServerProviderSkills(skills),
                  })),
                  Effect.mapError(
                    (cause) =>
                      new ProviderDriverError({
                        driver: driverKind,
                        instanceId,
                        detail: `Failed to probe ${displayName} skills for '${cwd}'`,
                        cause,
                      }),
                  ),
                ),
          adapter,
          textGeneration,
        } satisfies ProviderInstance;
      }),
  };
};

export const OpenRouterDriver: ProviderDriver<OpenCodeSettings, ScopedOpenCodeDriverEnv> =
  makeScopedOpenCodeDriver({
    driverKind: ProviderDriverKind.make("openrouter"),
    displayName: "OpenRouter",
    slugPrefix: "openrouter/",
  });

export const OllamaDriver: ProviderDriver<OpenCodeSettings, ScopedOpenCodeDriverEnv> =
  makeScopedOpenCodeDriver({
    driverKind: ProviderDriverKind.make("ollama"),
    displayName: "Ollama",
    slugPrefix: "ollama/",
  });
