import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { defineConfig } from 'vitepress'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(__dirname, '../../data')

const versionsFile = JSON.parse(
  readFileSync(resolve(dataDir, 'versions.json'), 'utf-8')
)
const versions: string[] = versionsFile.versions

function isFunctionCategory(endpoints: string[]) {
  return endpoints.some((ep) => ep.includes('()'))
}

function buildSidebarForVersion(ver: string) {
  const list = JSON.parse(
    readFileSync(resolve(dataDir, `placeholder-list-${ver}.json`), 'utf-8')
  )

  const sortedEntries = Object.entries(list).sort(([, a], [, b]) => {
    return Number(isFunctionCategory(a as string[])) - Number(isFunctionCategory(b as string[]))
  })

  return sortedEntries.map(([cat, endpoints]) => ({
    text: cat,
    collapsed: true,
    items: (endpoints as string[]).map((ep) => {
      const display = ep.replace(/</g, '[').replace(/>/g, ']')
      return {
        text: display,
        link: `/${ver}/placeholder/${cat}/${display}/`
      }
    })
  }))
}

function buildAllSidebars() {
  const sidebar: Record<string, any> = {}
  for (const ver of versions) {
    sidebar[`/${ver}/placeholder/`] = buildSidebarForVersion(ver)
  }
  return sidebar
}

export default defineConfig({
  srcExclude: [],

  base: "/FishonMC-Extras-R-Wiki/",

  title: "FishOnMC Extras R Wiki",
  description: "Wiki for the FishOnMC Extras R (FOER) mod",

  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/FishonMC-Extras-R-Wiki/icon.png' }],
    ['link', { rel: 'icon', href: '/FishonMC-Extras-R-Wiki/icon.ico' }]
  ],

  cleanUrls: true,

  themeConfig: {
    logo: {
      src: '/icon.png',
      width: 24,
      height: 24
    },

    nav: [
      { text: 'Home', link: '/' },
      {
        text: 'Placeholder',
        items: versions.map((ver) => ({
          text: ver,
          link: `/${ver}/placeholder/`
        }))
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/orgs/FishOnExtras/repositories' }
    ],

    sidebar: {
      ...buildAllSidebars()
    },

    footer: {
      message: '<b>FishOnMC-Extras-R-Wiki</b> is not affiliated, associated, authorized, endorsed by, or in any way officially connected with <a href="https://fishonmc.net/">FishOnMC</a><br /><i>Made by DannyPX</i>'
    }
  },

  transformPageData(pageData) {
    if (pageData.params?.rawEp) {
      pageData.title = pageData.params.cat
    }

    if (pageData.frontmatter.layout === 'home') {
    const latest = versionsFile.versions[0]
    pageData.frontmatter.hero.actions[0].link = `/${latest}/placeholder/`
  }
  }
});
