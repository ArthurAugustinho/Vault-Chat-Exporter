import type { Conversation, Message } from "~/types"
import { domToMarkdown, cleanText, sortByPosition } from "./index"

function getTitle(): string {
  const h1 = document.querySelector("h1")
  if (h1?.textContent?.trim()) return h1.textContent.trim()

  return (
    document.title
      .replace(/\s*[-|]?\s*Perplexity(\.ai)?$/i, "")
      .trim() || "Perplexity Conversation"
  )
}

function extractMessages(): Message[] {
  const messages: Message[] = []

  // Perplexity DOM (2025):
  // User queries: .query, [data-testid*='query'], .question-text
  // AI answers: .prose, [class*='answer'], [data-testid*='answer']

  const queryEls = document.querySelectorAll(
    ".query-text, [class*='query'], [data-testid*='query'], [data-testid*='question']"
  )
  const answerEls = document.querySelectorAll(
    ".prose, [class*='answer-content'], [data-testid*='answer'], [class*='answerText']"
  )

  if (queryEls.length > 0 || answerEls.length > 0) {
    const all = [
      ...Array.from(queryEls).map((el) => ({ el, role: "user" as const })),
      ...Array.from(answerEls).map((el) => ({ el, role: "assistant" as const }))
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

  // Fallback: look for alternating sections in main content
  const mainEl = document.querySelector("main") ?? document.body
  const sections = mainEl.querySelectorAll("section, article, [class*='container']")
  if (sections.length > 0) {
    sections.forEach((sec, i) => {
      const text = sec.textContent?.trim() ?? ""
      if (!text || text.length < 10) return
      const role = i % 2 === 0 ? ("user" as const) : ("assistant" as const)
      messages.push({ role, content: text.slice(0, 2000) })
    })
  }

  return messages
}

export function extractPerplexity(): Conversation {
  return {
    platform: "perplexity",
    title: getTitle(),
    url: location.href,
    messages: extractMessages()
  }
}

export function matchesPerplexity(url: string): boolean {
  return /^https:\/\/(www\.)?perplexity\.ai/.test(url)
}
