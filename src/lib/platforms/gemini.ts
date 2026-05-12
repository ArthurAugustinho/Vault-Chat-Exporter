import type { Conversation, Message } from "~/types"
import { domToMarkdown, cleanText, sortByPosition } from "./index"

function getTitle(): string {
  const header = document.querySelector(
    "h1, .conversation-title, [data-testid='conversation-title']"
  )
  if (header?.textContent?.trim()) return header.textContent.trim()

  return (
    document.title
      .replace(/^Gemini\s*[-|]?\s*/i, "")
      .replace(/\s*[-|]?\s*Gemini\s*(-\s*Google\s*AI)?$/i, "")
      .trim() || "Gemini Conversation"
  )
}

function extractMessages(): Message[] {
  const messages: Message[] = []

  // Gemini DOM (2025) - uses Angular components
  // User queries: .query-text, [class*='user-query'], .user-message
  // AI responses: .model-response, [class*='response-container'], .response-text

  const userEls = document.querySelectorAll(
    ".query-text, .user-query-text, [data-message-role='user'], [class*='query-text'], [class*='UserMessage']"
  )
  const aiEls = document.querySelectorAll(
    ".model-response-text, .response-text, [data-message-role='model'], [class*='ModelResponse'], [class*='response-container'] .markdown"
  )

  if (userEls.length > 0 || aiEls.length > 0) {
    const all = [
      ...Array.from(userEls).map((el) => ({ el, role: "user" as const })),
      ...Array.from(aiEls).map((el) => ({ el, role: "assistant" as const }))
    ]
    sortByPosition(all).forEach(({ el, role }) => {
      const content =
        role === "user"
          ? el.textContent?.trim() ?? ""
          : cleanText(domToMarkdown(el))
      if (content) messages.push({ role, content })
    })
    return messages
  }

  // Fallback: find conversation-like structure
  const turnEls = document.querySelectorAll(
    "message-turn, conversation-turn, [class*='turn'], [class*='Turn']"
  )
  if (turnEls.length > 0) {
    turnEls.forEach((el, i) => {
      const role = i % 2 === 0 ? ("user" as const) : ("assistant" as const)
      const content = el.textContent?.trim() ?? ""
      if (content) messages.push({ role, content })
    })
    return messages
  }

  return messages
}

export function extractGemini(): Conversation {
  return {
    platform: "gemini",
    title: getTitle(),
    url: location.href,
    messages: extractMessages()
  }
}

export function matchesGemini(url: string): boolean {
  return /^https:\/\/gemini\.google\.com/.test(url)
}
