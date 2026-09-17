import type { NextConfig } from "next";

const securityHeaders=[
  {key:"X-Content-Type-Options",value:"nosniff"},
  {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
  {key:"X-Frame-Options",value:"SAMEORIGIN"},
  {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},
];

const privateRoutes=["/api/:path*","/admin/:path*","/platform","/academy/:path*","/auth/:path*","/payment/:path*","/login","/signup/:path*","/onboarding","/forgot-password","/reset-password"];

const legacyHosts=[
  "getedita.app",
  "www.getedita.app",
  "edita-psi.vercel.app",
  "edita-eliseyiudin05-9623.vercel.app",
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async redirects(){
    return [
      ...legacyHosts.map(host=>({
        source:"/:path*",
        has:[{type:"host" as const,value:host}],
        destination:"https://kivronix.ru/:path*",
        permanent:true,
      })),
      {
        source:"/:path*",
        has:[{type:"host",value:"kivronix.com"}],
        destination:"https://kivronix.ru/:path*",
        permanent:true,
      },
      {
        source:"/:path*",
        has:[{type:"host",value:"www.kivronix.com"}],
        destination:"https://kivronix.ru/:path*",
        permanent:true,
      },
      {
        source:"/:path*",
        has:[{type:"host",value:"www.kivronix.ru"}],
        destination:"https://kivronix.ru/:path*",
        permanent:true,
      },
    ];
  },
  async headers(){
    return [
      {source:"/:path*",headers:securityHeaders},
      ...privateRoutes.map(source=>({source,headers:[{key:"X-Robots-Tag",value:"noindex, nofollow"}]})),
    ];
  },
};

export default nextConfig;
