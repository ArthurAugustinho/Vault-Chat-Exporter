import type { Message } from "~/types"

const TODO_RE = /^(?:\*{1,2})?(?:TODO|To-do|Todo)[:\s]+(.+)/i
const CHECKBOX_RE = /^(?:>\s*)?-\s*\[\s*\]\s+(.+)/
const ACTION_RE = /^(?:Preciso|Fazer|Implementar|Corrigir|Revisar)\b(.+)/i

function parseLine(line: string): string | null {
  const t = line.trim()
  if (!t || t.length > 300) return null

  let m = CHECKBOX_RE.exec(t)
  if (m) return m[1].trim()

  m = TODO_RE.exec(t)
  if (m) return m[1].trim()

  m = ACTION_RE.exec(t)
  if (m) return t // keep full sentence for action-verb lines

  return null
}

export function extractTasks(messages: Message[], selectedIds: Set<number>): string[] {
  const seen = new Set<string>()
  const tasks: string[] = []

  for (let i = 0; i < messages.length; i++) {
    if (!selectedIds.has(i)) continue
    for (const line of messages[i].content.split("\n")) {
      const task = parseLine(line)
      if (!task) continue
      const key = task.toLowerCase().replace(/\s+/g, " ").trim()
      if (!seen.has(key)) {
        seen.add(key)
        tasks.push(task)
      }
    }
  }

  return tasks
}
