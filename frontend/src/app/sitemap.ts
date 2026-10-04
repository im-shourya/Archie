import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: new URL("/", siteUrl()).toString(), changeFrequency: "weekly", priority: 1 },
    { url: new URL("/evals", siteUrl()).toString(), changeFrequency: "weekly", priority: 0.5 },
  ];
}
