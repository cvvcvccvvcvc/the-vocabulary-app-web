import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";
import type { LanguageSettings, VocabularyWord } from "../../domain/index.js";
import { api, ApiError } from "../lib/api.js";
import { languageName } from "../lib/languages.js";
import { createMeaningDraft, getMeaningValues, meaningDraftReducer } from "../lib/meaningDraft.js";
import { acquireTelegramVerticalSwipeLock, requestTelegramDeleteConfirmation } from "../lib/telegram.js";
import {
  DEFAULT_WORDS_SORT,
  DEFAULT_WORDS_SORT_DIRECTIONS,
  selectWordsSort,
  sortWords,
  type WordsSortDirection,
  type WordsSortKey,
  type WordsSortState,
} from "../lib/wordSort.js";
import { DeleteConfirmationDialog } from "./DeleteConfirmationDialog.js";
import { HelpPopover, useDismissiblePopover, type HelpPopoverItem } from "./HelpPopover.js";
import { Icon, type IconName } from "./Icons.js";
import { MeaningFields } from "./MeaningFields.js";
import { SwipeableWordRow } from "./SwipeableWordRow.js";

const EDIT_SAVE_GUARD_MS = 400;
const WORD_ROW_EXIT_MS = 180;
const LEVEL_HELP_ITEMS = [
  { marker: "✓", tone: "success", title: "Correct answer", detail: "Moves this word up one level." },
  { marker: "×", tone: "danger", title: "Wrong answer", detail: "Moves this word down one level." },
  { marker: "0–9", tone: "accent", title: "Learning interval", detail: "New words start at 0. Higher levels wait longer; level 9 is the maximum." },
] as const satisfies readonly HelpPopoverItem[];

const sortOptions = [
  {
    value: "recent",
    labels: { ascending: "Oldest first", descending: "Newest first" },
    shortLabels: { ascending: "Oldest", descending: "Newest" },
    icon: "clock",
  },
  {
    value: "alphabetical",
    labels: { ascending: "A–Z", descending: "Z–A" },
    shortLabels: { ascending: "A–Z", descending: "Z–A" },
    icon: "alphabetical",
  },
  {
    value: "level",
    labels: { ascending: "Level 0–9", descending: "Level 9–0" },
    shortLabels: { ascending: "Level 0–9", descending: "Level 9–0" },
    icon: "level",
  },
] as const satisfies ReadonlyArray<{
  value: WordsSortKey;
  labels: Readonly<Record<WordsSortDirection, string>>;
  shortLabels: Readonly<Record<WordsSortDirection, string>>;
  icon: IconName;
}>;

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
  const [sort, setSort] = useState<WordsSortState>(DEFAULT_WORDS_SORT);
  const [sortOpen, setSortOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const deleteRequestId = useRef<string | null>(null);
  const deleteConfirmationPending = useRef(false);
  const deleteConfirmationResolve = useRef<((confirmed: boolean) => void) | null>(null);
  const deleteConfirmationReturnFocus = useRef<HTMLElement | null>(null);
  const sortTrigger = useRef<HTMLButtonElement>(null);
  const selected = words.find((word) => word.id === selectedId) ?? null;
  const activeSort = sortOptions.find((option) => option.value === sort.key) ?? sortOptions[0];
  const activeSortLabel = activeSort.labels[sort.direction];
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const matches = normalized === ""
      ? [...words]
      : words.filter(
          (word) =>
            word.learningText.toLocaleLowerCase().includes(normalized) ||
            word.meanings.some((meaning) => meaning.toLocaleLowerCase().includes(normalized)),
        );

    return sortWords(matches, sort);
  }, [query, sort, words]);

  useEffect(() => acquireTelegramVerticalSwipeLock(), []);

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

  useEffect(() => () => {
    deleteConfirmationResolve.current?.(false);
    deleteConfirmationResolve.current = null;
    deleteConfirmationPending.current = false;
    deleteConfirmationReturnFocus.current = null;
  }, []);

  async function confirmDeletion(returnFocusTo: HTMLElement | null = null): Promise<boolean> {
    if (deleteConfirmationPending.current) return false;
    deleteConfirmationPending.current = true;

    const telegramResult = await requestTelegramDeleteConfirmation();
    if (telegramResult !== null) {
      deleteConfirmationPending.current = false;
      return telegramResult;
    }

    return new Promise<boolean>((resolve) => {
      deleteConfirmationResolve.current = resolve;
      deleteConfirmationReturnFocus.current = returnFocusTo;
      setDeleteConfirmationOpen(true);
    });
  }

  function finishDeleteConfirmation(confirmed: boolean): void {
    const resolve = deleteConfirmationResolve.current;
    const returnFocusTo = deleteConfirmationReturnFocus.current;
    deleteConfirmationResolve.current = null;
    deleteConfirmationReturnFocus.current = null;
    deleteConfirmationPending.current = false;
    setDeleteConfirmationOpen(false);
    resolve?.(confirmed);
    if (!confirmed && returnFocusTo !== null) {
      window.requestAnimationFrame(() => {
        if (returnFocusTo.isConnected) returnFocusTo.focus({ preventScroll: true });
      });
    }
  }

  async function deleteFromList(
    word: VocabularyWord,
    returnFocusTo: HTMLButtonElement | null,
  ): Promise<boolean> {
    if (deleteRequestId.current !== null) return false;

    deleteRequestId.current = word.id;
    setDeleteMessage(null);
    try {
      if (!(await confirmDeletion(returnFocusTo))) return false;
      setDeletingId(word.id);
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
      return true;
    } catch (error) {
      setDeleteMessage(error instanceof ApiError ? error.message : "Could not delete the word");
      return false;
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
              aria-label={`Sort words: ${activeSortLabel}`}
              aria-haspopup="menu"
              aria-expanded={sortOpen}
              onClick={() => setSortOpen((open) => !open)}
            >
              <Icon name="sort" />
              <span className="sort-trigger-label">{activeSort.shortLabels[sort.direction]}</span>
              <span className="sort-chevron" aria-hidden="true">⌄</span>
            </button>
            {sortOpen && (
              <div className="sort-popover" role="menu" aria-label="Sort words">
                {sortOptions.map((option) => {
                  const active = sort.key === option.value;
                  const direction = active
                    ? sort.direction
                    : DEFAULT_WORDS_SORT_DIRECTIONS[option.value];
                  const label = option.labels[direction];
                  return (
                    <button
                      key={option.value}
                      className={active ? "sort-option active" : "sort-option"}
                      type="button"
                      role="menuitemradio"
                      aria-label={active ? `${label}. Activate to reverse order.` : label}
                      aria-checked={active}
                      onClick={() => {
                        setSort((current) => selectWordsSort(current, option.value));
                        setSortOpen(false);
                        setRevealedId(null);
                        sortTrigger.current?.focus();
                      }}
                    >
                      <Icon name={option.icon} />
                      <span>{label}</span>
                      <span className="sort-option-direction" aria-hidden="true">
                        {active ? direction === "ascending" ? "↑" : "↓" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {deleteMessage !== null && (
          <p className="notice notice-error words-delete-error" role="alert">{deleteMessage}</p>
        )}

        <div className="words-list">
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
              onDelete={(returnFocusTo) => deleteFromList(word, returnFocusTo)}
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
          onConfirmDelete={confirmDeletion}
          onUpdated={onUpdated}
          onDeleted={(wordId) => {
            setSelectedId(null);
            onDeleted(wordId);
          }}
        />
      )}
      {deleteConfirmationOpen && (
        <DeleteConfirmationDialog
          onCancel={() => finishDeleteConfirmation(false)}
          onConfirm={() => finishDeleteConfirmation(true)}
        />
      )}
    </section>
  );
}

interface WordDetailProps {
  word: VocabularyWord;
  settings: LanguageSettings;
  onBack(): void;
  onConfirmDelete(returnFocusTo?: HTMLElement | null): Promise<boolean>;
  onUpdated(word: VocabularyWord): void;
  onDeleted(wordId: string): void;
}

function WordDetail({
  word,
  settings,
  onBack,
  onConfirmDelete,
  onUpdated,
  onDeleted,
}: WordDetailProps) {
  const editStartedAt = useRef(Number.NEGATIVE_INFINITY);
  const commentInput = useRef<HTMLTextAreaElement>(null);
  const [editing, setEditing] = useState(false);
  const [learningText, setLearningText] = useState(word.learningText);
  const [meaningDraft, dispatchMeaning] = useReducer(meaningDraftReducer, word.meanings, createMeaningDraft);
  const meanings = getMeaningValues(meaningDraft);
  const [comment, setComment] = useState(word.comment);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
    if (saving) return;
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

  async function remove(returnFocusTo: HTMLButtonElement): Promise<void> {
    if (deleting) return;
    setDeleting(true);
    try {
      if (!(await onConfirmDelete(returnFocusTo))) return;
      await api.deleteWord(word.id);
      onDeleted(word.id);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : "Could not delete the word");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className={editing ? "word-detail editing" : "word-detail"}>
      <header className={editing ? "detail-toolbar editing" : "detail-toolbar"}>
        {editing ? (
          <button
            className="toolbar-button cancel-button"
            type="button"
            aria-disabled={saving}
            onClick={cancelEditing}
          >
            Cancel
          </button>
        ) : (
          <button className="toolbar-button back-button" type="button" aria-label="Back to words" onClick={onBack}>
            <Icon name="back" /> <span>Back</span>
          </button>
        )}
        <div className="detail-toolbar-actions">
          {editing ? (
            <button
              className="toolbar-button primary save-button"
              type="submit"
              form="word-edit-form"
              aria-busy={saving}
              disabled={!canSave || saving}
            >
              Save
            </button>
          ) : (
            <>
              <button
                className="toolbar-button delete-button"
                type="button"
                aria-label="Delete word"
                disabled={deleting}
                onClick={(event) => void remove(event.currentTarget)}
              >
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
            aria-busy={saving}
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
                readOnly={saving}
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
                readOnly={saving}
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
