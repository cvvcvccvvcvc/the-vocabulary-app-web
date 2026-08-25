# Product

The Vocabulary App is a vocabulary trainer that follows the user across iPhone, Mac, browsers, and Telegram. The server stores the canonical profile and vocabulary; the native Swift application is not part of the new product.

## First release

- Telegram identity shared by the website and Telegram Mini App.
- The bot's `/start` and `/help` commands return a compact launch menu for Learn, Add Word, and Words. Each button opens the Mini App directly on that section.
- Responsive Learn, Add Word, Words, and Progress sections. They form the four primary destinations on mobile and desktop. Settings is a secondary destination opened from a gear button and returns to the section that opened it. Mobile Telegram leaves room for its overlay controls without redundant page titles. Add Word keeps its primary action above the bottom navigation and scrolls the card only when its content exceeds the available space.
- Centered review cards with compact labeled question and answer sides.
- One word is one card with one learning-language value and one to eight ordered known-language meanings.
- Focused word editing with separate Save and Cancel actions; review level remains read-only.
- Optional comment for examples, nuance, and notes.
- Scheduled Review followed by infinite Free Review.
- The active review-mode badge opens a short contextual explanation. The whole Level card opens an explanation of level progress; neither control relies on a tiny question-mark target.
- Swipe or drag a revealed review card left for a wrong answer and right for a correct answer; desktop keyboard arrows remain available. Mobile Telegram's vertical close gesture is disabled while Learn is open so it cannot interrupt card swipes.
- Words can be searched and sorted by date added, A–Z, or learning level from a compact custom menu.
- Browser speech synthesis for the learning-language side.
- Best-effort fullscreen presentation inside supported mobile Telegram clients.
- A light, dark, or device-matched appearance stored in the user's profile.
- A personal Progress screen with the current streak, the last seven calendar days, a rolling one-month review activity chart, the current word count, and the distribution of active words across levels 0–9.
- Server-side persistence and user isolation.
- An owner-only website analytics page at `/analytics` for registration growth,
  learning-active DAU/WAU/MAU, daily answer and word counts, and sortable user totals.

Automatic translation, external dictionary lookup, offline mutation replay, reminders,
tags, and decks are deferred until the core online experience is proven.

## Progress rules

An active day is a local calendar day with at least one accepted review answer. Correct
and wrong answers count in both Scheduled Review and Free Review. Showing a card or adding
a word does not count toward the streak.

The current streak is the consecutive run of active days ending today or yesterday. This
keeps an existing streak intact during the current day until the user has had a chance to
study; it resets after a full local calendar day is missed. Duplicate answer submissions
remain idempotent and cannot inflate activity.

The client sends its current IANA time-zone identifier when it requests progress. The
server keeps canonical timestamps in UTC and groups them into calendar days in that time
zone. The time zone is resolved per request rather than stored as another user setting, so
travel follows the device currently in use.

## Review rules

Levels are integers from 0 through 9. New words start at level 0.

Scheduled Review serves new and due words. Correct answers raise the level by one and wrong answers lower it by one, clamped to the valid range. The interval after the resulting level is:

| Level | Days |
| --- | ---: |
| 0 | 0 |
| 1 | 1 |
| 2 | 2 |
| 3 | 4 |
| 4 | 7 |
| 5–9 | 14 |

Free Review starts only when Scheduled Review is empty. It draws from all active words and never changes `level` or `nextReviewAt`.

The first side is chosen randomly. Every subsequent presentation of the same word alternates direction.

## Data ownership

Each Telegram identity maps to one internal Vocabulary account. A new user receives an empty account. All words, language and appearance settings, and sessions are scoped to that internal account. There is no separate device-sync control: authenticated devices read and write the same server profile.

The administrative analytics page is the only cross-user read surface. It is absent from
normal navigation and the server authorizes it against the configured owner Telegram ID.
It exposes profile labels and aggregate counts, never word text or meanings.
