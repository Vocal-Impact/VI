import type { MetadataRoute } from "next";

/** Lets committee members "Add to Home Screen" for quick attendance taking. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vocal Impact",
    short_name: "Vocal Impact",
    description: "Members, attendance, WhatsApp invites, birthdays and carpools for the Vocal Impact choir.",
    start_url: "/",
    display: "standalone",
    background_color: "#111111",
    theme_color: "#111111",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
