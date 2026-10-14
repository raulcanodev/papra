import { describe, expect, test } from 'vitest';
import { readRememberedLogin, writeRememberedLogin } from './auth.storage';

function createStorage(initialEntries: Record<string, string> = {}) {
  const entries = new Map(Object.entries(initialEntries));

  return {
    getItem: (key: string) => entries.get(key) ?? null,
    removeItem: (key: string) => entries.delete(key),
    setItem: (key: string, value: string) => entries.set(key, value),
  };
}

describe('auth storage', () => {
  test('defaults to remembering the email for first-time visitors', () => {
    expect(readRememberedLogin({ storage: createStorage() })).toEqual({
      email: '',
      rememberMe: true,
    });
  });

  test('stores and restores a normalized email', () => {
    const storage = createStorage();

    writeRememberedLogin({ email: '  person@example.com  ', rememberMe: true, storage });

    expect(readRememberedLogin({ storage })).toEqual({
      email: 'person@example.com',
      rememberMe: true,
    });
  });

  test('removes the email and preserves the unchecked preference', () => {
    const storage = createStorage();
    writeRememberedLogin({ email: 'person@example.com', rememberMe: true, storage });

    writeRememberedLogin({ email: 'person@example.com', rememberMe: false, storage });

    expect(readRememberedLogin({ storage })).toEqual({
      email: '',
      rememberMe: false,
    });
  });
});
