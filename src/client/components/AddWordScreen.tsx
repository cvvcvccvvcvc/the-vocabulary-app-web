import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { LanguageSettings, VocabularyWord } from "../../domain/index.js";
import { api, ApiError } from "../lib/api.js";
import { languageName } from "../lib/languages.js";
import {
  createMeaningDraft,
  getMeaningValues,
  MAX_MEANINGS,
  meaningDraftReducer,
  type MeaningAction,
  type MeaningDraft,
} from "../lib/meaningDraft.js";
import { telegramImpact, telegramNotification } from "../lib/telegram.js";
import { MeaningFields } from "./MeaningFields.js";

interface AddWordScreenProps {
  settings: LanguageSettings;
  draft: AddWordDraft;
  onDraftChange: Dispatch<SetStateAction<AddWordDraft>>;
  onAvailable(word: VocabularyWord): void;
  onViewWord(wordId: string): void;
}

export interface AddWordDraft {
  learningText: string;
  meaningDraft: MeaningDraft;
  comment: string;
}

export function emptyAddWordDraft(): AddWordDraft {
  return { learningText: "", meaningDraft: createMeaningDraft([]), comment: "" };
}

type AddNotice =
  | { kind: "success" | "existing"; text: string; wordId: string }
  | { kind: "error"; text: string };

export function AddWordScreen({ settings, draft, onDraftChange, onAvailable, onViewWord }: AddWordScreenProps) {
  const { learningText, meaningDraft, comment } = draft;
  const meanings = getMeaningValues(meaningDraft);
  const [notice, setNotice] = useState<AddNotice | null>(null);
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translationMessage, setTranslationMessage] = useState<string | null>(null);
  const translationRequest = useRef(0);
  const valid = learningText.trim() !== "" && meanings.length > 0;

  useEffect(() => {
    if (notice === null || notice.kind === "error") return;
    const timer = window.setTimeout(() => setNotice(null), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => () => { translationRequest.current += 1; }, []);

  function dispatchMeaning(action: MeaningAction): void {
    onDraftChange((current) => ({
      ...current,
      meaningDraft: meaningDraftReducer(current.meaningDraft, action),
    }));
  }

  function clear(): void {
    translationRequest.current += 1;
    setTranslating(false);
    setTranslationMessage(null);
    onDraftChange(emptyAddWordDraft());
  }

  async function translate(): Promise<void> {
    const text = learningText.trim();
    if (text === "" || translating || saving || meanings.length >= MAX_MEANINGS) return;
    const requestId = ++translationRequest.current;
    setTranslating(true);
    setTranslationMessage(null);

    try {
      const result = await api.translationSuggestions(text);
      if (requestId !== translationRequest.current) return;
      if (result.meanings.length === 0) {
        setTranslationMessage("No translation found. Try another method in Settings.");
        return;
      }
      dispatchMeaning({ type: "append", values: result.meanings });
    } catch (error) {
      if (requestId === translationRequest.current) {
        setTranslationMessage(error instanceof ApiError ? error.message : "Could not translate. Try again.");
      }
    } finally {
      if (requestId === translationRequest.current) setTranslating(false);
    }
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
              onChange={(event) => {
                const value = event.target.value;
                translationRequest.current += 1;
                setTranslating(false);
                setTranslationMessage(null);
                onDraftChange((current) => ({ ...current, learningText: value }));
              }}
            />
          </label>

          <div className="translation-action">
            <button
              className="translation-button"
              type="button"
              disabled={learningText.trim() === "" || translating || saving || meanings.length >= MAX_MEANINGS}
              aria-busy={translating}
              onClick={() => void translate()}
            >
              {translating ? "Translating…" : "Translate"}
            </button>
            {settings.translationMethod === "wikdict"
              ? <a href="https://www.wikdict.com/page/download" target="_blank" rel="noopener noreferrer">WikDict</a>
              : <span>Google · experimental</span>}
          </div>
          {translationMessage !== null && (
            <p className="translation-message" role="status">{translationMessage}</p>
          )}

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
              onChange={(event) => {
                const value = event.target.value;
                onDraftChange((current) => ({ ...current, comment: value }));
              }}
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
