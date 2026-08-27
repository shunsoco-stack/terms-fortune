import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/", name: "利用規約占い", short_name: "規約占い",
    description: "毎日ひとつのオリジナル条文で、今日をちょっといい日に。",
    start_url: "/", scope: "/", display: "standalone", lang: "ja",
    background_color: "#f6f3ec", theme_color: "#24372f",
    categories: ["entertainment", "lifestyle"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "これまでの条文", url: "/#history", icons: [{ src: "/icon-192.png", sizes: "192x192" }] }],
  };
}
