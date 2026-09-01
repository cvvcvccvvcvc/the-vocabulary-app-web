import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import type { LanguageSettings, VocabularyWord } from "../../domain/index.js";
import { api, ApiError } from "../lib/api.js";
import { languageName } from "../lib/languages.js";
import { createMeaningDraft, getMeaningValues, meaningDraftReducer } from "../lib/meaningDraft.js";
import { HelpPopover, useDismissiblePopover, type HelpPopoverItem } from "./HelpPopover.js";
import { Icon, type IconName } from "./Icons.js";
import { MeaningFields } from "./MeaningFields.js";
import { SwipeableWordRow } from "./SwipeableWordRow.js";

type WordsSort = "recent" | "alphabetical" | "level";
const EDIT_SAVE_GUARD_MS = 400;
const WORD_ROW_EXIT_MS = 180;
const LEVEL_HELP_ITEMS = [
  { marker: "✓", tone: "success", title: "Correct answer", detail: "Moves this word up one level." },
  { marker: "×", tone: "danger", title: "Wrong answer", detail: "Moves this word down one level." },
  { marker: "0–9", tone: "accent", title: "Learning interval", detail: "New words start at 0. Higher levels wait longer; level 9 is the maximum." },
] as const satisfies readonly HelpPopoverItem[];

const sortOptions = [
  { value: "recent", label: "Date added", shortLabel: "Added", icon: "clock" },
  { value: "alphabetical", label: "A–Z", shortLabel: "A–Z", icon: "alphabetical" },
  { value: "level", label: "Level 0–9", shortLabel: "Level", icon: "level" },
] as const satisfies ReadonlyArray<{ value: WordsSort; label: string; shortLabel: string; icon: IconName }>;

interface WordsScreenProps {
  words: VocabularyWord[];
  settings: LanguageSettings;
  initialSelectedId?: string | null;
  onUpdated(word: VocabularyWord): void;
  onDeleted(wordId: string): void;
}

export function WordsScreen({
  words,
  settings,
  initialSelectedId = null,
  onUpdated,
  onDeleted,
}: WordsScreenProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<WordsSort>("recent");
  const [sortOpen, setSortOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const deleteRequestId = useRef<string | null>(null);
  const sortTrigger = useRef<HTMLButtonElement>(null);
  const selected = words.find((word) => word.id === selectedId) ?? null;
  const activeSort = sortOptions.find((option) => option.value === sort) ?? sortOptions[0];
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

  useEffect(() => {
    if (revealedId !== null && !filtered.some((word) => word.id === revealedId)) {
      setRevealedId(null);
    }
  }, [filtered, revealedId]);

  async function deleteFromList(word: VocabularyWord): Promise<void> {
    if (deleteRequestId.current !== null || !window.confirm(`Delete “${word.learningText}”?`)) return;

    deleteRequestId.current = word.id;
    setDeletingId(word.id);
    setDeleteMessage(null);
    try {
      try {
        await api.deleteWord(word.id);
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 404) throw error;
      }

      setRemovingId(word.id);
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, WORD_ROW_EXIT_MS));
      }
      setRevealedId(null);
      onDeleted(word.id);
    } catch (error) {
      setDeleteMessage(error instanceof ApiError ? error.message : "Could not delete the word");
    } finally {
      if (deleteRequestId.current === word.id) deleteRequestId.current = null;
      setDeletingId(null);
      setRemovingId(null);
    }
  }

  return (
    <section className={selected === null ? "screen words-screen" : "screen words-screen detail-open"}>
      <div className="words-list-pane">
        <div
          className="words-controls"
          onFocusCapture={() => setRevealedId(null)}
          onPointerDown={() => setRevealedId(null)}
        >
          <label className="search-control">
            <Icon name="search" />
            <input
              type="search"
              placeholder="Search words"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setRevealedId(null);
              }}
            />
          </label>
          <div
            className="sort-menu"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setSortOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              setSortOpen(false);
              sortTrigger.current?.focus();
            }}
          >
            <button
              ref={sortTrigger}
              className={sortOpen ? "sort-trigger open" : "sort-trigger"}
              type="button"
              aria-label={`Sort words: ${activeSort.label}`}
              aria-haspopup="menu"
              aria-expanded={sortOpen}
              onClick={() => setSortOpen((open) => !open)}
            >
              <Icon name="sort" />
              <span className="sort-trigger-label">{activeSort.shortLabel}</span>
              <span className="sort-chevron" aria-hidden="true">⌄</span>
            </button>
            {sortOpen && (
              <div className="sort-popover" role="menu" aria-label="Sort words">
                {sortOptions.map((option) => (
                  <button
                    key={option.value}
                    className={sort === option.value ? "sort-option active" : "sort-option"}
                    type="button"
                    role="menuitemradio"
                    aria-checked={sort === option.value}
                    onClick={() => {
                      setSort(option.value);
                      setSortOpen(false);
                      setRevealedId(null);
                      sortTrigger.current?.focus();
                    }}
                  >
                    <Icon name={option.icon} />
                    <span>{option.label}</span>
                    <span className="sort-option-check" aria-hidden="true">✓</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {deleteMessage !== null && (
          <p className="notice notice-error words-delete-error" role="alert">{deleteMessage}</p>
        )}

        <div
          className="words-list"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setRevealedId(null);
          }}
          onScroll={() => setRevealedId(null)}
        >
          {filtered.length === 0 && <p className="empty-list">No matching words</p>}
          {filtered.map((word) => (
            <SwipeableWordRow
              key={word.id}
              word={word}
              selected={word.id === selectedId}
              revealed={word.id === revealedId}
              deleting={word.id === deletingId}
              removing={word.id === removingId}
              onSetRevealed={(revealed) => {
                setDeleteMessage(null);
                setRevealedId(revealed ? word.id : null);
              }}
              onOpen={() => {
                setDeleteMessage(null);
                setRevealedId(null);
                setSelectedId(word.id);
              }}
              onDelete={() => void deleteFromList(word)}
            />
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
  const editStartedAt = useRef(Number.NEGATIVE_INFINITY);
  const commentInput = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState(false);
  const [learningText, setLearningText] = useState(word.learningText);
  const [meaningDraft, dispatchMeaning] = useReducer(meaningDraftReducer, word.meanings, createMeaningDraft);
  const meanings = getMeaningValues(meaningDraft);
  const [comment, setComment] = useState(word.comment);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [levelHelpOpen, setLevelHelpOpen] = useState(false);
  const levelHelp = useDismissiblePopover<HTMLDivElement>(levelHelpOpen, setLevelHelpOpen);
  const canSave = learningText.trim() !== "" && meanings.length > 0;

  useLayoutEffect(() => {
    const field = commentInput.current;
    if (!editing || field === null) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, [comment, editing]);

  function speak(): void {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word.learningText);
    utterance.lang = settings.learningLanguage;
    window.speechSynthesis.speak(utterance);
  }

  function cancelEditing(): void {
    setLearningText(word.learningText);
    dispatchMeaning({ type: "reset", values: word.meanings });
    setComment(word.comment);
    setEditing(false);
    setMessage(null);
  }

  async function save(): Promise<void> {
    if (!canSave || saving || performance.now() - editStartedAt.current < EDIT_SAVE_GUARD_MS) return;
    setSaving(true);
    setMessage(null);
    try {
      const updated = await api.updateWord(word.id, {
        learningText,
        meanings,
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
        {editing ? (
          <button className="toolbar-button cancel-button" type="button" onClick={cancelEditing}>Cancel</button>
        ) : (
          <button className="toolbar-button back-button" type="button" aria-label="Back to words" onClick={onBack}>
            <Icon name="back" /> <span>Back</span>
          </button>
        )}
        <div className="detail-toolbar-actions">
          {editing ? (
            <button className="toolbar-button primary save-button" type="submit" form="word-edit-form" disabled={!canSave || saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          ) : (
            <>
              <button className="toolbar-button delete-button" type="button" aria-label="Delete word" onClick={() => void remove()}>
                <Icon name="delete" /> <span>Delete</span>
              </button>
              <button
                className="toolbar-button edit-button"
                type="button"
                onClick={() => {
                  editStartedAt.current = performance.now();
                  setLevelHelpOpen(false);
                  setEditing(true);
                }}
              >
                Edit
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
                onChange={(event) => setLearningText(event.target.value)}
              />
            </label>
            <MeaningFields
              label={languageName(settings.knownLanguage)}
              rows={meaningDraft.rows}
              onAction={dispatchMeaning}
              variant="edit"
              disabled={saving}
            />
            <label className="detail-edit-field detail-comment-field">
              <span>Comment</span>
              <textarea
                ref={commentInput}
                rows={1}
                maxLength={12_000}
                placeholder="Add an example or a note…"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
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

        {!editing && (
          <div
            ref={levelHelp}
            className="level-help"
          >
            <button
              className="level-card"
              type="button"
              aria-haspopup="dialog"
              aria-expanded={levelHelpOpen}
              aria-controls="level-help-popover"
              onClick={() => setLevelHelpOpen((open) => !open)}
            >
              <span>
                <span className="detail-label">Level</span>
                <span className="level-value">Level {word.level} <small>of 9</small></span>
              </span>
              <span className="level-progress" aria-label={`Level ${word.level} of 9`}>
                <span style={{ width: `${(word.level / 9) * 100}%` }} />
              </span>
            </button>
            {levelHelpOpen && (
              <HelpPopover
                id="level-help-popover"
                label="Level details"
                items={LEVEL_HELP_ITEMS}
                className="level-help-popover"
              />
            )}
          </div>
        )}

        {message !== null && <p className="notice notice-error">{message}</p>}
      </div>
    </section>
  );
}
