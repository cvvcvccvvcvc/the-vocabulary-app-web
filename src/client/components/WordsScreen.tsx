import { useEffect, useMemo, useState } from "react";
import type { VocabularyWord } from "../../domain/index.js";
import { api, ApiError } from "../lib/api.js";

interface WordsScreenProps {
  words: VocabularyWord[];
  onUpdated(word: VocabularyWord): void;
  onDeleted(wordId: string): void;
}

export function WordsScreen({ words, onUpdated, onDeleted }: WordsScreenProps) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(words[0]?.id ?? null);
  const selected = words.find((word) => word.id === selectedId) ?? null;
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (normalized === "") return words;
    return words.filter(
      (word) =>
        word.learningText.toLocaleLowerCase().includes(normalized) ||
        word.meanings.some((meaning) => meaning.toLocaleLowerCase().includes(normalized)),
    );
  }, [query, words]);

  useEffect(() => {
    if (selectedId !== null && !words.some((word) => word.id === selectedId)) {
      setSelectedId(words[0]?.id ?? null);
    }
  }, [selectedId, words]);

  return (
    <section className="screen words-screen">
      <header className="screen-header words-header">
        <div>
          <p className="eyebrow">Your collection</p>
          <h1>Words</h1>
        </div>
        <span className="count-badge">{words.length}</span>
      </header>

      <div className="words-layout">
        <div className="words-list-card">
          <input
            className="search-input"
            type="search"
            placeholder="Search words"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="words-list">
            {filtered.length === 0 && <p className="empty-list">No matching words</p>}
            {filtered.map((word) => (
              <button
                key={word.id}
                className={word.id === selectedId ? "word-row selected" : "word-row"}
                type="button"
                onClick={() => setSelectedId(word.id)}
              >
                <span>
                  <strong>{word.learningText}</strong>
                  <small>{word.meanings.join(" · ")}</small>
                </span>
                <span className="level-badge">Level {word.level}</span>
              </button>
            ))}
          </div>
        </div>

        {selected === null ? (
          <div className="word-detail empty-detail">
            <p>{words.length === 0 ? "Add your first word to begin." : "Select a word."}</p>
          </div>
        ) : (
          <WordEditor key={`${selected.id}-${selected.version}`} word={selected} onUpdated={onUpdated} onDeleted={onDeleted} />
        )}
      </div>
    </section>
  );
}

interface WordEditorProps {
  word: VocabularyWord;
  onUpdated(word: VocabularyWord): void;
  onDeleted(wordId: string): void;
}

function WordEditor({ word, onUpdated, onDeleted }: WordEditorProps) {
  const [learningText, setLearningText] = useState(word.learningText);
  const [meanings, setMeanings] = useState(word.meanings);
  const [comment, setComment] = useState(word.comment);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(): Promise<void> {
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.updateWord(word.id, {
        learningText,
        meanings: meanings.filter((meaning) => meaning.trim() !== ""),
        comment,
        version: word.version,
      });
      onUpdated(updated);
      setMessage("Saved");
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not save changes");
    } finally {
      setSaving(false);
    }
  }

  async function remove(): Promise<void> {
    if (!window.confirm(`Delete “${word.learningText}”?`)) return;
    try {
      await api.deleteWord(word.id);
      onDeleted(word.id);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not delete the word");
    }
  }

  return (
    <form
      className="word-detail"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="detail-heading">
        <span className="level-badge large">Level {word.level}</span>
        <span className="muted">{word.correctCount} correct · {word.wrongCount} wrong</span>
      </div>
      <label className="field-label">
        Word or phrase
        <input value={learningText} onChange={(event) => setLearningText(event.target.value)} />
      </label>
      <fieldset className="meanings-fieldset">
        <legend>Meanings</legend>
        {meanings.map((meaning, index) => (
          <div className="meaning-row" key={index}>
            <input
              aria-label={`Meaning ${index + 1}`}
              value={meaning}
              onChange={(event) =>
                setMeanings((current) => current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))
              }
            />
            {meanings.length > 1 && (
              <button className="icon-button" type="button" onClick={() => setMeanings((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                ×
              </button>
            )}
          </div>
        ))}
        {meanings.length < 8 && (
          <button className="text-button align-left" type="button" onClick={() => setMeanings((current) => [...current, ""])}>
            + Add meaning
          </button>
        )}
      </fieldset>
      <label className="field-label">
        Comment
        <textarea rows={5} value={comment} onChange={(event) => setComment(event.target.value)} />
      </label>
      {message !== null && <p className={message === "Saved" ? "notice notice-success" : "notice notice-error"}>{message}</p>}
      <div className="detail-actions">
        <button className="danger-button" type="button" onClick={() => void remove()}>
          Delete
        </button>
        <button
          className="primary-button"
          type="submit"
          disabled={saving || learningText.trim() === "" || !meanings.some((meaning) => meaning.trim() !== "")}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

