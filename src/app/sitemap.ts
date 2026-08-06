import type { MetadataRoute } from "next";
import { siteConfig } from "@/config/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.url.replace(/\/$/, "");
  const routes = [
    "",
    "/search",
    "/login",
    "/credits",
    "/privacy",
    "/terms",
    "/support",
  ];
  return routes.map((route) => ({
    url: `${base}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "" || route === "/search" ? "daily" : "monthly",
    priority: route === "" ? 1 : route === "/search" ? 0.9 : 0.4,
  }));
}
