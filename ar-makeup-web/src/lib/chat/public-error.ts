/** Shown in the chat bubble when every provider fails. Never include provider text. */
export const CHAT_FAILURE_MESSAGE = "I could not answer just now. Please try again.";

/** Shown when the catalog has no in-stock row for the request. */
export const CHAT_NO_MATCH_SENTENCE =
  "I couldn't find an exact match for that right now. Could we try looking for a different category or preference?";

/** Shown when this route's own limiter trips. Does not name a provider or a quota. */
export const CHAT_WAIT_MESSAGE = "Please wait a moment and try again.";

/** Maps any provider or transport failure to the one sentence the shopper can see. */
export function friendlyChatError(_error: unknown): string {
  return CHAT_FAILURE_MESSAGE;
}

/**
 * Shopper-visible answer text.
 * A model placeholder of only question marks is treated as no answer.
 */
export function assistantBubbleText(text: string): string {
  const cleaned = text.replace(/\uFFFD/g, "").replace(/^\s*(?:\?{2,}[\s]*)+/, "").trim();
  if (!cleaned || /^[?\s]+$/.test(cleaned)) return "";
  return cleaned;
}

export function isPlaceholderAssistantText(text: string): boolean {
  return assistantBubbleText(text).length === 0;
}
