import type { Conversation, MarkdownOptions } from "~/types"

function escapeYamlString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function buildFrontmatter(conv: Conversation, opts: MarkdownOptions): string {
  const lines = [
    "---",
    `title: "${escapeYamlString(opts.title)}"`,
    `source: ${conv.platform}`,
    `url: "${escapeYamlString(conv.url)}"`,
    `platform: ${conv.platform}`,
    `createdAt: "${new Date().toISOString()}"`
  ]

  // Template-specific fields — merged after base fields, before tags
  if (opts.templateFields) {
    for (const [key, value] of Object.entries(opts.templateFields)) {
      // Empty string → bare key (Obsidian renders as empty property)
      lines.push(value === "" ? `${key}:` : `${key}: ${value}`)
    }
  }

  if (opts.tags.length > 0) {
    lines.push("tags:")
    opts.tags.forEach((t) => lines.push(`  - ${t.trim()}`))
  }

  lines.push("---")
  return lines.join("\n")
}

function buildBody(conv: Conversation): string {
  return conv.messages
    .map((msg) => {
      const heading =
        msg.role === "user"
          ? "## User"
          : msg.role === "assistant"
          ? "## Assistant"
          : "## System"
      return `${heading}\n\n${msg.content}`
    })
    .join("\n\n---\n\n")
}

export function conversationToMarkdown(
  conv: Conversation,
  opts: MarkdownOptions
): string {
  return `${buildFrontmatter(conv, opts)}\n\n${buildBody(conv)}\n`
}
