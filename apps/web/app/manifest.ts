import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "midbig: live crypto prices",
    short_name: "midbig",
    description: "Live crypto prices, your portfolio, what-if scenarios and price alerts.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0d1117",
    theme_color: "#0d1117",
    categories: ["finance"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Portfolio", url: "/portfolio" },
      { name: "Watchlist", url: "/watchlist" },
      { name: "Price alerts", url: "/alerts" },
    ],
  };
}
