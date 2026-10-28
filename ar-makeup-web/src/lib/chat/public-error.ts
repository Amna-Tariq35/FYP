/** Shown in the chat bubble when every provider fails. Never include provider text. */
export const CHAT_FAILURE_MESSAGE = "I could not answer just now. Please try again.";

/** Shown when this route's own limiter trips. Does not name a provider or a quota. */
export const CHAT_WAIT_MESSAGE = "Please wait a moment and try again.";

/** Maps any provider or transport failure to the one sentence the shopper can see. */
export function friendlyChatError(_error: unknown): string {
  return CHAT_FAILURE_MESSAGE;
}
