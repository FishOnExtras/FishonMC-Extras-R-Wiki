<script setup lang="ts">
import { withBase } from 'vitepress'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  analyze, applyLayout, backspace, computeSignature, computeSuggestions, enter, format, formatParam, highlight,
  INDENT, isWhitespace, minify, NO_SUGGESTIONS, renderHtml, stripNewlines, tab, typeChar,
  type EditState, type PlaceholderRegistry, type SignatureContext, type Span, type SuggestionContext,
} from './placeholder-editor/lang'
import { defaultRegistry, schemaVersion } from './placeholder-editor/default-registry'

const props = withDefaults(defineProps<{
  modelValue?: string
  registry?: PlaceholderRegistry | null
  readonly?: boolean
  lineNumbers?: boolean
  minLines?: number
  maxHeight?: string
  tabIndents?: boolean
  placeholder?: string
  ariaLabel?: string
  issueUrl?: string
  repoUrl?: string
}>(), {
  modelValue: '',
  readonly: false,
  lineNumbers: true,
  minLines: 4,
  maxHeight: '28rem',
  tabIndents: true,
  placeholder: '',
  ariaLabel: 'Placeholder editor',
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const normalize = (value: string) => value.replace(/\r\n?/g, '\n')

const registry = computed(() => (props.registry === undefined ? defaultRegistry : props.registry))
const usingDefault = computed(() => props.registry === undefined)

const rootEl = ref<HTMLElement>()
const scrollEl = ref<HTMLElement>()
const layerEl = ref<HTMLElement>()
const inputEl = ref<HTMLTextAreaElement>()
const popupEl = ref<HTMLElement>()
const signatureEl = ref<HTMLElement>()

const text = ref(normalize(props.modelValue))
const selection = ref({ start: 0, end: 0 })
const focused = ref(false)
const active = ref(0)
const uid = ref('pe') 
const floatStyle = ref<Record<string, string>>({ visibility: 'hidden' })


const stripped = computed(() => stripNewlines(text.value))
const spans = computed(() => highlight(stripped.value.text, registry.value ?? undefined))
const structure = computed(() => analyze(stripped.value.text))

const spanClass = (span: Span): string =>
  span.kind === 'depth' ? `pe-d${span.depth % 10}`
    : span.error ? 'pe-invalid pe-err'
    : `pe-${span.kind}`

const baseClasses = computed(() => {
  const classes = new Array<string>(text.value.length).fill('')
  const toRaw = stripped.value.toRaw
  for (const span of spans.value) {
    const cls = spanClass(span)
    for (let i = span.start; i < span.end; i++) classes[toRaw[i]] = cls
  }
  return classes
})

const collapsed = computed(() => selection.value.start === selection.value.end)

const extras = computed(() => {
  const map = new Map<number, string>()
  const toRaw = stripped.value.toRaw
  const add = (index: number, cls: string) => map.set(index, map.has(index) ? `${map.get(index)} ${cls}` : cls)

  for (const delimiter of structure.value.unmatched) add(toRaw[delimiter.index], 'pe-err')

  if (focused.value && collapsed.value) {
    const caret = stripped.value.toStripped(selection.value.end)
    const near = structure.value.delimiterAt(caret - 1) ?? structure.value.delimiterAt(caret)
    if (near) {
      add(toRaw[near.index], near.partner >= 0 ? 'pe-bracket' : 'pe-bracket-bad')
      if (near.partner >= 0) add(toRaw[near.partner], 'pe-bracket')
    }
  }
  return map
})

const currentLine = computed(() => {
  let line = 0
  for (let i = 0; i < selection.value.end; i++) if (text.value[i] === '\n') line++
  return line
})

const html = computed(() => renderHtml(text.value, {
  classes: baseClasses.value,
  extras: extras.value,
  caret: selection.value.end,
  currentLine: focused.value ? currentLine.value : -1,
}))

const lineCount = computed(() => text.value.split('\n').length)

const showLineNumbers = ref(props.lineNumbers)
watch(() => props.lineNumbers, (value) => { showLineNumbers.value = value })

const wordWrap = ref(true)
const showIndentGuides = ref(true)

function lineIndentDepth(line: string): number {
  let i = 0
  let depth = 0
  while (i < line.length) {
    if (line[i] === '\t') { depth++; i++; continue }
    if (line.startsWith(INDENT, i)) { depth++; i += INDENT.length; continue }
    break
  }
  return depth
}

function syncIndentGuides() {
  const layer = layerEl.value
  if (!layer) return
  const lines = text.value.split('\n')
  const lineDivs = layer.children
  for (let i = 0; i < lineDivs.length; i++) {
    const lineDiv = lineDivs[i] as HTMLElement
    lineDiv.querySelectorAll(':scope > .pe-guide').forEach((el) => el.remove())
    if (!showIndentGuides.value) continue
    const depth = lineIndentDepth(lines[i] ?? '')
    if (depth === 0) continue
    let markup = ''
    for (let level = 0; level < depth; level++) {
      markup += `<span class="pe-guide" style="left:${level * INDENT.length}ch"></span>`
    }
    lineDiv.insertAdjacentHTML('afterbegin', markup)
  }
}

watch(html, () => void nextTick(syncIndentGuides))

const ZOOM_MIN = 0.8
const ZOOM_MAX = 1.6
const ZOOM_STEP = 0.1
const fontZoom = ref(1)
const zoomPercent = computed(() => Math.round(fontZoom.value * 100))
function zoomIn() { fontZoom.value = Math.min(ZOOM_MAX, Math.round((fontZoom.value + ZOOM_STEP) * 10) / 10) }
function zoomOut() { fontZoom.value = Math.max(ZOOM_MIN, Math.round((fontZoom.value - ZOOM_STEP) * 10) / 10) }
function zoomReset() { fontZoom.value = 1 }

const homeUrl = computed(() => withBase('/'))

const rootStyle = computed(() => ({
  '--pe-digits': String(String(lineCount.value).length),
  '--pe-min-lines': String(props.minLines),
  '--pe-max-height': props.maxHeight,
  '--pe-zoom': String(fontZoom.value),
}))


interface Problem {
  line: number
  column: number
  message: string
  rawStart: number
  rawEnd: number
}

const locate = (rawIndex: number) => {
  let line = 1
  let lastBreak = -1
  for (let i = 0; i < rawIndex; i++) {
    if (text.value[i] === '\n') { line++; lastBreak = i }
  }
  return { line, column: rawIndex - lastBreak }
}

const problems = computed<Problem[]>(() => {
  const list: Problem[] = []
  const toRaw = stripped.value.toRaw
  const source = stripped.value.text

  let previous: Span | null = null
  for (const span of spans.value) {
    if (!span.error) continue
    const joined = previous !== null && source.substring(previous.end, span.start).trim() === '.'
    previous = span
    if (joined) continue
    const rawStart = toRaw[span.start]
    list.push({
      ...locate(rawStart),
      rawStart,
      rawEnd: toRaw[span.end],
      message: `"${source.substring(span.start, span.end)}" is not a placeholder that can be used here`,
    })
  }
  for (const delimiter of structure.value.unmatched) {
    const rawStart = toRaw[delimiter.index]
    list.push({ ...locate(rawStart), rawStart, rawEnd: rawStart + 1, message: `Unmatched "${delimiter.char}"` })
  }
  return list.sort((a, b) => a.line - b.line || a.column - b.column)
})

const status = computed(() => {
  const count = problems.value.length
  return count === 0 ? 'No problems' : count === 1 ? '1 problem' : `${count} problems`
})
const position = computed(() => {
  const before = text.value.slice(0, selection.value.end)
  return { line: before.split('\n').length, column: before.length - before.lastIndexOf('\n') }
})


type PanelTab = 'problems'
const panelOpen = ref(false)
const activePanelTab = ref<PanelTab>('problems')

function jumpToProblem(problem: Problem) {
  const el = inputEl.value
  if (!el) return
  el.focus()
  el.setSelectionRange(problem.rawStart, problem.rawEnd)
  syncSelection()
  void nextTick(revealCaret)
}


type MenuName = 'file' | 'edit' | 'view' | 'help' | 'mobile'
const openMenuName = ref<MenuName | null>(null)
const menubarEl = ref<HTMLElement>()

function toggleMenu(name: MenuName) {
  openMenuName.value = openMenuName.value === name ? null : name
}
function closeMenu() {
  openMenuName.value = null
}

const toastMessage = ref<string | null>(null)
let toastTimer: ReturnType<typeof setTimeout> | undefined
function showToast(message: string) {
  toastMessage.value = message
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMessage.value = null }, 1800)
}


function clearEditor() {
  if (text.value.trim() !== '' && !window.confirm('Clear the editor? This can still be undone with Ctrl+Z.')) return
  edit({ text: '', start: 0, end: 0 })
  inputEl.value?.focus({ preventScroll: true })
}

async function copyAllText() {
  try {
    await navigator.clipboard.writeText(text.value)
    showToast('Copied to clipboard')
  } catch {
    showToast('Could not copy - check clipboard permissions')
  }
}

interface Snippet { id: string; name: string; text: string; updatedAt: number }
const SNIPPETS_KEY = 'placeholder-editor:snippets'

function makeId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function loadSnippetsFromStorage(): Snippet[] {
  try {
    const raw = localStorage.getItem(SNIPPETS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as Snippet[]) : []
  } catch {
    return []
  }
}

function saveSnippetsToStorage(list: Snippet[]) {
  try {
    localStorage.setItem(SNIPPETS_KEY, JSON.stringify(list))
  } catch {
    showToast('Could not save - storage might be full')
  }
}

type Dialog = { kind: 'snippets'; mode: 'open' | 'save' | 'manage' } | { kind: 'shortcuts' } | { kind: 'about' }
const dialog = ref<Dialog | null>(null)
const snippets = ref<Snippet[]>([])
const saveName = ref('')
const renamingId = ref<string | null>(null)
const renameValue = ref('')

function sortedSnippets(list: Snippet[]): Snippet[] {
  return [...list].sort((a, b) => b.updatedAt - a.updatedAt)
}

function openSnippets(mode: 'open' | 'save' | 'manage') {
  snippets.value = sortedSnippets(loadSnippetsFromStorage())
  saveName.value = ''
  renamingId.value = null
  dialog.value = { kind: 'snippets', mode }
}

function closeDialog() {
  dialog.value = null
}

function loadSnippet(snippet: Snippet) {
  edit({ text: snippet.text, start: 0, end: 0 })
  closeDialog()
  inputEl.value?.focus({ preventScroll: true })
}

function saveAsNew() {
  const name = saveName.value.trim()
  if (!name) return
  const list = loadSnippetsFromStorage()
  list.push({ id: makeId(), name, text: text.value, updatedAt: Date.now() })
  saveSnippetsToStorage(list)
  snippets.value = sortedSnippets(list)
  saveName.value = ''
  showToast(`Saved as "${name}"`)
}

function overwriteSnippet(snippet: Snippet) {
  if (!window.confirm(`Overwrite "${snippet.name}" with the current text?`)) return
  const list = loadSnippetsFromStorage()
  const found = list.find((s) => s.id === snippet.id)
  if (!found) return
  found.text = text.value
  found.updatedAt = Date.now()
  saveSnippetsToStorage(list)
  snippets.value = sortedSnippets(list)
  showToast(`Saved "${snippet.name}"`)
}

function deleteSnippet(snippet: Snippet) {
  if (!window.confirm(`Delete "${snippet.name}"? This cannot be undone.`)) return
  const list = loadSnippetsFromStorage().filter((s) => s.id !== snippet.id)
  saveSnippetsToStorage(list)
  snippets.value = sortedSnippets(list)
  showToast(`Deleted "${snippet.name}"`)
}

function startRename(snippet: Snippet) {
  renamingId.value = snippet.id
  renameValue.value = snippet.name
}

function commitRename(snippet: Snippet) {
  const name = renameValue.value.trim()
  renamingId.value = null
  if (!name || name === snippet.name) return
  const list = loadSnippetsFromStorage()
  const found = list.find((s) => s.id === snippet.id)
  if (!found) return
  found.name = name
  saveSnippetsToStorage(list)
  snippets.value = sortedSnippets(list)
}

function snippetRowClick(snippet: Snippet) {
  if (!dialog.value || dialog.value.kind !== 'snippets') return
  if (dialog.value.mode === 'open') loadSnippet(snippet)
  else if (dialog.value.mode === 'save') overwriteSnippet(snippet)
}


async function copySelectionOrAll() {
  const state = readState()
  const value = state.start !== state.end ? state.text.slice(state.start, state.end) : state.text
  try {
    await navigator.clipboard.writeText(value)
    showToast('Copied to clipboard')
  } catch {
    showToast('Could not copy - check clipboard permissions')
  }
}

async function cutSelection() {
  const state = readState()
  if (state.start === state.end) return
  const value = state.text.slice(state.start, state.end)
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    showToast('Could not copy - check clipboard permissions')
    return
  }
  edit({ text: state.text.slice(0, state.start) + state.text.slice(state.end), start: state.start, end: state.start })
  inputEl.value?.focus({ preventScroll: true })
}

async function pasteFromClipboard() {
  let value: string
  try {
    value = await navigator.clipboard.readText()
  } catch {
    showToast('Could not read clipboard - check permissions')
    return
  }
  const state = readState()
  const caret = state.start + value.length
  edit({ text: state.text.slice(0, state.start) + value + state.text.slice(state.end), start: caret, end: caret })
  inputEl.value?.focus({ preventScroll: true })
}

function selectAllText() {
  const el = inputEl.value
  if (!el) return
  el.focus()
  el.setSelectionRange(0, el.value.length)
  syncSelection()
}

function menuUndo() {
  undo()
  inputEl.value?.focus({ preventScroll: true })
}
function menuRedo() {
  redo()
  inputEl.value?.focus({ preventScroll: true })
}

function indentSelection() {
  const next = tab(readState(), false)
  if (next) edit(next)
  inputEl.value?.focus({ preventScroll: true })
}
function unindentSelection() {
  const next = tab(readState(), true)
  if (next) edit(next)
  inputEl.value?.focus({ preventScroll: true })
}


const dismissed = ref<{ text: string; caret: number } | null>(null)
const isDismissed = computed(() => {
  const gone = dismissed.value
  return gone !== null && gone.text === text.value && gone.caret === selection.value.start
})

const suggestions = computed<SuggestionContext>(() => {
  if (!registry.value || props.readonly || !focused.value || !collapsed.value) return NO_SUGGESTIONS
  return computeSuggestions(stripped.value.text, stripped.value.toStripped(selection.value.start), registry.value)
})

const popupOpen = computed(() => suggestions.value.suggestions.length > 0 && !isDismissed.value)

const selectable = computed(() => suggestions.value.suggestions.filter((suggestion) => !suggestion.hint).length)
const interactive = computed(() => popupOpen.value && selectable.value > 0)
const detail = computed(() => {
  const list = suggestions.value.suggestions
  const shown = interactive.value ? list[active.value] : list[0]
  return shown && (shown.signature || shown.description) ? shown : null
})

const signature = computed<SignatureContext | null>(() => {
  if (!registry.value || props.readonly || !focused.value || !collapsed.value) return null
  return computeSignature(stripped.value.text, stripped.value.toStripped(selection.value.start), registry.value)
})
const signatureOpen = computed(() => signature.value !== null && !popupOpen.value && !isDismissed.value)

const popupId = computed(() => `${uid.value}-suggestions`)
const signatureId = computed(() => `${uid.value}-signature`)
const statusTipId = computed(() => `${uid.value}-status-tip`)
const versionTipId = computed(() => `${uid.value}-version-tip`)
const minifyTipId = computed(() => `${uid.value}-minify-tip`)
const beautifyTipId = computed(() => `${uid.value}-beautify-tip`)
const optionId = (index: number) => `${uid.value}-option-${index}`

watch(suggestions, () => { active.value = 0 })

const floatingOpen = computed(() => popupOpen.value || signatureOpen.value)
watch(floatingOpen, (open) => {
  if (open) floatStyle.value = { visibility: 'hidden' }
  void nextTick(updateFloating)
})
watch([html, active], () => { if (floatingOpen.value) void nextTick(updateFloating) })
watch(active, () => void nextTick(() => {
  document.getElementById(optionId(active.value))?.scrollIntoView?.({ block: 'nearest' })
}))

function dismissPopup() {
  dismissed.value = { text: text.value, caret: selection.value.start }
}

function hover(index: number) {
  active.value = index
}

function acceptSuggestion(index = active.value) {
  const context = suggestions.value
  const picked = context.suggestions[index]
  if (!picked || picked.hint) return

  const state = readState()
  const rawEnd = state.start
  const rawStart = Math.min(stripped.value.toRaw[context.replaceStart], rawEnd)

  let tail = rawEnd
  while (tail < state.text.length && isWhitespace(state.text[tail])) tail++
  const addCall = picked.isFunction && !state.text.startsWith('.(', tail)

  const inserted = addCall ? `${picked.name}.()` : picked.name
  const caret = rawStart + picked.name.length + (addCall ? 2 : 0)
  edit({ text: state.text.slice(0, rawStart) + inserted + state.text.slice(rawEnd), start: caret, end: caret })
}

function lineHeightPx(): number {
  const layer = layerEl.value
  if (!layer) return 20
  const style = getComputedStyle(layer)
  return parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.7 || 20
}

function updateFloating() {
  const root = rootEl.value
  const box = scrollEl.value
  const marker = layerEl.value?.querySelector<HTMLElement>('.pe-caret')
  const floating = popupOpen.value ? popupEl.value : signatureOpen.value ? signatureEl.value : undefined
  if (!floating || !root || !box || !marker) return

  const r = root.getBoundingClientRect()
  const b = box.getBoundingClientRect()
  const m = marker.getBoundingClientRect()
  const lh = lineHeightPx()
  const lineTop = m.top - (lh - m.height) / 2

  if (lineTop + lh < b.top || lineTop > b.bottom) {
    floatStyle.value = { visibility: 'hidden' } 
    return
  }

  const height = floating.offsetHeight
  const width = floating.offsetWidth

  let top = lineTop + lh - r.top + 2
  if (lineTop + lh + 2 + height > window.innerHeight && lineTop - height - 2 > 0) top = lineTop - r.top - height - 2
  const left = Math.max(4, Math.min(m.left - r.left, r.width - width - 4))

  floatStyle.value = { left: `${left}px`, top: `${top}px` }
}


const readState = (): EditState => {
  const el = inputEl.value!
  return { text: el.value, start: el.selectionStart, end: el.selectionEnd }
}

function syncSelection() {
  const el = inputEl.value
  if (!el) return
  if (el.selectionStart !== selection.value.start || el.selectionEnd !== selection.value.end) {
    selection.value = { start: el.selectionStart, end: el.selectionEnd }
  }
}

function commitText(value: string) {
  text.value = value
  emit('update:modelValue', value)
}

const undoStack: EditState[] = []
const redoStack: EditState[] = []
let lastEditAt = 0
let lastWasTyping = false

function remember(before: EditState, typing: boolean) {
  const now = Date.now()
  if (!(typing && lastWasTyping && now - lastEditAt < 700)) {
    undoStack.push(before)
    if (undoStack.length > 300) undoStack.shift()
  }
  redoStack.length = 0
  lastEditAt = now
  lastWasTyping = typing
}

function write(state: EditState) {
  const el = inputEl.value!
  const box = scrollEl.value
  const top = box?.scrollTop ?? 0
  if (el.value !== state.text) el.value = state.text
  el.setSelectionRange(state.start, state.end)
  if (box) box.scrollTop = top
  commitText(state.text)
  syncSelection()
  void nextTick(revealCaret)
}

function edit(next: EditState, typing = false) {
  if (props.readonly) return
  remember(readState(), typing)
  write(next)
}

function undo() {
  const previous = undoStack.pop()
  if (!previous) return
  redoStack.push(readState())
  lastWasTyping = false
  write(previous)
}

function redo() {
  const next = redoStack.pop()
  if (!next) return
  undoStack.push(readState())
  lastWasTyping = false
  write(next)
}

function revealCaret() {
  const box = scrollEl.value
  const marker = layerEl.value?.querySelector<HTMLElement>('.pe-caret')
  if (!box || !marker) return

  const b = box.getBoundingClientRect()
  const m = marker.getBoundingClientRect()
  const lh = lineHeightPx()
  const lineTop = m.top - (lh - m.height) / 2
  const bottom = b.bottom - (box.offsetHeight - box.clientHeight)

  if (lineTop < b.top) box.scrollTop -= b.top - lineTop
  else if (lineTop + lh > bottom) box.scrollTop += lineTop + lh - bottom
}


let before: EditState | null = null
let releaseTab = false

function onBeforeInput(event: Event) {
  const e = event as InputEvent
  if (props.readonly) return
  before = readState()

  switch (e.inputType) {
    case 'historyUndo':
      e.preventDefault()
      undo()
      break
    case 'historyRedo':
      e.preventDefault()
      redo()
      break
    case 'insertLineBreak':
    case 'insertParagraph':
      e.preventDefault()
      edit(enter(readState()))
      break
    case 'insertText': {
      const next = e.data && e.data.length === 1 ? typeChar(readState(), e.data) : null
      if (next) {
        e.preventDefault()
        edit(next, true)
      }
      break
    }
    case 'deleteContentBackward': {
      const next = backspace(readState())
      if (next) {
        e.preventDefault()
        edit(next, true)
      }
      break
    }
  }
}

function onInput(event: Event) {
  const state = readState()
  const type = (event as InputEvent).inputType
  const typing = type === 'insertText' || type === 'deleteContentBackward' || type === 'deleteContentForward'
  remember(before ?? state, typing)
  before = null
  commitText(state.text)
  syncSelection()
  void nextTick(revealCaret)
}

function onKeydown(e: KeyboardEvent) {
  const wasReleased = releaseTab
  releaseTab = false

  const modifier = e.ctrlKey || e.metaKey
  if (modifier && !e.altKey && e.key.toLowerCase() === 'p') {
    e.preventDefault() 
    panelOpen.value = !panelOpen.value
    return
  }

  if (props.readonly) return

  if (modifier && !e.altKey) {
    const key = e.key.toLowerCase()
    if (key === 'z') {
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    } else if (key === 'y') {
      e.preventDefault()
      redo()
    } else if (key === ' ') {
      e.preventDefault()
      dismissed.value = null
    }
    return
  }

  if (interactive.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      active.value = Math.min(active.value + 1, selectable.value - 1)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      active.value = Math.max(active.value - 1, 0)
      return
    }
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault()
      acceptSuggestion()
      return
    }
  }

  if ((popupOpen.value || signatureOpen.value) && e.key === 'Escape') {
    e.preventDefault()
    dismissPopup()
    return
  }

  if (panelOpen.value && e.key === 'Escape') {
    e.preventDefault()
    panelOpen.value = false
    return
  }

  if (e.key === 'Escape') {
    releaseTab = true 
    return
  }

  if (e.key === 'Tab' && props.tabIndents && !wasReleased) {
    e.preventDefault()
    const next = tab(readState(), e.shiftKey)
    if (next) edit(next)
  }
}

function onFocus() {
  focused.value = true
  syncSelection()
}

function onBlur() {
  focused.value = false
}

function onSelectionChange() {
  if (document.activeElement === inputEl.value) syncSelection()
}


function applyToolbarLayout(layout: (value: string) => string) {
  const next = applyLayout(readState(), layout)
  if (next) edit(next)
  inputEl.value?.focus({ preventScroll: true })
}

const beautify = () => applyToolbarLayout(format)
const minifyText = () => applyToolbarLayout(minify)


type MenuItem =
  | { kind: 'action'; label: string; run: () => void; disabled?: boolean; shortcut?: string }
  | { kind: 'toggle'; label: string; checked: boolean; run: () => void; shortcut?: string }
  | { kind: 'zoom' }
  | { kind: 'link'; label: string; href?: string; disabledHint?: string; external?: boolean }
  | { kind: 'sep' }

interface MenuGroup { id: MenuName; label: string; items: MenuItem[] }

const menuGroups = computed<MenuGroup[]>(() => [
  {
    id: 'file', label: 'File', items: [
      { kind: 'action', label: 'New / Clear', run: clearEditor },
      { kind: 'action', label: 'Open\u2026', run: () => openSnippets('open'), shortcut: 'Ctrl+O' },
      { kind: 'action', label: 'Save\u2026', run: () => openSnippets('save'), disabled: props.readonly, shortcut: 'Ctrl+S' },
      { kind: 'sep' },
      { kind: 'action', label: 'Import\u2026', run: () => {}, disabled: true },
      { kind: 'action', label: 'Export\u2026', run: () => {}, disabled: true },
      { kind: 'sep' },
      { kind: 'action', label: 'Copy', run: copyAllText },
      { kind: 'action', label: 'Delete\u2026', run: () => openSnippets('manage') },
      { kind: 'sep' },
      { kind: 'link', label: 'Exit', href: homeUrl.value, external: false },
    ],
  },
  {
    id: 'edit', label: 'Edit', items: [
      { kind: 'action', label: 'Undo', run: menuUndo, disabled: props.readonly, shortcut: 'Ctrl+Z' },
      { kind: 'action', label: 'Redo', run: menuRedo, disabled: props.readonly, shortcut: 'Ctrl+Y' },
      { kind: 'sep' },
      { kind: 'action', label: 'Cut', run: cutSelection, disabled: props.readonly, shortcut: 'Ctrl+X' },
      { kind: 'action', label: 'Copy', run: copySelectionOrAll, shortcut: 'Ctrl+C' },
      { kind: 'action', label: 'Paste', run: pasteFromClipboard, disabled: props.readonly, shortcut: 'Ctrl+V' },
      { kind: 'sep' },
      { kind: 'action', label: 'Select All', run: selectAllText, shortcut: 'Ctrl+A' },
      { kind: 'sep' },
      { kind: 'action', label: 'Beautify', run: beautify, disabled: props.readonly, shortcut: 'Ctrl+Shift+B' },
      { kind: 'action', label: 'Minify', run: minifyText, disabled: props.readonly, shortcut: 'Ctrl+Shift+M' },
      { kind: 'sep' },
      { kind: 'action', label: 'Indent', run: indentSelection, disabled: props.readonly, shortcut: 'Tab' },
      { kind: 'action', label: 'Un-indent', run: unindentSelection, disabled: props.readonly, shortcut: 'Shift+Tab' },
    ],
  },
  {
    id: 'view', label: 'View', items: [
      { kind: 'toggle', label: 'Line numbers', checked: showLineNumbers.value, run: () => { showLineNumbers.value = !showLineNumbers.value }, shortcut: 'Ctrl+Shift+L' },
      { kind: 'toggle', label: 'Indent guides', checked: showIndentGuides.value, run: () => { showIndentGuides.value = !showIndentGuides.value; void nextTick(syncIndentGuides) } },
      { kind: 'sep' },
      { kind: 'zoom' },
      { kind: 'sep' },
      { kind: 'toggle', label: 'Word wrap', checked: wordWrap.value, run: () => { wordWrap.value = !wordWrap.value }, shortcut: 'Alt+Z' },
      { kind: 'sep' },
      { kind: 'toggle', label: 'Bottom panel', checked: panelOpen.value, run: () => { panelOpen.value = !panelOpen.value }, shortcut: 'Ctrl+P' },
    ],
  },
  {
    id: 'help', label: 'Help', items: [
      { kind: 'action', label: 'Keyboard shortcuts\u2026', run: () => { dialog.value = { kind: 'shortcuts' } }, shortcut: 'Ctrl+Shift+/' },
      { kind: 'link', label: 'Report an issue', href: props.issueUrl, disabledHint: 'No issue tracker configured' },
      { kind: 'action', label: 'About\u2026', run: () => { dialog.value = { kind: 'about' } } },
    ],
  },
])

function runItem(item: MenuItem) {
  if (item.kind === 'sep' || item.kind === 'link' || item.kind === 'zoom') return
  if (item.kind === 'action' && item.disabled) return
  item.run()
  if (item.kind === 'action') closeMenu()
}

defineExpose({ focus: () => inputEl.value?.focus(), beautify, minify: minifyText })


watch(() => props.modelValue, (value) => {
  const next = normalize(value ?? '')
  if (next === text.value) return
  text.value = next
  if (inputEl.value && inputEl.value.value !== next) inputEl.value.value = next
  undoStack.length = 0
  redoStack.length = 0
  syncSelection()
})

function onDocumentMouseDown(e: MouseEvent) {
  if (openMenuName.value && menubarEl.value && !menubarEl.value.contains(e.target as Node)) closeMenu()
}

function editorHasFocus(): boolean {
  return !!rootEl.value && !!document.activeElement && rootEl.value.contains(document.activeElement)
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)
}

function onDocumentKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (dialog.value) dialog.value = null
    else if (openMenuName.value) closeMenu()
    return
  }

  if (!editorHasFocus()) return
  const modifier = e.ctrlKey || e.metaKey
  if (!modifier || e.altKey) {
    if (e.altKey && !modifier && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      wordWrap.value = !wordWrap.value
    }
    return
  }

  if (e.shiftKey) {
    switch (e.key) {
      case 'B': case 'b':
        e.preventDefault()
        if (!props.readonly) beautify()
        return
      case 'M': case 'm':
        e.preventDefault()
        if (!props.readonly) minifyText()
        return
      case 'L': case 'l':
        e.preventDefault()
        showLineNumbers.value = !showLineNumbers.value
        return
      case '/': case '?':
        e.preventDefault()
        dialog.value = { kind: 'shortcuts' }
        return
    }
    switch (e.code) {
      case 'Equal': case 'NumpadAdd':
        e.preventDefault()
        zoomIn()
        return
      case 'Minus': case 'NumpadSubtract':
        e.preventDefault()
        zoomOut()
        return
      case 'Digit9': case 'Numpad9':
        e.preventDefault()
        zoomReset()
        return
    }
    return
  }

  switch (e.key.toLowerCase()) {
    case 's':
      e.preventDefault()
      if (!props.readonly) openSnippets('save')
      return
    case 'o':
      e.preventDefault()
      openSnippets('open')
      return
  }
}

onMounted(() => {
  uid.value = `pe-${Math.random().toString(36).slice(2, 8)}`
  document.addEventListener('selectionchange', onSelectionChange)
  document.addEventListener('mousedown', onDocumentMouseDown)
  document.addEventListener('keydown', onDocumentKeydown)
  window.addEventListener('resize', updateFloating)
  void nextTick(syncIndentGuides)
})

onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', onSelectionChange)
  document.removeEventListener('mousedown', onDocumentMouseDown)
  document.removeEventListener('keydown', onDocumentKeydown)
  window.removeEventListener('resize', updateFloating)
  clearTimeout(toastTimer)
})
</script>

<template>
  <div
    ref="rootEl"
    class="placeholder-editor"
    :class="{ 'pe-readonly': readonly, 'pe-plain': !showLineNumbers, 'pe-nowrap': !wordWrap }"
    :style="rootStyle"
  >
    <div ref="menubarEl" class="pe-menubar">
      <div class="pe-menubar-row">
        <div v-for="group in menuGroups" :key="group.id" class="pe-menu">
          <button
            type="button"
            class="pe-menu-btn"
            :class="{ 'pe-active': openMenuName === group.id }"
            :aria-expanded="openMenuName === group.id"
            aria-haspopup="menu"
            @click="toggleMenu(group.id)"
          >{{ group.label }}</button>
          <div v-if="openMenuName === group.id" class="pe-menu-dropdown" role="menu">
            <template v-for="(item, index) in group.items" :key="index">
              <div v-if="item.kind === 'sep'" class="pe-menu-sep" role="separator" />
              <div v-else-if="item.kind === 'zoom'" class="pe-menu-zoom">
                <span>Font size</span>
                <span class="pe-menu-zoom-controls">
                  <button type="button" aria-label="Zoom out" title="Ctrl+Shift+-" @click="zoomOut">−</button>
                  <span class="pe-menu-zoom-value">{{ zoomPercent }}%</span>
                  <button type="button" aria-label="Zoom in" title="Ctrl+Shift+=" @click="zoomIn">+</button>
                  <button type="button" class="pe-menu-zoom-reset" title="Ctrl+Shift+9" @click="zoomReset">Reset</button>
                </span>
              </div>
              <a
                v-else-if="item.kind === 'link'"
                class="pe-menu-item"
                :class="{ 'pe-menu-item-disabled': !item.href }"
                :href="item.href"
                :title="!item.href ? item.disabledHint : undefined"
                :target="item.href && item.external !== false ? '_blank' : undefined"
                :rel="item.href && item.external !== false ? 'noopener' : undefined"
                role="menuitem"
                @click="item.href ? closeMenu() : $event.preventDefault()"
              >
                <span class="pe-menu-check" />
                {{ item.label }}
              </a>
              <button
                v-else
                type="button"
                class="pe-menu-item"
                role="menuitem"
                :disabled="item.kind === 'action' && item.disabled"
                @click="runItem(item)"
              >
                <span class="pe-menu-check">{{ item.kind === 'toggle' && item.checked ? '✓' : '' }}</span>
                <span class="pe-menu-label">{{ item.label }}</span>
                <span v-if="item.shortcut" class="pe-menu-shortcut">{{ item.shortcut }}</span>
              </button>
            </template>
          </div>
        </div>
      </div>

      <div class="pe-menubar-mobile">
        <button
          type="button"
          class="pe-menu-btn pe-hamburger"
          :class="{ 'pe-active': openMenuName === 'mobile' }"
          aria-label="Menu"
          :aria-expanded="openMenuName === 'mobile'"
          @click="toggleMenu('mobile')"
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
        </button>
        <div v-if="openMenuName === 'mobile'" class="pe-menu-dropdown pe-menu-dropdown-mobile" role="menu">
          <template v-for="group in menuGroups" :key="group.id">
            <div class="pe-menu-group-title">{{ group.label }}</div>
            <template v-for="(item, index) in group.items" :key="index">
              <div v-if="item.kind === 'sep'" class="pe-menu-sep" role="separator" />
              <div v-else-if="item.kind === 'zoom'" class="pe-menu-zoom">
                <span>Font size</span>
                <span class="pe-menu-zoom-controls">
                  <button type="button" aria-label="Zoom out" title="Ctrl+Shift+-" @click="zoomOut">−</button>
                  <span class="pe-menu-zoom-value">{{ zoomPercent }}%</span>
                  <button type="button" aria-label="Zoom in" title="Ctrl+Shift+=" @click="zoomIn">+</button>
                  <button type="button" class="pe-menu-zoom-reset" title="Ctrl+Shift+9" @click="zoomReset">Reset</button>
                </span>
              </div>
              <a
                v-else-if="item.kind === 'link'"
                class="pe-menu-item"
                :class="{ 'pe-menu-item-disabled': !item.href }"
                :href="item.href"
                :title="!item.href ? item.disabledHint : undefined"
                :target="item.href && item.external !== false ? '_blank' : undefined"
                :rel="item.href && item.external !== false ? 'noopener' : undefined"
                role="menuitem"
                @click="item.href ? closeMenu() : $event.preventDefault()"
              >
                <span class="pe-menu-check" />
                {{ item.label }}
              </a>
              <button
                v-else
                type="button"
                class="pe-menu-item"
                role="menuitem"
                :disabled="item.kind === 'action' && item.disabled"
                @click="runItem(item)"
              >
                <span class="pe-menu-check">{{ item.kind === 'toggle' && item.checked ? '✓' : '' }}</span>
                <span class="pe-menu-label">{{ item.label }}</span>
                <span v-if="item.shortcut" class="pe-menu-shortcut">{{ item.shortcut }}</span>
              </button>
            </template>
          </template>
        </div>
      </div>
    </div>

    <div v-if="toastMessage" class="pe-toast" role="status">{{ toastMessage }}</div>

    <div ref="scrollEl" class="pe-scroll" @scroll.passive="updateFloating">
      <div class="pe-stack">
        <div ref="layerEl" class="pe-layer" aria-hidden="true" v-html="html" />
        <textarea
          ref="inputEl"
          class="pe-input"
          :value="text"
          :readonly="readonly"
          :placeholder="placeholder"
          :aria-label="ariaLabel"
          :aria-controls="popupOpen ? popupId : undefined"
          :aria-activedescendant="interactive ? optionId(active) : undefined"
          :aria-describedby="signatureOpen ? signatureId : undefined"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          spellcheck="false"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          @beforeinput="onBeforeInput"
          @input="onInput"
          @keydown="onKeydown"
          @keyup="syncSelection"
          @select="syncSelection"
          @mouseup="syncSelection"
          @focus="onFocus"
          @blur="onBlur"
        />
      </div>
    </div>

    <div v-if="popupOpen" :id="popupId" ref="popupEl" class="pe-float pe-suggest" role="listbox" :style="floatStyle" @mousedown.prevent>
      <div class="pe-options">
        <div
          v-for="(suggestion, index) in suggestions.suggestions"
          :id="optionId(index)"
          :key="suggestion.name"
          class="pe-option"
          :class="{ 'pe-active': interactive && index === active, 'pe-hint': suggestion.hint }"
          role="option"
          :aria-selected="interactive && index === active"
          :aria-disabled="suggestion.hint ? 'true' : undefined"
          @mousemove="suggestion.hint ? undefined : hover(index)"
          @click="acceptSuggestion(index)"
        >
          <span class="pe-option-name">{{ suggestion.name }}<span v-if="suggestion.isFunction" class="pe-option-call">(…)</span></span>
          <span v-if="suggestion.returns" class="pe-returns">{{ suggestion.returns }}</span>
        </div>
      </div>
      <div v-if="detail" class="pe-detail">
        <code v-if="detail.signature" class="pe-detail-signature">{{ detail.signature }}</code>
        <span v-if="detail.description">{{ detail.description }}</span>
      </div>
    </div>

    <div v-else-if="signatureOpen && signature" :id="signatureId" ref="signatureEl" class="pe-float pe-signature" role="tooltip" :style="floatStyle">
      <div class="pe-signature-line">
        <span>{{ signature.name }}.(</span>
        <template v-for="(param, index) in signature.params" :key="index">
          <span v-if="index > 0">, </span>
          <span :class="{ 'pe-param-active': index === signature.active }">{{ formatParam(param) }}</span>
        </template>
        <span>)</span><span v-if="signature.node.returns" class="pe-returns">: {{ signature.node.returns }}</span>
      </div>
      <div v-if="signature.node.description" class="pe-detail">{{ signature.node.description }}</div>
    </div>

    <div v-if="panelOpen" class="pe-panel">
      <div class="pe-panel-content">
        <ul v-if="activePanelTab === 'problems' && problems.length > 0" class="pe-problems" role="list">
          <li v-for="(problem, index) in problems" :key="index" class="pe-problem" @click="jumpToProblem(problem)">
            <svg class="pe-problem-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M8 4.5v4.5M8 11.25v.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
            <span class="pe-problem-message">{{ problem.message }}</span>
            <span class="pe-problem-pos">Ln {{ problem.line }}, Col {{ problem.column }}</span>
          </li>
        </ul>
        <div v-else-if="activePanelTab === 'problems'" class="pe-panel-empty">No problems have been detected.</div>
      </div>

      <div class="pe-panel-tabs">
        <button
          type="button"
          class="pe-panel-tab"
          :class="{ 'pe-active': activePanelTab === 'problems' }"
          @click="activePanelTab = 'problems'"
        >
          Problems
          <span v-if="problems.length > 0" class="pe-panel-tab-count">{{ problems.length }}</span>
        </button>
        <button type="button" class="pe-panel-close" aria-label="Close panel" title="Close panel (Ctrl+P)" @click="panelOpen = false">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
        </button>
      </div>
    </div>

    <div class="pe-bar">
      <span class="pe-tip pe-tip-left">
        <span
          class="pe-status"
          :class="{ 'pe-bad': problems.length > 0 }"
          tabindex="0"
          role="button"
          :aria-describedby="problems.length > 0 ? statusTipId : undefined"
        >{{ status }}</span>
        <span v-if="problems.length > 0" :id="statusTipId" class="pe-tip-bubble pe-tip-card" role="tooltip">
          <span
            v-for="(problem, index) in problems.slice(0, 8)"
            :key="index"
            class="pe-tip-problem"
            @click="jumpToProblem(problem)"
          >
            <span class="pe-tip-problem-message">{{ problem.message }}</span>
            <span class="pe-tip-problem-pos">Ln {{ problem.line }}, Col {{ problem.column }}</span>
          </span>
          <span v-if="problems.length > 8" class="pe-tip-more">+{{ problems.length - 8 }} more - open with Ctrl+P</span>
        </span>
      </span>
      <span class="pe-position">Ln {{ position.line }}, Col {{ position.column }}</span>
      <span v-if="usingDefault && schemaVersion" class="pe-tip">
        <span class="pe-position" tabindex="0" :aria-describedby="versionTipId">v{{ schemaVersion }}</span>
        <span :id="versionTipId" class="pe-tip-bubble" role="tooltip">Version of the placeholders it checks against</span>
      </span>

      <span class="pe-actions">
        <span class="pe-tip">
          <button type="button" class="pe-btn" aria-label="Minify" :aria-describedby="minifyTipId" :disabled="readonly" @click="minifyText">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 4.5h10M3 8h10M3 11.5h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none" /></svg>
          </button>
          <span :id="minifyTipId" class="pe-tip-bubble" role="tooltip">Minify</span>
        </span>
        <span class="pe-tip">
          <button type="button" class="pe-btn" aria-label="Beautify" :aria-describedby="beautifyTipId" :disabled="readonly" @click="beautify">
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3 3.5h10M6 7h7M6 10.5h7M3 14h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none" /></svg>
          </button>
          <span :id="beautifyTipId" class="pe-tip-bubble" role="tooltip">Beautify</span>
        </span>

        <button type="button" class="pe-btn" aria-label="Keyboard shortcuts" @click="dialog = { kind: 'shortcuts' }">
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" stroke="currentColor" stroke-width="1.5" fill="none" /><path d="M6.2 6.3a1.9 1.9 0 1 1 2.6 1.75c-.5.25-.8.6-.8 1.2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none" /><circle cx="8" cy="11.4" r=".85" fill="currentColor" /></svg>
        </button>
      </span>
    </div>

    <Teleport to="body">
    <div v-if="dialog" class="pe-modal-backdrop" @mousedown.self="closeDialog">
      <div v-if="dialog.kind === 'snippets'" class="pe-modal" role="dialog" aria-modal="true" :aria-label="dialog.mode === 'save' ? 'Save snippet' : dialog.mode === 'manage' ? 'Manage snippets' : 'Open snippet'">
        <div class="pe-modal-header">
          <h2>{{ dialog.mode === 'save' ? 'Save snippet' : dialog.mode === 'manage' ? 'Manage snippets' : 'Open snippet' }}</h2>
          <button type="button" class="pe-modal-close" aria-label="Close" @click="closeDialog">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
          </button>
        </div>

        <div v-if="dialog.mode === 'save'" class="pe-modal-save-row">
          <input v-model="saveName" type="text" class="pe-modal-input" placeholder="Snippet name" @keydown.enter="saveAsNew" />
          <button type="button" class="pe-modal-primary" :disabled="!saveName.trim()" @click="saveAsNew">Save as new</button>
        </div>

        <ul v-if="snippets.length > 0" class="pe-modal-list">
          <li v-for="snippet in snippets" :key="snippet.id" class="pe-modal-row">
            <input
              v-if="renamingId === snippet.id"
              v-model="renameValue"
              class="pe-modal-rename-input"
              @keydown.enter="commitRename(snippet)"
              @keydown.esc.stop="renamingId = null"
              @vue:mounted="(vnode: any) => (vnode.el as HTMLInputElement).focus()"
              @blur="commitRename(snippet)"
            />
            <button v-else type="button" class="pe-modal-row-main" @click="snippetRowClick(snippet)">
              <span class="pe-modal-row-name">{{ snippet.name }}</span>
              <span class="pe-modal-row-date">{{ new Date(snippet.updatedAt).toLocaleDateString() }}</span>
            </button>
            <button type="button" class="pe-modal-icon-btn" aria-label="Rename" title="Rename" @click="startRename(snippet)">
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M11 2.5l2.5 2.5L5 13.5H2.5V11z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" /></svg>
            </button>
            <button type="button" class="pe-modal-icon-btn pe-modal-icon-danger" aria-label="Delete" title="Delete" @click="deleteSnippet(snippet)">
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3.5 4.5h9M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M6 7.5v4M10 7.5v4M4.5 4.5l.6 8a1 1 0 0 0 1 .95h3.8a1 1 0 0 0 1-.95l.6-8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
          </li>
        </ul>
        <p v-else class="pe-modal-empty">No saved snippets yet.</p>
      </div>

      <div v-else-if="dialog.kind === 'shortcuts'" class="pe-modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
        <div class="pe-modal-header">
          <h2>Keyboard shortcuts</h2>
          <button type="button" class="pe-modal-close" aria-label="Close" @click="closeDialog">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
          </button>
        </div>
        <div class="pe-modal-body">
          <span class="pe-row"><span class="pe-keys"><kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd></span><span>Indent / un-indent lines</span></span>
          <span class="pe-row"><span class="pe-keys"><kbd>Enter</kbd></span><span>New line, keeps the indentation</span></span>
          <span class="pe-row"><span class="pe-keys"><kbd>Backspace</kbd></span><span>In an empty pair, removes both</span></span>
          <span class="pe-row"><span class="pe-keys"><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Y</kbd></span><span>Undo / redo</span></span>
          <span class="pe-row"><span class="pe-keys"><kbd>Ctrl</kbd>+<kbd>X</kbd> / <kbd>C</kbd> / <kbd>V</kbd></span><span>Cut / copy / paste the selection</span></span>
          <span class="pe-row"><span class="pe-keys"><kbd>Ctrl</kbd>+<kbd>A</kbd></span><span>Select all</span></span>
          <span class="pe-row"><span class="pe-keys"><kbd>Esc</kbd>, <kbd>Tab</kbd></span><span>Leave the editor</span></span>

          <span class="pe-shortcuts-title">File</span>
          <span class="pe-row"><span class="pe-keys"><kbd>Ctrl</kbd>+<kbd>S</kbd></span><span>Save…</span></span>
          <span class="pe-row"><span class="pe-keys"><kbd>Ctrl</kbd>+<kbd>O</kbd></span><span>Open…</span></span>

          <span class="pe-shortcuts-title">View</span>
          <span class="pe-row"><span class="pe-keys"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd></span><span>Beautify</span></span>
          <span class="pe-row"><span class="pe-keys"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd></span><span>Minify</span></span>
          <span class="pe-row"><span class="pe-keys"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd></span><span>Toggle line numbers</span></span>
          <span class="pe-row"><span class="pe-keys"><kbd>Alt</kbd>+<kbd>Z</kbd></span><span>Toggle word wrap</span></span>
          <span class="pe-row"><span class="pe-keys"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>+</kbd> / <kbd>-</kbd> / <kbd>9</kbd></span><span>Zoom in / out / reset</span></span>
          <span class="pe-row"><span class="pe-keys"><kbd>Ctrl</kbd>+<kbd>P</kbd></span><span>Toggle the Problems panel</span></span>

          <span class="pe-shortcuts-title">Suggestions</span>
          <span class="pe-row"><span class="pe-keys"><kbd>↑</kbd> <kbd>↓</kbd></span><span>Choose</span></span>
          <span class="pe-row"><span class="pe-keys"><kbd>Tab</kbd> or click</span><span>Accept; functions get <code>.()</code></span></span>
          <span class="pe-row"><span class="pe-keys"><kbd>Esc</kbd></span><span>Close</span></span>
          <span class="pe-row"><span class="pe-keys"><kbd>Ctrl</kbd>+<kbd>Space</kbd></span><span>Show again</span></span>

          <span class="pe-shortcuts-title">Help</span>
          <span class="pe-row"><span class="pe-keys"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>/</kbd></span><span>Open this dialog</span></span>
        </div>
      </div>

      <div v-else-if="dialog.kind === 'about'" class="pe-modal" role="dialog" aria-modal="true" aria-label="About">
        <div class="pe-modal-header">
          <h2>About</h2>
          <button type="button" class="pe-modal-close" aria-label="Close" @click="closeDialog">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
          </button>
        </div>
        <div class="pe-modal-body pe-modal-about">
          <p>An editor for FishOnMC-Extras placeholders.</p>
          <p v-if="usingDefault && schemaVersion">Checking against placeholder schema v{{ schemaVersion }}.</p>
          <p v-if="repoUrl"><a :href="repoUrl" target="_blank" rel="noopener">View source</a></p>
        </div>
      </div>
    </div>
    </Teleport>
  </div>
</template>

<style>
.placeholder-editor {
  --pe-d0: #b45309; --pe-d1: #a16207; --pe-d2: #4d7c0f; --pe-d3: #15803d; --pe-d4: #0f766e;
  --pe-d5: #0e7490; --pe-d6: #1d4ed8; --pe-d7: #4338ca; --pe-d8: #7e22ce; --pe-d9: #be185d;
  --pe-string: #166534;
  --pe-operator: #6b7280;
  --pe-invalid: #dc2626;
  --pe-selection: rgba(60, 100, 220, 0.22);
  --pe-match: rgba(128, 128, 128, 0.28);

  --pe-fg: var(--vp-c-text-1, #213547);
  --pe-dim: var(--vp-c-text-2, #5f6b7a);
  --pe-faint: var(--vp-c-text-3, #8a94a6);
  --pe-border: var(--vp-c-divider, #e2e2e3);
  --pe-bg: var(--vp-code-block-bg, #f6f6f7);
  --pe-lh: 1.7;
  --pe-gutter: calc(var(--pe-digits, 1) * 1ch + 32px);

  position: relative;
  margin: 16px 0;
  background: var(--pe-bg);
  color: var(--pe-fg);
  font-family: var(--vp-font-family-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace);
  font-size: calc(var(--vp-code-font-size, 0.875em) * var(--pe-zoom, 1));
  line-height: var(--pe-lh);
}

.dark .placeholder-editor {
  --pe-d0: #ffa726; --pe-d1: #ffc107; --pe-d2: #b8d83e; --pe-d3: #4fcb5a; --pe-d4: #20c9a6;
  --pe-d5: #29bbd6; --pe-d6: #4295f4; --pe-d7: #6c6fef; --pe-d8: #a45be3; --pe-d9: #e65a9e;
  --pe-string: #7fff7f;
  --pe-operator: #aaaaaa;
  --pe-invalid: #ff5555;
  --pe-selection: rgba(120, 160, 255, 0.3);
  --pe-match: rgba(200, 200, 200, 0.26);
}

.placeholder-editor .pe-scroll {
  max-height: var(--pe-max-height, 28rem);
  overflow: auto;
}

.placeholder-editor .pe-stack {
  position: relative;
  display: grid;
  min-height: max(100%, calc(var(--pe-min-lines, 4) * var(--pe-lh) * 1em + 24px));
}

.placeholder-editor .pe-stack::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: calc(var(--pe-gutter) - 8px);
  width: 1px;
  background: var(--pe-border);
}

.placeholder-editor.pe-plain .pe-stack::before { display: none; }

.placeholder-editor .pe-layer,
.placeholder-editor .pe-input {
  grid-area: 1 / 1;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 12px 16px 12px var(--pe-gutter);
  border: 0;
  border-radius: 0;
  font: inherit;
  letter-spacing: inherit;
  tab-size: 2;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: normal;
}

.placeholder-editor.pe-nowrap .pe-layer,
.placeholder-editor.pe-nowrap .pe-input { white-space: pre; overflow-wrap: normal; }

.placeholder-editor.pe-plain .pe-layer,
.placeholder-editor.pe-plain .pe-input { padding-left: 16px; }

.placeholder-editor .pe-layer {
  counter-reset: pe-line;
  pointer-events: none;
  user-select: none;
}

.placeholder-editor .pe-input {
  overflow: hidden;
  resize: none;
  outline: none;
  background: transparent;
  color: transparent;
  -webkit-text-fill-color: transparent;
  caret-color: var(--pe-fg);
}

.placeholder-editor .pe-input::selection { background: var(--pe-selection); color: transparent; }
.placeholder-editor .pe-input::placeholder { color: var(--pe-faint); -webkit-text-fill-color: var(--pe-faint); }
.placeholder-editor.pe-readonly .pe-input { cursor: default; }

.placeholder-editor .pe-line { position: relative; }

.placeholder-editor:not(.pe-plain) .pe-line::before {
  counter-increment: pe-line;
  content: counter(pe-line);
  position: absolute;
  left: calc(var(--pe-gutter) * -1);
  width: calc(var(--pe-gutter) - 16px);
  text-align: right;
  color: var(--pe-faint);
}

.placeholder-editor:not(.pe-plain) .pe-line.pe-current::before { color: var(--pe-fg); }

.placeholder-editor .pe-guide {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--pe-border);
  opacity: 0.6;
  pointer-events: none;
}

.placeholder-editor .pe-line.pe-current .pe-guide { opacity: 1; }

.placeholder-editor .pe-d0 { color: var(--pe-d0); }
.placeholder-editor .pe-d1 { color: var(--pe-d1); }
.placeholder-editor .pe-d2 { color: var(--pe-d2); }
.placeholder-editor .pe-d3 { color: var(--pe-d3); }
.placeholder-editor .pe-d4 { color: var(--pe-d4); }
.placeholder-editor .pe-d5 { color: var(--pe-d5); }
.placeholder-editor .pe-d6 { color: var(--pe-d6); }
.placeholder-editor .pe-d7 { color: var(--pe-d7); }
.placeholder-editor .pe-d8 { color: var(--pe-d8); }
.placeholder-editor .pe-d9 { color: var(--pe-d9); }
.placeholder-editor .pe-number { color: var(--pe-fg); }
.placeholder-editor .pe-string { color: var(--pe-string); }
.placeholder-editor .pe-operator { color: var(--pe-operator); }
.placeholder-editor .pe-invalid { color: var(--pe-invalid); }

.placeholder-editor .pe-err {
  text-decoration: underline wavy var(--pe-invalid);
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.placeholder-editor .pe-bracket {
  background: var(--pe-match);
  outline: 1px solid currentColor;
  outline-offset: -1px;
  border-radius: 2px;
}

.placeholder-editor .pe-bracket-bad {
  background: color-mix(in srgb, var(--pe-invalid) 28%, transparent);
  border-radius: 2px;
}

.placeholder-editor .pe-float {
  position: absolute;
  z-index: 20;
  min-width: 16rem;
  max-width: min(34rem, calc(100% - 8px));
  border: 1px solid var(--pe-border);
  border-radius: 8px;
  background: var(--vp-c-bg-elv, var(--vp-c-bg, #fff));
  box-shadow: var(--vp-shadow-3, 0 8px 24px rgba(0, 0, 0, 0.14));
}

.placeholder-editor .pe-suggest { padding: 4px 0 0; }

.placeholder-editor .pe-options {
  max-height: 12rem;
  overflow-y: auto;
  padding: 0 4px 4px;
}

.placeholder-editor .pe-option {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding: 1px 8px;
  border-radius: 4px;
  cursor: pointer;
  white-space: nowrap;
}

.placeholder-editor .pe-option.pe-active { background: var(--vp-c-brand-soft, rgba(100, 108, 255, 0.14)); }
.placeholder-editor .pe-option.pe-hint { color: var(--pe-faint); cursor: default; font-style: italic; }
.placeholder-editor .pe-option-call { color: var(--pe-faint); }
.placeholder-editor .pe-returns { color: var(--pe-faint); font-size: 0.9em; }

.placeholder-editor .pe-detail {
  display: grid;
  gap: 2px;
  padding: 6px 12px 7px;
  border-top: 1px solid var(--pe-border);
  color: var(--pe-dim);
  font-family: var(--vp-font-family-base, system-ui, sans-serif);
  font-size: 12.5px;
  line-height: 1.45;
  white-space: normal;
}

.placeholder-editor .pe-detail-signature {
  color: var(--pe-fg);
  font-family: var(--vp-font-family-mono, ui-monospace, monospace);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.placeholder-editor .pe-signature { padding: 0; }
.placeholder-editor .pe-signature-line { padding: 4px 12px; white-space: normal; overflow-wrap: anywhere; }
.placeholder-editor .pe-signature .pe-detail { margin-top: 0; }
.placeholder-editor .pe-param-active { color: var(--vp-c-brand-1, #3451b2); font-weight: 700; }

.placeholder-editor .pe-panel {
  display: flex;
  flex-direction: column;
  height: 9.5rem;
  border-top: 1px solid var(--pe-border);
  background: var(--pe-bg);
}

.placeholder-editor .pe-panel-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.placeholder-editor .pe-panel-empty {
  padding: 10px 14px;
  color: var(--pe-faint);
  font-family: var(--vp-font-family-base, system-ui, sans-serif);
  font-size: 12.5px;
}

.placeholder-editor .pe-problems { margin: 0; padding: 2px 0; list-style: none; }

.placeholder-editor .pe-problem {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 14px;
  color: var(--pe-fg);
  font-family: var(--vp-font-family-base, system-ui, sans-serif);
  font-size: 12.5px;
  line-height: 1.5;
  cursor: pointer;
  white-space: nowrap;
}

.placeholder-editor .pe-problem:hover { background: var(--vp-c-default-soft, rgba(142, 150, 170, 0.14)); }
.placeholder-editor .pe-problem-icon { flex: none; color: var(--pe-invalid); }

.placeholder-editor .pe-problem-message {
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--vp-font-family-mono, ui-monospace, monospace);
}

.placeholder-editor .pe-problem-pos { flex: none; margin-left: auto; color: var(--pe-faint); }

.placeholder-editor .pe-panel-tabs {
  display: flex;
  align-items: stretch;
  flex: none;
  border-top: 1px solid var(--pe-border);
}

.placeholder-editor .pe-panel-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px;
  height: 30px;
  border: 0;
  border-top: 2px solid transparent;
  background: transparent;
  color: var(--pe-dim);
  font-family: var(--vp-font-family-base, system-ui, sans-serif);
  font-size: 12.5px;
  cursor: pointer;
}

.placeholder-editor .pe-panel-tab.pe-active { border-top-color: var(--vp-c-brand-1, #3451b2); color: var(--pe-fg); font-weight: 600; }

.placeholder-editor .pe-panel-tab-count {
  padding: 0 5px;
  border-radius: 8px;
  background: var(--vp-c-default-soft, rgba(142, 150, 170, 0.2));
  color: var(--pe-dim);
  font-size: 11px;
  line-height: 16px;
}

.placeholder-editor .pe-panel-close {
  display: grid;
  place-items: center;
  width: 30px;
  margin-left: auto;
  border: 0;
  background: transparent;
  color: var(--pe-dim);
  cursor: pointer;
}

.placeholder-editor .pe-panel-close:hover { color: var(--pe-fg); }

.placeholder-editor .pe-menubar {
  position: relative;
  z-index: 15;
  display: flex;
  align-items: stretch;
  min-height: 32px;
  border-bottom: 1px solid var(--pe-border);
  border-radius: 7px 7px 0 0;
  background: var(--pe-bg);
  font-family: var(--vp-font-family-base, system-ui, sans-serif);
  font-size: 12.5px;
}

.placeholder-editor .pe-menubar-row { display: flex; }
.placeholder-editor .pe-menu { position: relative; }

.placeholder-editor .pe-menu-btn {
  height: 32px;
  padding: 0 12px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--pe-dim);
  cursor: pointer;
}

.placeholder-editor .pe-menu-btn:hover,
.placeholder-editor .pe-menu-btn.pe-active { background: var(--vp-c-default-soft, rgba(142, 150, 170, 0.14)); color: var(--pe-fg); }

.placeholder-editor .pe-menu-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 25;
  display: flex;
  flex-direction: column;
  min-width: 13rem;
  padding: 4px;
  border: 1px solid var(--pe-border);
  border-radius: 8px;
  background: var(--vp-c-bg-elv, var(--vp-c-bg, #fff));
  box-shadow: var(--vp-shadow-3, 0 8px 24px rgba(0, 0, 0, 0.14));
}

.placeholder-editor .pe-menu-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--pe-fg);
  font: inherit;
  text-align: left;
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
}

.placeholder-editor .pe-menu-item:hover:not(:disabled) { background: var(--vp-c-default-soft, rgba(142, 150, 170, 0.14)); }
.placeholder-editor .pe-menu-item:disabled,
.placeholder-editor .pe-menu-item-disabled { color: var(--pe-faint); cursor: not-allowed; }
.placeholder-editor .pe-menu-check { display: inline-block; width: 1em; flex: none; color: var(--vp-c-brand-1, #3451b2); }
.placeholder-editor .pe-menu-label { flex: 1; }
.placeholder-editor .pe-menu-shortcut { flex: none; margin-left: 12px; color: var(--pe-faint); font-size: 11px; }
.placeholder-editor .pe-menu-sep { height: 1px; margin: 4px 6px; background: var(--pe-border); }

.placeholder-editor .pe-menu-zoom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 10px;
  color: var(--pe-fg);
}

.placeholder-editor .pe-menu-zoom-controls { display: flex; align-items: center; gap: 4px; }

.placeholder-editor .pe-menu-zoom-controls button:not(.pe-menu-zoom-reset) {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--pe-border);
  border-radius: 4px;
  background: var(--pe-bg);
  color: var(--pe-fg);
  cursor: pointer;
  line-height: 1;
}

.placeholder-editor .pe-menu-zoom-value { min-width: 3ch; text-align: center; color: var(--pe-dim); }
.placeholder-editor .pe-menu-zoom-reset {
  margin-left: 4px;
  padding: 2px 6px;
  border: 1px solid var(--pe-border);
  border-radius: 4px;
  background: var(--pe-bg);
  color: var(--pe-dim);
  cursor: pointer;
  font-size: 11px;
}

.placeholder-editor .pe-menubar-mobile { display: none; position: relative; margin-left: auto; }

.placeholder-editor .pe-hamburger {
  display: grid;
  place-items: center;
  width: 36px;
}

.placeholder-editor .pe-menu-dropdown-mobile {
  right: 0;
  left: auto;
  max-height: 70vh;
  overflow-y: auto;
}

.placeholder-editor .pe-menu-group-title {
  margin: 6px 8px 2px;
  color: var(--pe-faint);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.placeholder-editor .pe-menu-group-title:first-child { margin-top: 2px; }

@media (max-width: 560px) {
  .placeholder-editor .pe-menubar-row { display: none; }
  .placeholder-editor .pe-menubar-mobile { display: block; }
}

.placeholder-editor .pe-toast {
  position: absolute;
  top: 40px;
  left: 50%;
  z-index: 22;
  transform: translateX(-50%);
  padding: 5px 12px;
  border-radius: 6px;
  background: var(--pe-fg);
  box-shadow: var(--vp-shadow-2, 0 4px 12px rgba(0, 0, 0, 0.16));
  color: var(--pe-bg);
  font-family: var(--vp-font-family-base, system-ui, sans-serif);
  font-size: 12.5px;
  white-space: nowrap;
}

.placeholder-editor-modal-backdrop,
.pe-modal-backdrop {
  --pe-fg: var(--vp-c-text-1, #213547);
  --pe-dim: var(--vp-c-text-2, #5f6b7a);
  --pe-faint: var(--vp-c-text-3, #8a94a6);
  --pe-border: var(--vp-c-divider, #e2e2e3);
  --pe-bg: var(--vp-code-block-bg, #f6f6f7);
  --pe-invalid: #dc2626;

  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.45);
}

.dark .pe-modal-backdrop {
  --pe-invalid: #ff5555;
}

.pe-modal {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 26rem;
  max-height: 80vh;
  border: 1px solid var(--pe-border);
  border-radius: 10px;
  background: var(--vp-c-bg-elv, var(--vp-c-bg, #fff));
  box-shadow: var(--vp-shadow-4, 0 12px 32px rgba(0, 0, 0, 0.25));
  color: var(--pe-fg);
  font-family: var(--vp-font-family-base, system-ui, sans-serif);
}

.pe-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--pe-border);
}

.pe-modal-header h2 { margin: 0; font-size: 14px; font-weight: 600; }

.pe-modal-close {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--pe-dim);
  cursor: pointer;
}

.pe-modal-close:hover { background: var(--vp-c-default-soft, rgba(142, 150, 170, 0.14)); color: var(--pe-fg); }

.pe-modal-body {
  display: grid;
  gap: 2px;
  padding: 12px 14px;
  overflow-y: auto;
  font-size: 12.5px;
}

.pe-modal-about p { margin: 0 0 8px; line-height: 1.5; }
.pe-modal-about p:last-child { margin-bottom: 0; }

.pe-modal-save-row { display: flex; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--pe-border); }

.pe-modal-input {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid var(--pe-border);
  border-radius: 6px;
  background: var(--pe-bg);
  color: var(--pe-fg);
  font: inherit;
}

.pe-modal-primary {
  padding: 6px 12px;
  border: 0;
  border-radius: 6px;
  background: var(--vp-c-brand-1, #3451b2);
  color: #fff;
  font: inherit;
  cursor: pointer;
}

.pe-modal-primary:disabled { opacity: 0.5; cursor: not-allowed; }

.pe-modal-list { margin: 0; padding: 6px; overflow-y: auto; list-style: none; }

.pe-modal-row { display: flex; align-items: center; gap: 2px; padding: 1px 0; }

.pe-modal-row-main {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--pe-fg);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.pe-modal-row-main:hover { background: var(--vp-c-default-soft, rgba(142, 150, 170, 0.14)); }
.pe-modal-row-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pe-modal-row-date { flex: none; color: var(--pe-faint); font-size: 11.5px; }

.pe-modal-rename-input {
  flex: 1;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid var(--vp-c-brand-1, #3451b2);
  border-radius: 6px;
  background: var(--pe-bg);
  color: var(--pe-fg);
  font: inherit;
}

.pe-modal-icon-btn {
  display: grid;
  flex: none;
  place-items: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--pe-dim);
  cursor: pointer;
}

.pe-modal-icon-btn:hover { background: var(--vp-c-default-soft, rgba(142, 150, 170, 0.14)); color: var(--pe-fg); }
.pe-modal-icon-btn.pe-modal-icon-danger:hover { color: var(--pe-invalid); }
.pe-modal-empty { margin: 0; padding: 16px 14px; color: var(--pe-faint); font-size: 12.5px; }

.placeholder-editor .pe-bar {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 36px;
  padding: 2px 6px 2px 16px;
  border-top: 1px solid var(--pe-border);
  color: var(--pe-dim);
  font-family: var(--vp-font-family-base, system-ui, sans-serif);
  font-size: 12px;
  line-height: 1.4;
}

.placeholder-editor .pe-bad { color: var(--pe-invalid); }
.placeholder-editor .pe-position { color: var(--pe-faint); }
.placeholder-editor .pe-actions { display: flex; align-items: center; gap: 2px; margin-left: auto; }

.placeholder-editor .pe-btn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--pe-dim);
  cursor: pointer;
}

.placeholder-editor .pe-btn:hover:not(:disabled) { background: var(--vp-c-default-soft, rgba(142, 150, 170, 0.14)); color: var(--pe-fg); }
.placeholder-editor .pe-btn:focus-visible { outline: 2px solid var(--vp-c-brand-1, #3451b2); outline-offset: 1px; }
.placeholder-editor .pe-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.placeholder-editor .pe-tip { position: relative; display: inline-flex; }

.placeholder-editor .pe-tip-bubble {
  position: absolute;
  bottom: calc(100% + 7px);
  left: 50%;
  z-index: 30;
  display: none;
  transform: translateX(-50%);
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--pe-fg);
  box-shadow: var(--vp-shadow-2, 0 4px 12px rgba(0, 0, 0, 0.16));
  color: var(--pe-bg);
  font-family: var(--vp-font-family-base, system-ui, sans-serif);
  font-size: 11.5px;
  line-height: 1.4;
  white-space: nowrap;
}

.placeholder-editor .pe-tip-bubble::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  border: 4px solid transparent;
  border-top-color: var(--pe-fg);
  transform: translateX(-50%);
}

.placeholder-editor .pe-tip:hover .pe-tip-bubble,
.placeholder-editor .pe-tip:focus-within .pe-tip-bubble { display: block; }

.placeholder-editor .pe-tip-left .pe-tip-bubble { left: 0; transform: none; white-space: normal; }
.placeholder-editor .pe-tip-left .pe-tip-bubble::after { left: 14px; transform: none; }

.placeholder-editor .pe-tip-card {
  min-width: 16rem;
  max-width: min(26rem, calc(100vw - 32px));
  padding: 6px;
  background: var(--vp-c-bg-elv, var(--vp-c-bg, #fff));
  color: var(--pe-fg);
  white-space: normal;
}

.placeholder-editor .pe-tip-card::after { border-top-color: var(--vp-c-bg-elv, var(--vp-c-bg, #fff)); }

.placeholder-editor .pe-tip-problem {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 3px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.placeholder-editor .pe-tip-problem:hover { background: var(--vp-c-default-soft, rgba(142, 150, 170, 0.14)); }
.placeholder-editor .pe-tip-problem-message { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--vp-font-family-mono, ui-monospace, monospace); }
.placeholder-editor .pe-tip-problem-pos { flex: none; color: var(--pe-faint); }
.placeholder-editor .pe-tip-more { display: block; padding: 3px 6px; color: var(--pe-faint); font-size: 11.5px; }

.placeholder-editor .pe-status { cursor: default; }
.placeholder-editor .pe-status:focus-visible,
.placeholder-editor .pe-position:focus-visible { outline: 2px solid var(--vp-c-brand-1, #3451b2); outline-offset: 2px; border-radius: 3px; }

.pe-modal .pe-shortcuts-title { display: block; margin: 0 0 4px; font-weight: 600; }
.pe-modal .pe-shortcuts-title:not(:first-child) { margin-top: 10px; }

.pe-modal .pe-row {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 2px 0;
  color: var(--pe-dim);
}

.pe-modal .pe-keys { display: inline-flex; align-items: center; flex-wrap: wrap; gap: 2px; white-space: nowrap; }
.pe-modal .pe-row > span:last-child { text-align: right; }

.pe-modal kbd {
  padding: 0 4px;
  border: 1px solid var(--pe-border);
  border-radius: 4px;
  background: var(--pe-bg);
  color: var(--pe-fg);
  font-family: var(--vp-font-family-mono, ui-monospace, monospace);
  font-size: 11.5px;
}

.pe-modal .pe-row code {
  padding: 0 3px;
  border-radius: 3px;
  background: var(--pe-bg);
  font-size: 11.5px;
}

@media (max-width: 520px) {
  .placeholder-editor .pe-position { display: none; }
}
</style>