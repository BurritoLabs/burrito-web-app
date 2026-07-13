import { useEffect } from "react"
import { useLocation } from "react-router-dom"
import { getRouteMetadata } from "./routeMetadataConfig"

const SITE_ORIGIN = "https://app.burrito.money"

const setMetaContent = (selector: string, content: string) => {
  document.querySelector<HTMLMetaElement>(selector)?.setAttribute("content", content)
}

export default function RouteMetadata() {
  const { pathname } = useLocation()

  useEffect(() => {
    const route = getRouteMetadata(pathname)
    const canonicalUrl = new URL(route.canonicalPath, SITE_ORIGIN).href

    document.title = route.title
    document
      .querySelector<HTMLLinkElement>('link[rel="canonical"]')
      ?.setAttribute("href", canonicalUrl)
    setMetaContent('meta[name="description"]', route.description)
    setMetaContent('meta[property="og:title"]', route.title)
    setMetaContent('meta[property="og:description"]', route.description)
    setMetaContent('meta[property="og:url"]', canonicalUrl)
    setMetaContent('meta[name="twitter:title"]', route.title)
    setMetaContent('meta[name="twitter:description"]', route.description)
    setMetaContent('meta[name="twitter:url"]', canonicalUrl)
  }, [pathname])

  return null
}
