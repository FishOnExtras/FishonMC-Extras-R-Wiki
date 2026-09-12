<script setup lang="ts">
import { useRoute } from 'vitepress'
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import fuzzysort from 'fuzzysort'
import versionsFile from '../../../../data/versions.json'

interface VersionEntry {
  version: string
  display: string
}

interface SchemaParam {
  name: string
  type: string
}

interface SchemaNode {
  signature?: string
  returns?: string
  description?: string
  params?: SchemaParam[]
}

type SchemaTree = {
  [key: string]: SchemaTree | SchemaNode
}

type PlaceholderList = Record<string, string[]>

interface Entry {
  cat: string
  ep: string
  display: string
  description: string
  link: string
  searchText: string
}

const versions: VersionEntry[] = versionsFile.versions

const route = useRoute()
var currentVersion = route.data.params.ver;

const listModules = import.meta.glob<{ default: PlaceholderList }>(
  '../../../../data/placeholder-list-*.json',
  { eager: true }
)
const schemaModules = import.meta.glob<{ default: SchemaTree }>(
  '../../../../data/placeholder-schema-*.json',
  { eager: true }
)

function extractVersion(path: string): string | null {
  const match = path.match(/-(\d+\.\d+\.\d+)\.json$/)
  return match ? match[1] : null
}

function resolveSchema(root: SchemaTree, ep: string): SchemaNode | undefined {
  const segments = ep.split('.').filter((seg) => seg !== '()')
  let node: SchemaTree | SchemaNode = root
  for (const seg of segments) {
    if (node == null) return undefined
    node = (node as SchemaTree)[seg] as SchemaTree | SchemaNode
  }
  return node as SchemaNode | undefined
}

const entriesByVersion: Record<string, Entry[]> = {}

for (const [path, mod] of Object.entries(listModules)) {
  const ver = extractVersion(path)
  if (!ver) continue

  const list = mod.default
  const schemaPath = Object.keys(schemaModules).find((p) => p.includes(`-${ver}.json`))
  const schema: SchemaTree = schemaPath ? schemaModules[schemaPath].default : {}

  const entries: Entry[] = []
  for (const [cat, endpoints] of Object.entries(list)) {
    for (const ep of endpoints) {
      const display = ep.replace(/</g, '[').replace(/>/g, ']')
      const node = resolveSchema(schema, ep) ?? {}
      entries.push({
        cat,
        ep,
        display,
        description: node.description ?? '',
        link: `/FishonMC-Extras-R-Wiki/${ver}/placeholder/${cat}/${display}/`,
        searchText: `${cat} ${display} ${node.description ?? ''}`
      })
    }
  }
  entriesByVersion[ver] = entries
}

const selectedVersion = ref<string>(versions[0].version)
const selectedDisplay = computed(
  () => versions.find((v) => v.version === selectedVersion.value)?.display ?? selectedVersion.value
)
const query = ref('')
const isSearchOpen = ref(false)
const isVersionOpen = ref(false)
const containerRef = ref<HTMLElement | null>(null)

const results = computed<Entry[]>(() => {
  const q = query.value.trim()
  if (!q) return []

  const entries = entriesByVersion[selectedVersion.value] ?? []

  return fuzzysort
    .go(q, entries, {
      key: 'searchText',
      limit: 15,
      threshold: 0
    })
    .map((r) => r.obj)
})

function selectVersion(v: string) {
  selectedVersion.value = v
  isVersionOpen.value = false
}

function handleClickOutside(e: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    isSearchOpen.value = false
    isVersionOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))

onBeforeUnmount(() => document.removeEventListener('click', handleClickOutside))

watch(
  () => route.path,
  (newPath, oldPath) => {
    currentVersion = route.data.params.ver
    selectVersion(currentVersion)
  }
)
</script>

<template>
  <div class="nav-search" ref="containerRef">
    <div class="version-dropdown">
      <button
        type="button"
        class="version-trigger"
        :aria-expanded="isVersionOpen"
        @click="isVersionOpen = !isVersionOpen"
      >
        <span>{{ selectedDisplay }}</span>
        <svg class="chevron" :class="{ open: isVersionOpen }" width="12" height="12" viewBox="0 0 24 24">
          <path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      <Transition name="flyout">
        <div v-if="isVersionOpen" class="version-menu">
          <button
            v-for="v in versions"
            :key="v.version"
            class="version-option"
            :class="{ active: v.version === selectedVersion }"
            @click="selectVersion(v.version)"
          >
            {{ v.display }}
          </button>
        </div>
      </Transition>
    </div>

    <input
      v-model="query"
      type="text"
      placeholder="Search placeholders..."
      class="search-input"
      @focus="isSearchOpen = true"
    />

    <div v-if="isSearchOpen && query && results.length" class="dropdown">
      
      <a v-for="r in results"
        :key="r.ep"
        :href="r.link"
        class="dropdown-item"
        @click="isSearchOpen = false"
      >
        <code>{{ r.display }}</code>
        <span class="cat-tag">{{ r.cat }}</span>
      </a>
    </div>

    <div v-else-if="isSearchOpen && query && !results.length" class="dropdown">
      <div class="no-results">No results</div>
    </div>
  </div>
</template>

<style scoped>
.nav-search {
  position: relative;
  display: flex;
  align-items: stretch;
  margin-left: 1rem;
}

.version-dropdown {
  position: relative;
}

.version-trigger {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  height: 100%;
  font-size: 0.85rem;
  font-weight: 500;
  padding: 0.35rem 0.65rem;
  border: 1px solid var(--vp-c-divider);
  border-right: none;
  border-radius: 6px 0 0 6px;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  cursor: pointer;
  transition: color 0.2s;
}

.version-trigger:hover {
  color: var(--vp-c-brand-1);
}

.chevron {
  transition: transform 0.2s;
}

.chevron.open {
  transform: rotate(180deg);
}

.version-menu {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  min-width: 120px;
  padding: 6px;
  background: var(--vp-c-bg-elv);
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  box-shadow: var(--vp-shadow-3);
  z-index: 100;
}

.version-option {
  display: block;
  width: 100%;
  text-align: left;
  padding: 6px 10px;
  font-size: 0.85rem;
  font-weight: 500;
  border-radius: 6px;
  background: transparent;
  color: var(--vp-c-text-1);
  cursor: pointer;
}

.version-option:hover {
  background: var(--vp-c-default-soft);
  color: var(--vp-c-brand-1);
}

.version-option.active {
  color: var(--vp-c-brand-1);
  font-weight: 600;
}

.flyout-enter-active,
.flyout-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.flyout-enter-from,
.flyout-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.search-input {
  font-size: 0.9rem;
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 0 6px 6px 0;
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  width: 280px;
}

.search-input:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
  z-index: 1;
  position: relative;
}

.dropdown {
  position: absolute;
  top: 110%;
  left: 0;
  width: 420px;
  max-height: 400px;
  overflow-y: auto;
  background: var(--vp-c-bg-elv);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  box-shadow: var(--vp-shadow-3);
  z-index: 100;
}

.dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6rem 0.85rem;
  text-decoration: none;
  border-bottom: 1px solid var(--vp-c-divider);
}

.dropdown-item:last-child {
  border-bottom: none;
}

.dropdown-item:hover {
  background: var(--vp-c-bg-soft);
}

.dropdown-item code {
  overflow-wrap: anywhere;
  white-space: normal;
}

.cat-tag {
  font-size: 0.72rem;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  white-space: nowrap;
  flex-shrink: 0;
}

.no-results {
  padding: 0.85rem;
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
}
</style>