import type { ObsidianSendOptions } from "~/types"

// ─── Shared types ─────────────────────────────────────────────────────────────

interface VaultListOpts {
  baseUrl: string
  token: string
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function vaultUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}/${path}`
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/")
}

/** GET /vault/ and return the raw files array. Shared by listFolders and listNotes. */
async function fetchVaultFiles(opts: VaultListOpts): Promise<string[]> {
  let res: Response
  try {
    res = await fetch(vaultUrl(opts.baseUrl, "vault/"), {
      headers: { Authorization: `Bearer ${opts.token}` }
    })
  } catch {
    throw new Error("Cannot reach Obsidian API. Is Obsidian running?")
  }
  if (res.status === 401) throw new Error("Invalid API token.")
  if (!res.ok) throw new Error(`Vault listing failed: ${res.status}`)
  const data = (await res.json()) as { files?: string[] }
  return data.files ?? []
}

// ─── Vault Listing ────────────────────────────────────────────────────────────

/**
 * GET /vault/ — derives unique folder paths from the vault file list.
 */
export async function listFolders(opts: VaultListOpts): Promise<string[]> {
  const files = await fetchVaultFiles(opts)
  const folders = new Set<string>()
  for (const file of files) {
    const clean = file.endsWith("/") ? file.slice(0, -1) : file
    const parts = clean.split("/").filter(Boolean)
    for (let i = 0; i < parts.length - (file.endsWith("/") ? 0 : 1); i++) {
      folders.add(parts.slice(0, i + 1).join("/"))
    }
  }
  return Array.from(folders).sort((a, b) => a.localeCompare(b))
}

/**
 * GET /vault/ — returns all .md file paths in the vault, sorted alphabetically.
 */
export async function listNotes(opts: VaultListOpts): Promise<string[]> {
  const files = await fetchVaultFiles(opts)
  return files.filter((f) => f.endsWith(".md")).sort()
}

/**
 * GET /tags/ — available in obsidian-local-rest-api v2.x.
 * Returns null if the endpoint doesn't exist (older plugin version).
 * Response shape: { "tagName": count } or { "#tagName": count }
 */
export async function listTags(opts: VaultListOpts): Promise<string[] | null> {
  try {
    const res = await fetch(vaultUrl(opts.baseUrl, "tags/"), {
      headers: { Authorization: `Bearer ${opts.token}` }
    })
    if (!res.ok) return null

    const data = (await res.json()) as Record<string, unknown>

    if (Array.isArray((data as { tags?: unknown }).tags)) {
      return ((data as { tags: string[] }).tags)
        .map((t) => t.replace(/^#/, ""))
        .filter(Boolean)
        .sort()
    }

    if (typeof data === "object" && data !== null) {
      return Object.keys(data)
        .map((t) => t.replace(/^#/, ""))
        .filter(Boolean)
        .sort()
    }

    return null
  } catch {
    return null
  }
}

// ─── Note Read ────────────────────────────────────────────────────────────────

/**
 * GET /vault/{path} — read an existing note's content.
 * Returns null if the note does not exist (404).
 * Throws on auth errors or other API failures.
 */
export async function readNote(opts: VaultListOpts & { path: string }): Promise<string | null> {
  let res: Response
  try {
    res = await fetch(vaultUrl(opts.baseUrl, `vault/${encodePath(opts.path)}`), {
      headers: { Authorization: `Bearer ${opts.token}`, Accept: "text/markdown" }
    })
  } catch {
    throw new Error("Cannot reach Obsidian API. Is Obsidian running?")
  }
  if (res.status === 404) return null
  if (res.status === 401) throw new Error("Invalid API token.")
  if (!res.ok) throw new Error(`Read note failed: ${res.status}`)
  return await res.text()
}

// ─── MOC Linking ─────────────────────────────────────────────────────────────

/**
 * Append a wikilink bullet to an existing index / MOC note.
 *
 * Link format:
 *   - If folder/title path equals the bare title: [[path/without/ext]]
 *   - Otherwise: [[path/without/ext|title]]
 *
 * Deduplication: no-ops silently if a link to the same path already exists.
 * Throws if the index note does not exist (user must create it first).
 */
export async function appendLinkToNote(opts: {
  baseUrl: string
  token: string
  indexPath: string
  notePath: string
  noteTitle: string
}): Promise<void> {
  const { baseUrl, token, indexPath, notePath, noteTitle } = opts

  // Normalise: forward slashes and ensure .md extension
  const slashed = indexPath.replace(/\\/g, "/")
  const safeIndex = slashed.endsWith(".md") ? slashed : `${slashed}.md`

  const pathWithoutMd = notePath.replace(/\.md$/, "")
  // Strip wikilink-breaking chars from the display title
  const safeTitle = noteTitle.replace(/[[\]|]/g, "").trim() || pathWithoutMd

  const link =
    pathWithoutMd === safeTitle
      ? `[[${pathWithoutMd}]]`
      : `[[${pathWithoutMd}|${safeTitle}]]`
  const listItem = `- ${link}`

  const existing = await readNote({ baseUrl, token, path: safeIndex })
  if (existing === null) {
    throw new Error(
      `Index note not found: "${safeIndex}". Create it in Obsidian first.`
    )
  }

  // Dedup: [[pathWithoutMd]] and [[pathWithoutMd|alias]] both start with [[pathWithoutMd
  if (existing.includes(`[[${pathWithoutMd}`)) return

  const suffix = existing.endsWith("\n") ? `${listItem}\n` : `\n${listItem}\n`
  await sendToObsidian({ baseUrl, token, path: safeIndex, content: suffix, append: true })
}

// ─── Path Sanitization ───────────────────────────────────────────────────────

/**
 * Sanitize a single path segment: remove traversal chars and control chars.
 * Does NOT affect slashes — call this per-segment.
 */
export function sanitizeSegment(segment: string): string {
  return segment
    .replace(/\.\./g, "")
    .replace(/[<>:"|?*\x00-\x1f]/g, "")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 200)
}

/**
 * Sanitize a vault-relative path (may contain slashes).
 * Returns a safe relative path with .md extension.
 */
export function sanitizePath(rawPath: string): string {
  const segments = rawPath
    .split(/[/\\]/)
    .map(sanitizeSegment)
    .filter(Boolean)
  return segments.join("/")
}

export function buildVaultPath(folder: string, title: string): string {
  const safeTitle = sanitizeSegment(title) || "Untitled"
  const fileName = safeTitle.endsWith(".md") ? safeTitle : `${safeTitle}.md`
  const safeFolder = sanitizePath(folder)
  return safeFolder ? `${safeFolder}/${fileName}` : fileName
}

// ─── Note Write ───────────────────────────────────────────────────────────────

export async function sendToObsidian(opts: ObsidianSendOptions): Promise<void> {
  const { baseUrl, token, path, content, append } = opts

  if (!token) throw new Error("Obsidian API token is not configured.")
  if (!baseUrl) throw new Error("Obsidian API URL is not configured.")

  const url = `${baseUrl.replace(/\/$/, "")}/vault/${encodePath(path)}`
  const method = append ? "POST" : "PUT"

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "text/markdown"
      },
      body: content
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Cannot reach Obsidian API at ${baseUrl}. Is Obsidian running? (${msg})`)
  }

  if (!response.ok) {
    let detail = ""
    try {
      detail = await response.text()
    } catch {}
    if (response.status === 401) {
      throw new Error("Invalid API token. Check your Obsidian Local REST API settings.")
    }
    if (response.status === 404) {
      throw new Error(`Path not found: "${path}". Check the folder exists in your vault.`)
    }
    throw new Error(`Obsidian API error ${response.status}${detail ? `: ${detail}` : ""}`)
  }
}
