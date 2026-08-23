# Product

Vocabulary is a vocabulary trainer that follows the user across iPhone, Mac, browsers, and Telegram. The server stores the canonical profile and vocabulary; the native Swift application is not part of the new product.

## First release

- Telegram identity shared by the website and Telegram Mini App.
- Responsive Learn, Add Word, Words, and Settings sections.
- Centered review cards with compact labeled question and answer sides.
- One word is one card with one learning-language value and one to eight ordered known-language meanings.
- Focused word editing with separate Save and Cancel actions; review level remains read-only.
- Optional comment for examples, nuance, and notes.
- Scheduled Review followed by infinite Free Review.
- Swipe or drag a revealed review card left for a wrong answer and right for a correct answer; desktop keyboard arrows remain available.
- Browser speech synthesis for the learning-language side.
- Best-effort fullscreen presentation inside supported mobile Telegram clients.
- A light, dark, or device-matched appearance stored in the user's profile.
- Server-side persistence and user isolation.

Automatic translation, external dictionary lookup, offline mutation replay, reminders, statistics, tags, and decks are deferred until the core online experience is proven.

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
