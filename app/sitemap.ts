import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base=process.env.NEXT_PUBLIC_SITE_URL || "https://getedita.app";
  return ["","/pricing","/platform","/signup","/login","/requisites","/privacy","/terms","/offer","/arena-rules","/status","/u/demo"].map(path=>({
    url:base+path,
    lastModified:new Date(),
    changeFrequency:path===""?"weekly":"monthly",
    priority:path===""?1:path==="/pricing"?0.9:0.6,
  }));
}
