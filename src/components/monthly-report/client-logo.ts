/**
 * Hub URL for a client's logo. Every client logo is served from Drive
 * (1o8 Hub_Backend/Client Logos) at this path; callers must handle a
 * 404 (no logo uploaded) by hiding the image / showing the initial.
 */
export function clientLogoSrc(clientIdCode?: string | null): string | null {
  return clientIdCode ? `/client-logos/${clientIdCode}.png` : null;
}
