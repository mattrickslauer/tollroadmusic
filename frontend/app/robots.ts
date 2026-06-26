import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/shareUrls";

/** Allow crawling of the public marketing + share pages; keep the gated, per-
 *  user app routes (wallet, library, API, artist dashboard) out of the index. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/wallet", "/library", "/liked", "/search", "/artist", "/u/"],
    },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
