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
    ['link', { rel: 'icon', type: 'image/png', href: '/FishonMC-Extras-R-Wiki/logo.png' }],
  ],

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Placeholder', link: '/placeholder/'}
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/orgs/FishOnExtras/repositories' }
    ],

    sidebar: generateSidebar(vitePressSidebarOptions)
  }
});
