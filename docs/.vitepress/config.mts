import { defineConfig } from 'vitepress'
import { generateSidebar } from 'vitepress-sidebar'

const vitePressSidebarOptions = {
  documentRootPath: 'docs/',
  collapsed: false,
  capitalizeFirst: false,
  includeDynamicRoutes: true
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
      { text: 'Placeholder', link: '/placeholder/'}
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/orgs/FishOnExtras/repositories' }
    ],

    sidebar: generateSidebar(vitePressSidebarOptions),

    footer: {
      message: '<b>FishOnMC-Extras-R-Wiki</b> is not affiliated, associated, authorized, endorsed by, or in any way officially connected with <a href="https://fishonmc.net/">FishOnMC</a><br /><i>Made by DannyPX</i>'
    }
  },

  transformPageData(pageData) {
    if (pageData.params?.rawEp) {
      pageData.title = pageData.params.cat
    }
  }
});
