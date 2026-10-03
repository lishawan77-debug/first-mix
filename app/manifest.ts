import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "FIRST MIX - Learn to DJ", short_name: "FIRST MIX", description: "Easy DJ learning games for complete beginners", start_url: "/", display: "standalone", background_color: "#090b10", theme_color: "#090b10", orientation: "any", icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }] };
}
