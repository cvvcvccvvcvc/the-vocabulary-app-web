import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

export class VocabularyDatabase {
  readonly sqlite: Database.Database;

  constructor(databasePath: string) {
    if (databasePath !== ":memory:") {
      fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    }

    this.sqlite = new Database(databasePath);
    this.sqlite.pragma("foreign_keys = ON");
    this.sqlite.pragma("journal_mode = WAL");
    this.applyMigrations();
  }

  close(): void {
    this.sqlite.close();
  }

  private applyMigrations(): void {
    this.sqlite.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `);

    const migrationsDirectory = fileURLToPath(new URL("../../migrations", import.meta.url));
    const files = fs
      .readdirSync(migrationsDirectory)
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .sort();
    const applied = new Set(
      this.sqlite
        .prepare("SELECT version FROM schema_migrations")
        .all()
        .map((row) => (row as { version: number }).version),
    );

    for (const file of files) {
      const version = Number.parseInt(file.split("_")[0] ?? "", 10);
      if (applied.has(version)) {
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDirectory, file), "utf8");
      this.sqlite.transaction(() => {
        this.sqlite.exec(sql);
        this.sqlite
          .prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)")
          .run(version, new Date().toISOString());
      })();
    }
  }
}

