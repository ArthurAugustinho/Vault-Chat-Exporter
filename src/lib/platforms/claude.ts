import type { Conversation, Message } from "~/types"
import { domToMarkdown, cleanText, sortByPosition } from "./index"

function getTitle(): string {
  // Claude shows conversation title in the header
  const headerTitle = document.querySelector(
    "header h1, [data-testid='conversation-title'], .conversation-title"
  )
  if (headerTitle?.textContent?.trim()) return headerTitle.textContent.trim()

  return (
    document.title
      .replace(/^Claude\s*[-|]?\s*/i, "")
      .replace(/\s*[-|]?\s*Claude$/i, "")
      .trim() || "Claude Conversation"
  )
}

function extractMessages(): Message[] {
  const messages: Message[] = []

  // Strategy 1: data-testid selectors
  const humanEls = document.querySelectorAll(
    "[data-testid='human-turn'], [data-testid='user-message']"
  )
  const aiEls = document.querySelectorAll(
    "[data-testid='ai-turn'], [data-testid='assistant-message']"
  )

  if (humanEls.length > 0 || aiEls.length > 0) {
    const all = [
      ...Array.from(humanEls).map((el) => ({ el, role: "user" as const })),
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

  // Strategy 2: class-based detection (claude.ai 2025 DOM)
  // Human messages: .font-user-message, .human-turn, [class*="HumanTurn"]
  // AI messages: .font-claude-message, .ai-turn, [class*="AssistantTurn"]
  const humanEls2 = document.querySelectorAll(
    ".font-user-message, .human-turn, [class*='HumanTurn'], [class*='human-turn']"
  )
  const aiEls2 = document.querySelectorAll(
    ".font-claude-message, .ai-turn, [class*='AssistantTurn'], [class*='assistant-turn']"
  )

  if (humanEls2.length > 0 || aiEls2.length > 0) {
    const all = [
      ...Array.from(humanEls2).map((el) => ({ el, role: "user" as const })),
      ...Array.from(aiEls2).map((el) => ({ el, role: "assistant" as const }))
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

  // Strategy 3: find conversation container and alternate
  const conversationEl =
    document.querySelector("[class*='conversation']") ??
    document.querySelector("main") ??
    document.querySelector("[role='main']")

  if (conversationEl) {
    let isUser = true
    Array.from(conversationEl.children).forEach((child) => {
      const text = child.textContent?.trim() ?? ""
      if (!text || text.length < 3) return
      const role = isUser ? "user" : "assistant"
      const content =
        role === "user" ? text : cleanText(domToMarkdown(child))
      if (content) {
        messages.push({ role, content })
        isUser = !isUser
      }
    })
  }

  return messages
}

export function extractClaude(): Conversation {
  return {
    platform: "claude",
    title: getTitle(),
    url: location.href,
    messages: extractMessages()
  }
}

export function matchesClaude(url: string): boolean {
  return /^https:\/\/claude\.ai/.test(url)
}
