import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LanguageSettings } from "../../src/domain/models.js";
import { TranslationService, UnsupportedTranslationPairError } from "../../src/server/translation.js";

const settings: LanguageSettings = {
  learningLanguage: "en",
  knownLanguage: "ru",
  theme: "system",
  translationMethod: "wikdict",
};

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("translation suggestions", () => {
  it("uses separate WikDict entries, removes stress marks and duplicates", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "vocabulary-wikdict-"));
    directories.push(directory);
    const database = new Database(path.join(directory, "en-ru.sqlite3"));
    database.exec("CREATE TABLE simple_translation (written_rep TEXT, trans_list TEXT)");
    database.prepare("INSERT INTO simple_translation VALUES (?, ?)")
      .run("bank", "ба́нк | банк | [[берег|бе́рег]] | вал | банка");
    database.close();

    const service = new TranslationService(directory);
    expect(await service.suggest("Bank", settings)).toEqual(["банк", "берег", "вал"]);
  });

  it("downloads a missing dictionary once for repeated lookups", async () => {
    const source = await fs.mkdtemp(path.join(os.tmpdir(), "vocabulary-wikdict-source-"));
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "vocabulary-wikdict-target-"));
    directories.push(source, directory);
    const databaseFile = path.join(source, "dictionary.sqlite3");
    const database = new Database(databaseFile);
    database.exec("CREATE TABLE simple_translation (written_rep TEXT, trans_list TEXT)");
    database.prepare("INSERT INTO simple_translation VALUES (?, ?)").run("apple", "яблоко");
    database.close();

    const request = vi.fn(async () => new Response(await fs.readFile(databaseFile), { status: 200 }));
    const service = new TranslationService(directory, request as typeof fetch);
    expect(await service.suggest("apple", settings)).toEqual(["яблоко"]);
    expect(await service.suggest("apple", settings)).toEqual(["яблоко"]);
    expect(request).toHaveBeenCalledOnce();
  });

  it("rejects language pairs that WikDict does not publish", async () => {
    const service = new TranslationService("/unused");
    await expect(service.suggest("hello", { ...settings, knownLanguage: "uk" }))
      .rejects.toBeInstanceOf(UnsupportedTranslationPairError);
  });
});
