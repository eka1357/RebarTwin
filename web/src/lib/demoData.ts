import type { Bundle } from "../types/bundle";

export type DemoVariant = "zone2" | "zone3";

const DEMO_PATHS: Record<DemoVariant, string> = {
  zone2: "/demo/C4xB12",
  zone3: "/demo/C4xB12-zone3",
};

export function demoAssetUrl(variant: DemoVariant, filename: string): string {
  return `${DEMO_PATHS[variant]}/${filename}`;
}

export async function fetchDemoBundle(variant: DemoVariant): Promise<Bundle> {
  const url = demoAssetUrl(variant, "bundle.json");
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Could not load demo bundle from ${url} (${res.status}).`);
  }
  return (await res.json()) as Bundle;
}
