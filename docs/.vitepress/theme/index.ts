import { h } from 'vue'
import type { Theme } from 'vitepress'
import DefaultTheme, { VPButton } from 'vitepress/theme'
import { useRoute } from 'vitepress'
import NavSearch from './components/NavSearch.vue'
import './style.css'

export default {
  extends: DefaultTheme,
  Layout: () => {
    const route = useRoute()

    return h(DefaultTheme.Layout, null, {
      'nav-bar-content-before': () =>
        route.path.includes('/placeholder/') ? h(NavSearch) : null
    })
  },
  enhanceApp({ app, router, siteData }) {
    app.component('VPButton', VPButton)
  }
} satisfies Theme
