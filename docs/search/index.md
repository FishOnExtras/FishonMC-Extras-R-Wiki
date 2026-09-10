---
title: Search
---

# Search

FishOnMCExtras adds a powerful **item search bar** to your personal vault, auction house and storage, letting you filter items not just by name, but by comparing specific NBT fields against exact values.

::: tip What can I search?
Type a plain word to search item names — like `Pet` - or use a field operator like `rating > 90` to filter by a specific stat. You can combine as many terms as you like in a single search.
:::

## Basic name search

The simplest way to search is to just type a word. It matches against item names (and other visible text on the item, like its tooltip).

```
Pet
```

Search any item that has the word `Pet` in it.

## Granular filtering

For more precise filtering, you can compare specific fields against exact values using operators.

### Allowed operators

| Operator | Meaning                  |
|----------|--------------------------|
| `=` `==` | equal to                 |
| `!=`     | not equal to             |
| `<`      | less than                |
| `>`      | greater than             |
| `<=`     | less than or equal to    |
| `>=`     | greater than or equal to |

### Searchable fields

Some fields map directly to an item's NBT data. Others are special fields the mod exposes that aren't stored as raw NBT.

::: code-group

```txt [Pets]
rating
lluck
lscale
cluck
cscale
lluck_percent
lscale_percent
cluck_percent
cscale_percent
```

```txt [Other]
tooltip
```

:::

::: warning Non-NBT fields
The fields above (pet stats, `tooltip`) are **not** raw NBT paths - they're special fields the mod resolves for you. Any other field name you use is looked up directly in the item's NBT data.
:::

## Examples

### Search by tooltip text

```
tooltip="tunas"
```

Search items whose `tooltip` has the word `tunas` in it.

### Combine multiple conditions

```
rating>90 lscale_percent>=80
```

Search items that are of **pet rating** higher than `90`, **and** of **location scale** higher than or equal to `80%`.

### Mix field filters with a plain word

```
type="armor" rarity="mythical" quality>96 Subtropical
```

Search items that are of **type** equal to `armor`, **and** of **rarity** equal to `mythical`, **and** of **quality** higher than `94%`, **and** search any item that has the word `Subtropical` in it.

::: details Reading a combined search
Every space-separated term in the search bar is combined with **AND** - an item has to match *all* of them to show up in the results.
:::