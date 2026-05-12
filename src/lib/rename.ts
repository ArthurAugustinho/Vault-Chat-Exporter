// ─── DOM helpers ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function waitForElement(selector: string, timeoutMs = 3000): Promise<HTMLElement> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const el = document.querySelector<HTMLElement>(selector)
    if (el) return el
    await sleep(80)
  }
  throw new Error(`Element not found: "${selector}"`)
}

function setNativeInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set
  if (setter) setter.call(input, value)
  else input.value = value
  input.dispatchEvent(new Event("input", { bubbles: true }))
  input.dispatchEvent(new Event("change", { bubbles: true }))
}

function pressEnter(el: HTMLElement): void {
  for (const type of ["keydown", "keypress", "keyup"] as const) {
    el.dispatchEvent(
      new KeyboardEvent(type, { key: "Enter", code: "Enter", keyCode: 13, bubbles: true, cancelable: true })
    )
  }
}

function findButton(container: ParentNode, ...patterns: (string | RegExp)[]): HTMLElement | null {
  const els = Array.from(container.querySelectorAll<HTMLElement>("button, [role='button'], [role='menuitem']"))
  return (
    els.find((b) => {
      const text = (b.textContent ?? "") + " " + (b.getAttribute("aria-label") ?? "") + " " + (b.getAttribute("title") ?? "")
      return patterns.some((p) => (typeof p === "string" ? text.toLowerCase().includes(p.toLowerCase()) : p.test(text)))
    }) ?? null
  )
}

// ─── ChatGPT ──────────────────────────────────────────────────────────────────

async function renameChatGPTChat(newName: string): Promise<void> {
  const href = location.pathname

  let activeItem =
    (document.querySelector<HTMLElement>(`nav a[href="${href}"]`)?.closest("li") as HTMLElement | null) ??
    (document.querySelector<HTMLElement>("nav [aria-current='page']")?.closest("li") as HTMLElement | null)

  if (!activeItem) throw new Error("Active conversation not found in ChatGPT sidebar.")

  activeItem.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
  await sleep(200)

  const moreBtn =
    activeItem.querySelector<HTMLElement>("button[aria-haspopup]") ??
    activeItem.querySelector<HTMLElement>("button:last-of-type")
  if (!moreBtn) throw new Error("Options button not found.")

  moreBtn.click()
  await sleep(250)

  const renameItem = findButton(document.body, "rename")
  if (!renameItem) throw new Error("Rename option not found in menu.")

  renameItem.click()
  await sleep(250)

  const input =
    activeItem.querySelector<HTMLInputElement>("input[type='text']") ??
    ((await waitForElement("input[type='text']", 1500)) as HTMLInputElement)

  input.focus()
  input.select()
  setNativeInputValue(input, newName)
  await sleep(80)
  pressEnter(input)
}

// ─── Claude ───────────────────────────────────────────────────────────────────

async function renameClaudeChat(newName: string): Promise<void> {
  const href = location.pathname

  const link: HTMLElement | null =
    document.querySelector<HTMLElement>(`a[href="${href}"]`) ??
    document.querySelector<HTMLElement>("[aria-current='page']")
  if (!link) throw new Error("Active conversation not found in Claude sidebar.")

  const item = (link.closest("li, [role='listitem']") as HTMLElement | null) ?? (link.parentElement as HTMLElement)

  item.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
  await sleep(250)

  const editBtn =
    item.querySelector<HTMLElement>("button[aria-label*='ename'], button[aria-label*='dit'], button[title*='ename']") ??
    findButton(item, "rename", "edit")
  if (!editBtn) throw new Error("Rename button not found in Claude sidebar item.")

  editBtn.click()
  await sleep(250)

  const input =
    item.querySelector<HTMLInputElement>("input[type='text']") ??
    ((await waitForElement("input[type='text']", 1500)) as HTMLInputElement)

  input.focus()
  input.select()
  setNativeInputValue(input, newName)
  await sleep(80)
  pressEnter(input)
}

// ─── Gemini ───────────────────────────────────────────────────────────────────

async function renameGeminiChat(newName: string): Promise<void> {
  const href = location.pathname

  const link: HTMLElement | null =
    document.querySelector<HTMLElement>(`a[href="${href}"]`) ??
    document.querySelector<HTMLElement>("[aria-current='page'], [aria-selected='true']")
  if (!link) throw new Error("Active conversation not found in Gemini sidebar.")

  const item = (link.closest("li, [role='listitem']") as HTMLElement | null) ?? (link.parentElement as HTMLElement)

  item.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))
  await sleep(250)

  const moreBtn =
    item.querySelector<HTMLElement>("button[aria-label*='ore'], button[aria-label*='ption'], button[aria-haspopup]") ??
    item.querySelector<HTMLElement>("button:last-of-type")
  if (!moreBtn) throw new Error("Options button not found in Gemini sidebar.")

  moreBtn.click()
  await sleep(250)

  const renameItem = findButton(document.body, "rename")
  if (!renameItem) throw new Error("Rename option not found in Gemini menu.")

  renameItem.click()
  await sleep(300)

  const input = (await waitForElement(
    "input[type='text'], input[cdkFocusInitial], dialog input",
    1500
  )) as HTMLInputElement

  input.focus()
  input.select()
  setNativeInputValue(input, newName)
  await sleep(80)

  const confirmBtn = findButton(document.body, "save", "ok", "confirm")
  if (confirmBtn) confirmBtn.click()
  else pressEnter(input)
}

// ─── Perplexity ───────────────────────────────────────────────────────────────

async function renamePerplexityChat(_newName: string): Promise<void> {
  throw new Error("Rename not supported for Perplexity.")
}

// ─── Router ───────────────────────────────────────────────────────────────────

export async function renamePlatformChat(platform: string, newName: string): Promise<void> {
  switch (platform) {
    case "chatgpt":   return renameChatGPTChat(newName)
    case "claude":    return renameClaudeChat(newName)
    case "gemini":    return renameGeminiChat(newName)
    case "perplexity":return renamePerplexityChat(newName)
    default:          throw new Error(`Rename not supported for platform "${platform}".`)
  }
}
