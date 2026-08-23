import { useEffect, useState } from "react";
import type { LanguageSettings, VocabularyWord } from "../../domain/index.js";
import { api, ApiError } from "../lib/api.js";
import { languageName } from "../lib/languages.js";
import { telegramNotification } from "../lib/telegram.js";
import { Icon } from "./Icons.js";

interface AddWordScreenProps {
  settings: LanguageSettings;
  onCreated(word: VocabularyWord): void;
  onViewWords(): void;
}

export function AddWordScreen({ settings, onCreated, onViewWords }: AddWordScreenProps) {
  const [learningText, setLearningText] = useState("");
  const [meanings, setMeanings] = useState([""]);
  const [comment, setComment] = useState("");
  const [notice, setNotice] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const valid = learningText.trim() !== "" && meanings.some((meaning) => meaning.trim() !== "");

  useEffect(() => {
    if (notice?.kind !== "success") return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function updateMeaning(index: number, value: string): void {
    setMeanings((current) => current.map((meaning, itemIndex) => (itemIndex === index ? value : meaning)));
  }

  function clear(): void {
    setLearningText("");
    setMeanings([""]);
    setComment("");
  }

  async function save(): Promise<void> {
    if (!valid || saving) return;
    setSaving(true);
    setNotice(null);

    try {
      const word = await api.createWord({
        learningText,
        meanings: meanings.filter((meaning) => meaning.trim() !== ""),
        comment,
      });
      onCreated(word);
      clear();
      setNotice({ kind: "success", text: `Added ${word.learningText}` });
      telegramNotification("success");
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

          <fieldset className="add-meanings">
            <legend>{languageName(settings.knownLanguage)}</legend>
            {meanings.map((meaning, index) => (
              <div className="add-meaning-row" key={index}>
                <input
                  aria-label={`Meaning ${index + 1}`}
                  maxLength={600}
                  placeholder={index === 0 ? "Meaning" : "Another meaning"}
                  value={meaning}
                  onChange={(event) => updateMeaning(index, event.target.value)}
                />
                {index === 0 && meanings.length < 8 ? (
                  <button
                    className="circle-control"
                    type="button"
                    aria-label="Add another meaning"
                    onClick={() => setMeanings((current) => [...current, ""])}
                  >
                    <Icon name="add" />
                  </button>
                ) : meanings.length > 1 ? (
                  <button
                    className="circle-control remove-control"
                    type="button"
                    aria-label={`Remove meaning ${index + 1}`}
                    onClick={() => setMeanings((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    −
                  </button>
                ) : null}
              </div>
            ))}
          </fieldset>

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
            <span className="toast-status">{notice.kind === "success" ? "✓" : "!"}</span>
            <span>{notice.text}</span>
            {notice.kind === "success" && (
              <button type="button" onClick={onViewWords}>View</button>
            )}
          </div>
        )}

        <div className="add-actions">
          <button
            className="clear-button"
            type="button"
            disabled={learningText === "" && meanings.every((meaning) => meaning === "") && comment === ""}
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
