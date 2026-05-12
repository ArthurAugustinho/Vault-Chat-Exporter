import type { Conversation, Message } from "~/types"
import { domToMarkdown, cleanText } from "./index"

function getTitle(): string {
  // Try sidebar active item first
  const sidebarActive = document.querySelector(
    "nav li a[aria-current='page'], nav li.bg-token-sidebar-surface-secondary"
  )
  if (sidebarActive?.textContent?.trim()) {
    return sidebarActive.textContent.trim()
  }
  // Fall back to document title
  return (
    document.title
      .replace(/^ChatGPT\s*[-|]?\s*/i, "")
      .replace(/\s*[-|]?\s*ChatGPT$/i, "")
      .trim() || "ChatGPT Conversation"
  )
}

function extractMessages(): Message[] {
  const messages: Message[] = []

  // Strategy 1: data-message-author-role (most reliable)
  const roleEls = document.querySelectorAll("[data-message-author-role]")
  if (roleEls.length > 0) {
    roleEls.forEach((el) => {
      const rawRole = el.getAttribute("data-message-author-role")
      if (rawRole !== "user" && rawRole !== "assistant") return

      const role = rawRole as "user" | "assistant"
      let content = ""

      if (role === "user") {
        const textEl =
          el.querySelector(".whitespace-pre-wrap") ??
          el.querySelector("p") ??
          el
        content = textEl.textContent?.trim() ?? ""
      } else {
        const markdownEl =
          el.querySelector(".markdown") ??
          el.querySelector("[class*='prose']") ??
          el.querySelector(".agent-turn") ??
          el
        content = cleanText(domToMarkdown(markdownEl))
      }

      if (content) messages.push({ role, content })
    })
    return messages
  }

  // Strategy 2: article-based alternating (fallback)
  const articles = document.querySelectorAll("article")
  if (articles.length > 0) {
    articles.forEach((article, i) => {
      const role = i % 2 === 0 ? "user" : "assistant"
      const content = article.textContent?.trim() ?? ""
      if (content) messages.push({ role, content })
    })
    return messages
  }

  return messages
}

export function extractChatGPT(): Conversation {
  return {
    platform: "chatgpt",
    title: getTitle(),
    url: location.href,
    messages: extractMessages()
  }
}

export function matchesChatGPT(url: string): boolean {
  return /^https:\/\/(chat\.openai\.com|chatgpt\.com)/.test(url)
}
