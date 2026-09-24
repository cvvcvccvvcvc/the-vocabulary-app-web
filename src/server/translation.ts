import type { LanguageSettings } from "../domain/models.js";

export class TranslationProviderError extends Error {}

function uniqueMeanings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const meaning = value.trim().normalize("NFKC");
    const key = meaning.toLocaleLowerCase();
    if (meaning.length === 0 || meaning.length > 600 || seen.has(key)) continue;
    seen.add(key);
    result.push(meaning);
    if (result.length === 3) break;
  }
  return result;
}

function googleMeanings(body: unknown): string[] {
  if (!Array.isArray(body) || !Array.isArray(body[0])) throw new Error("Invalid Google response");
  const translated = body[0]
    .map((part: unknown) => Array.isArray(part) && typeof part[0] === "string" ? part[0] : "")
    .join("");
  const alternatives: string[] = [];
  if (Array.isArray(body[1])) {
    for (const group of body[1]) {
      if (!Array.isArray(group) || !Array.isArray(group[2])) continue;
      for (const entry of group[2]) {
        if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
        // The tiny-score tail commonly contains unrelated back-translations.
        if (typeof entry[3] === "number" && entry[3] < 0.0001) continue;
        alternatives.push(entry[0]);
      }
    }
  }
  return uniqueMeanings([translated, ...alternatives]);
}

function yandexMeanings(body: unknown, pair: string): string[] {
  if (body === null || typeof body !== "object") throw new Error("Invalid Yandex response");
  const section = (body as Record<string, unknown>)[pair];
  if (section === null || typeof section !== "object") return [];
  const regular = (section as Record<string, unknown>).regular;
  if (!Array.isArray(regular)) return [];
  const translations: string[] = [];
  for (const group of regular) {
    if (group === null || typeof group !== "object") continue;
    const entries = (group as Record<string, unknown>).tr;
    if (!Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (entry !== null && typeof entry === "object") {
        const value = (entry as Record<string, unknown>).text;
        if (typeof value === "string") translations.push(value);
      }
    }
  }
  return uniqueMeanings(translations);
}

export class TranslationService {
  constructor(private readonly request: typeof fetch = fetch) {}

  async suggest(text: string, settings: LanguageSettings): Promise<string[]> {
    const source = settings.learningLanguage;
    const target = settings.knownLanguage;
    if (settings.translationMethod === "yandex") {
      const pair = `${source}-${target}`;
      const url = new URL("https://dictionary.yandex.net/dicservice.json/lookupMultiple");
      url.search = new URLSearchParams({ text, dict: pair }).toString();
      return this.suggestFrom(url, (body) => yandexMeanings(body, pair), "Yandex");
    }

    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.search = new URLSearchParams([
      ["client", "dict-chrome-ex"], ["sl", source], ["tl", target],
      ["dt", "t"], ["dt", "bd"], ["q", text],
    ]).toString();
    return this.suggestFrom(url, googleMeanings, "Google");
  }

  private async suggestFrom(url: URL, parse: (body: unknown) => string[], provider: string): Promise<string[]> {
    try {
      const response = await this.request(url, { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error(`${provider} returned an error`);
      return parse(await response.json());
    } catch {
      throw new TranslationProviderError(`${provider} translation is temporarily unavailable.`);
    }
  }
}
