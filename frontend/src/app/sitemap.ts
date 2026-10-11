import type { MetadataRoute } from "next";
import { LEGAL_DOCS } from "@/features/legal/docs";
import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: new URL("/", siteUrl()).toString(), changeFrequency: "weekly", priority: 1 },
    { url: new URL("/evals", siteUrl()).toString(), changeFrequency: "weekly", priority: 0.5 },
    ...["/legal", ...LEGAL_DOCS.map((d) => `/legal/${d}`)].map((path) => ({
      url: new URL(path, siteUrl()).toString(),
      changeFrequency: "monthly" as const,
      priority: 0.3,
    })),
  ];
}
