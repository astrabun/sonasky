export const TRUSTED_LINK_DOMAINS = ["bsky.app", "ssky.app", "sonasky.app", "ref.sonasky.app"];

export function isTrustedLinkDomain(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return TRUSTED_LINK_DOMAINS.some((domain) => host === domain || host.endsWith(`.${domain}`));
}
