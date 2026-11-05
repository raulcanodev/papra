import { describe, expect, test } from 'vitest';
import changelog from './changelog.md?raw';
import { getMessageParts, getUnseenChangelog, MAX_CHANGELOG_MESSAGES, parseChangelog } from './changelog.models';

const entries = [
  { id: '2026-11-05', messages: ['c', 'd'] },
  { id: '2026-10-29', messages: ['a', 'b'] },
];

describe('changelog', () => {
  describe('changelog.md', () => {
    const parsed = parseChangelog(changelog);

    test('has its entries by date, newest first, each date once and none empty', () => {
      const ids = parsed.map(({ id }) => id);

      expect(ids.length).toBeGreaterThan(0);
      expect(ids.every(id => /^\d{4}-\d{2}-\d{2}$/.test(id) && !Number.isNaN(Date.parse(id)))).toBe(true);
      expect(ids).toEqual([...new Set(ids)].toSorted().toReversed());
      expect(parsed.every(({ messages }) => messages.length > 0)).toBe(true);
    });

    test('every message is short, one speech bubble', () => {
      const messages = parsed.flatMap(({ messages }) => messages).map(message => message.replaceAll('**', ''));

      expect(messages.filter(message => message.length > 200)).toEqual([]);
    });
  });

  describe('parseChangelog', () => {
    test('each heading is an entry and each list line a message, the rest is ignored', () => {
      expect(parseChangelog('# Title\n\nSome text\n\n## 2026-11-05\n\n- one\n- two\n\n## 2026-11-01\n- three\n')).toEqual([
        { id: '2026-11-05', messages: ['one', 'two'] },
        { id: '2026-11-01', messages: ['three'] },
      ]);
    });
  });

  describe('getUnseenChangelog', () => {
    test('someone who never saw any gets what happened since they signed up, newest first', () => {
      expect(getUnseenChangelog({ entries, lastSeenId: null, userCreatedAt: '2026-01-01T00:00:00.000Z' })).toEqual({ latestId: '2026-11-05', messages: ['c', 'd', 'a', 'b'] });
    });

    test('only what is newer than the last entry seen', () => {
      expect(getUnseenChangelog({ entries, lastSeenId: '2026-10-29', userCreatedAt: new Date('2026-01-01') })).toEqual({ latestId: '2026-11-05', messages: ['c', 'd'] });
    });

    test('nothing once the newest was seen', () => {
      expect(getUnseenChangelog({ entries, lastSeenId: '2026-11-05', userCreatedAt: new Date('2026-01-01') })).toEqual({ latestId: undefined, messages: [] });
    });

    test('a newcomer is not told what changed before they arrived', () => {
      expect(getUnseenChangelog({ entries, lastSeenId: null, userCreatedAt: new Date('2026-11-06') }).messages).toEqual([]);
      expect(getUnseenChangelog({ entries, lastSeenId: null, userCreatedAt: new Date('2026-11-01') }).messages).toEqual(['c', 'd']);
    });

    test('someone away for long gets the latest messages only', () => {
      const many = [{ id: '2026-11-05', messages: Array.from({ length: 10 }, (_, index) => String(index)) }];

      expect(getUnseenChangelog({ entries: many, userCreatedAt: new Date('2026-01-01') }).messages).toHaveLength(MAX_CHANGELOG_MESSAGES);
    });
  });

  describe('getMessageParts', () => {
    test('splits the bold parts from the plain text', () => {
      expect(getMessageParts('**Proformas** nuevas')).toEqual([{ text: 'Proformas', isBold: true }, { text: ' nuevas', isBold: false }]);
      expect(getMessageParts('sin negrita')).toEqual([{ text: 'sin negrita', isBold: false }]);
    });
  });
});
