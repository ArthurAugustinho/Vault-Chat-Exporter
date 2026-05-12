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
  chatgpt: "bg-emerald-950 text-emerald-400 border border-emerald-800",
  claude: "bg-orange-950 text-orange-400 border border-orange-800",
  gemini: "bg-blue-950 text-blue-400 border border-blue-800",
  perplexity: "bg-teal-950 text-teal-400 border border-teal-800",
  unknown: "bg-zinc-800 text-zinc-400 border border-zinc-700"
}

const ROLE_BADGE: Record<string, string> = {
  user: "bg-zinc-800 text-zinc-300 border-zinc-700",
  assistant: "bg-indigo-950 text-indigo-400 border-indigo-900",
  system: "bg-yellow-950 text-yellow-500 border-yellow-900"
}

const ROLE_LABEL: Record<string, string> = {
  user: "User",
  assistant: "AI",
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

function normaliseTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-")
}

function previewContent(content: string, maxLen = 90): string {
  const stripped = content
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/`[^`\n]+`/g, "[code]")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  return stripped.length > maxLen ? stripped.slice(0, maxLen) + "…" : stripped
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const INPUT_CLS =
  "w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 transition-colors"

const LABEL_CLS = "text-[11px] font-semibold uppercase tracking-wide text-zinc-500"

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className={LABEL_CLS}>{label}</label>
      {children}
      {hint && <p className="text-[11px] text-zinc-600 leading-relaxed">{hint}</p>}
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
      className="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-colors">
      {children}
    </button>
  )
}

function Banner({
  type,
  children
}: {
  type: "success" | "warning" | "error"
  children: React.ReactNode
}) {
  const styles = {
    success: "bg-emerald-950/80 border-emerald-800/70 text-emerald-400",
    warning: "bg-yellow-950/80 border-yellow-800/70 text-yellow-400",
    error: "bg-red-950/80 border-red-800/70 text-red-400"
  }[type]
  const icon = { success: "✓", warning: "⚠", error: "✗" }[type]
  return (
    <div className={`flex items-start gap-2 border rounded-lg px-3 py-2.5 text-xs leading-relaxed ${styles}`}>
      <span className="shrink-0 font-bold mt-px">{icon}</span>
      <span>{children}</span>
    </div>
  )
}

function CheckboxRow({
  checked,
  onChange,
  label
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer select-none group">
      <div
        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${
          checked
            ? "bg-indigo-600 border-indigo-600"
            : "bg-zinc-900 border-zinc-700 group-hover:border-zinc-500"
        }`}>
        {checked && (
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
            <path
              d="M1.5 5l2.5 2.5 4.5-4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only"
        />
      </div>
      <span className="text-xs text-zinc-400 group-hover:text-zinc-200 transition-colors">
        {label}
      </span>
    </label>
  )
}

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
  return (
    <div className="relative">
      <input
        type="text"
        list="vce-folders"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="AI Chats"
        className={INPUT_CLS + " pr-7"}
      />
      <datalist id="vce-folders">
        {folders.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      {loading && (
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 text-xs select-none animate-spin">
          ⟳
        </span>
      )}
    </div>
  )
}

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
  const confirmed = parts.slice(0, parts.length - 1).map(normaliseTag).filter(Boolean)

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
    onChange([...confirmed, tag].join(", "))
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ai, study, project"
        className={INPUT_CLS}
      />
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {chips.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => addTag(tag)}
              className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300 border border-zinc-700/60 transition-colors">
              +{tag}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

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
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className={LABEL_CLS}>
          Messages{" "}
          <span className="text-zinc-700 normal-case font-normal">
            {selectedIds.size}/{messages.length}
          </span>
        </span>
        <div className="flex gap-1">
          {(["All", "None"] as const).map((action) => (
            <button
              key={action}
              type="button"
              onClick={() =>
                onChange(
                  action === "All" ? new Set(messages.map((_, i) => i)) : new Set()
                )
              }
              className="text-[11px] text-zinc-600 hover:text-zinc-300 px-2 py-0.5 rounded hover:bg-zinc-800 transition-colors">
              {action}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-px max-h-[132px] overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-900/50">
        {messages.map((msg, i) => {
          const checked = selectedIds.has(i)
          const roleCls = ROLE_BADGE[msg.role] ?? ROLE_BADGE.user
          const roleLabel = ROLE_LABEL[msg.role] ?? msg.role
          return (
            <label
              key={i}
              className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer select-none transition-colors ${
                checked ? "bg-zinc-800/70" : "hover:bg-zinc-800/30"
              }`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(i)}
                className="accent-indigo-500 h-3.5 w-3.5 shrink-0 cursor-pointer"
              />
              <span
                className={`text-[9px] px-1.5 py-px rounded border font-bold shrink-0 uppercase tracking-wider leading-tight ${roleCls}`}>
                {roleLabel}
              </span>
              <span className="text-xs text-zinc-500 truncate min-w-0 leading-tight">
                {previewContent(msg.content)}
              </span>
            </label>
          )
        })}
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
    <div className="flex items-center gap-1.5 ml-auto text-[11px]">
      {loading ? (
        <span className="text-zinc-600 animate-pulse">syncing…</span>
      ) : error ? (
        <span className="text-yellow-700 truncate max-w-[150px]" title={error}>
          ⚠ {error}
        </span>
      ) : folderCount > 0 ? (
        <span className="text-zinc-700">
          {folderCount}f{tagCount > 0 ? ` · ${tagCount}t` : ""}
        </span>
      ) : null}
      <button
        onClick={onRefresh}
        disabled={loading}
        title="Refresh folders and tags from Obsidian"
        className="text-zinc-700 hover:text-zinc-400 disabled:cursor-not-allowed transition-colors">
        ↺{cacheTs > 0 && !loading ? ` ${timeAgo(cacheTs)}` : ""}
      </button>
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

  const [template, setTemplate] = useState("")
  const [useMoc, setUseMoc] = useState(false)
  const [mocPath, setMocPath] = useState("")

  // Vault metadata
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

  useEffect(() => {
    if (!conversation) return
    setSelectedIds(new Set(conversation.messages.map((_, i) => i)))
  }, [conversation])

  useEffect(() => {
    if (!conversation) return
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean)
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

  // ── Vault data ──────────────────────────────────────────────────────────────

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
        setVaultError(
          foldersResult.reason instanceof Error
            ? foldersResult.reason.message
            : "Failed to load folders"
        )
      }
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : "Could not reach Obsidian API.")
    } finally {
      setVaultLoading(false)
    }
  }

  // ── Init ────────────────────────────────────────────────────────────────────

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
          ? "Open ChatGPT, Claude, Gemini or Perplexity first."
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
    <div className="w-[420px] h-[580px] bg-[#0c0c0e] text-zinc-100 flex flex-col font-sans overflow-hidden">

      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-3 bg-zinc-900/30 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">🔮</span>
          <span className="text-sm font-semibold tracking-tight">Vault Chat Exporter</span>
        </div>
        <button
          onClick={toggleSettings}
          className={`text-xs font-medium px-2.5 py-1.5 rounded-md transition-colors ${
            view === "settings"
              ? "bg-zinc-700 text-zinc-200"
              : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800"
          }`}>
          {view === "settings" ? "← Back" : "⚙ Settings"}
        </button>
      </header>

      {/* ── Loading ── */}
      {view === "loading" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-zinc-800 border-t-indigo-500 animate-spin" />
          <p className="text-zinc-500 text-sm">Extracting conversation…</p>
        </div>
      )}

      {/* ── No match ── */}
      {view === "no-match" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-2xl">
            🤖
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-zinc-200 text-sm font-semibold">No conversation found</p>
            <p className="text-zinc-500 text-xs leading-relaxed max-w-[260px]">{extractError}</p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <div className="flex gap-1.5 flex-wrap justify-center">
              {["ChatGPT", "Claude", "Gemini", "Perplexity"].map((p) => (
                <span
                  key={p}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-900 text-zinc-500 border border-zinc-800">
                  {p}
                </span>
              ))}
            </div>
            {!hasToken && (
              <button
                onClick={toggleSettings}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors">
                Configure API token →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Preview ── */}
      {view === "preview" && conversation && (
        <>
          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto min-h-0">

            {/* Info bar */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-800/60 bg-zinc-900/20 shrink-0">
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${PLATFORM_BADGE[platform]}`}>
                {PLATFORM_LABELS[platform]}
              </span>
              <span className="text-xs text-zinc-700">
                {conversation.messages.length} msg{conversation.messages.length !== 1 ? "s" : ""}
              </span>
              {!hasToken ? (
                <button
                  onClick={toggleSettings}
                  className="ml-auto text-[11px] text-yellow-600 hover:text-yellow-400 transition-colors whitespace-nowrap">
                  ⚠ Set token →
                </button>
              ) : (
                <VaultStatusBar
                  loading={vaultLoading}
                  error={vaultError}
                  folderCount={folders.length}
                  tagCount={knownTags.length}
                  cacheTs={cacheTs}
                  hasToken={hasToken}
                  onRefresh={handleRefresh}
                />
              )}
            </div>

            {/* Messages */}
            <div className="px-4 py-3 border-b border-zinc-800/60">
              <MessageSelector
                messages={conversation.messages}
                selectedIds={selectedIds}
                onChange={setSelectedIds}
              />
            </div>

            {/* Export config */}
            <div className="px-4 py-3 border-b border-zinc-800/60 flex flex-col gap-3">
              <Field label="Title">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Conversation title"
                  className={INPUT_CLS}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Folder" hint='e.g. "AI Chats/GPT"'>
                  <FolderPicker
                    value={folder}
                    onChange={setFolder}
                    folders={folders}
                    loading={vaultLoading && folders.length === 0}
                  />
                </Field>
                <Field label="Template">
                  <select
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    className={INPUT_CLS}>
                    <option value="">None</option>
                    {TEMPLATES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Tags">
                <TagInput value={tags} onChange={setTags} suggestions={knownTags} />
              </Field>
            </div>

            {/* Options */}
            <div className="px-4 py-3 border-b border-zinc-800/60 flex flex-col gap-2.5">
              <p className={LABEL_CLS}>Options</p>
              <CheckboxRow checked={append} onChange={setAppend} label="Append to existing file" />
              <CheckboxRow checked={useMoc} onChange={setUseMoc} label="Add to index / MOC" />
              {useMoc && (
                <div className="pl-6">
                  <input
                    type="text"
                    list="vce-notes"
                    value={mocPath}
                    onChange={(e) => setMocPath(e.target.value)}
                    placeholder="00 - MOCs/Topic.md"
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
            <div className="px-4 py-3 flex flex-col gap-1.5">
              <label className={LABEL_CLS}>Preview</label>
              <pre className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-3 text-[11px] text-zinc-500 overflow-auto max-h-[96px] whitespace-pre-wrap leading-relaxed font-mono">
                {markdown}
              </pre>
            </div>
          </div>

          {/* ── Sticky footer ── */}
          <div className="shrink-0 px-4 py-3 bg-zinc-900/30 border-t border-zinc-800 flex flex-col gap-2">
            {noneSelected && (
              <Banner type="warning">Select at least one message to export.</Banner>
            )}
            {syncStatus === "success" && <Banner type="success">{syncMsg}</Banner>}
            {syncStatus === "partial" && <Banner type="warning">{syncMsg}</Banner>}
            {syncStatus === "error" && !noneSelected && (
              <Banner type="error">{syncMsg}</Banner>
            )}
            <PrimaryButton
              onClick={handleSync}
              disabled={syncStatus === "syncing" || noneSelected}>
              {syncStatus === "syncing" ? "Syncing…" : "Sync to Vault →"}
            </PrimaryButton>
          </div>
        </>
      )}

      {/* ── Settings ── */}
      {view === "settings" && (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-4 py-4 flex flex-col gap-4">

            <div className="flex flex-col gap-3">
              <p className={LABEL_CLS}>Obsidian Local REST API</p>

              <Field label="API URL" hint="HTTP: http://127.0.0.1:27123">
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
                hint="Obsidian → Settings → Local REST API → API Key">
                <input
                  type="password"
                  value={apiToken}
                  onChange={(e) => setApiToken(e.target.value)}
                  placeholder="Paste your API key here"
                  className={INPUT_CLS}
                />
              </Field>

              <PrimaryButton onClick={handleSaveSettings}>Save Settings</PrimaryButton>

              {settingsSaved && (
                <Banner type="success">Settings saved — refreshing vault data…</Banner>
              )}
            </div>

            <div className="border-t border-zinc-800 pt-4 flex flex-col gap-2">
              <p className={LABEL_CLS}>Setup guide</p>
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg px-3 py-3 flex flex-col gap-2">
                {[
                  ["1", "Install", "obsidian-local-rest-api plugin in Obsidian."],
                  ["2", "Enable it", "and copy the API key from its settings."],
                  ["3", "Use HTTP", "(port 27123) to avoid certificate issues."]
                ].map(([num, bold, rest]) => (
                  <p key={num} className="text-xs text-zinc-600 leading-relaxed">
                    <span className="text-zinc-700 font-semibold mr-1">{num}.</span>
                    <span className="text-zinc-400 font-medium">{bold}</span>{" "}
                    {rest}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Popup
