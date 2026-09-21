---
title: Custom Creator
---

# Custom Creator

FishOnMCExtras includes a **Custom Creator** system, letting you build your own HUD elements, triggers, and observers, combined together to create fully custom behavior, without needing to write any code.

::: tip How it fits together
**Triggers** fire when something happens. **Observers** react to a trigger. **HUD Elements** are things you can display on screen, independent of triggers/observers, but often driven by the data those systems track.
:::

![Custom Creator Menu](/creator-screen.png)

::: tip Opening the FOER Menu
You can open this menu by pressing <kbd>`O`</kbd> on your keyboard, or by clicking the button labeled <kbd>`F`</kbd> in your inventory, located below the crafting squares on the right side.
:::

## HUD Elements

Custom elements you can display on your screen.

### HUD Text

Creates custom HUD elements with text. Each line can use [placeholders](/placeholder/) to show live, dynamic data.

### HUD Icons

Creates custom HUD elements with itemstack icons. You can specify the item either as a `minecraft:<item>` id, or as an inventory index, to show that itemstack on screen.

## Triggers

Triggers fire when a specific condition is met, they're the starting point that feeds into observers.

### Chat Triggers

Triggered when a chat message matches a filter or regex you specify.

### Event Triggers

Triggered when a specific in-game event gets activated.

### Timers

User-created timers that can trigger observers on a schedule you define.

## Observers

Observers react when a trigger fires, this is where you define what actually happens.

### Notifications

Sends a notification when triggered by a trigger.

### Chat Notification

Sends a message in chat when triggered by a trigger.

### Trackers

Tracks numbers, strings, or itemstacks based on conditions and set values.

::: info Looking for setup steps?
This page is just an overview of what each creator type does. See the individual pages for each type for how to actually configure and use them.
:::