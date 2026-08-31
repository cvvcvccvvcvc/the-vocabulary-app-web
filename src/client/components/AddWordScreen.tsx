import { useEffect, useReducer, useState } from "react";
import type { LanguageSettings, VocabularyWord } from "../../domain/index.js";
import { api, ApiError } from "../lib/api.js";
import { languageName } from "../lib/languages.js";
import { createMeaningDraft, getMeaningValues, meaningDraftReducer } from "../lib/meaningDraft.js";
import { telegramImpact, telegramNotification } from "../lib/telegram.js";
import { MeaningFields } from "./MeaningFields.js";

interface AddWordScreenProps {
  settings: LanguageSettings;
  onAvailable(word: VocabularyWord): void;
  onViewWord(wordId: string): void;
}

type AddNotice =
  | { kind: "success" | "existing"; text: string; wordId: string }
  | { kind: "error"; text: string };

export function AddWordScreen({ settings, onAvailable, onViewWord }: AddWordScreenProps) {
  const [learningText, setLearningText] = useState("");
  const [meaningDraft, dispatchMeaning] = useReducer(meaningDraftReducer, [], createMeaningDraft);
  const meanings = getMeaningValues(meaningDraft);
  const [comment, setComment] = useState("");
  const [notice, setNotice] = useState<AddNotice | null>(null);
  const [saving, setSaving] = useState(false);
  const valid = learningText.trim() !== "" && meanings.length > 0;

  useEffect(() => {
    if (notice === null || notice.kind === "error") return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function clear(): void {
    setLearningText("");
    dispatchMeaning({ type: "reset", values: [] });
    setComment("");
  }

  async function save(): Promise<void> {
    if (!valid || saving) return;
    setSaving(true);
    telegramImpact();

    try {
      const result = await api.createWord({
        learningText,
        meanings,
        comment,
      });
      onAvailable(result.word);
      if (result.outcome === "created") {
        clear();
        setNotice({
          kind: "success",
          text: `Added ${result.word.learningText}`,
          wordId: result.word.id,
        });
        telegramNotification("success");
      } else {
        setNotice({
          kind: "existing",
          text: `${result.word.learningText} is already in your words`,
          wordId: result.word.id,
        });
      }
    } catch (error) {
      setNotice({
        kind: "error",
        text: error instanceof ApiError ? error.message : "Could not add the word",
      });
      telegramNotification("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="screen add-screen">
      <form
        className="add-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="add-card">
          <label className="add-field learning-field">
            <span>{languageName(settings.learningLanguage)}</span>
            <input
              autoComplete="off"
              maxLength={300}
              placeholder="Word or phrase"
              value={learningText}
              onChange={(event) => setLearningText(event.target.value)}
            />
          </label>

          <span className="add-divider" aria-hidden="true" />

          <MeaningFields
            label={languageName(settings.knownLanguage)}
            rows={meaningDraft.rows}
            onAction={dispatchMeaning}
            variant="add"
            disabled={saving}
          />

          <span className="add-divider" aria-hidden="true" />

          <label className="add-field comment-field">
            <span>Comment</span>
            <textarea
              maxLength={12_000}
              placeholder="Add a note, example, or mnemonic"
              rows={2}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </label>
        </div>

        {notice !== null && (
          <div className={`add-toast ${notice.kind}`} role="status">
            <span className="toast-status">
              {notice.kind === "success" ? "✓" : notice.kind === "existing" ? "i" : "!"}
            </span>
            <span>{notice.text}</span>
            {notice.kind !== "error" && (
              <button type="button" onClick={() => onViewWord(notice.wordId)}>View</button>
            )}
          </div>
        )}

        <div className="add-actions">
          <button
            className="clear-button"
            type="button"
            disabled={saving || (learningText === "" && meaningDraft.rows.every((row) => row.text === "") && comment === "")}
            onClick={clear}
          >
            Clear
          </button>
          <button className="primary-button add-submit" type="submit" disabled={!valid || saving}>
            {saving ? "Adding…" : "Add Word"}
          </button>
        </div>
      </form>
    </section>
  );
}
