import { describe, expect, test } from 'vitest';
import { readSessionHint, SESSION_HINT_STORAGE_KEY, writeSessionHint } from './session-hint';

function createStorage() {
  const values = new Map<string, string>();

  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
}

describe('session hint', () => {
  test('a browser that never had a session is a visitor', () => {
    expect(readSessionHint({ storage: createStorage() })).to.eql(false);
  });

  test('the hint follows the last known session', () => {
    const storage = createStorage();

    writeSessionHint({ hasSession: true, storage });
    expect(readSessionHint({ storage })).to.eql(true);
    expect(storage.values.get(SESSION_HINT_STORAGE_KEY)).to.eql('true');

    writeSessionHint({ hasSession: false, storage });
    expect(readSessionHint({ storage })).to.eql(false);
  });

  test('a blocked storage never breaks the app', () => {
    const storage = { getItem: () => {
      throw new Error('blocked');
    }, setItem: () => {
      throw new Error('blocked');
    }, removeItem: () => {
      throw new Error('blocked');
    } };

    expect(readSessionHint({ storage })).to.eql(false);
    expect(() => writeSessionHint({ hasSession: true, storage })).not.toThrow();
  });
});
