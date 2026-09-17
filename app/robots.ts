import type { MetadataRoute } from "next";
import {KIVRONIX_SITE_URL} from "@/lib/public-config";

export default function robots():MetadataRoute.Robots{
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow:["/api/","/admin/","/platform","/academy/","/auth/","/payment/"],
    },
    sitemap: `${KIVRONIX_SITE_URL}/sitemap.xml`,
    host: KIVRONIX_SITE_URL,
  };
}
