import { openTelegramLink } from "../lib/telegram.js";
import { Icon } from "./Icons.js";

export function SupportLink() {
  return (
    <a
      className="support-link"
      href="https://t.me/thevocabularyapp?direct"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contact Support"
      title="Contact Support"
      onClick={(event) => {
        if (event.button === 0
          && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
          && openTelegramLink(event.currentTarget.href)) {
          event.preventDefault();
        }
      }}
    >
      <Icon name="support" />
    </a>
  );
}
