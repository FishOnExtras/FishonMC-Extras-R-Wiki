---
title: Placeholders
---

# Placeholders

FishOnMC-Extras exposes a set of **placeholders** — small dynamic data points you can drop into Custom HUDs, that get replaced with live data from the mod and server.

::: tip What is a placeholder?
A placeholder is written as a dot-separated path, like `stats_data.data.fish.total`. When the mod processes a message containing this placeholder, it looks up the current value and substitutes it in — no coding required.
:::

## How placeholders are structured

Every placeholder belongs to a **category**, which groups related data together. The category is always the first segment of the path.

```
<category>.<path>.<to>.<value>
```

For example:

| Full placeholder | Category | Meaning |
|---|---|---|
| `stats_data.data.fish.total` | `stats_data` | Total fish caught |
| `boss_bar.weather` | `boss_bar` | Current weather shown on the boss bar |
| `uppercase.(value: string)` | `uppercase` | Converts text to upper case |

## Dynamic segments: `<string>`

Some placeholders contain a segment written as `<string>` — this is a **wildcard**. It means you substitute your own value in that position rather than typing it literally.

::: warning Don't type `<string>` literally
`<string>` is a placeholder for *your own input* — like an item name, a fish size, or a rarity tier. You replace it, you don't keep the brackets.
:::

For example, `stats_data.data.item.<string>.count` becomes:

```
stats_data.data.item.armorShard.count
```

to get the catch count for shards specifically.

## Functions

Some placeholders act like functions and take arguments in parentheses, shown with a signature such as:

```
uppercase.(value: string|component): dynamic
```

::: details Reading a function signature
- **`uppercase`** — the placeholder/category name
- **`(value: string|component)`** — the parameter(s) it accepts, and their allowed types
- **`: dynamic`** — the type of the value it returns
:::

Example usage:

```
uppercase.("hello world")
```

which returns:

```
HELLO WORLD
```

## Browsing the full list

Every leaf placeholder links to its own page with return type, description, and parameters.

<table>
  <thead>
    <tr>
      <th>Category</th>
      <th>Endpoints</th>
    </tr>
  </thead>
  <tbody>
    <tr v-for="c in categories" :key="c.cat">
      <td><code>{{ c.cat }}</code></td>
      <td>
        <div v-for="e in c.endpoints" :key="e.raw">
          <a :href="`/FishonMC-Extras-R-Wiki/placeholder/${c.cat}/${e.display}.html`">
            <code>{{ e.raw }}</code>
          </a>
        </div>
      </td>
    </tr>
  </tbody>
</table>

::: info Looking for a specific placeholder?
Use the search bar at the top of the page, or browse by category in the sidebar. Each entry shows its full path, return type, description, and parameters (if any).
:::

<script setup>
import list from '../../data/placeholder-list-0.3.10.json'

const categories = Object.entries(list).map(([cat, endpoints]) => ({
  cat,
  endpoints: endpoints.map((ep) => ({
    raw: ep,
    display: ep.replace(/</g, '[').replace(/>/g, ']')
  }))
}))
</script>