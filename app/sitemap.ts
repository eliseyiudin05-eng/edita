import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base=process.env.NEXT_PUBLIC_SITE_URL || "https://kivronix.ru";
  return ["","/platform","/signup","/login","/requisites","/privacy","/terms","/offer","/challenge-rules","/arena-rules","/status","/creators","/u/demo"].map(path=>({
    url:base+path,
    lastModified:new Date(),
    changeFrequency:path===""?"weekly":"monthly",
    priority:path===""?1:path==="/platform"?0.9:0.6,
  }));
}
