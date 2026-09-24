import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import Database from "better-sqlite3";
import type { LanguageSettings } from "../domain/models.js";

const wikdictVersion = "2_2026-06";
const wikdictLanguages = new Set(["en", "ru", "de", "es", "fr", "it", "pt", "tr", "zh", "ja"]);
const maximumDictionaryBytes = 100 * 1024 * 1024;

export class UnsupportedTranslationPairError extends Error {}
export class TranslationProviderError extends Error {}

function normalizeMeaning(value: string): string {
  const plain = value
    .replace(/\[\[([^\[\]]+)\]\]/g, (_match, link: string) => link.split("|").at(-1) ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\u0301/g, "")
    .trim()
    .normalize("NFKC");
  return plain.includes("[[") || plain.includes("]]") ? "" : plain;
}

function uniqueMeanings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const meaning = normalizeMeaning(value);
    const key = meaning.toLocaleLowerCase();
    if (meaning.length === 0 || meaning.length > 600 || seen.has(key)) continue;
    seen.add(key);
    result.push(meaning);
    if (result.length === 3) break;
  }
  return result;
}

export class TranslationService {
  private readonly downloads = new Map<string, Promise<string>>();

  constructor(
    private readonly dictionaryDirectory: string,
    private readonly request: typeof fetch = fetch,
  ) {}

  async suggest(text: string, settings: LanguageSettings): Promise<string[]> {
    if (settings.translationMethod === "wikdict") {
      return this.wikdict(text, settings.learningLanguage, settings.knownLanguage);
    }
    return this.google(text, settings.learningLanguage, settings.knownLanguage);
  }

  private async wikdict(text: string, source: string, target: string): Promise<string[]> {
    if (!wikdictLanguages.has(source) || !wikdictLanguages.has(target)) {
      throw new UnsupportedTranslationPairError("WikDict does not cover this language pair. Choose Google in Settings.");
    }

    const file = await this.dictionaryFile(`${source}-${target}`);
    let database: Database.Database | null = null;
    try {
      database = new Database(file, { readonly: true, fileMustExist: true });
      const row = database.prepare(`
        SELECT trans_list FROM simple_translation
        WHERE written_rep = ? COLLATE NOCASE LIMIT 1
      `).get(text.trim().normalize("NFKC")) as { trans_list: string | null } | undefined;
      return uniqueMeanings((row?.trans_list ?? "").split(/\s+\|\s+/));
    } catch {
      throw new TranslationProviderError("WikDict is temporarily unavailable.");
    } finally {
      database?.close();
    }
  }

  private async dictionaryFile(pair: string): Promise<string> {
    const file = path.join(this.dictionaryDirectory, `${pair}.sqlite3`);
    try {
      if ((await fs.stat(file)).size > 0) return file;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    const pending = this.downloads.get(pair);
    if (pending !== undefined) return pending;
    const download = this.downloadDictionary(pair, file).finally(() => this.downloads.delete(pair));
    this.downloads.set(pair, download);
    return download;
  }

  private async downloadDictionary(pair: string, file: string): Promise<string> {
    await fs.mkdir(this.dictionaryDirectory, { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      const url = `https://download.wikdict.com/dictionaries/sqlite/${wikdictVersion}/${pair}.sqlite3`;
      const response = await this.request(url, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok || response.body === null) {
        throw new TranslationProviderError("WikDict could not be downloaded.");
      }

      const handle = await fs.open(temporary, "wx");
      let total = 0;
      try {
        for await (const chunk of response.body) {
          total += chunk.byteLength;
          if (total > maximumDictionaryBytes) {
            throw new TranslationProviderError("WikDict download is too large.");
          }
          let written = 0;
          while (written < chunk.byteLength) {
            const result = await handle.write(chunk, written, chunk.byteLength - written);
            written += result.bytesWritten;
          }
        }
      } finally {
        await handle.close();
      }

      if (total === 0) throw new TranslationProviderError("WikDict download is empty.");
      const database = new Database(temporary, { readonly: true, fileMustExist: true });
      try {
        database.prepare("SELECT written_rep FROM simple_translation LIMIT 1").get();
      } finally {
        database.close();
      }
      await fs.rename(temporary, file);
      return file;
    } catch {
      throw new TranslationProviderError("WikDict could not be downloaded.");
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }

  private async google(text: string, source: string, target: string): Promise<string[]> {
    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.search = new URLSearchParams({
      client: "dict-chrome-ex",
      sl: source,
      tl: target,
      dt: "t",
      q: text,
    }).toString();

    try {
      const response = await this.request(url, { signal: AbortSignal.timeout(8_000) });
      if (!response.ok) throw new Error("Google returned an error");
      const body: unknown = await response.json();
      if (!Array.isArray(body) || !Array.isArray(body[0])) throw new Error("Invalid Google response");
      const translated = body[0]
        .map((part: unknown) => Array.isArray(part) && typeof part[0] === "string" ? part[0] : "")
        .join("");
      return uniqueMeanings([translated]);
    } catch {
      throw new TranslationProviderError("Google translation is temporarily unavailable. Try WikDict in Settings.");
    }
  }
}
