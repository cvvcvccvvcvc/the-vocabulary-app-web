# Product

The Vocabulary App is a vocabulary trainer that follows the user across iPhone, Mac, browsers, and Telegram. The server stores the canonical profile and vocabulary; the native Swift application is not part of the new product.

## First release

- Telegram identity shared by the website and Telegram Mini App.
- The bot's `/start` and `/help` commands return a compact launch menu for Learn, Add Word, and Words. Each button opens the Mini App directly on that section.
- Responsive Learn, Add Word, Words, and Progress sections. They form the four primary destinations on mobile and desktop. Settings is a secondary destination opened from a gear button and returns to the section that opened it. Mobile Telegram leaves room for its overlay controls without redundant page titles. Add Word keeps its primary action above the bottom navigation and scrolls the card only when its content exceeds the available space.
- Centered review cards with compact labeled question and answer sides.
- One word is one card with one learning-language value and one to eight ordered known-language meanings.
- Add Word and Edit share a meaning editor without a plus button. Typing offers one more empty field until eight meanings are filled. Any populated meaning can be deleted or reordered by dragging its handle. While dragging, neighboring meanings shift to show the exact resulting order before release; moving beyond the populated rows keeps the first or last position selected, and releasing settles into that order without an intermediate return to the old layout. The empty field is optional, does not participate in reordering, and is never saved.
- Focused word editing with separate Save and Cancel actions; review level remains read-only
  and is hidden while editing. Edit and Delete remain separate actions on the word screen.
- Optional comment for examples, nuance, and notes.
- Scheduled Review followed by infinite Free Review.
- The active review-mode badge opens a short contextual explanation. The whole Level card opens an explanation of level progress; neither control relies on a tiny question-mark target.
- Swipe or drag a revealed review card left for a wrong answer and right for a correct answer; the card fills softly with the corresponding color as the gesture progresses, while a quiet card stack appears underneath. Once the gesture is accepted, the actual next question waits blurred below the outgoing card and comes into focus when that card leaves the screen. Desktop keyboard arrows use the same transition. Learn does not scroll as a page; only oversized card content scrolls vertically. Mobile Telegram's vertical close gesture is disabled while Learn is open so it cannot interrupt card swipes.
- Words can be searched and sorted by date added, A–Z, or learning level from a compact custom menu.
- Adding an already saved word is a neutral result with a direct link to the existing card; View after a successful add opens the new card directly.
- Browser speech synthesis for the learning-language side.
- Best-effort fullscreen presentation inside supported mobile Telegram clients.
- A light, dark, or device-matched appearance stored in the user's profile.
- A personal Progress screen with the exact current streak and one interactive 12-week
  calendar for Answers and Words added. Selecting a calendar day reveals its exact answer
  or addition count. The calendar owns touch drags in both axes, and mobile Telegram's
  vertical close gesture is disabled while the interactive calendar is present. A
  brand-new account sees one Add Word action instead of empty analytics.
- Opt-in Telegram reminders when Scheduled Review cards are ready.
- Server-side persistence and user isolation.
- An owner-only website analytics page at `/analytics` for registration growth,
  learning-active DAU/WAU/MAU, daily answer and word counts, and sortable user totals.

Automatic translation, external dictionary lookup, offline mutation replay, tags, and
decks are deferred until the core online experience is proven.

## Progress rules

An active day is a local calendar day with at least one accepted review answer. Correct
and wrong answers count in both Scheduled Review and Free Review. Showing a card or adding
a word does not count toward the streak.

The current streak is the consecutive run of active days ending today or yesterday. This
keeps an existing streak intact during the current day until the user has had a chance to
study; it resets after a full local calendar day is missed. Duplicate answer submissions
remain idempotent and cannot inflate activity.

Words added are grouped by their original creation time. Deleting a word later removes it
from the current collection but does not rewrite the historical addition count. An active
addition day contains at least one created word and is independent of the review streak.

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

Moving to another tab and back keeps the current review card, its direction and reveal state, and the remaining in-memory queue. A full application reload deliberately starts a fresh queue from server data.

An accepted answer immediately projects the next card from the in-memory queue. It waits blurred beneath the outgoing card, becomes readable when that card leaves the screen, and does not wait for the server response. It can then be revealed while the previous answer is being saved, but another answer waits for server confirmation. A failed save keeps the same card and offers an exact retry rather than selecting again.

The first side is chosen randomly. Every subsequent presentation of the same word alternates direction.

## Telegram reminders

Telegram reminders are disabled by default. The setting can be enabled only from the
Telegram Mini App after Telegram grants the bot write access, and it can be disabled from
any authenticated client.

Each completed review answer starts a new reminder cycle, regardless of answer correctness
or review mode. The server checks the cycle after 1, 2, 4, 7, 14, and 30 elapsed days. At
each milestone it sends one reminder only when at least one active card is ready for
Scheduled Review. A milestone with no due cards is consumed without sending. No more
reminders are sent after day 30 until another answer starts a new cycle.

The message uses the current due-card count and the neutral Russian copy “К повторению
готовы N карточек.” with correct singular and plural forms. Its “Повторить” button opens
Learn, where Scheduled Review remains ahead of Free Review.

## Data ownership

Each Telegram identity maps to one internal account in The Vocabulary App. A new user receives an empty account. All words, language and appearance settings, and sessions are scoped to that internal account. There is no separate device-sync control: authenticated devices read and write the same server profile.

The administrative analytics page is the only cross-user read surface. It is absent from
normal navigation and the server authorizes it against the configured owner Telegram ID.
It exposes profile labels and aggregate counts, never word text or meanings.
