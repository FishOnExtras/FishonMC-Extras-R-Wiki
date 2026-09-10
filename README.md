# FishOnMC Extras R Wiki

Documentation site for the **FishOnMC Extras R (FOER)** mod, built with [VitePress](https://vitepress.dev).

## Project Structure

```
.
├── data/
│   ├── versions.json
│   ├── placeholder-list-*.json
│   └── placeholder-schema-*.json
├── docs/
│   ├── .vitepress/
│   │   ├── config.mts
│   │   └── theme/
│   ├── [ver]/
│   │   └── placeholder/
│   │       ├── index.md
│   │       ├── index.paths.ts
│   │       └── [cat]/
│   │           ├── [ep].md
│   │           └── [ep].paths.ts
│   └── search/
└── package.json
```

Placeholder documentation pages are **generated at build time** from the JSON files in `data/` - adding a new mod version means adding an entry to `versions.json` plus the matching `placeholder-list-*.json` / `placeholder-schema-*.json` files, no page-by-page editing required.

## Setup

```sh
yarn install
```

## Development

Starts a local dev server with hot reload.

```sh
yarn docs:dev
```

## Build

Type-checks and builds the site for production into `docs/.vitepress/dist`.

```sh
yarn docs:build
```

## Preview

Locally preview the production build.

```sh
yarn docs:preview
```

## Adding a New Mod Version

1. Add the version string to `data/versions.json`
2. Add `data/placeholder-list-<version>.json` and `data/placeholder-schema-<version>.json`
3. Run `yarn docs:build` - the new version's pages, sidebar, and nav entry are generated automatically

## License

[GPLv3](https://github.com/FishOnExtras/FishonMC-Extras-R-Wiki/blob/main/LICENSE)

> FishOnMC-Extras-R-Wiki is not affiliated, associated, authorized, endorsed by, or in any way officially connected with [FishOnMC](https://fishonmc.net/)
