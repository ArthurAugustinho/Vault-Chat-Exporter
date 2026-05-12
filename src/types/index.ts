export type Platform = "chatgpt" | "claude" | "gemini" | "perplexity" | "unknown"

export type Role = "user" | "assistant" | "system"

export interface Message {
  role: Role
  content: string
}

export interface Conversation {
  platform: Platform
  title: string
  url: string
  messages: Message[]
}

export interface AppSettings {
  obsidianBaseUrl: string
  obsidianToken: string
  lastFolder: string
  lastTags: string
  lastMocPath: string
  useMoc: boolean
  lastTemplate: string
}

export interface MarkdownOptions {
  title: string
  tags: string[]
  templateFields?: Record<string, string>
}

export interface ObsidianSendOptions {
  baseUrl: string
  token: string
  path: string
  content: string
  append: boolean
}

// Vault metadata cache (folders + tags + notes from Obsidian API)
export interface VaultCache {
  folders: string[]
  tags: string[]
  notes: string[]
  ts: number // unix ms of last successful refresh
}

// Messages between popup and content script
export interface ExtractRequest {
  type: "EXTRACT_CONVERSATION"
}

export interface ExtractResponse {
  conversation: Conversation | null
  error: string | null
}
