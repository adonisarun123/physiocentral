import type { Metadata } from "next";

export const SITE_NAME = "Physio Central by Dr Nitin Sunku";

type OpenGraph = NonNullable<Metadata["openGraph"]>;

/**
 * Open Graph block for a page. Next replaces (not merges) a parent's openGraph
 * when a page sets its own, so every page builds it here to keep siteName/locale
 * and an og:url that matches the canonical (resolved against metadataBase).
 */
export function pageOpenGraph(path: string, extra: Partial<OpenGraph> = {}): OpenGraph {
  return { siteName: SITE_NAME, locale: "en_IN", type: "website", url: path, ...extra } as OpenGraph;
}
