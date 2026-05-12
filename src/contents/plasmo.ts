import type { PlasmoCSConfig } from "plasmo"
import type { ExtractRequest, ExtractResponse, RenameRequest, RenameResponse } from "~/types"
import { extractChatGPT, matchesChatGPT } from "~/lib/platforms/chatgpt"
import { extractClaude, matchesClaude } from "~/lib/platforms/claude"
import { extractGemini, matchesGemini } from "~/lib/platforms/gemini"
import { extractPerplexity, matchesPerplexity } from "~/lib/platforms/perplexity"
import { renamePlatformChat } from "~/lib/rename"

export const config: PlasmoCSConfig = {
  matches: [
    "https://chat.openai.com/*",
    "https://chatgpt.com/*",
    "https://claude.ai/*",
    "https://gemini.google.com/*",
    "https://www.perplexity.ai/*"
  ]
}

function detectAndExtract(): ExtractResponse {
  const url = location.href

  try {
    if (matchesChatGPT(url)) {
      return { conversation: extractChatGPT(), error: null }
    }
    if (matchesClaude(url)) {
      return { conversation: extractClaude(), error: null }
    }
    if (matchesGemini(url)) {
      return { conversation: extractGemini(), error: null }
    }
    if (matchesPerplexity(url)) {
      return { conversation: extractPerplexity(), error: null }
    }
    return { conversation: null, error: "Platform not supported." }
  } catch (err) {
    return {
      conversation: null,
      error: err instanceof Error ? err.message : "Extraction failed."
    }
  }
}

chrome.runtime.onMessage.addListener(
  (message: ExtractRequest | RenameRequest, _sender, sendResponse) => {
    if (message.type === "EXTRACT_CONVERSATION") {
      const result = detectAndExtract()

      // If no messages were found, report it as an error rather than empty data
      if (result.conversation && result.conversation.messages.length === 0) {
        result.conversation = null
        result.error =
          "No messages found. Make sure the conversation has loaded fully."
      }

      sendResponse(result as ExtractResponse)
      return true
    }

    if (message.type === "RENAME_PLATFORM_CHAT") {
      const url = location.href
      let platform = "unknown"
      if (matchesChatGPT(url)) platform = "chatgpt"
      else if (matchesClaude(url)) platform = "claude"
      else if (matchesGemini(url)) platform = "gemini"
      else if (matchesPerplexity(url)) platform = "perplexity"

      renamePlatformChat(platform, message.newName)
        .then(() => sendResponse({ ok: true } as RenameResponse))
        .catch((err) =>
          sendResponse({
            ok: false,
            error: err instanceof Error ? err.message : String(err)
          } as RenameResponse)
        )
      return true // keep channel open for async response
    }
  }
)
