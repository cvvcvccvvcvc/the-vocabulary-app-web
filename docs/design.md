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
- State the metric and time range precisely. Prefer `Last 30 days` to an ambiguous label
  such as `Past month`, and `Review activity` to a generic `Activity`.
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

The first version answers three questions and intentionally adds no further KPIs:

1. Do I need to study today? — current streak and the last seven local calendar days.
2. How consistently have I practiced? — active days and daily review activity over the
   last 30 days.
3. What is the current shape of my collection? — total words and their distribution over
   levels 0–9.

Streak is a habit aid, not a learning score. Review totals, accuracy, time spent, longest
streak, words added, and supposed mastered-word counts stay out until a concrete user need
and an honest interpretation justify them.

## Sources

- [Apple Human Interface Guidelines: Color](https://developer.apple.com/design/human-interface-guidelines/color)
- [Apple Human Interface Guidelines: Charts](https://developer.apple.com/design/human-interface-guidelines/charts)
- [Android design guidance: Color](https://developer.android.com/design/ui/mobile/guides/styles/color)
- [GOV.UK Design System: Data visualisation principles](https://brand.design-system.service.gov.uk/data/)
- [GOV.UK Design System: Charts](https://brand.design-system.service.gov.uk/data/charts/)
- [GOV.UK Design System: Using colour in charts](https://brand.design-system.service.gov.uk/colour/charts/)
- [W3C: Understanding non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast)
- [W3C: Understanding use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
- [US Web Design System: Data visualizations](https://designsystem.digital.gov/components/data-visualizations/)
- [Journal of Consumer Research: The Motivating-Uncertainty Effect of Streaks](https://academic.oup.com/jcr/article/49/6/1095/6623414)
- [Nature Reviews Psychology: Making memories last using the science of effective learning](https://doi.org/10.1038/s44159-022-00089-1)
- [Anki Manual: Statistics](https://docs.ankiweb.net/stats.html)
