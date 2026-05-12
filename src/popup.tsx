import { useEffect, useRef, useState } from "react"
import "~/style.css"

import type { AppSettings, Conversation, ExtractRequest, ExtractResponse, Message } from "~/types"
import { conversationToMarkdown } from "~/lib/markdown"
import { TEMPLATES } from "~/lib/templates"
import {
  appendLinkToNote,
  buildVaultPath,
  listFolders,
  listNotes,
  listTags,
  sendToObsidian
} from "~/lib/obsidianApi"
import {
  isCacheStale,
  loadSettings,
  loadVaultCache,
  saveLastUsed,
  saveSettings,
  saveVaultCache
} from "~/lib/storage"

// ─── Local types ──────────────────────────────────────────────────────────────

type View = "loading" | "no-match" | "preview" | "settings"
type SyncStatus = "idle" | "syncing" | "success" | "partial" | "error"

// ─── Constants ────────────────────────────────────────────────────────────────

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
  unknown: "Unknown"
}

const PLATFORM_BADGE: Record<string, string> = {
  chatgpt: "bg-emerald-900 text-emerald-300 border border-emerald-700",
  claude: "bg-orange-900 text-orange-300 border border-orange-700",
  gemini: "bg-blue-900 text-blue-300 border border-blue-700",
  perplexity: "bg-teal-900 text-teal-300 border border-teal-700",
  unknown: "bg-zinc-800 text-zinc-400 border border-zinc-700"
}

const ROLE_BADGE: Record<string, string> = {
  user: "bg-zinc-800 text-zinc-300 border-zinc-700",
  assistant: "bg-indigo-950 text-indigo-400 border-indigo-900",
  system: "bg-yellow-950 text-yellow-500 border-yellow-900"
}

const ROLE_LABEL: Record<string, string> = {
  user: "User",
  assistant: "Asst",
  system: "Sys"
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 10) return "just now"
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

/** Normalise a single tag: lowercase, trim, spaces→hyphens */
function normaliseTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-")
}

/** Strip markdown syntax and return a short preview string */
function previewContent(content: string, maxLen = 80): string {
  const stripped = content
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/`[^`\n]+`/g, "[code]")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  return stripped.length > maxLen ? stripped.slice(0, maxLen) + "…" : stripped
}

// ─── Shared input style ───────────────────────────────────────────────────────

const INPUT_CLS =
  "w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 transition-colors"

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  action,
  children
}: {
  label: string
  hint?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-zinc-400">{label}</label>
        {action}
      </div>
      {children}
      {hint && <p className="text-xs text-zinc-600">{hint}</p>}
    </div>
  )
}

function PrimaryButton({
  onClick,
  disabled,
  children
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-medium py-2 rounded-md text-sm transition-colors w-full">
      {children}
    </button>
  )
}

/**
 * Folder picker: native <datalist> for zero-overhead dropdown.
 * Falls back gracefully to free-text input when no folders are loaded.
 */
function FolderPicker({
  value,
  onChange,
  folders,
  loading
}: {
  value: string
  onChange: (v: string) => void
  folders: string[]
  loading: boolean
}) {
  const listId = "vce-folders"
  return (
    <div className="relative">
      <input
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="AI Chats"
        className={INPUT_CLS + " pr-7"}
      />
      <datalist id={listId}>
        {folders.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      {loading && (
        <span
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 text-xs select-none"
          aria-label="Loading folders">
          ⟳
        </span>
      )}
    </div>
  )
}

/**
 * Tag input: free-text comma-separated field + clickable suggestion chips.
 * Chips filter dynamically by partial text after the last comma.
 * Clicking a chip completes the partial tag (or appends if empty).
 */
function TagInput({
  value,
  onChange,
  suggestions
}: {
  value: string
  onChange: (v: string) => void
  suggestions: string[]
}) {
  const parts = value.split(",")
  const partial = normaliseTag(parts[parts.length - 1])
  const confirmed = parts
    .slice(0, parts.length - 1)
    .map(normaliseTag)
    .filter(Boolean)

  const chips = suggestions
    .filter((s) => {
      const sl = s.toLowerCase()
      if (confirmed.includes(sl)) return false
      if (sl === partial) return false
      if (partial !== "") return sl.includes(partial)
      return true
    })
    .slice(0, 8)

  function addTag(tag: string) {
    const next = [...confirmed, tag].join(", ")
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ai, chatgpt"
        className={INPUT_CLS}
      />
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label="Tag suggestions">
          {chips.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => addTag(tag)}
              className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-200 border border-zinc-700 transition-colors">
              + {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Message selector: checkbox list with role badge + truncated content preview.
 * All messages selected by default; "All" / "None" bulk actions in header.
 */
function MessageSelector({
  messages,
  selectedIds,
  onChange
}: {
  messages: Message[]
  selectedIds: Set<number>
  onChange: (ids: Set<number>) => void
}) {
  function toggle(i: number) {
    const next = new Set(selectedIds)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-400">
          Messages{" "}
          <span className="text-zinc-600 font-normal">
            ({selectedIds.size}/{messages.length})
          </span>
        </span>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => onChange(new Set(messages.map((_, i) => i)))}
            className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors">
            All
          </button>
          <button
            type="button"
            onClick={() => onChange(new Set())}
            className="text-xs text-zinc-500 hover:text-zinc-200 transition-colors">
            None
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-px max-h-36 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-900 p-1">
        {messages.map((msg, i) => {
          const checked = selectedIds.has(i)
          const roleCls = ROLE_BADGE[msg.role] ?? ROLE_BADGE.user
          const roleLabel = ROLE_LABEL[msg.role] ?? msg.role
          return (
            <label
              key={i}
              className={`flex items-start gap-2 px-2 py-1.5 rounded cursor-pointer select-none transition-colors ${
                checked ? "bg-zinc-800" : "hover:bg-zinc-800/40"
              }`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(i)}
                className="mt-0.5 accent-indigo-500 h-3.5 w-3.5 shrink-0 cursor-pointer"
              />
              <span
                className={`text-[10px] px-1.5 py-px rounded border font-medium shrink-0 leading-tight mt-px ${roleCls}`}>
                {roleLabel}
              </span>
              <span className="text-xs text-zinc-500 leading-snug truncate min-w-0">
                {previewContent(msg.content)}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Popup ───────────────────────────────────────────────────────────────

function Popup() {
  const [view, setView] = useState<View>("loading")
  const [conversation, setConversation] = useState<Conversation | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [extractError, setExtractError] = useState("")

  // Sync form
  const [title, setTitle] = useState("")
  const [folder, setFolder] = useState("")
  const [tags, setTags] = useState("")
  const [append, setAppend] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [markdown, setMarkdown] = useState("")
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle")
  const [syncMsg, setSyncMsg] = useState("")

  // Template de frontmatter
  const [template, setTemplate] = useState("")

  // MOC / index linking
  const [useMoc, setUseMoc] = useState(false)
  const [mocPath, setMocPath] = useState("")

  // Vault metadata (folders + tags + notes from Obsidian)
  const [folders, setFolders] = useState<string[]>([])
  const [knownTags, setKnownTags] = useState<string[]>([])
  const [notes, setNotes] = useState<string[]>([])
  const [vaultLoading, setVaultLoading] = useState(false)
  const [vaultError, setVaultError] = useState("")
  const [cacheTs, setCacheTs] = useState(0)

  // Settings form
  const [apiUrl, setApiUrl] = useState("")
  const [apiToken, setApiToken] = useState("")
  const [settingsSaved, setSettingsSaved] = useState(false)
  const settingsSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const prevView = useRef<View>("loading")

  useEffect(() => {
    void init()
    return () => {
      if (settingsSavedTimer.current) clearTimeout(settingsSavedTimer.current)
    }
  }, [])

  // Select all messages whenever a new conversation is loaded
  useEffect(() => {
    if (!conversation) return
    setSelectedIds(new Set(conversation.messages.map((_, i) => i)))
  }, [conversation])

  // Regenerate markdown preview when relevant fields or selection change
  useEffect(() => {
    if (!conversation) return
    const tagList = tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
    const filtered: Conversation = {
      ...conversation,
      messages: conversation.messages.filter((_, i) => selectedIds.has(i))
    }
    const tpl = TEMPLATES.find((t) => t.id === template)
    setMarkdown(
      conversationToMarkdown(filtered, {
        title: title || conversation.title,
        tags: tagList,
        templateFields: tpl?.fields
      })
    )
  }, [conversation, title, tags, selectedIds, template])

  // ── Vault data loading ──────────────────────────────────────────────────────

  async function loadVaultData(s: AppSettings, forceRefresh = false): Promise<void> {
    const cache = await loadVaultCache()
    if (cache.folders.length > 0) {
      setFolders(cache.folders)
      setKnownTags(cache.tags)
      setNotes(cache.notes)
      setCacheTs(cache.ts)
    }

    if (!s.obsidianToken || !s.obsidianBaseUrl) return
    if (!forceRefresh && !isCacheStale(cache.ts) && cache.folders.length > 0) return

    setVaultLoading(true)
    setVaultError("")

    try {
      const [foldersResult, tagsResult, notesResult] = await Promise.allSettled([
        listFolders({ baseUrl: s.obsidianBaseUrl, token: s.obsidianToken }),
        listTags({ baseUrl: s.obsidianBaseUrl, token: s.obsidianToken }),
        listNotes({ baseUrl: s.obsidianBaseUrl, token: s.obsidianToken })
      ])

      const newFolders =
        foldersResult.status === "fulfilled" ? foldersResult.value : cache.folders
      const newTags =
        tagsResult.status === "fulfilled" && tagsResult.value !== null
          ? tagsResult.value
          : cache.tags
      const newNotes =
        notesResult.status === "fulfilled" ? notesResult.value : cache.notes

      const ts = Date.now()
      setFolders(newFolders)
      setKnownTags(newTags)
      setNotes(newNotes)
      setCacheTs(ts)
      await saveVaultCache({ folders: newFolders, tags: newTags, notes: newNotes, ts })

      if (foldersResult.status === "rejected") {
        const msg =
          foldersResult.reason instanceof Error
            ? foldersResult.reason.message
            : "Failed to load folders"
        setVaultError(msg)
      }
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : "Could not reach Obsidian API.")
    } finally {
      setVaultLoading(false)
    }
  }

  // ── Initialisation ──────────────────────────────────────────────────────────

  async function init() {
    const loaded = await loadSettings()
    setSettings(loaded)
    setApiUrl(loaded.obsidianBaseUrl)
    setApiToken(loaded.obsidianToken)
    setFolder(loaded.lastFolder)
    setTags(loaded.lastTags)
    setTemplate(loaded.lastTemplate)
    setUseMoc(loaded.useMoc)
    setMocPath(loaded.lastMocPath)

    void loadVaultData(loaded)

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) {
        setExtractError("Could not access the current tab.")
        setView("no-match")
        return
      }

      const msg: ExtractRequest = { type: "EXTRACT_CONVERSATION" }
      const response = (await chrome.tabs.sendMessage(tab.id, msg)) as ExtractResponse

      if (response?.conversation) {
        setConversation(response.conversation)
        setTitle(response.conversation.title)
        setView("preview")
      } else {
        setExtractError(response?.error ?? "No conversation data returned.")
        setView("no-match")
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setExtractError(
        errMsg.includes("Receiving end does not exist")
          ? "Not on a supported page. Open ChatGPT, Claude, Gemini or Perplexity first."
          : `Extraction error: ${errMsg}`
      )
      setView("no-match")
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  async function handleSync() {
    if (!settings || !conversation) return

    if (!settings.obsidianToken) {
      prevView.current = view
      setView("settings")
      return
    }

    if (selectedIds.size === 0) {
      setSyncStatus("error")
      setSyncMsg("No messages selected — select at least one to export.")
      return
    }

    setSyncStatus("syncing")
    setSyncMsg("")

    try {
      const path = buildVaultPath(folder, title || conversation.title)
      const noteTitle = title || conversation.title

      await sendToObsidian({
        baseUrl: settings.obsidianBaseUrl,
        token: settings.obsidianToken,
        path,
        content: markdown,
        append
      })

      await saveLastUsed(folder, tags)
      await saveSettings({ useMoc, lastMocPath: mocPath.trim(), lastTemplate: template })

      // Optionally append a wikilink to the index / MOC note
      if (useMoc && mocPath.trim()) {
        try {
          await appendLinkToNote({
            baseUrl: settings.obsidianBaseUrl,
            token: settings.obsidianToken,
            indexPath: mocPath.trim(),
            notePath: path,
            noteTitle
          })
          setSyncStatus("success")
          setSyncMsg(`Saved → ${path} · Index updated`)
        } catch (indexErr) {
          setSyncStatus("partial")
          setSyncMsg(
            `Saved → ${path}. Index update failed: ${
              indexErr instanceof Error ? indexErr.message : "Unknown error"
            }`
          )
        }
      } else {
        setSyncStatus("success")
        setSyncMsg(`Saved → ${path}`)
      }
    } catch (err) {
      setSyncStatus("error")
      setSyncMsg(err instanceof Error ? err.message : "Unknown error.")
    }
  }

  async function handleSaveSettings() {
    const trimmedUrl = apiUrl.trim().replace(/\/$/, "")
    const trimmedToken = apiToken.trim()

    await saveSettings({ obsidianBaseUrl: trimmedUrl, obsidianToken: trimmedToken })
    const updated: AppSettings = {
      ...(settings ?? {
        obsidianBaseUrl: trimmedUrl,
        obsidianToken: trimmedToken,
        lastFolder: folder,
        lastTags: tags,
        lastMocPath: mocPath,
        useMoc,
        lastTemplate: template
      }),
      obsidianBaseUrl: trimmedUrl,
      obsidianToken: trimmedToken
    }
    setSettings(updated)
    setSettingsSaved(true)
    if (settingsSavedTimer.current) clearTimeout(settingsSavedTimer.current)
    settingsSavedTimer.current = setTimeout(() => setSettingsSaved(false), 2500)

    void loadVaultData(updated, true)
  }

  async function handleRefresh() {
    if (!settings) return
    await loadVaultData(settings, true)
  }

  function toggleSettings() {
    if (view === "settings") {
      setView(prevView.current === "settings" ? "preview" : prevView.current)
    } else {
      prevView.current = view
      setView("settings")
    }
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const platform = conversation?.platform ?? "unknown"
  const hasToken = !!settings?.obsidianToken
  const noneSelected = selectedIds.size === 0 && (conversation?.messages.length ?? 0) > 0

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="w-[400px] min-h-[560px] max-h-[680px] bg-zinc-950 text-zinc-100 flex flex-col font-sans overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base">🔮</span>
          <span className="text-sm font-semibold text-zinc-100 tracking-tight">
            Vault Chat Exporter
          </span>
        </div>
        <button
          onClick={toggleSettings}
          className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors px-2 py-1 rounded hover:bg-zinc-800">
          {view === "settings" ? "← Back" : "⚙ Settings"}
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 flex flex-col p-4 gap-3 overflow-y-auto">

        {/* Loading */}
        {view === "loading" && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-zinc-500 text-sm animate-pulse">Extracting conversation…</p>
          </div>
        )}

        {/* No match */}
        {view === "no-match" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-4">
            <span className="text-3xl">🤖</span>
            <p className="text-zinc-300 text-sm font-medium">No conversation found</p>
            <p className="text-zinc-500 text-xs leading-relaxed">{extractError}</p>
            <p className="text-zinc-600 text-xs">
              Supported: ChatGPT · Claude · Gemini · Perplexity
            </p>
          </div>
        )}

        {/* Preview / Sync form */}
        {view === "preview" && conversation && (
          <>
            {/* Platform badge + token warning */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLATFORM_BADGE[platform]}`}>
                {PLATFORM_LABELS[platform]}
              </span>
              <span className="text-xs text-zinc-600">
                {conversation.messages.length} message
                {conversation.messages.length !== 1 ? "s" : ""}
              </span>
              {!hasToken && (
                <span className="ml-auto text-xs text-yellow-500">⚠ Token not set</span>
              )}
            </div>

            {/* Vault data status bar */}
            <VaultStatusBar
              loading={vaultLoading}
              error={vaultError}
              folderCount={folders.length}
              tagCount={knownTags.length}
              cacheTs={cacheTs}
              hasToken={hasToken}
              onRefresh={handleRefresh}
            />

            {/* Message selector */}
            <MessageSelector
              messages={conversation.messages}
              selectedIds={selectedIds}
              onChange={setSelectedIds}
            />

            {/* Title */}
            <Field label="Title">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Conversation title"
                className={INPUT_CLS}
              />
            </Field>

            {/* Folder picker */}
            <Field label="Folder" hint='Relative to vault root, e.g. "AI Chats/GPT"'>
              <FolderPicker
                value={folder}
                onChange={setFolder}
                folders={folders}
                loading={vaultLoading && folders.length === 0}
              />
            </Field>

            {/* Tags with autocomplete chips */}
            <Field label="Tags (comma-separated)">
              <TagInput value={tags} onChange={setTags} suggestions={knownTags} />
            </Field>

            {/* Template de frontmatter */}
            <Field label="Template">
              <select
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                className={INPUT_CLS}>
                <option value="">Nenhum</option>
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>

            {/* Append checkbox */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={append}
                onChange={(e) => setAppend(e.target.checked)}
                className="accent-indigo-500 h-4 w-4 rounded"
              />
              <span className="text-xs text-zinc-400">Append to existing file</span>
            </label>

            {/* MOC / Index linking */}
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={useMoc}
                  onChange={(e) => setUseMoc(e.target.checked)}
                  className="accent-indigo-500 h-4 w-4 rounded"
                />
                <span className="text-xs text-zinc-400">Add to index / MOC</span>
              </label>
              {useMoc && (
                <div className="pl-6">
                  <input
                    type="text"
                    list="vce-notes"
                    value={mocPath}
                    onChange={(e) => setMocPath(e.target.value)}
                    placeholder="00 - MOCs/Java.md"
                    className={INPUT_CLS}
                  />
                  <datalist id="vce-notes">
                    {notes.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </div>
              )}
            </div>

            {/* Markdown preview */}
            <Field label="Markdown preview">
              <pre className="bg-zinc-900 border border-zinc-800 rounded-md p-2.5 text-xs text-zinc-400 overflow-auto max-h-32 whitespace-pre-wrap leading-relaxed font-mono">
                {markdown}
              </pre>
            </Field>

            {/* Empty-selection warning */}
            {noneSelected && (
              <div className="bg-yellow-950 border border-yellow-800 rounded-md px-3 py-2 text-xs text-yellow-400">
                ⚠ No messages selected — select at least one to export.
              </div>
            )}

            {/* Sync button */}
            <PrimaryButton
              onClick={handleSync}
              disabled={syncStatus === "syncing" || noneSelected}>
              {syncStatus === "syncing" ? "Syncing…" : "Sync to Vault →"}
            </PrimaryButton>

            {/* Status feedback */}
            {syncStatus === "success" && (
              <div className="bg-emerald-950 border border-emerald-800 rounded-md px-3 py-2 text-xs text-emerald-400">
                ✓ {syncMsg}
              </div>
            )}
            {syncStatus === "partial" && (
              <div className="bg-yellow-950 border border-yellow-800 rounded-md px-3 py-2 text-xs text-yellow-400">
                ⚠ {syncMsg}
              </div>
            )}
            {syncStatus === "error" && !noneSelected && (
              <div className="bg-red-950 border border-red-800 rounded-md px-3 py-2 text-xs text-red-400">
                ✗ {syncMsg}
              </div>
            )}
          </>
        )}

        {/* Settings */}
        {view === "settings" && (
          <>
            <p className="text-xs font-semibold text-zinc-300 mb-1">
              Obsidian Local REST API
            </p>

            <Field
              label="API URL"
              hint="Default: http://127.0.0.1:27123 (HTTP) or https://127.0.0.1:27124 (HTTPS)">
              <input
                type="text"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="http://127.0.0.1:27123"
                className={INPUT_CLS}
              />
            </Field>

            <Field
              label="API Token"
              hint="Find in Obsidian → Settings → Local REST API → API Key">
              <input
                type="password"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                placeholder="••••••••••••••••••••"
                className={INPUT_CLS}
              />
            </Field>

            <PrimaryButton onClick={handleSaveSettings}>Save Settings</PrimaryButton>

            {settingsSaved && (
              <div className="bg-emerald-950 border border-emerald-800 rounded-md px-3 py-2 text-xs text-emerald-400 text-center">
                ✓ Settings saved — refreshing vault data…
              </div>
            )}

            <div className="border-t border-zinc-800 pt-3 mt-1">
              <p className="text-xs text-zinc-600 leading-relaxed">
                Install the{" "}
                <strong className="text-zinc-500">obsidian-local-rest-api</strong> plugin in
                Obsidian. Enable it, copy the API key, and paste it here. Use HTTP (port 27123)
                to avoid certificate errors.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Vault Status Bar ─────────────────────────────────────────────────────────

function VaultStatusBar({
  loading,
  error,
  folderCount,
  tagCount,
  cacheTs,
  hasToken,
  onRefresh
}: {
  loading: boolean
  error: string
  folderCount: number
  tagCount: number
  cacheTs: number
  hasToken: boolean
  onRefresh: () => void
}) {
  if (!hasToken) return null

  return (
    <div className="flex items-center gap-2 text-xs text-zinc-600 min-h-[16px]">
      {loading ? (
        <span className="animate-pulse text-zinc-500">Loading vault…</span>
      ) : error ? (
        <span className="text-yellow-700 truncate" title={error}>
          ⚠ {error}
        </span>
      ) : folderCount > 0 ? (
        <span>
          {folderCount} folder{folderCount !== 1 ? "s" : ""}
          {tagCount > 0 ? ` · ${tagCount} tag${tagCount !== 1 ? "s" : ""}` : ""}
        </span>
      ) : (
        <span className="text-zinc-700">No vault data</span>
      )}

      <button
        onClick={onRefresh}
        disabled={loading}
        title="Refresh folders and tags from Obsidian"
        className="ml-auto text-zinc-700 hover:text-zinc-400 disabled:cursor-not-allowed transition-colors flex items-center gap-1">
        ↺{cacheTs > 0 && !loading ? ` ${timeAgo(cacheTs)}` : ""}
      </button>
    </div>
  )
}

export default Popup
