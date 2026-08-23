import { useEffect, useMemo, useState } from "react";
import type { LanguageSettings, VocabularyWord } from "../../domain/index.js";
import { api, ApiError } from "../lib/api.js";
import { languageName } from "../lib/languages.js";
import { Icon } from "./Icons.js";

type WordsSort = "recent" | "alphabetical" | "level";

interface WordsScreenProps {
  words: VocabularyWord[];
  settings: LanguageSettings;
  onUpdated(word: VocabularyWord): void;
  onDeleted(wordId: string): void;
}

export function WordsScreen({ words, settings, onUpdated, onDeleted }: WordsScreenProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<WordsSort>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = words.find((word) => word.id === selectedId) ?? null;
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const matches = normalized === ""
      ? [...words]
      : words.filter(
          (word) =>
            word.learningText.toLocaleLowerCase().includes(normalized) ||
            word.meanings.some((meaning) => meaning.toLocaleLowerCase().includes(normalized)),
        );

    return matches.sort((left, right) => {
      if (sort === "alphabetical") return left.learningText.localeCompare(right.learningText);
      if (sort === "level") return left.level - right.level || left.learningText.localeCompare(right.learningText);
      return right.createdAt.localeCompare(left.createdAt);
    });
  }, [query, sort, words]);

  useEffect(() => {
    if (selectedId !== null && !words.some((word) => word.id === selectedId)) {
      setSelectedId(null);
    }
  }, [selectedId, words]);

  return (
    <section className={selected === null ? "screen words-screen" : "screen words-screen detail-open"}>
      <div className="words-list-pane">
        <h1 className="mobile-screen-title">Words</h1>
        <div className="words-controls">
          <label className="search-control">
            <Icon name="search" />
            <input
              type="search"
              placeholder="Search words"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="sort-control">
            <Icon name="sort" />
            <select value={sort} aria-label="Sort words" onChange={(event) => setSort(event.target.value as WordsSort)}>
              <option value="recent">Recent</option>
              <option value="alphabetical">A–Z</option>
              <option value="level">Level</option>
            </select>
          </label>
        </div>

        <div className="words-list">
          {filtered.length === 0 && <p className="empty-list">No matching words</p>}
          {filtered.map((word) => (
            <button
              key={word.id}
              className={word.id === selectedId ? "word-row selected" : "word-row"}
              type="button"
              onClick={() => setSelectedId(word.id)}
            >
              <span className="word-row-copy">
                <strong>{word.learningText}</strong>
                <small>{word.meanings.join(", ")}</small>
              </span>
              <span className={word.level === 0 ? "level-badge zero" : "level-badge"}>{word.level}</span>
            </button>
          ))}
        </div>

        <footer className="words-footer">
          {filtered.length} of {words.length}
        </footer>
      </div>

      {selected !== null && (
        <WordDetail
          key={`${selected.id}-${selected.version}`}
          word={selected}
          settings={settings}
          onBack={() => setSelectedId(null)}
          onUpdated={onUpdated}
          onDeleted={(wordId) => {
            setSelectedId(null);
            onDeleted(wordId);
          }}
        />
      )}
    </section>
  );
}

interface WordDetailProps {
  word: VocabularyWord;
  settings: LanguageSettings;
  onBack(): void;
  onUpdated(word: VocabularyWord): void;
  onDeleted(wordId: string): void;
}

function WordDetail({ word, settings, onBack, onUpdated, onDeleted }: WordDetailProps) {
  const [editing, setEditing] = useState(false);
  const [learningText, setLearningText] = useState(word.learningText);
  const [meanings, setMeanings] = useState(word.meanings);
  const [comment, setComment] = useState(word.comment);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const canSave = learningText.trim() !== "" && meanings.some((meaning) => meaning.trim() !== "");

  function speak(): void {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word.learningText);
    utterance.lang = settings.learningLanguage;
    window.speechSynthesis.speak(utterance);
  }

  function cancelEditing(): void {
    setLearningText(word.learningText);
    setMeanings(word.meanings);
    setComment(word.comment);
    setEditing(false);
    setMessage(null);
  }

  async function save(): Promise<void> {
    if (!canSave || saving) return;
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
      setEditing(false);
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
    <section className={editing ? "word-detail editing" : "word-detail"}>
      <header className={editing ? "detail-toolbar editing" : "detail-toolbar"}>
        <button className="toolbar-button back-button" type="button" aria-label="Back to words" onClick={onBack}>
          <Icon name="back" /> <span>Back</span>
        </button>
        {editing && (
          <button className="toolbar-button cancel-button" type="button" onClick={cancelEditing}>Cancel</button>
        )}
        <strong className="mobile-detail-title">{editing ? learningText || word.learningText : word.learningText}</strong>
        <div className="detail-toolbar-actions">
          {editing ? (
            <button className="toolbar-button primary" type="submit" form="word-edit-form" disabled={!canSave || saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          ) : (
            <>
              <button className="toolbar-button primary" type="button" onClick={() => setEditing(true)}>
                <Icon name="edit" /> <span>Edit</span>
              </button>
              <button className="toolbar-button delete-button" type="button" aria-label="Delete word" onClick={() => void remove()}>
                <Icon name="delete" /> <span>Delete</span>
              </button>
            </>
          )}
        </div>
      </header>

      <div className="detail-content">
        {editing ? (
          <form
            id="word-edit-form"
            className="detail-edit-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label className="detail-edit-field">
              <span>{languageName(settings.learningLanguage)}</span>
              <input
                className="detail-learning-input"
                value={learningText}
                maxLength={300}
                autoFocus
                onChange={(event) => setLearningText(event.target.value)}
              />
            </label>
            <fieldset className="detail-edit-meanings">
              <legend>{languageName(settings.knownLanguage)}</legend>
              {meanings.length < 8 && (
                <button
                  className="add-meaning-button"
                  type="button"
                  aria-label="Add meaning"
                  onClick={() => setMeanings((current) => [...current, ""])}
                >
                  <Icon name="add" />
                </button>
              )}
              {meanings.map((meaning, index) => (
                <div className="detail-meaning-row" key={index}>
                  <input
                    aria-label={`Meaning ${index + 1}`}
                    value={meaning}
                    maxLength={600}
                    onChange={(event) =>
                      setMeanings((current) => current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))
                    }
                  />
                  {meanings.length > 1 && (
                    <button className="remove-meaning-button" type="button" aria-label={`Remove meaning ${index + 1}`} onClick={() => setMeanings((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                      −
                    </button>
                  )}
                </div>
              ))}
            </fieldset>
            <label className="detail-edit-field detail-comment-field">
              <span>Comment</span>
              <textarea rows={5} maxLength={12_000} value={comment} onChange={(event) => setComment(event.target.value)} />
            </label>
          </form>
        ) : (
          <div className="detail-read">
            <span className="detail-label">{languageName(settings.learningLanguage)}</span>
            <div className="detail-learning-value">
              <strong>{word.learningText}</strong>
              <button className="speaker-button" type="button" aria-label="Pronounce learning word" onClick={speak}>
                <Icon name="speaker" />
              </button>
            </div>

            <span className="detail-label">{languageName(settings.knownLanguage)}</span>
            <div className="detail-meanings">
              {word.meanings.map((meaning) => <span key={meaning}>{meaning}</span>)}
            </div>

            {word.comment !== "" && (
              <>
                <span className="detail-label">Comment</span>
                <p className="detail-comment">“{word.comment}”</p>
              </>
            )}
          </div>
        )}

        <div className="level-card">
          <div>
            <span className="detail-label">Level&nbsp; <span aria-label="Levels range from zero to nine">?</span></span>
            <p>Level {word.level} <small>of 9</small></p>
          </div>
          <div className="level-progress" aria-label={`Level ${word.level} of 9`}>
            <span style={{ width: `${(word.level / 9) * 100}%` }} />
          </div>
        </div>

        {message !== null && <p className="notice notice-error">{message}</p>}
      </div>
    </section>
  );
}
