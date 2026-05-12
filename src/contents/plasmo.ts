import type { PlasmoCSConfig } from "plasmo"
import type { ExtractRequest, ExtractResponse } from "~/types"
import { extractChatGPT, matchesChatGPT } from "~/lib/platforms/chatgpt"
import { extractClaude, matchesClaude } from "~/lib/platforms/claude"
import { extractGemini, matchesGemini } from "~/lib/platforms/gemini"
import { extractPerplexity, matchesPerplexity } from "~/lib/platforms/perplexity"

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
  (message: ExtractRequest, _sender, sendResponse) => {
    if (message.type !== "EXTRACT_CONVERSATION") return

    const result = detectAndExtract()

    // If no messages were found, report it as an error rather than empty data
    if (result.conversation && result.conversation.messages.length === 0) {
      result.conversation = null
      result.error =
        "No messages found. Make sure the conversation has loaded fully."
    }

    sendResponse(result)
    return true
  }
)
