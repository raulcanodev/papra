import { describe, expect, test } from 'vitest';
import { buildLocalStorageKey, joinLocalStorageKey } from './persistence.models';

describe('local-storage models', () => {
  describe('joinLocalStorageKey', () => {
    test('simply joins the provided parts with a ":" separator', () => {
      expect(joinLocalStorageKey('paqui', 'test')).toBe('paqui:test');
      expect(joinLocalStorageKey('part1', 'part2', 'part3')).toBe('part1:part2:part3');
    });
  });

  describe('buildLocalStorageKey', () => {
    test('adds the "paqui" prefix to the provided parts and joins them with a ":" separator', () => {
      expect(buildLocalStorageKey('test')).toBe('paqui:test');
      expect(buildLocalStorageKey('part1', 'part2', 'part3')).toBe('paqui:part1:part2:part3');
    });
  });
});
