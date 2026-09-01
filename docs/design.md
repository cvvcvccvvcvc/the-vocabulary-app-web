# Design guidance

The Vocabulary App should stay quiet, compact, and action-oriented. This document records
the reusable interface decisions behind the product so later screens do not have to solve
the same design questions again.

## Hierarchy and consistency

- Give each screen and card one primary question to answer. Additional information earns
  its place only when it changes what the user understands or does next.
- Reuse the same information order for peer components: context, title, short summary,
  then visualization or action. Deliberate hero components may be different, but two
  analytical cards should not look like unrelated component types.
- Prefer native spacing, type, and interaction conventions over ornamental UI. Reduce
  words before reducing legibility.
- Use the established blue accent for selection, activity, and emphasis. Add another
  semantic color only when it has a stable meaning across the product. Never rely on color
  alone to distinguish a state; pair it with text, shape, or an icon.
- Check contrast for icons, chart marks, and other meaningful graphics as well as text.
- On mobile, the Words sort button and the Progress settings gear share a borderless
  floating surface, a 54-by-48-pixel hit area, a 24-pixel corner radius, and a soft shadow.
  Use the secondary neutral color and a 22-pixel glyph for the gear; retain the sort
  icon's 24-pixel size. Preserve a visible keyboard focus indicator. The Settings back
  button and desktop toolbar keep their existing styles.
- Contact Support is a quiet headset icon at the top right of Settings. Use the
  primary neutral text color, a 22-pixel glyph, a 44-pixel hit area,
  keyboard focus, and a Contact Support tooltip. Do not add a support card or blue accent.

## Meaning fields

- Add and Edit use the same meaning-field behavior. Keep one optional empty field after
  the populated meanings; at eight meanings, replace it with a quiet limit label.
- Never transfer focus to an automatically created field. If a user clears an existing
  field, keep it in place and remove the other empty slot. Once focus leaves, the empty
  slot returns to the end. Defer structural changes during IME composition.
- Give rows stable local identities across edits and moves. Preserve the user's order
  and exclude the empty slot from saved content; the server still validates uniqueness.
- Put the reorder handle, input, and remove button in separate columns with 44-pixel
  control targets. Start dragging only from the handle; text selection and scrolling
  remain native. The handle is direct manipulation, not a button, and does not open a
  secondary action menu. Keep the dragged row within the populated rows: moving beyond
  either end selects the first or last position, while the optional empty field is never
  a destination. Only an explicit cancellation such as Escape or a system pointer cancel
  leaves the order unchanged. Track the active gesture on the window so releasing above
  another field still finishes it, even when pointer capture is unavailable.
- During dragging, lift the selected row and shift neighboring rows into their prospective
  positions. The visible order before release must equal the committed order; do not add a
  separate insertion line. Calculate destinations from fixed slot midpoints captured before rows move,
  commit the displayed order in the same render that clears the preview, and settle every
  row from its release position into the new layout so the old order is never painted between
  them. Remove nonessential transitions when reduced motion is requested.
- Disable Telegram's vertical close gesture while reorder controls are available and
  restore it when leaving the editor. Scroll the visible card or screen at its edges during
  dragging, including when the software keyboard reduces the visual viewport. Stop scrolling
  once the populated track is fully visible; do not scroll toward Comment after its last row.

## Word detail and editing

- Keep Edit and Delete as separate actions on the word screen. Delete remains directly
  available and asks for confirmation; it does not require entering the editor first.
- Treat editing as a focused mode: show Cancel on the leading side and the blue Save action
  on the trailing side. Hide Back, Delete, pronunciation, Level, and bottom navigation until
  editing ends.
- Preserve the reading view's typography while editing. Fields have no persistent borders,
  fills, or underlines; the selected field alone shows a blue line along its bottom edge.
  Entering edit mode does not choose a field or open the keyboard automatically.
- Start Comment at one line and grow it with its content. Its active line follows the bottom
  of the text until eight lines, after which the field scrolls internally.

## Data visualization

- A chart must communicate a specific message, not merely display available data. Add a
  textual summary only when it contributes meaning beyond the visible marks.
- State the metric and time range precisely. Prefer `Last 12 weeks` to an ambiguous label
  such as `Past months`, and `Answer activity` to a generic `Activity`.
- Use bars for discrete daily counts and start their quantitative scale at zero. Keep tick
  intervals even and use simple rounded bounds when the observed maximum is awkward.
- Encode values proportionally. Do not give small non-zero values an artificial minimum
  height, and do not use progress-track styling for a distribution that has no target.
- Use a restrained palette. Color should clarify grouping or meaning, not decorate a
  chart, and a gradient must not imply an unsupported good-to-bad progression.
- Judge label size after the chart is rendered at its smallest supported width. Scaling an
  SVG can make an apparently reasonable source font unreadable on a phone.
- Do not hide essential information behind hover. Touch interfaces have no hover state;
  provide a visible summary and, when individual values matter, an accessible textual
  alternative or a deliberate tap interaction.
- When dense chart marks are visually smaller than a comfortable touch target, make the
  plot itself the interaction surface. Resolve the nearest mark from a tap or drag, show a
  persistent selected state and textual detail, and provide equivalent keyboard access.

## Product language and metrics

- Name a measure after what it actually counts. A review answer is practice volume, not
  proof that a word was learned.
- Levels describe scheduling maturity: higher levels wait longer between reviews. They do
  not prove mastery, so use `Word levels`, not `Mastery` or `Words learned`.
- Prefer exact, compact copy and remove repetition. For example, `Current streak` followed
  by `12 days` is clearer than `12 day streak`.
- Prefer consistency measures such as active days when they are more useful than a large
  aggregate total. Avoid metrics that reward collection growth or app usage without
  reflecting useful study behavior.
- Empty states should give one relevant next action instead of presenting several empty
  analytical charts.

## Review motion

- Before reveal, keep a single question visually quiet. When the known-language question
  contains multiple meanings, preserve their order in an unnumbered vertical group. Center
  the group and each meaning horizontally within the card, and wrap each meaning independently.
  Let oversized questions scroll vertically inside the card rather than shrinking,
  truncating, or joining them with punctuation.
- Keep revealed review cards in a stable reading order regardless of question direction:
  learning language, known-language meanings, then the optional comment. Present multiple
  meanings as a quiet numbered list and omit numbering for a single meaning. Preserve the
  saved order and wrap each meaning independently.
- Treat the comment as secondary prose rather than a quotation. Preserve its line breaks,
  omit quotation marks, italics, and a visible `Comment` heading, and separate it from the
  meanings with spacing and a neutral rule. Keep it readable in both themes.
- The Learn shell stays fixed, including review context and mobile navigation. The card owns
  vertical overflow on both the question and revealed sides, starts each new presentation at
  the top, and keeps short content vertically balanced.
- Resolve gesture intent from a clear dominant axis rather than whether the card currently
  overflows. Horizontal intent answers; vertical intent scrolls long content or does nothing
  on a short card; an ambiguous diagonal gesture waits without moving the card.

- Keep the card stack shallow and aligned: one quiet rear edge and one blurred incoming
  surface are enough to communicate continuity without turning review into a game effect.
- Tie the stack's depth response directly to horizontal drag progress. A cancelled gesture
  returns every layer with the card; an accepted gesture promotes the real next card.
- Remove the incoming blur when the outgoing card leaves the screen, independently of the
  server response. Saving controls whether another answer is allowed, not visual focus.
- Animate only the card transforms, opacity, and the small question surface. Decorative
  layers stay outside the accessibility tree, and reduced-motion mode removes depth and
  blur transitions.

## Progress screen

The screen answers three related questions and intentionally adds no general collection
dashboard:

1. Am I maintaining the habit? — the exact current streak.
2. How often am I practicing words? — a 12-week calendar of answer volume.
3. How consistently am I growing the material I study? — the same calendar switched to
   addition volume.

One calendar with two explicit modes makes the two behaviors comparable without asking a
phone-width screen to support two simultaneous charts. The current local calendar week and
the previous 11 expose routine and gaps while keeping daily cells aligned and legible; this
is an explicit range, not a vague calendar month. The grid uses the established blue accent
as a sequential count scale. Zero is neutral, intensity means more activity, and no color
is described as inherently good or bad.

The visible modes are `Answers` and `Words added`. `Answers` names every accepted correct
or wrong response in either review mode without relying on specialist review terminology.
The equal-width segmented control establishes visual balance; its labels do not need the
same number of words.

The mode control comes first, followed by `Last 12 weeks` as a quiet chart scope rather
than a card title. The calendar labels Monday, Wednesday, and Friday as `Mon`, `Wed`, and
`Fri`: three familiar anchors preserve orientation without crowding all seven rows.

Selecting or scrubbing a day reveals its exact count in one centered, plain-language
annotation below the grid, such as `4 answers on 18 Aug` or `4 answers today`. Count and
date use one typographic treatment because together they describe one data point, not two
opposing metrics. The annotation area is centered between its top separator and the card's
bottom edge. The screen does not invent a quality score for answers or additions: daily
volume establishes frequency and consistency, but not recall quality, mastery, or whether
a new entry is well written.

Streak is a habit aid, not a learning score. Time spent, longest streak, level distribution,
supposed mastered-word counts, and large lifetime totals stay out until a concrete user
decision and an honest interpretation justify them. Before today's first answer, the card
asks the user to keep an existing streak or start a new one and offers a concise `Learn`
action. After an answer, it collapses to the streak itself without adding a redundant
completion message.

## Sources

- [Apple Human Interface Guidelines: Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- [Apple: Build powerful drag and drop in SwiftUI](https://developer.apple.com/videos/play/wwdc2026/271/)
- [Apple Human Interface Guidelines: Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Apple Human Interface Guidelines: Color](https://developer.apple.com/design/human-interface-guidelines/color)
- [Apple Human Interface Guidelines: Charts](https://developer.apple.com/design/human-interface-guidelines/charts)
- [Android design guidance: Color](https://developer.android.com/design/ui/mobile/guides/styles/color)
- [GOV.UK Design System: Data visualisation principles](https://brand.design-system.service.gov.uk/data/)
- [GOV.UK Design System: Charts](https://brand.design-system.service.gov.uk/data/charts/)
- [GOV.UK Design System: Using colour in charts](https://brand.design-system.service.gov.uk/colour/charts/)
- [W3C: Understanding non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast)
- [W3C: Understanding use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
- [W3C: Understanding target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [W3C: Understanding dragging movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)
- [W3C: Using `prefers-reduced-motion`](https://www.w3.org/WAI/WCAG21/Techniques/css/C39.html)
- [MDN: Visual Viewport API](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport)
- [MDN: `requestAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)
- [US Web Design System: Data visualizations](https://designsystem.digital.gov/components/data-visualizations/)
- [web.dev: High-performance CSS animations](https://web.dev/articles/animations-guide)
- [GitHub Docs: Viewing contributions on your profile](https://docs.github.com/en/account-and-profile/concepts/contributions-visible-on-your-profile)
- [Journal of Consumer Research: The Motivating-Uncertainty Effect of Streaks](https://academic.oup.com/jcr/article/49/6/1095/6623414)
- [Nature Reviews Psychology: Making memories last using the science of effective learning](https://doi.org/10.1038/s44159-022-00089-1)
- [Anki Manual: Statistics](https://docs.ankiweb.net/stats.html)
