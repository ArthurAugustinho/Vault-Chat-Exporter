import type { Conversation, MarkdownOptions, Message } from "~/types"

// ─── Frontmatter ──────────────────────────────────────────────────────────────

function escapeYamlString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function extractChatId(url: string, platform: string): string {
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean)
    const last = segments[segments.length - 1]
    if (last && last.length > 4) return `${platform}_${last}`
  } catch {}
  return `${platform}_${Date.now()}`
}

export function buildFrontmatter(
  conv: Conversation,
  opts: MarkdownOptions,
  messageCount: number
): string {
  const now = new Date().toISOString()
  const id = extractChatId(conv.url, conv.platform)

  const defaultTags = ["ai-conversation", conv.platform]
  const userTags = opts.tags.map((t) => t.trim()).filter(Boolean)
  const allTags = [...new Set([...defaultTags, ...userTags])]

  const lines = [
    "---",
    `id: ${id}`,
    `title: "${escapeYamlString(opts.title)}"`,
    `source: ${conv.platform}`,
    `url: "${escapeYamlString(conv.url)}"`,
    `created: "${now}"`,
    `modified: "${now}"`,
    "tags:",
    ...allTags.map((t) => `  - ${t}`),
    `message_count: ${messageCount}`,
  ]

  if (opts.templateFields) {
    for (const [key, value] of Object.entries(opts.templateFields)) {
      lines.push(value === "" ? `${key}:` : `${key}: ${value}`)
    }
  }

  lines.push("---")
  return lines.join("\n")
}

// ─── Callouts ─────────────────────────────────────────────────────────────────

/** Prefixes every line with "> " so content renders inside an Obsidian callout. */
export function escapeCalloutContent(content: string): string {
  return content
    .trimEnd()
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n")
}

export function formatCallout(
  type: string,
  label: string,
  content: string,
  collapsible = false
): string {
  const header = collapsible ? `> [!${type}]- ${label}` : `> [!${type}] ${label}`
  return `${header}\n${escapeCalloutContent(content)}`
}

const AI_LABEL: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
}

// ─── Turn formatting ──────────────────────────────────────────────────────────

export function buildConversationHeading(userContent: string): string {
  const clean = userContent
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]+`/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()

  if (!clean) return "Conversa exportada"
  if (clean.length <= 80) return clean
  const cut = clean.slice(0, 80)
  const lastSpace = cut.lastIndexOf(" ")
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut) + "…"
}

export function formatTurn(msg: Message, platform: string): string {
  const parts: string[] = []

  if (msg.role === "user") {
    parts.push(formatCallout("QUESTION", "User", msg.content))
  } else if (msg.role === "assistant") {
    if (msg.thinking) {
      parts.push(formatCallout("ABSTRACT", "Raciocínio", msg.thinking, true))
    }
    parts.push(formatCallout("NOTE", AI_LABEL[platform] ?? "AI", msg.content))
  } else {
    parts.push(formatCallout("INFO", "System", msg.content))
  }

  return parts.join("\n\n")
}

// ─── Body ─────────────────────────────────────────────────────────────────────

export function formatConversationMarkdown(conv: Conversation): string {
  const sections: string[] = []
  let i = 0

  while (i < conv.messages.length) {
    const msg = conv.messages[i]

    if (msg.role === "user") {
      const heading = buildConversationHeading(msg.content)
      const parts = [`## ${heading}`, "", formatTurn(msg, conv.platform)]
      i++

      // Collect consecutive non-user messages belonging to this turn
      while (i < conv.messages.length && conv.messages[i].role !== "user") {
        parts.push("", formatTurn(conv.messages[i], conv.platform))
        i++
      }

      sections.push(parts.join("\n"))
    } else {
      // Non-user message with no preceding user message (edge case)
      sections.push(`## Conversa exportada\n\n${formatTurn(msg, conv.platform)}`)
      i++
    }
  }

  return sections.join("\n\n")
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function conversationToMarkdown(conv: Conversation, opts: MarkdownOptions): string {
  const fm = buildFrontmatter(conv, opts, conv.messages.length)
  const body = formatConversationMarkdown(conv)
  return `${fm}\n\n${body}\n`
}
