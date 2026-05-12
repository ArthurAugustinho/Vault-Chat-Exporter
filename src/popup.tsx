import { useEffect, useMemo, useRef, useState } from "react"
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
  sendToObsidian,
  testConnection
} from "~/lib/obsidianApi"
import {
  isCacheStale,
  loadSettings,
  loadVaultCache,
  saveLastUsed,
  saveSettings,
  saveVaultCache
} from "~/lib/storage"

// ─── Types ────────────────────────────────────────────────────────────────────

type View = "loading" | "no-match" | "preview" | "settings"
type SyncStatus = "idle" | "syncing" | "success" | "partial" | "error"
type ConnStatus = "idle" | "testing" | "ok" | "error"

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg: "#111327",
  header: "#0E2548",
  card: "#151D38",
  input: "#0D1526",
  border: "#1E2D4A",
  divider: "#192038",
  text: "#E8EEFF",
  sub: "#8B9CC8",
  muted: "#4B5A7E",
  footer: "#0A0F1E",
  accent: "#7C3AED",
  accentHover: "#6D28D9"
} as const

const PLATFORM_DOT: Record<string, string> = {
  chatgpt: "#10B981",
  claude: "#F97316",
  gemini: "#3B82F6",
  perplexity: "#14B8A6",
  unknown: "#4B5A7E"
}

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
  unknown: "Unknown"
}

const ROLE_LABEL: Record<string, string> = { user: "You", assistant: "AI", system: "Sys" }
const ROLE_COLOR: Record<string, string> = {
  user: "#8B9CC8",
  assistant: "#A78BFA",
  system: "#FBBF24"
}

// ─── SVG icon library ─────────────────────────────────────────────────────────

function Ico({
  name,
  size = 16,
  className = ""
}: {
  name: string
  size?: number
  className?: string
}) {
  const s = { width: size, height: size, display: "inline-block", flexShrink: 0 }
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }

  switch (name) {
    case "logo":
      return (
        <svg style={s} viewBox="0 0 20 20" fill="currentColor" className={className}>
          <path d="M10 2 L12 7.5 L18 10 L12 12.5 L10 18 L8 12.5 L2 10 L8 7.5 Z" />
        </svg>
      )
    case "gear":
      return (
        <svg style={s} viewBox="0 0 16 16" {...stroke} className={className}>
          <circle cx="8" cy="8" r="2.5" />
          <path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" />
        </svg>
      )
    case "arrow-left":
      return (
        <svg style={s} viewBox="0 0 16 16" {...stroke} className={className}>
          <path d="M13 8H3M7 4L3 8l4 4" />
        </svg>
      )
    case "monitor-off":
      return (
        <svg style={s} viewBox="0 0 16 16" {...stroke} className={className}>
          <rect x="2" y="2" width="12" height="9" rx="1.5" />
          <path d="M5 14h6M8 11v3" />
          <path d="M6 6l4 4M10 6L6 10" />
        </svg>
      )
    case "folder":
      return (
        <svg style={s} viewBox="0 0 16 16" {...stroke} className={className}>
          <path d="M1.5 5.5a1.5 1.5 0 011.5-1.5h2.8l1.2 1.5H13a1.5 1.5 0 011.5 1.5V12A1.5 1.5 0 0113 13.5H3A1.5 1.5 0 011.5 12V5.5z" />
        </svg>
      )
    case "file-plus":
      return (
        <svg style={s} viewBox="0 0 16 16" {...stroke} className={className}>
          <path d="M9 1.5H4A1.5 1.5 0 002.5 3v10A1.5 1.5 0 004 14.5h8A1.5 1.5 0 0013.5 13V6L9 1.5z" />
          <path d="M9 1.5V6H13.5" />
          <path d="M8 9.5v3M6.5 11h3" />
        </svg>
      )
    case "link":
      return (
        <svg style={s} viewBox="0 0 16 16" {...stroke} className={className}>
          <path d="M10.5 12.5H13a3 3 0 000-6h-2.5M5.5 3.5H3a3 3 0 000 6h2.5" />
          <path d="M5 8h6" />
        </svg>
      )
    case "globe":
      return (
        <svg style={s} viewBox="0 0 16 16" {...stroke} className={className}>
          <circle cx="8" cy="8" r="6.5" />
          <path d="M8 1.5C6 3.5 5 5.5 5 8s1 4.5 3 6.5M8 1.5c2 2 3 4 3 6.5s-1 4.5-3 6.5" />
          <path d="M1.5 8h13" />
        </svg>
      )
    case "key":
      return (
        <svg style={s} viewBox="0 0 16 16" {...stroke} className={className}>
          <circle cx="5.5" cy="8" r="3.5" />
          <path d="M9 8h5.5M12.5 8v2M11 8v1.5" />
        </svg>
      )
    case "download":
      return (
        <svg style={s} viewBox="0 0 16 16" {...stroke} className={className}>
          <path d="M8 2v8M5 7l3 3 3-3" />
          <path d="M2.5 12.5h11" />
        </svg>
      )
    case "check":
      return (
        <svg style={s} viewBox="0 0 16 16" {...stroke} className={className}>
          <path d="M2.5 8.5l4 4 7-8" />
        </svg>
      )
    case "warning":
      return (
        <svg style={s} viewBox="0 0 16 16" {...stroke} className={className}>
          <path d="M8 3.5L2 13h12L8 3.5z" />
          <path d="M8 7.5v3" />
          <circle cx="8" cy="11.5" r=".4" fill="currentColor" stroke="none" />
        </svg>
      )
    case "x-circle":
      return (
        <svg style={s} viewBox="0 0 16 16" {...stroke} className={className}>
          <circle cx="8" cy="8" r="6.5" />
          <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" />
        </svg>
      )
    case "refresh":
      return (
        <svg style={s} viewBox="0 0 16 16" {...stroke} className={className}>
          <path d="M3 8a5 5 0 0110 0" />
          <path d="M13 5v3h-3" />
        </svg>
      )
    case "tag":
      return (
        <svg style={s} viewBox="0 0 16 16" {...stroke} className={className}>
          <path d="M1.5 1.5h6l7 7a1.5 1.5 0 010 2.1l-4 4a1.5 1.5 0 01-2.1 0l-7-7V1.5z" />
          <circle cx="5" cy="5" r="1" fill="currentColor" stroke="none" />
        </svg>
      )
    case "sync":
      return (
        <svg style={s} viewBox="0 0 16 16" {...stroke} className={className}>
          <path d="M13 3.5A6.5 6.5 0 108 14.5" />
          <path d="M13.5 1v3h-3" />
        </svg>
      )
    case "chevron-right":
      return (
        <svg style={s} viewBox="0 0 16 16" {...stroke} className={className}>
          <path d="M6 12l4-4-4-4" />
        </svg>
      )
    case "chevron-down":
      return (
        <svg style={s} viewBox="0 0 16 16" {...stroke} className={className}>
          <path d="M4 6l4 4 4-4" />
        </svg>
      )
    default:
      return null
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 10) return "just now"
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  return `${Math.floor(s / 3600)}h ago`
}

function normaliseTag(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-")
}

function previewContent(content: string, maxLen = 85): string {
  const s = content
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/`[^`\n]+`/g, "[code]")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s
}

// ─── Primitive components ─────────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <span style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: C.muted,
        whiteSpace: "nowrap"
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: C.divider }} />
    </div>
  )
}

function Card({
  children,
  style: extraStyle
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.border}`,
      borderRadius: 12,
      padding: "12px 14px",
      ...extraStyle
    }}>
      {children}
    </div>
  )
}

function IconBadge({ icon, color = C.muted }: { icon: string; color?: string }) {
  return (
    <div style={{
      width: 32,
      height: 32,
      borderRadius: 8,
      background: C.input,
      border: `1px solid ${C.border}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color,
      flexShrink: 0
    }}>
      <Ico name={icon} size={15} />
    </div>
  )
}

function PrimaryBtn({
  onClick,
  disabled,
  children,
  style: extra
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: 1,
        padding: "10px 16px",
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 600,
        color: "#fff",
        background: disabled
          ? C.border
          : hov
          ? C.accentHover
          : C.accent,
        opacity: disabled ? 0.55 : 1,
        transition: "background 0.15s, opacity 0.15s",
        ...extra
      }}>
      {children}
    </button>
  )
}

function SecondaryBtn({
  onClick,
  disabled,
  children
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  const [hov, setHov] = useState(false)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flex: 1,
        padding: "10px 16px",
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 500,
        color: hov ? C.text : C.sub,
        background: hov ? "rgba(255,255,255,0.06)" : C.card,
        border: `1px solid ${C.border}`,
        opacity: disabled ? 0.4 : 1,
        transition: "background 0.15s, color 0.15s"
      }}>
      {children}
    </button>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        position: "relative",
        width: 36,
        height: 20,
        borderRadius: 10,
        background: checked ? C.accent : C.border,
        transition: "background 0.2s",
        flexShrink: 0
      }}>
      <span style={{
        position: "absolute",
        top: 2,
        left: checked ? 18 : 2,
        width: 16,
        height: 16,
        borderRadius: "50%",
        background: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
        transition: "left 0.2s"
      }} />
    </button>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  list
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  list?: string
}) {
  return (
    <input
      type={type}
      value={value}
      list={list}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        background: C.input,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 13,
        color: C.text
      }}
    />
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      color: C.muted,
      marginBottom: 6
    }}>
      {children}
    </div>
  )
}

function FieldGroup({
  label,
  hint,
  children
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <Label>{label}</Label>
      {children}
      {hint && (
        <div style={{ fontSize: 11, color: C.muted, marginTop: 5, lineHeight: 1.5 }}>
          {hint}
        </div>
      )}
    </div>
  )
}

function Banner({ type, children }: { type: "success" | "warning" | "error"; children: React.ReactNode }) {
  const cfg = {
    success: { bg: "rgba(16,185,129,0.1)", border: "rgba(16,185,129,0.25)", color: "#6EE7B7", icon: "check" },
    warning: { bg: "rgba(245,158,11,0.1)", border: "rgba(245,158,11,0.25)", color: "#FCD34D", icon: "warning" },
    error: { bg: "rgba(239,68,68,0.1)", border: "rgba(239,68,68,0.25)", color: "#FCA5A5", icon: "x-circle" }
  }[type]
  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      borderRadius: 10,
      padding: "10px 12px",
      fontSize: 12,
      color: cfg.color,
      lineHeight: 1.5
    }}>
      <span style={{ marginTop: 1, flexShrink: 0 }}><Ico name={cfg.icon} size={14} /></span>
      <span>{children}</span>
    </div>
  )
}

// ─── Vault sub-components ─────────────────────────────────────────────────────

// ─── Folder Tree Picker ───────────────────────────────────────────────────────

interface FolderNode {
  name: string
  path: string
  children: FolderNode[]
}

// Converts a flat sorted list of folder paths into a nested tree.
// Relies on alphabetical sort guaranteeing parent before child:
//   "A/B" always sorts after "A" since "/" (U+002F) < any letter.
function buildFolderTree(folders: string[]): FolderNode[] {
  const map = new Map<string, FolderNode>()
  const roots: FolderNode[] = []
  const sorted = [...folders].sort((a, b) => a.localeCompare(b))
  for (const path of sorted) {
    const parts = path.split("/").filter(Boolean)
    if (parts.length === 0) continue
    const node: FolderNode = { name: parts[parts.length - 1], path, children: [] }
    map.set(path, node)
    if (parts.length === 1) {
      roots.push(node)
    } else {
      const parent = map.get(parts.slice(0, -1).join("/"))
      if (parent) parent.children.push(node)
      else roots.push(node) // orphan: intermediate path missing from API response
    }
  }
  return roots
}

// Proper React component so React can reconcile expand state correctly.
// Using a function (not a component) caused React to miss re-renders on expand toggle.
function TreeNode({
  node, depth, value, expanded, onSelect, onToggle
}: {
  node: FolderNode
  depth: number
  value: string
  expanded: Set<string>
  onSelect: (path: string) => void
  onToggle: (path: string) => void
}) {
  const isExp = expanded.has(node.path)
  const isSel = value === node.path
  const hasKids = node.children.length > 0
  return (
    <div>
      <div
        onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.05)" }}
        onMouseLeave={(e) => { e.currentTarget.style.background = isSel ? "rgba(124,58,237,0.15)" : "transparent" }}
        style={{
          display: "flex", alignItems: "center",
          paddingLeft: 6 + depth * 16, paddingRight: 10,
          paddingTop: 5, paddingBottom: 5,
          background: isSel ? "rgba(124,58,237,0.15)" : "transparent",
          borderLeft: isSel ? `2px solid ${C.accent}` : "2px solid transparent",
          userSelect: "none"
        }}>
        {/* Expand/collapse — 20×20 zone, easier to hit than 14×14 */}
        <span
          onClick={() => { if (hasKids) onToggle(node.path) }}
          style={{
            width: 20, height: 20,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, cursor: hasKids ? "pointer" : "default", color: C.muted
          }}>
          {hasKids && <Ico name={isExp ? "chevron-down" : "chevron-right"} size={12} />}
        </span>
        {/* Folder icon */}
        <span style={{ display: "inline-flex", color: isSel ? C.accent : C.muted, marginRight: 6, flexShrink: 0 }}>
          <Ico name="folder" size={13} />
        </span>
        {/* Name — click selects this folder */}
        <span
          onClick={() => onSelect(node.path)}
          style={{ flex: 1, fontSize: 12, color: isSel ? C.text : C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}>
          {node.name}
        </span>
        {isSel && <span style={{ flexShrink: 0, color: C.accent, display: "inline-flex" }}><Ico name="check" size={12} /></span>}
      </div>
      {isExp && hasKids && node.children.map(child => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          value={value}
          expanded={expanded}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}

function FolderTreePicker({
  value,
  onChange,
  folders,
  loading,
  onRefresh
}: {
  value: string
  onChange: (v: string) => void
  folders: string[]
  loading: boolean
  onRefresh: () => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const searchRef = useRef<HTMLInputElement>(null)

  const tree = useMemo(() => buildFolderTree(folders), [folders])

  // Auto-expand ancestors when a saved value is loaded
  useEffect(() => {
    if (!value) return
    const parts = value.split("/").filter(Boolean)
    if (parts.length <= 1) return
    setExpanded(prev => {
      const next = new Set(prev)
      for (let i = 0; i < parts.length - 1; i++) next.add(parts.slice(0, i + 1).join("/"))
      return next
    })
  }, [value])

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50)
    else setSearch("")
  }, [open])

  const lc = search.trim().toLowerCase()
  const filtered = lc ? folders.filter(f => f.toLowerCase().includes(lc)) : null

  function selectFolder(path: string) {
    onChange(path)
    setOpen(false)
  }

  function toggleExpand(path: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Manual input + open/close button */}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Selecione ou digite o caminho da pasta"
          style={{ flex: 1, background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: C.text }}
        />
        <button
          onClick={() => setOpen(o => !o)}
          title={open ? "Fechar navegador de pastas" : "Navegar pastas"}
          style={{
            width: 34, height: 34, borderRadius: 8, flexShrink: 0,
            background: open ? "rgba(124,58,237,0.2)" : C.input,
            border: `1px solid ${open ? C.accent : C.border}`,
            color: open ? C.accent : C.muted,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.15s, border-color 0.15s, color 0.15s"
          }}>
          <Ico name="folder" size={15} />
        </button>
      </div>

      {/* Tree panel */}
      {open && (
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.input }}>
          {/* Search + Refresh header */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderBottom: `1px solid ${C.divider}` }}>
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar pastas…"
              style={{ flex: 1, background: "transparent", fontSize: 12, color: C.text }}
            />
            {search && (
              <button onClick={() => setSearch("")} style={{ color: C.muted, display: "flex" }}>
                <Ico name="x-circle" size={13} />
              </button>
            )}
            <button
              onClick={onRefresh}
              disabled={loading}
              title="Atualizar lista de pastas"
              style={{ color: loading ? C.muted : C.sub, display: "flex", opacity: loading ? 0.5 : 1 }}>
              <Ico name="refresh" size={13} />
            </button>
          </div>

          {/* Scrollable content — maxHeight directly on this div, no flex/overflow:hidden above */}
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            {loading && folders.length === 0 ? (
              <div style={{ padding: 14, textAlign: "center", fontSize: 12, color: C.muted }}>
                Carregando pastas…
              </div>
            ) : folders.length === 0 ? (
              <div style={{ padding: 14, textAlign: "center", fontSize: 12, color: C.muted }}>
                Nenhuma pasta encontrada. O Obsidian está aberto?
              </div>
            ) : filtered !== null ? (
              filtered.length === 0 ? (
                <div style={{ padding: 14, textAlign: "center", fontSize: 12, color: C.muted }}>
                  Nenhuma pasta encontrada para "{search}"
                </div>
              ) : (
                filtered.map(path => {
                  const name = path.split("/").pop() ?? path
                  const isSel = value === path
                  return (
                    <div
                      key={path}
                      onClick={() => selectFolder(path)}
                      onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.05)" }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = isSel ? "rgba(124,58,237,0.15)" : "transparent" }}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "6px 12px", cursor: "pointer", userSelect: "none",
                        background: isSel ? "rgba(124,58,237,0.15)" : "transparent",
                        borderLeft: isSel ? `2px solid ${C.accent}` : "2px solid transparent"
                      }}>
                      <span style={{ color: isSel ? C.accent : C.muted, display: "inline-flex", flexShrink: 0 }}>
                        <Ico name="folder" size={13} />
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: isSel ? C.text : C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                        <div style={{ fontSize: 10, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{path}</div>
                      </div>
                      {isSel && <span style={{ color: C.accent, display: "inline-flex", flexShrink: 0 }}><Ico name="check" size={12} /></span>}
                    </div>
                  )
                })
              )
            ) : (
              // Tree mode: use TreeNode component so React reconciles expand state correctly
              tree.map(node => (
                <TreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  value={value}
                  expanded={expanded}
                  onSelect={selectFolder}
                  onToggle={toggleExpand}
                />
              ))
            )}
          </div>
        </div>
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
      if (confirmed.includes(sl) || sl === partial) return false
      return partial !== "" ? sl.includes(partial) : true
    })
    .slice(0, 8)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="ai, study, project"
        style={{
          width: "100%",
          background: C.input,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 13,
          color: C.text
        }}
      />
      {chips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {chips.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onChange([...confirmed, tag].join(", "))}
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 20,
                background: C.input,
                color: C.sub,
                border: `1px solid ${C.border}`,
                transition: "color 0.15s, background 0.15s"
              }}>
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
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Label>Messages <span style={{ color: C.border, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>{selectedIds.size}/{messages.length}</span></Label>
        <div style={{ display: "flex", gap: 2 }}>
          {["All", "None"].map((action) => (
            <button
              key={action}
              type="button"
              onClick={() => onChange(action === "All" ? new Set(messages.map((_, i) => i)) : new Set())}
              style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, color: C.sub, transition: "color 0.15s, background 0.15s" }}>
              {action}
            </button>
          ))}
        </div>
      </div>
      <div style={{
        maxHeight: 128,
        overflowY: "auto",
        background: C.input,
        border: `1px solid ${C.border}`,
        borderRadius: 10
      }}>
        {messages.map((msg, i) => {
          const checked = selectedIds.has(i)
          const roleColor = ROLE_COLOR[msg.role] ?? ROLE_COLOR.user
          const roleLabel = ROLE_LABEL[msg.role] ?? msg.role
          return (
            <label
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 12px",
                cursor: "pointer",
                userSelect: "none",
                background: checked ? "rgba(124,58,237,0.1)" : undefined,
                borderBottom: i < messages.length - 1 ? `1px solid ${C.divider}` : undefined,
                transition: "background 0.1s"
              }}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(i)}
                style={{ accentColor: C.accent, width: 13, height: 13, cursor: "pointer", flexShrink: 0 }}
              />
              <span style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: roleColor,
                width: 24,
                flexShrink: 0
              }}>
                {roleLabel}
              </span>
              <span style={{ fontSize: 12, color: C.sub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {previewContent(msg.content)}
              </span>
            </label>
          )
        })}
      </div>
    </div>
  )
}

function VaultStatus({
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
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.muted }}>
      {loading ? (
        <span style={{ color: C.sub }}>Loading vault…</span>
      ) : error ? (
        <span style={{ color: "#FCD34D" }} title={error}>⚠ {error.slice(0, 40)}</span>
      ) : folderCount > 0 ? (
        <span>{folderCount} folders{tagCount > 0 ? ` · ${tagCount} tags` : ""}</span>
      ) : (
        <span>No vault data</span>
      )}
      <button
        onClick={onRefresh}
        disabled={loading}
        style={{ color: C.muted, display: "flex", alignItems: "center", gap: 4, transition: "color 0.15s" }}
        title="Refresh from Obsidian">
        <Ico name="refresh" size={12} />
        {cacheTs > 0 && !loading ? timeAgo(cacheTs) : ""}
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

  const [folders, setFolders] = useState<string[]>([])
  const [knownTags, setKnownTags] = useState<string[]>([])
  const [notes, setNotes] = useState<string[]>([])
  const [vaultLoading, setVaultLoading] = useState(false)
  const [vaultError, setVaultError] = useState("")
  const [cacheTs, setCacheTs] = useState(0)

  const [apiUrl, setApiUrl] = useState("")
  const [apiToken, setApiToken] = useState("")
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [connStatus, setConnStatus] = useState<ConnStatus>("idle")
  const [connMsg, setConnMsg] = useState("")
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevView = useRef<View>("loading")

  useEffect(() => {
    void init()
    return () => { if (savedTimer.current) clearTimeout(savedTimer.current) }
  }, [])

  useEffect(() => {
    if (!conversation) return
    setSelectedIds(new Set(conversation.messages.map((_, i) => i)))
  }, [conversation])

  useEffect(() => { setConnStatus("idle"); setConnMsg("") }, [apiUrl, apiToken])

  useEffect(() => {
    if (!conversation) return
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean)
    const filtered: Conversation = { ...conversation, messages: conversation.messages.filter((_, i) => selectedIds.has(i)) }
    const tpl = TEMPLATES.find((t) => t.id === template)
    setMarkdown(conversationToMarkdown(filtered, { title: title || conversation.title, tags: tagList, templateFields: tpl?.fields }))
  }, [conversation, title, tags, selectedIds, template])

  async function loadVaultData(s: AppSettings, forceRefresh = false) {
    const cache = await loadVaultCache()
    if (cache.folders.length > 0) { setFolders(cache.folders); setKnownTags(cache.tags); setNotes(cache.notes); setCacheTs(cache.ts) }
    if (!s.obsidianToken || !s.obsidianBaseUrl) return
    if (!forceRefresh && !isCacheStale(cache.ts) && cache.folders.length > 0) return
    setVaultLoading(true); setVaultError("")
    try {
      const [fR, tR, nR] = await Promise.allSettled([
        listFolders({ baseUrl: s.obsidianBaseUrl, token: s.obsidianToken }),
        listTags({ baseUrl: s.obsidianBaseUrl, token: s.obsidianToken }),
        listNotes({ baseUrl: s.obsidianBaseUrl, token: s.obsidianToken })
      ])
      const nf = fR.status === "fulfilled" ? fR.value : cache.folders
      const nt = tR.status === "fulfilled" && tR.value !== null ? tR.value : cache.tags
      const nn = nR.status === "fulfilled" ? nR.value : cache.notes
      const ts = Date.now()
      setFolders(nf); setKnownTags(nt); setNotes(nn); setCacheTs(ts)
      await saveVaultCache({ folders: nf, tags: nt, notes: nn, ts })
      if (fR.status === "rejected") setVaultError(fR.reason instanceof Error ? fR.reason.message : "Failed to load folders")
    } catch (e) {
      setVaultError(e instanceof Error ? e.message : "Could not reach Obsidian API.")
    } finally {
      setVaultLoading(false)
    }
  }

  async function init() {
    const s = await loadSettings()
    setSettings(s); setApiUrl(s.obsidianBaseUrl); setApiToken(s.obsidianToken)
    setFolder(s.lastFolder); setTags(s.lastTags); setTemplate(s.lastTemplate)
    setUseMoc(s.useMoc); setMocPath(s.lastMocPath)
    void loadVaultData(s)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) { setExtractError("Could not access the current tab."); setView("no-match"); return }
      const resp = (await chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_CONVERSATION" } as ExtractRequest)) as ExtractResponse
      if (resp?.conversation) { setConversation(resp.conversation); setTitle(resp.conversation.title); setView("preview") }
      else { setExtractError(resp?.error ?? "No conversation data returned."); setView("no-match") }
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      setExtractError(m.includes("Receiving end does not exist") ? "Open ChatGPT, Claude, Gemini or Perplexity first." : `Extraction error: ${m}`)
      setView("no-match")
    }
  }

  async function handleSync() {
    if (!settings || !conversation) return
    if (!settings.obsidianToken) { prevView.current = view; setView("settings"); return }
    if (!folder.trim()) { setSyncStatus("error"); setSyncMsg("Informe uma pasta de destino antes de salvar."); return }
    if (selectedIds.size === 0) { setSyncStatus("error"); setSyncMsg("No messages selected."); return }
    setSyncStatus("syncing"); setSyncMsg("")
    try {
      const path = buildVaultPath(folder, title || conversation.title)
      const noteTitle = title || conversation.title
      await sendToObsidian({ baseUrl: settings.obsidianBaseUrl, token: settings.obsidianToken, path, content: markdown, append })
      await saveLastUsed(folder, tags)
      await saveSettings({ useMoc, lastMocPath: mocPath.trim(), lastTemplate: template })
      if (useMoc && mocPath.trim()) {
        try {
          await appendLinkToNote({ baseUrl: settings.obsidianBaseUrl, token: settings.obsidianToken, indexPath: mocPath.trim(), notePath: path, noteTitle })
          setSyncStatus("success"); setSyncMsg(`Saved → ${path} · Index updated`)
        } catch (ie) {
          setSyncStatus("partial"); setSyncMsg(`Saved → ${path}. Index failed: ${ie instanceof Error ? ie.message : "Unknown error"}`)
        }
      } else {
        setSyncStatus("success"); setSyncMsg(`Saved → ${path}`)
      }
    } catch (e) {
      setSyncStatus("error"); setSyncMsg(e instanceof Error ? e.message : "Unknown error.")
    }
  }

  async function handleSaveSettings() {
    const url = apiUrl.trim().replace(/\/$/, "")
    const token = apiToken.trim()
    await saveSettings({ obsidianBaseUrl: url, obsidianToken: token })
    const updated: AppSettings = {
      ...(settings ?? { obsidianBaseUrl: url, obsidianToken: token, lastFolder: folder, lastTags: tags, lastMocPath: mocPath, useMoc, lastTemplate: template }),
      obsidianBaseUrl: url, obsidianToken: token
    }
    setSettings(updated); setSettingsSaved(true)
    if (savedTimer.current) clearTimeout(savedTimer.current)
    savedTimer.current = setTimeout(() => setSettingsSaved(false), 2500)
    void loadVaultData(updated, true)
  }

  async function handleTestConnection() {
    setConnStatus("testing")
    setConnMsg("")
    const result = await testConnection({ baseUrl: apiUrl.trim(), token: apiToken.trim() })
    if ("reason" in result) {
      setConnStatus("error")
      setConnMsg(result.reason)
    } else {
      setConnStatus("ok")
      setConnMsg(result.detail)
    }
  }

  function toggleSettings() {
    if (view === "settings") setView(prevView.current === "settings" ? "preview" : prevView.current)
    else { prevView.current = view; setView("settings") }
  }

  const platform = conversation?.platform ?? "unknown"
  const hasToken = !!settings?.obsidianToken
  const noneSelected = selectedIds.size === 0 && (conversation?.messages.length ?? 0) > 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ width: 440, height: 600, background: C.bg, color: C.text, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>

      {/* Header */}
      <div style={{ height: 68, background: C.header, borderBottom: `1px solid ${C.border}`, padding: "0 20px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(124,58,237,0.3)", border: "1px solid rgba(124,58,237,0.4)", display: "flex", alignItems: "center", justifyContent: "center", color: "#C4B5FD" }}>
            <Ico name="logo" size={18} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>Vault Chat Exporter</div>
            <div style={{ fontSize: 11, color: "rgba(139,156,200,0.7)", lineHeight: 1.3, marginTop: 1 }}>Export AI chats to Obsidian</div>
          </div>
        </div>
        <button
          onClick={toggleSettings}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = C.text }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = C.sub }}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 12px", borderRadius: 8,
            fontSize: 12, fontWeight: 500,
            color: view === "settings" ? C.text : C.sub,
            background: view === "settings" ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
            transition: "background 0.15s, color 0.15s"
          }}>
          {view === "settings"
            ? <><Ico name="arrow-left" size={13} /><span>Back</span></>
            : <><Ico name="gear" size={13} /><span>Settings</span></>}
        </button>
      </div>

      {/* Loading */}
      {view === "loading" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", border: `2px solid ${C.border}`, borderTopColor: C.accent, animation: "spin 0.8s linear infinite" }} />
          <div style={{ fontSize: 13, color: C.sub }}>Extracting conversation…</div>
        </div>
      )}

      {/* No match */}
      {view === "no-match" && (
        <>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: "0 32px", textAlign: "center" }}>
            <div style={{ width: 64, height: 64, borderRadius: 20, background: C.card, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted }}>
              <Ico name="monitor-off" size={28} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 8 }}>No conversation found</div>
              <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.6 }}>{extractError}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Supported platforms</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" }}>
                {Object.entries(PLATFORM_LABELS).filter(([k]) => k !== "unknown").map(([key, label]) => (
                  <span key={key} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: C.card, border: `1px solid ${C.border}`, color: C.sub }}>{label}</span>
                ))}
              </div>
            </div>
          </div>
          <div style={{ padding: "14px 20px", background: C.footer, borderTop: `1px solid ${C.border}`, display: "flex", gap: 10 }}>
            <SecondaryBtn onClick={toggleSettings}>Settings</SecondaryBtn>
            {!hasToken && <PrimaryBtn onClick={toggleSettings}>Configure API Token</PrimaryBtn>}
          </div>
        </>
      )}

      {/* Preview */}
      {view === "preview" && conversation && (
        <>
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Platform row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: PLATFORM_DOT[platform] ?? C.muted, flexShrink: 0, display: "inline-block" }} />
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{PLATFORM_LABELS[platform]}</span>
                <span style={{ fontSize: 12, color: C.muted }}>&middot; {conversation.messages.length} messages</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {!hasToken && (
                  <button
                    onClick={toggleSettings}
                    style={{ fontSize: 11, color: "#FCD34D", display: "flex", alignItems: "center", gap: 4, transition: "opacity 0.15s" }}>
                    <Ico name="warning" size={12} /> Set token
                  </button>
                )}
                <VaultStatus loading={vaultLoading} error={vaultError} folderCount={folders.length} tagCount={knownTags.length} cacheTs={cacheTs} hasToken={hasToken} onRefresh={() => settings && void loadVaultData(settings, true)} />
              </div>
            </div>

            {/* Messages */}
            <div>
              <SectionDivider label="Messages" />
              <MessageSelector messages={conversation.messages} selectedIds={selectedIds} onChange={setSelectedIds} />
            </div>

            {/* Export settings */}
            <div>
              <SectionDivider label="Export" />
              <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <FieldGroup label="Title">
                  <TextInput value={title} onChange={setTitle} placeholder="Conversation title" />
                </FieldGroup>
                <FieldGroup label="Folder" hint="Vault-relative path">
                  <FolderTreePicker
                    value={folder}
                    onChange={setFolder}
                    folders={folders}
                    loading={vaultLoading}
                    onRefresh={() => settings && void loadVaultData(settings, true)}
                  />
                </FieldGroup>
                <FieldGroup label="Template">
                  <select
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    style={{ width: "100%", background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, color: C.text }}>
                    <option value="">None</option>
                    {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </FieldGroup>
                <FieldGroup label="Tags">
                  <TagInput value={tags} onChange={setTags} suggestions={knownTags} />
                </FieldGroup>
              </Card>
            </div>

            {/* Options */}
            <div>
              <SectionDivider label="Options" />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Card>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <IconBadge icon="file-plus" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Append mode</div>
                      <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>Add to end of an existing note instead of replacing</div>
                    </div>
                    <Toggle checked={append} onChange={setAppend} />
                  </div>
                </Card>
                <Card>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <IconBadge icon="link" />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Index / MOC</div>
                      <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>Append a wikilink to an existing index note</div>
                      {useMoc && (
                        <div style={{ marginTop: 8 }}>
                          <input
                            type="text"
                            list="vce-notes"
                            value={mocPath}
                            onChange={(e) => setMocPath(e.target.value)}
                            placeholder="00 - MOCs/Topic.md"
                            style={{ width: "100%", background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", fontSize: 12, color: C.text }}
                          />
                          <datalist id="vce-notes">{notes.map((n) => <option key={n} value={n} />)}</datalist>
                        </div>
                      )}
                    </div>
                    <Toggle checked={useMoc} onChange={setUseMoc} />
                  </div>
                </Card>
              </div>
            </div>

            {/* Preview */}
            <div>
              <SectionDivider label="Markdown Preview" />
              <pre style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", fontSize: 11, color: C.sub, fontFamily: "'SF Mono', 'Fira Code', 'Consolas', monospace", overflowY: "auto", maxHeight: 90, whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0 }}>
                {markdown}
              </pre>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: "12px 20px", background: C.footer, borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 10, flexShrink: 0 }}>
            {noneSelected && <Banner type="warning">Select at least one message to export.</Banner>}
            {syncStatus === "success" && <Banner type="success">{syncMsg}</Banner>}
            {syncStatus === "partial" && <Banner type="warning">{syncMsg}</Banner>}
            {syncStatus === "error" && !noneSelected && <Banner type="error">{syncMsg}</Banner>}
            <div style={{ display: "flex", gap: 10 }}>
              <SecondaryBtn onClick={toggleSettings}>Settings</SecondaryBtn>
              <PrimaryBtn onClick={handleSync} disabled={syncStatus === "syncing" || noneSelected}>
                {syncStatus === "syncing" ? "Syncing…" : "Sync to Vault"}
              </PrimaryBtn>
            </div>
          </div>
        </>
      )}

      {/* Settings */}
      {view === "settings" && (
        <>
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <SectionDivider label="Connection" />
              <Card style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <IconBadge icon="globe" color={C.sub} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Obsidian Local REST API</div>
                    <div style={{ fontSize: 11, color: C.sub }}>HTTP port 27123 recommended</div>
                  </div>
                </div>
                <FieldGroup label="API URL" hint="Default: http://127.0.0.1:27123">
                  <TextInput value={apiUrl} onChange={setApiUrl} placeholder="http://127.0.0.1:27123" />
                </FieldGroup>
                <FieldGroup label="API Token" hint="Obsidian → Settings → Local REST API → API Key">
                  <TextInput type="password" value={apiToken} onChange={setApiToken} placeholder="Paste your API key here" />
                </FieldGroup>
                <div style={{ borderTop: `1px solid ${C.divider}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    onClick={handleTestConnection}
                    disabled={connStatus === "testing"}
                    onMouseEnter={(e) => { if (connStatus !== "testing") { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = C.text } }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.sub }}
                    style={{
                      alignSelf: "flex-start",
                      fontSize: 12,
                      fontWeight: 500,
                      padding: "6px 14px",
                      borderRadius: 8,
                      color: connStatus === "testing" ? C.muted : C.sub,
                      background: "transparent",
                      border: `1px solid ${C.border}`,
                      opacity: connStatus === "testing" ? 0.6 : 1,
                      transition: "background 0.15s, color 0.15s"
                    }}>
                    {connStatus === "testing" ? "Testing…" : "Test Connection"}
                  </button>
                  {connStatus === "ok" && (
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6EE7B7" }}>
                      <Ico name="check" size={13} />
                      <span>{connMsg}</span>
                    </div>
                  )}
                  {connStatus === "error" && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: 12, color: "#FCA5A5", lineHeight: 1.5 }}>
                      <span style={{ flexShrink: 0, marginTop: 1 }}><Ico name="x-circle" size={13} /></span>
                      <span>{connMsg}</span>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            <div>
              <SectionDivider label="Setup Guide" />
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {([
                  ["download", "Install the plugin", "Search \"obsidian-local-rest-api\" in Obsidian community plugins and install it."],
                  ["key", "Copy the API key", "Obsidian → Settings → Local REST API → copy the API Key field."],
                  ["globe", "Use HTTP port 27123", "Avoids SSL certificate errors in Chrome extensions."]
                ] as [string, string, string][]).map(([icon, title, desc]) => (
                  <Card key={title}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <IconBadge icon={icon} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{title}</div>
                        <div style={{ fontSize: 11, color: C.sub, marginTop: 3, lineHeight: 1.5 }}>{desc}</div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {settingsSaved && <Banner type="success">Settings saved — refreshing vault data…</Banner>}
          </div>

          <div style={{ padding: "12px 20px", background: C.footer, borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, flexShrink: 0 }}>
            <SecondaryBtn onClick={toggleSettings}>Back</SecondaryBtn>
            <PrimaryBtn onClick={handleSaveSettings}>Save Settings</PrimaryBtn>
          </div>
        </>
      )}
    </div>
  )
}

export default Popup
