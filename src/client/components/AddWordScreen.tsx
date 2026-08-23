import { useState } from "react";
import type { VocabularyWord } from "../../domain/index.js";
import { api, ApiError } from "../lib/api.js";
import { telegramNotification } from "../lib/telegram.js";

interface AddWordScreenProps {
  onCreated(word: VocabularyWord): void;
}

export function AddWordScreen({ onCreated }: AddWordScreenProps) {
  const [learningText, setLearningText] = useState("");
  const [meanings, setMeanings] = useState([""]);
  const [comment, setComment] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const valid = learningText.trim() !== "" && meanings.some((meaning) => meaning.trim() !== "");

  function updateMeaning(index: number, value: string): void {
    setMeanings((current) => current.map((meaning, itemIndex) => (itemIndex === index ? value : meaning)));
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
      setLearningText("");
      setMeanings([""]);
      setComment("");
      setNotice("Word added");
      telegramNotification("success");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "Could not add the word");
      telegramNotification("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="screen add-screen">
      <header className="screen-header compact-header">
        <p className="eyebrow">Build your vocabulary</p>
        <h1>Add Word</h1>
      </header>

      <form
        className="form-card"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="field-label">
          Word or phrase
          <input
            autoComplete="off"
            maxLength={300}
            placeholder="What are you learning?"
            value={learningText}
            onChange={(event) => setLearningText(event.target.value)}
          />
        </label>

        <fieldset className="meanings-fieldset">
          <legend>Meanings</legend>
          {meanings.map((meaning, index) => (
            <div className="meaning-row" key={index}>
              <input
                aria-label={`Meaning ${index + 1}`}
                maxLength={600}
                placeholder={index === 0 ? "Add a meaning" : "Another meaning"}
                value={meaning}
                onChange={(event) => updateMeaning(index, event.target.value)}
              />
              {meanings.length > 1 && (
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Remove meaning ${index + 1}`}
                  onClick={() => setMeanings((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {meanings.length < 8 && (
            <button className="text-button align-left" type="button" onClick={() => setMeanings((current) => [...current, ""])}>
              + Add another meaning
            </button>
          )}
        </fieldset>

        <label className="field-label">
          Comment <span className="optional-label">optional</span>
          <textarea
            maxLength={12_000}
            placeholder="Example, nuance, or note"
            rows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </label>

        {notice !== null && <p className={notice === "Word added" ? "notice notice-success" : "notice notice-error"}>{notice}</p>}

        <button className="primary-button" type="submit" disabled={!valid || saving}>
          {saving ? "Adding…" : "Add Word"}
        </button>
      </form>
    </section>
  );
}

