import type { MetadataRoute } from "next";
import { buildRobots } from "@microtools/seo-kit";
import { site } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return buildRobots(site);
}
