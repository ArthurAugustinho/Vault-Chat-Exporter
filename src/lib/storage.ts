import type { AppSettings, VaultCache } from "~/types"

// ─── App Settings ─────────────────────────────────────────────────────────────

const SETTINGS_KEY = "vce_settings"

const DEFAULTS: AppSettings = {
  obsidianBaseUrl: "http://127.0.0.1:27123",
  obsidianToken: "",
  lastFolder: "",
  lastTags: "ai",
  lastMocPath: "",
  useMoc: false,
  lastTemplate: ""
}

export async function loadSettings(): Promise<AppSettings> {
  return new Promise((resolve) => {
    chrome.storage.local.get(SETTINGS_KEY, (result) => {
      resolve({ ...DEFAULTS, ...(result[SETTINGS_KEY] ?? {}) })
    })
  })
}

export async function saveSettings(partial: Partial<AppSettings>): Promise<void> {
  const current = await loadSettings()
  return new Promise((resolve) => {
    chrome.storage.local.set({ [SETTINGS_KEY]: { ...current, ...partial } }, resolve)
  })
}

export async function saveLastUsed(folder: string, tags: string): Promise<void> {
  await saveSettings({ lastFolder: folder, lastTags: tags })
}

// ─── Vault Metadata Cache ─────────────────────────────────────────────────────

const VAULT_CACHE_KEY = "vce_vault_cache"
/** Refresh cache if older than 5 minutes */
const CACHE_TTL_MS = 5 * 60 * 1000

const EMPTY_CACHE: VaultCache = { folders: [], tags: [], notes: [], ts: 0 }

export async function loadVaultCache(): Promise<VaultCache> {
  return new Promise((resolve) => {
    chrome.storage.local.get(VAULT_CACHE_KEY, (result) => {
      resolve({ ...EMPTY_CACHE, ...(result[VAULT_CACHE_KEY] ?? {}) })
    })
  })
}

export async function saveVaultCache(cache: Partial<VaultCache>): Promise<void> {
  const current = await loadVaultCache()
  return new Promise((resolve) => {
    chrome.storage.local.set({ [VAULT_CACHE_KEY]: { ...current, ...cache } }, resolve)
  })
}

export function isCacheStale(ts: number): boolean {
  return Date.now() - ts > CACHE_TTL_MS
}
