export function projectPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`;
}

export function projectUploadPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/upload`;
}

export function projectReviewPath(
  projectId: string,
  opts?: { joint?: string | null },
): string {
  const base = `/projects/${encodeURIComponent(projectId)}/review`;
  if (!opts?.joint) return base;
  const params = new URLSearchParams();
  params.set("joint", opts.joint);
  return `${base}?${params.toString()}`;
}

export function projectReportPath(
  projectId: string,
  opts?: {
    joint?: string | null;
    variant?: "zone2" | "zone3" | null;
    option?: number | null;
  },
): string {
  const base = `/projects/${encodeURIComponent(projectId)}/report`;
  if (!opts) return base;
  const params = new URLSearchParams();
  if (opts.joint) params.set("joint", opts.joint);
  if (opts.variant && opts.variant !== "zone2") params.set("variant", opts.variant);
  if (opts.option !== undefined && opts.option !== null && opts.option >= 0) {
    params.set("option", String(opts.option));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export function jointPath(projectId: string, jointId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/joints/${encodeURIComponent(jointId)}`;
}

export function iitDemoReportPath(opts?: { option?: number | null }): string {
  if (opts?.option !== undefined && opts.option !== null && opts.option >= 0) {
    const params = new URLSearchParams();
    params.set("option", String(opts.option));
    return `/demo/iit/report?${params.toString()}`;
  }
  return "/demo/iit/report";
}

export function resolveBundlePageImageUrl(
  pageImage: string | null | undefined,
  bundleUrl?: string,
): string | null {
  if (!pageImage) return null;
  if (/^(https?:|\/)/.test(pageImage)) return pageImage;
  if (!bundleUrl) return pageImage;

  const isApiBundle = bundleUrl.endsWith("/bundle");
  const basePath = isApiBundle ? `${bundleUrl.slice(0, -"/bundle".length)}/` : bundleUrl;
  try {
    if (/^https?:/.test(basePath)) {
      return new URL(pageImage, basePath).toString();
    }
    const resolved = new URL(pageImage, new URL(basePath, "http://rebartwin.local"));
    return `${resolved.pathname}${resolved.search}`;
  } catch {
    return pageImage;
  }
}
