import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Boards live in the visitor's browser: index the landing page only, never boards or the API. */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/b/", "/api/", "/interview", "/design"] },
    sitemap: new URL("/sitemap.xml", base).toString(),
    host: base.origin,
  };
}
