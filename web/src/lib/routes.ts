export function projectPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}`;
}

export function projectUploadPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/upload`;
}

export function projectReviewPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/review`;
}

export function projectReportPath(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/report`;
}

export function jointPath(projectId: string, jointId: string): string {
  return `/projects/${encodeURIComponent(projectId)}/joints/${encodeURIComponent(jointId)}`;
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
