import { describe, expect, it } from "@effect/vitest";
import type { ModelCapabilities, ServerProviderModel } from "@t3tools/contracts";
import { createModelCapabilities } from "@t3tools/shared/model";

import type { ServerProviderDraft } from "../providerSnapshot.ts";
import { filterDraftModelsBySlugPrefix, scopeOpenCodeDraft } from "./scopedOpenCode.fork.ts";

const CAPABILITIES: ModelCapabilities = createModelCapabilities({ optionDescriptors: [] });

function makeModel(slug: string, name = slug): ServerProviderModel {
  return {
    slug,
    name,
    isCustom: false,
    capabilities: CAPABILITIES,
  };
}

function makeCustomModel(slug: string, name = slug): ServerProviderModel {
  return {
    slug,
    name,
    isCustom: true,
    capabilities: CAPABILITIES,
  };
}

function makeDraft(
  models: ReadonlyArray<ServerProviderModel>,
  overrides: Partial<ServerProviderDraft> = {},
): ServerProviderDraft {
  return {
    displayName: "OpenCode",
    enabled: true,
    installed: true,
    version: "1.2.3",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-09-04T00:00:00Z",
    models: [...models],
    slashCommands: [],
    skills: [],
    ...overrides,
  };
}

const MIXED_DRAFT = makeDraft([
  makeModel("openrouter/z-ai/glm-5.3-flash", "GLM 5.3 Flash"),
  makeModel("openrouter/anthropic/claude-sonnet-5", "Claude Sonnet 5"),
  makeModel("ollama/qwen38-27b:Q6_K_XL", "Qwen3 8B 27b"),
  makeModel("opencode/grok-code", "Grok Code"),
]);

describe("filterDraftModelsBySlugPrefix", () => {
  it("keeps only the openrouter models of a mixed draft", () => {
    const filtered = filterDraftModelsBySlugPrefix(MIXED_DRAFT, "openrouter/");

    expect(filtered.models.map((model) => model.slug)).toEqual([
      "openrouter/z-ai/glm-5.3-flash",
      "openrouter/anthropic/claude-sonnet-5",
    ]);
  });

  it("keeps only the ollama models of a mixed draft", () => {
    const filtered = filterDraftModelsBySlugPrefix(MIXED_DRAFT, "ollama/");

    expect(filtered.models.map((model) => model.slug)).toEqual(["ollama/qwen38-27b:Q6_K_XL"]);
  });

  it("returns an empty model list without throwing when nothing matches", () => {
    const filtered = filterDraftModelsBySlugPrefix(MIXED_DRAFT, "meta/");

    expect(filtered.models).toEqual([]);
  });

  it("leaves every other draft field untouched", () => {
    const filtered = filterDraftModelsBySlugPrefix(MIXED_DRAFT, "ollama/");

    const { models: filteredModels, ...rest } = filtered;
    const { models: _originalModels, ...originalRest } = MIXED_DRAFT;

    expect(rest).toEqual(originalRest);
    expect(filteredModels).not.toBe(MIXED_DRAFT.models);
  });

  it("does not match a slug whose prefix is a proper substring of another vendor", () => {
    // `openrouter/` must not catch `openrouterX/...`-style slugs: the prefix
    // check anchors on the slash, so only `openrouter/`-scoped models pass.
    const draft = makeDraft([makeModel("openrouterish/fake-model", "Fake")]);

    expect(filterDraftModelsBySlugPrefix(draft, "openrouter/").models).toEqual([]);
  });
});

describe("scopeOpenCodeDraft", () => {
  const SCOPED_OPTIONS = { slugPrefix: "openrouter/", vendorName: "OpenRouter" } as const;

  it("degrades a ready, authenticated draft whose models are all filtered out", () => {
    // Upstream probe saw `meta/llama-4` connected and reported ready; the
    // OpenRouter slice itself is empty and must not present itself as ready.
    const draft = makeDraft([makeModel("meta/llama-4", "Llama 4")]);

    const scoped = scopeOpenCodeDraft(draft, SCOPED_OPTIONS);

    expect(scoped.status).toBe("warning");
    expect(scoped.auth).toEqual({ status: "unknown" });
    expect(scoped.message).toContain("OpenRouter");
    expect(scoped.models).toEqual([]);
  });

  it("preserves the original diagnostic of a draft that was already warning or error", () => {
    const warningDraft = makeDraft([makeModel("meta/llama-4", "Llama 4")], {
      status: "warning",
      auth: { status: "unknown" },
      message: "OpenCode is available, but it did not report any connected upstream providers.",
    });
    const errorDraft = makeDraft([makeModel("meta/llama-4", "Llama 4")], {
      status: "error",
      message: "OpenCode CLI (`opencode`) is not installed or not on PATH.",
    });

    const scopedWarning = scopeOpenCodeDraft(warningDraft, SCOPED_OPTIONS);
    const scopedError = scopeOpenCodeDraft(errorDraft, SCOPED_OPTIONS);

    expect(scopedWarning.status).toBe("warning");
    expect(scopedWarning.message).toBe(
      "OpenCode is available, but it did not report any connected upstream providers.",
    );
    expect(scopedError.status).toBe("error");
    expect(scopedError.message).toBe("OpenCode CLI (`opencode`) is not installed or not on PATH.");
  });

  it("keeps a custom model whose slug has no vendor prefix", () => {
    // `providerModelsFromSettings` only trims custom slugs, so a user-entered
    // custom model may lack the vendor prefix entirely and still belongs to
    // the instance it was typed in.
    const draft = makeDraft([
      makeModel("openrouter/z-ai/glm-5.3-flash", "GLM 5.3 Flash"),
      makeCustomModel("qwen-my-tune", "My Qwen Tune"),
    ]);

    const scoped = scopeOpenCodeDraft(draft, SCOPED_OPTIONS);

    expect(scoped.models.map((model) => model.slug)).toEqual([
      "openrouter/z-ai/glm-5.3-flash",
      "qwen-my-tune",
    ]);
    // The slice is not empty, so the draft stays ready.
    expect(scoped.status).toBe("ready");
  });

  it("drops a catalog model with the wrong vendor prefix", () => {
    const draft = makeDraft([
      makeModel("openrouter/z-ai/glm-5.3-flash", "GLM 5.3 Flash"),
      makeModel("ollama/qwen38-27b:Q6_K_XL", "Qwen3 8B 27b"),
    ]);

    const scoped = scopeOpenCodeDraft(draft, SCOPED_OPTIONS);

    expect(scoped.models.map((model) => model.slug)).toEqual(["openrouter/z-ai/glm-5.3-flash"]);
  });

  it("uses the vendor name as base display name when no instance label is set", () => {
    // An instance with an explicit instance ID but an empty label would
    // otherwise surface as "OpenCode", indistinguishable from the other two.
    const draft = makeDraft([makeModel("openrouter/z-ai/glm-5.3-flash", "GLM 5.3 Flash")]);

    const scoped = scopeOpenCodeDraft(draft, SCOPED_OPTIONS);

    expect(scoped.displayName).toBe("OpenRouter");
  });

  it("prefers the instance label over the vendor name when one is set", () => {
    const draft = makeDraft([makeModel("openrouter/z-ai/glm-5.3-flash", "GLM 5.3 Flash")]);

    const scoped = scopeOpenCodeDraft(draft, {
      ...SCOPED_OPTIONS,
      instanceLabel: "My OpenRouter",
    });

    expect(scoped.displayName).toBe("My OpenRouter");
  });
});
