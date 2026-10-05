"use client";

import { useEffect, useState } from "react";
import type { BrandId } from "./brands";

type Paths = typeof import("./brandPaths").BRAND_PATHS;

/** One lazy chunk for every brand path, fetched the first time any node needs a logo. */
let loaded: Paths | null = null;
let loading: Promise<Paths> | null = null;
const load = () => (loading ??= import("./brandPaths").then((m) => (loaded = m.BRAND_PATHS)));

/**
 * A monochrome brand mark in the current colour (docs/06 · Node shapes and logos).
 * Renders `fallback` (the kind's glyph) until the paths arrive or if they fail to load.
 */
export function BrandLogo({ brand, size = 18, fallback }: { brand: BrandId; size?: number; fallback: React.ReactNode }) {
  const [paths, setPaths] = useState<Paths | null>(loaded);
  useEffect(() => {
    if (paths) return;
    let live = true;
    load()
      .then((p) => live && setPaths(p))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [paths]);
  const icon = paths?.[brand];
  if (!icon) return <>{fallback}</>;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden data-brand={brand}>
      <path d={icon.path} />
    </svg>
  );
}
