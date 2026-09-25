import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { LanguageSettings, VocabularyWord } from "../../domain/index.js";
import { api, ApiError } from "../lib/api.js";
import { addViewportCoverage } from "../lib/addViewport.js";
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
  onOpenSettings(): void;
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
  | { kind: "missing" | "translation-error" | "error"; text: string };

export function AddWordScreen({ settings, draft, onDraftChange, onAvailable, onViewWord, onOpenSettings }: AddWordScreenProps) {
  const screenRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const { learningText, meaningDraft, comment } = draft;
  const meanings = getMeaningValues(meaningDraft);
  const [notice, setNotice] = useState<AddNotice | null>(null);
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const translationRequest = useRef(0);
  const translationAbort = useRef<AbortController | null>(null);
  const valid = learningText.trim() !== "" && meanings.length > 0;

  useLayoutEffect(() => {
    const screen = screenRef.current;
    const card = cardRef.current;
    const viewport = window.visualViewport;
    if (screen === null || card === null || viewport === null) return;
    const addScreen: HTMLElement = screen;
    const addCard: HTMLDivElement = card;
    const visibleViewport: VisualViewport = viewport;
    const mobileQuery = window.matchMedia("(max-width: 850px)");
    const touchQuery = window.matchMedia("(hover: none) and (pointer: coarse)");

    let frame = 0;
    let coverage = {
      unobscuredBottom: visibleViewport.offsetTop + visibleViewport.height,
      coveredHeight: 0,
    };

    function update() {
      frame = 0;
      const visibleBottom = visibleViewport.offsetTop + visibleViewport.height;
      const focused = document.activeElement;
      const editing = (focused instanceof HTMLInputElement || focused instanceof HTMLTextAreaElement)
        && addCard.contains(focused);
      const touchEditing = mobileQuery.matches && touchQuery.matches && editing;
      coverage = addViewportCoverage(coverage, visibleBottom, touchEditing);
      const { coveredHeight } = coverage;
      addScreen.style.setProperty("--add-visible-top", `${visibleViewport.offsetTop}px`);
      addScreen.style.setProperty("--add-visible-height", `${visibleViewport.height}px`);
      addScreen.style.setProperty("--add-covered-height", `${coveredHeight}px`);
      addScreen.toggleAttribute("data-keyboard-visible", coveredHeight > 0);

      if (!mobileQuery.matches || !editing) return;

      const field = focused.closest(".add-field, .meaning-row") ?? focused;
      const cardBounds = addCard.getBoundingClientRect();
      const fieldBounds = field.getBoundingClientRect();
      const margin = 12;
      if (fieldBounds.bottom > cardBounds.bottom - margin) {
        addCard.scrollTop += fieldBounds.bottom - (cardBounds.bottom - margin);
      } else if (fieldBounds.top < cardBounds.top + margin) {
        addCard.scrollTop += fieldBounds.top - (cardBounds.top + margin);
      }
    }

    function scheduleUpdate() {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    }

    update();
    visibleViewport.addEventListener("resize", scheduleUpdate);
    visibleViewport.addEventListener("scroll", scheduleUpdate);
    window.addEventListener("resize", scheduleUpdate);
    addScreen.addEventListener("focusin", scheduleUpdate);
    addScreen.addEventListener("focusout", scheduleUpdate);
    return () => {
      window.cancelAnimationFrame(frame);
      visibleViewport.removeEventListener("resize", scheduleUpdate);
      visibleViewport.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      addScreen.removeEventListener("focusin", scheduleUpdate);
      addScreen.removeEventListener("focusout", scheduleUpdate);
    };
  }, []);

  useEffect(() => {
    if (notice === null || notice.kind === "error") return;
    const translationNotice = notice.kind === "missing" || notice.kind === "translation-error";
    const timer = window.setTimeout(() => setNotice(null), translationNotice ? 8000 : 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => () => {
    translationRequest.current += 1;
    translationAbort.current?.abort();
  }, []);

  function dispatchMeaning(action: MeaningAction): void {
    onDraftChange((current) => ({
      ...current,
      meaningDraft: meaningDraftReducer(current.meaningDraft, action),
    }));
  }

  function clear(): void {
    translationRequest.current += 1;
    translationAbort.current?.abort();
    setTranslating(false);
    setNotice(null);
    onDraftChange(emptyAddWordDraft());
  }

  async function translate(): Promise<void> {
    const text = learningText.trim();
    if (text === "" || translating || saving || meanings.length >= MAX_MEANINGS) return;
    const requestId = ++translationRequest.current;
    const controller = new AbortController();
    translationAbort.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    setTranslating(true);
    setNotice((current) => current?.kind === "missing" || current?.kind === "translation-error" ? null : current);

    try {
      const result = await api.translationSuggestions(text, controller.signal);
      if (requestId !== translationRequest.current) return;
      if (!Array.isArray(result.meanings) || !result.meanings.every((value) => typeof value === "string")) {
        throw new Error("Invalid translation response");
      }
      if (result.meanings.length === 0) {
        setNotice({ kind: "missing", text: "No translation found" });
        return;
      }
      dispatchMeaning({ type: "append", values: result.meanings });
    } catch {
      if (requestId === translationRequest.current) {
        setNotice({ kind: "translation-error", text: "Translation unavailable" });
      }
    } finally {
      window.clearTimeout(timeout);
      if (translationAbort.current === controller) translationAbort.current = null;
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
    <section className="screen add-screen" ref={screenRef}>
      <form
        className="add-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <div className="add-card" ref={cardRef}>
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
                translationAbort.current?.abort();
                setTranslating(false);
                setNotice((current) => current?.kind === "missing" || current?.kind === "translation-error" ? null : current);
                onDraftChange((current) => ({ ...current, learningText: value }));
              }}
            />
          </label>

          <span className="add-divider" aria-hidden="true" />

          <MeaningFields
            label={languageName(settings.knownLanguage)}
            rows={meaningDraft.rows}
            onAction={dispatchMeaning}
            variant="add"
            disabled={saving}
            onTranslate={() => void translate()}
            translateDisabled={learningText.trim() === "" || translating || saving}
            translating={translating}
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
              {notice.kind === "success" ? "✓" : notice.kind === "existing" || notice.kind === "missing" ? "i" : "!"}
            </span>
            <span>{notice.text}</span>
            {(notice.kind === "missing" || notice.kind === "translation-error") && (
              <button className="toast-settings-link" type="button" onClick={onOpenSettings}>Settings</button>
            )}
            {(notice.kind === "success" || notice.kind === "existing") && (
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
