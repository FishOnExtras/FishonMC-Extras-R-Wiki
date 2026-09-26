---
layout: page
footer: false
aside: false
navbar: false
---

<div class="full-editor">
  <PlaceholderEditor 
    v-model="text" 
    max-height="none"
    placeholder="Start writing %"
    issueUrl="https://github.com/FishOnExtras/FishonMC-Extras-R-Wiki"
  />
</div>

<script setup>
import { ref } from 'vue'

const text = ref()
</script>

<style scoped>
.full-editor {
  height: calc(100vh - var(--vp-nav-height));
  box-sizing: border-box;
}

.full-editor :deep(.placeholder-editor) {
  height: 100%;
  margin: 0;
  display: flex;
  flex-direction: column;
}

.full-editor :deep(.pe-scroll) {
  flex: 1;
  min-height: 0;
}
</style>