import type { Conversation, Message, Platform } from "~/types"

export interface Extractor {
  matches(url: string): boolean
  platform: Platform
  extract(): Conversation
}

// --- DOM → Markdown helper (runs inside page context via content script) ---

function renderInline(el: Element): string {
  const buf: string[] = []
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      buf.push(node.textContent || "")
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const ch = node as Element
      const t = ch.tagName.toLowerCase()
      if (t === "strong" || t === "b") buf.push(`**${ch.textContent}**`)
      else if (t === "em" || t === "i") buf.push(`_${ch.textContent}_`)
      else if (t === "code") buf.push(`\`${ch.textContent}\``)
      else if (t === "a") {
        const href = (ch as HTMLAnchorElement).href
        buf.push(`[${ch.textContent}](${href})`)
      } else {
        buf.push(ch.textContent || "")
      }
    }
  })
  return buf.join("")
}

export function domToMarkdown(el: Element): string {
  const parts: string[] = []

  function walk(node: Node): void {
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent || "")
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return

    const elem = node as Element
    const tag = elem.tagName.toLowerCase()

    switch (tag) {
      case "pre": {
        const codeEl = elem.querySelector("code")
        const lang = (codeEl?.className ?? "").match(/language-(\w+)/)?.[1] ?? ""
        const content = (codeEl?.textContent ?? elem.textContent ?? "").trimEnd()
        parts.push(`\n\`\`\`${lang}\n${content}\n\`\`\`\n`)
        break
      }
      case "code":
        if (!elem.closest("pre")) parts.push(`\`${elem.textContent}\``)
        break
      case "h1": parts.push(`\n# ${elem.textContent?.trim()}\n`); break
      case "h2": parts.push(`\n## ${elem.textContent?.trim()}\n`); break
      case "h3": parts.push(`\n### ${elem.textContent?.trim()}\n`); break
      case "h4": parts.push(`\n#### ${elem.textContent?.trim()}\n`); break
      case "p": parts.push(`\n${renderInline(elem)}\n`); break
      case "ul": {
        elem.querySelectorAll(":scope > li").forEach((li) => {
          parts.push(`\n- ${renderInline(li).trim()}`)
        })
        parts.push("\n")
        break
      }
      case "ol": {
        let i = 1
        elem.querySelectorAll(":scope > li").forEach((li) => {
          parts.push(`\n${i++}. ${renderInline(li).trim()}`)
        })
        parts.push("\n")
        break
      }
      case "blockquote":
        parts.push(`\n> ${elem.textContent?.trim().replace(/\n/g, "\n> ")}\n`)
        break
      case "br": parts.push("\n"); break
      case "hr": parts.push("\n---\n"); break
      case "table": {
        const ths = Array.from(elem.querySelectorAll("th")).map(
          (th) => th.textContent?.trim() ?? ""
        )
        if (ths.length > 0) {
          parts.push("\n| " + ths.join(" | ") + " |")
          parts.push("\n| " + ths.map(() => "---").join(" | ") + " |")
          elem.querySelectorAll("tbody tr").forEach((tr) => {
            const cells = Array.from(tr.querySelectorAll("td")).map(
              (td) => td.textContent?.trim() ?? ""
            )
            parts.push("\n| " + cells.join(" | ") + " |")
          })
          parts.push("\n")
        }
        break
      }
      case "script":
      case "style":
      case "svg":
      case "button":
      case "img":
        break
      default:
        elem.childNodes.forEach((child) => walk(child))
    }
  }

  el.childNodes.forEach((child) => walk(child))
  return parts.join("")
}

export function cleanText(text: string): string {
  return text
    .replace(/\n{3,}/g, "\n\n") // collapse excessive newlines
    .trim()
}

// Sort elements by DOM position
export function sortByPosition(
  items: { el: Element; role: Message["role"] }[]
): { el: Element; role: Message["role"] }[] {
  return items.sort((a, b) => {
    const pos = a.el.compareDocumentPosition(b.el)
    return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
  })
}
