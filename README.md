# 🔮 Vault Chat Exporter

Export conversations from **ChatGPT**, **Claude**, **Gemini** and **Perplexity** directly to your Obsidian vault — with a single click.

Built with [Plasmo](https://docs.plasmo.com/), React and TypeScript.

---

## Features

- **One-click export** — opens a popup with conversation preview before syncing
- **Markdown conversion** — YAML frontmatter + structured body with code blocks preserved
- **4 platforms** — ChatGPT, Claude (primary), Gemini & Perplexity (good coverage)
- **Append mode** — optionally append to an existing note instead of overwriting
- **Persistent settings** — folder, tags and API config survive browser restarts
- **Dark UI** — minimal, distraction-free popup

---

## Prerequisites

1. [Obsidian](https://obsidian.md) installed and running
2. The **Local REST API** community plugin installed in Obsidian  
   `Settings → Community Plugins → Browse → "Local REST API"`
3. Plugin enabled and the **API key** copied from its settings panel

---

## Installation (Developer / Unpacked)

```bash
# 1. Clone or download this repo
git clone <repo-url>
cd vault-chat-exporter

# 2. Install dependencies
npm install

# 3. Build the extension
npm run build
# Output: build/chrome-mv3-prod/
```

Then load in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `build/chrome-mv3-prod/` folder

The extension icon appears in the toolbar. Pin it for quick access.

---

## First-time setup

1. Click the extension icon → **⚙ Settings**
2. Set **API URL**: `http://127.0.0.1:27123`  
   _(Use HTTP port 27123 to avoid self-signed certificate errors)_
3. Paste your **API Token** from Obsidian → Settings → Local REST API → API Key
4. Click **Save Settings**

---

## Usage

1. Navigate to a conversation on ChatGPT, Claude, Gemini or Perplexity
2. Click the extension icon — the popup auto-extracts the conversation
3. Edit the **Title**, **Folder** and **Tags** as needed
4. Check **Append** if you want to add to an existing note
5. Review the Markdown preview
6. Click **Sync to Vault →**

The note is created at `<Folder>/<Title>.md` inside your vault.

---

## Project structure

```
src/
├── popup.tsx                  # Popup UI (React)
├── style.css                  # Tailwind base styles
├── types/index.ts             # Shared TypeScript types
├── contents/
│   └── plasmo.ts              # Content script — injected into AI sites
└── lib/
    ├── storage.ts             # chrome.storage wrapper
    ├── markdown.ts            # Conversation → Markdown converter
    ├── obsidianApi.ts         # Obsidian Local REST API client
    └── platforms/
        ├── index.ts           # DOM → Markdown helpers + Extractor interface
        ├── chatgpt.ts         # ChatGPT extractor
        ├── claude.ts          # Claude extractor
        ├── gemini.ts          # Gemini extractor
        └── perplexity.ts      # Perplexity extractor
```

---

## Development

```bash
npm run dev       # hot-reload dev build (chrome-mv3-dev)
npm run typecheck # TypeScript check without emitting
npm run build     # production build
npm run package   # zip for store submission
```

After `npm run dev`, load `build/chrome-mv3-dev/` as an unpacked extension. Changes rebuild automatically.

---

## Obsidian Local REST API notes

- **HTTP** (port `27123`) — recommended; no certificate issues in Chrome
- **HTTPS** (port `27124`) — requires importing the self-signed cert into Chrome's trust store; not recommended for most setups
- The plugin must be active when you sync (Obsidian must be open)
- Folder paths are relative to your vault root, e.g. `AI Chats/GPT`

---

## Security notes

- The API token is stored in `chrome.storage.local` (sandboxed per extension, not synced)
- No data leaves your machine — all calls go to `127.0.0.1`
- Path segments are sanitized (no `..` traversal, no control chars)
- The extension requests the minimum required permissions: `storage`, `activeTab`, `tabs`
- Content scripts are scoped only to the four supported domains

---

## What was implemented

| Feature | Status |
|---|---|
| Plasmo + React + TypeScript scaffold | ✅ |
| Popup UI (dark, Tailwind) | ✅ |
| Settings panel (URL + token) | ✅ |
| ChatGPT extractor (multi-strategy) | ✅ |
| Claude extractor (multi-strategy) | ✅ |
| Gemini extractor (basic + fallback) | ✅ |
| Perplexity extractor (basic + fallback) | ✅ |
| DOM → Markdown converter (code, lists, tables, headings) | ✅ |
| YAML frontmatter with title / source / url / tags | ✅ |
| Obsidian API client (PUT create, POST append) | ✅ |
| Path sanitization (no traversal, no illegal chars) | ✅ |
| chrome.storage persistence (settings, last folder/tags) | ✅ |
| Markdown preview before sync | ✅ |
| Error handling (connection, 401, 404) | ✅ |

---

## ⚠️ Known: new tab page override

The Plasmo scaffold created `src/newtab.tsx`, which makes the extension override your browser's new tab page. **Delete it** before sharing or distributing:

```bash
# On Windows (PowerShell)
Remove-Item src\newtab.tsx
Remove-Item src\options.tsx   # also unnecessary

npm run build                 # rebuild without the overrides
```

After rebuilding, open `build/chrome-mv3-prod/manifest.json` and confirm that `chrome_url_overrides` is gone.

---

## Manual testing checklist

Use this checklist after loading the unpacked extension to verify all paths work.

### Setup
- [ ] Obsidian is open with the Local REST API plugin enabled
- [ ] Extension loaded from `build/chrome-mv3-prod/` as unpacked
- [ ] Token configured: click icon → ⚙ Settings → paste token → Save Settings

### Happy path — ChatGPT
- [ ] Open a ChatGPT conversation (must have at least one message exchanged)
- [ ] Click extension icon → popup shows "ChatGPT" badge and message count
- [ ] Markdown preview shows `---` frontmatter + `## User` / `## Assistant` sections
- [ ] Code blocks inside the conversation appear as fenced `` ``` `` blocks
- [ ] Edit folder to `Test/ChatGPT` and click **Sync to Vault →**
- [ ] Success banner appears: `Saved → Test/ChatGPT/<title>.md`
- [ ] Open Obsidian — note exists at the correct path

### Happy path — Claude
- [ ] Repeat same flow on a `claude.ai` conversation
- [ ] Platform badge shows "Claude"

### Append mode
- [ ] Sync a conversation (creates the file)
- [ ] Check **Append to existing file** and sync again
- [ ] Open the note in Obsidian — content is appended, not replaced

### Error handling
- [ ] Stop Obsidian and try to sync → error banner: "Cannot reach Obsidian API"
- [ ] Use a wrong token → error banner: "Invalid API token"
- [ ] Open popup on a non-AI site (e.g., GitHub) → "No conversation found" view
- [ ] Clear the token → clicking Sync redirects you to Settings

### Settings persistence
- [ ] Set folder to `AI Exports`, sync, then close and reopen popup
- [ ] Folder field is still `AI Exports`

---

## What is partial / known risks

| Item | Detail |
|---|---|
| Platform DOM selectors | AI sites change HTML frequently — extractors use multi-strategy fallbacks but may need selector updates after redesigns |
| HTTPS Obsidian API | Not tested; HTTP (port 27123) is the recommended path |
| Gemini / Perplexity extraction | Relies on class-name heuristics; may produce incomplete results on some conversation layouts |
| `src/newtab.tsx` / `src/options.tsx` | Plasmo scaffold artifacts — override new tab and add unused options page. Delete both files and rebuild. |

## Recommended next steps

1. **Delete scaffold pages**: remove `src/newtab.tsx` and `src/options.tsx`, rebuild
2. **Test on real conversations** — run the checklist above; inspect DevTools console for extraction errors
3. **Add a badge count** — show message count on the extension icon via background script
4. **Keyboard shortcut** — register a `commands` entry to open the popup without clicking
5. **Submit to Chrome Web Store** after full testing (`npm run package`)
