import { describe, expect, it, vi } from "vitest";
import type { LanguageSettings } from "../../src/domain/models.js";
import { TranslationProviderError, TranslationService } from "../../src/server/translation.js";

const settings: LanguageSettings = {
  learningLanguage: "en",
  knownLanguage: "ru",
  theme: "system",
  translationMethod: "google",
};

describe("translation suggestions", () => {
  it("keeps Google's main translation and adds distinct dictionary alternatives", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify([
      [[["слово", "word"]]],
      [["noun", ["слово", "речь", "текст", "обещание"], [
        ["слово", [], null, 0.46], ["речь", [], null, 0.0004],
        ["текст", [], null, 0.0002], ["обещание", [], null, 0.00001],
      ]]],
    ])));
    const service = new TranslationService(request as typeof fetch);

    expect(await service.suggest("word", settings)).toEqual(["слово", "речь", "текст"]);
    const url = new URL(request.mock.calls[0]![0] as URL);
    expect(url.searchParams.getAll("dt")).toEqual(["t", "bd"]);
  });

  it("returns one Google meaning when no dictionary alternatives exist", async () => {
    const request = vi.fn(async () => new Response('[[["добрый день","good morning"]],null,"en"]'));
    const service = new TranslationService(request as typeof fetch);
    expect(await service.suggest("good morning", settings)).toEqual(["добрый день"]);
  });

  it("uses Yandex's separate translations and skips duplicate meanings", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({
      head: {},
      "en-ru": { regular: [
        { tr: [{ text: "банк" }, { text: "берег" }, { text: "крен" }] },
        { tr: [{ text: "БАНК" }, { text: "банковский" }] },
      ] },
    })));
    const service = new TranslationService(request as typeof fetch);
    expect(await service.suggest("bank", { ...settings, translationMethod: "yandex" }))
      .toEqual(["банк", "берег", "крен"]);
    expect(new URL(request.mock.calls[0]![0] as URL).searchParams.get("dict")).toBe("en-ru");
  });

  it("returns no Yandex suggestions for an absent dictionary entry", async () => {
    const service = new TranslationService(async () => new Response('{"head":{}}'));
    expect(await service.suggest("unknown phrase", { ...settings, translationMethod: "yandex" }))
      .toEqual([]);
  });

  it("reports provider failures without exposing remote responses", async () => {
    const service = new TranslationService(async () => new Response("limited", { status: 429 }));
    await expect(service.suggest("bank", settings)).rejects.toBeInstanceOf(TranslationProviderError);
  });

  it("contains a malformed provider response", async () => {
    const service = new TranslationService(async () => new Response('{"unexpected":true}'));
    await expect(service.suggest("bank", settings)).rejects.toBeInstanceOf(TranslationProviderError);
  });
});
