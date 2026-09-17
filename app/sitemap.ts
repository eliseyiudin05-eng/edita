import type { MetadataRoute } from "next";
import {KIVRONIX_SITE_URL} from "@/lib/public-config";

export default function sitemap(): MetadataRoute.Sitemap {
  const base=KIVRONIX_SITE_URL;
  const publicPages=["","/pricing","/creators","/requisites","/privacy","/terms","/offer","/cookies","/personal-data-consent","/challenge-rules","/arena-rules"];
  return publicPages.map(path=>({
    url:base+path,
    lastModified:new Date("2026-09-17T00:00:00.000Z"),
    changeFrequency:path===""?"weekly":"monthly",
    priority:path===""?1:path==="/pricing"||path==="/creators"?0.8:0.5,
  }));
}
