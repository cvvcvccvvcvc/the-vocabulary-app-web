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

## Data visualization

- A chart must communicate a specific message, not merely display available data. Pair it
  with a short textual summary of the main result.
- State the metric and time range precisely. Prefer `Last 12 weeks` to an ambiguous label
  such as `Past months`, and `Review activity` to a generic `Activity`.
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

## Progress screen

The screen answers three related questions and intentionally adds no general collection
dashboard:

1. Am I maintaining the habit? — the exact current streak.
2. How often and how well am I recalling words? — review active days, first-try recall,
   and a 12-week calendar of answer volume.
3. How consistently am I growing the material I study? — addition active days, total words
   added in the same period, and the same calendar switched to addition volume.

One calendar with two explicit modes makes the two behaviors comparable without asking a
phone-width screen to support two simultaneous charts. The current local calendar week and
the previous 11 expose routine and gaps while keeping daily cells aligned and legible; this
is an explicit range, not a vague calendar month. The grid uses the established blue accent
as a sequential count scale. Zero is neutral, intensity means more activity, and no color
is described as inherently good or bad.

Selecting or scrubbing a day reveals its exact count below the grid. Review detail also
shows the day's first-try numerator and denominator. First try means the first accepted
answer for a card on that local day; repeat attempts remain visible in volume but cannot
improve the recall percentage. This is a useful recall signal, not mastery or overall
accuracy. Word additions deliberately have no invented quality score because creation
volume alone cannot establish whether an entry is useful or well written.

Streak is a habit aid, not a learning score. Time spent, longest streak, level distribution,
supposed mastered-word counts, and large lifetime totals stay out until a concrete user
decision and an honest interpretation justify them.

## Sources

- [Apple Human Interface Guidelines: Color](https://developer.apple.com/design/human-interface-guidelines/color)
- [Apple Human Interface Guidelines: Charts](https://developer.apple.com/design/human-interface-guidelines/charts)
- [Android design guidance: Color](https://developer.android.com/design/ui/mobile/guides/styles/color)
- [GOV.UK Design System: Data visualisation principles](https://brand.design-system.service.gov.uk/data/)
- [GOV.UK Design System: Charts](https://brand.design-system.service.gov.uk/data/charts/)
- [GOV.UK Design System: Using colour in charts](https://brand.design-system.service.gov.uk/colour/charts/)
- [W3C: Understanding non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast)
- [W3C: Understanding use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
- [W3C: Understanding target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [US Web Design System: Data visualizations](https://designsystem.digital.gov/components/data-visualizations/)
- [GitHub Docs: Viewing contributions on your profile](https://docs.github.com/en/account-and-profile/concepts/contributions-visible-on-your-profile)
- [Journal of Consumer Research: The Motivating-Uncertainty Effect of Streaks](https://academic.oup.com/jcr/article/49/6/1095/6623414)
- [Nature Reviews Psychology: Making memories last using the science of effective learning](https://doi.org/10.1038/s44159-022-00089-1)
- [Anki Manual: Statistics](https://docs.ankiweb.net/stats.html)
