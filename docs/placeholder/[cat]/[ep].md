# {{ $params.rawEp.replace(/</g, '&lt;').replace(/>/g, '&gt;') }}

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
    </tr>
  </thead>
  <tbody>
    <tr v-for="p in $params.paramsList" :key="p.name">
      <td><code>{{ p.name }}</code></td>
      <td><code>{{ p.type }}</code></td>
      <td  >{{ p.optional ? '✅' : '' }}</td>
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

<style module>
table td:nth-child(3) {
    text-align: center;
}
</style>