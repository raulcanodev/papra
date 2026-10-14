export function parseEmailAddress({ address }: { address: string }): { name?: string; email: string } {
  const separatorIndex = address.lastIndexOf('<');
  const hasNamedAddress = separatorIndex > 0 && address.endsWith('>');

  if (!hasNamedAddress) {
    return { email: address.trim() };
  }

  const name = address.slice(0, separatorIndex).trim().replace(/^"(.*)"$/, '$1');

  return { name: name === '' ? undefined : name, email: address.slice(separatorIndex + 1, -1).trim() };
}

// Characters that would break or inject into the From header (quotes, angle brackets, address separators, line breaks)
const UNSAFE_DISPLAY_NAME_CHARACTERS = /["<>,;\\\r\n\t]/g;

/**
 * Sends on behalf of someone else (e.g. an organization invoicing its customers): the display name changes,
 * the address stays the platform one, since only its domain is verified with the email provider.
 */
export function formatSenderAddress({ fromEmail, displayName }: { fromEmail: string; displayName?: string | null }) {
  const { email } = parseEmailAddress({ address: fromEmail });
  const safeDisplayName = (displayName ?? '').replace(UNSAFE_DISPLAY_NAME_CHARACTERS, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);

  return safeDisplayName === '' ? fromEmail : `"${safeDisplayName}" <${email}>`;
}
