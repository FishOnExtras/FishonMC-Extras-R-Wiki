---
title: {{ $params.rawEp }}
---

# `{{ $params.rawEp }}` <Badge type="info" :text=$params.ver />

<div v-if="$params.description">
{{ $params.description }}
</div>

<div v-if="$params.signature">

## Signature

`{{ $params.signature }}`
</div>

<div v-if="$params.returns">

## Returns

`{{ $params.returns }}`
</div>

<div v-if="$params.paramsList && $params.paramsList.length">

## Parameters

<table>
  <thead>
    <tr>
      <th>Name</th>
      <th>Type</th>
      <th>Optional</th>
      <th>Variadic</th>
    </tr>
  </thead>
  <tbody>
    <tr v-for="p in $params.paramsList" :key="p.name">
      <td><code>{{ p.name }}</code></td>
      <td><code>{{ p.type }}</code></td>
      <td  >{{ p.optional ? '✅' : '' }}</td>
      <td  >{{ p.variadic ? '✅' : '' }}</td>
    </tr>
  </tbody>
</table>
</div>

<hr>

<details>
  <summary>Raw path info</summary>

- **Category:** `{{ $params.cat }}`
- **Endpoint:** `{{ $params.rawEp }}`

</details>

<hr>

<div class="back-home"><VPButton text="← Back to Placeholders" :href="`/${ selectedVersion }/placeholder/`" theme="alt" /></div>

<style module>
table td:nth-child(n+3):nth-child(-n+4) {
    text-align: center;
}

:global(.back-home) {
  display: flex !important;
  justify-content: flex-end !important;
}
</style>

<script setup lang="ts">
import { useRoute } from 'vitepress'

const route = useRoute()
const selectedVersion = route.data.params.ver;
</script>
