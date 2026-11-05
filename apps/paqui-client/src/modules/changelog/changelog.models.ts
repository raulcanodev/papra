export type ChangelogEntry = { id: string; messages: string[] };

// What fits in one sitting: someone who has been away gets the latest news, not the whole year
export const MAX_CHANGELOG_MESSAGES = 6;

/** The file as entries: each `## date` is an entry, each `- ` line under it one message. Anything else is ignored. */
export function parseChangelog(markdown: string) {
  const entries: ChangelogEntry[] = [];

  for (const line of markdown.split('\n')) {
    const heading = /^## (\S+)\s*$/.exec(line);
    const message = /^- (.+)$/.exec(line);

    if (heading) {
      entries.push({ id: heading[1]!, messages: [] });
    } else if (message) {
      entries.at(-1)?.messages.push(message[1]!.trim());
    }
  }

  return entries;
}

/**
 * The news a user has not read, newest first: entries after the last one they saw, and only those after they signed
 * up, because a newcomer has no use for what changed before they arrived.
 */
export function getUnseenChangelog({ entries, lastSeenId, userCreatedAt }: { entries: ChangelogEntry[]; lastSeenId?: string | null; userCreatedAt: Date | string }) {
  const signupId = new Date(userCreatedAt).toISOString().slice(0, 10);
  const unseen = entries.filter(({ id }) => id >= signupId && (lastSeenId === null || lastSeenId === undefined || id > lastSeenId));

  return {
    latestId: unseen[0]?.id,
    messages: unseen.flatMap(({ messages }) => messages).slice(0, MAX_CHANGELOG_MESSAGES),
  };
}

/** A message as text with `**bold**` parts */
export function getMessageParts(message: string) {
  return message.split('**').map((text, index) => ({ text, isBold: index % 2 === 1 })).filter(({ text }) => text !== '');
}
