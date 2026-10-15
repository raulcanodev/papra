// @vitest-environment happy-dom
import { describe, expect, test } from 'vitest';
import { getCaptureUrl, getScaledSize, isUnreachableFromPhone } from './captures.models';

describe('captures models', () => {
  test('the QR code links to the capture page of the app', () => {
    expect(getCaptureUrl({ token: 'abc', baseUrl: 'https://app.example.com/' })).toBe('https://app.example.com/capture/abc');
  });

  test('a link to the computer itself cannot be opened by the phone', () => {
    expect(isUnreachableFromPhone({ url: 'http://localhost:43127/capture/abc' })).toBe(true);
    expect(isUnreachableFromPhone({ url: 'http://192.168.1.20:43127/capture/abc' })).toBe(false);
    expect(isUnreachableFromPhone({ url: 'https://app.example.com/capture/abc' })).toBe(false);
  });

  test('photos are shrunk to fit the maximum side, keeping their ratio, never enlarged', () => {
    expect(getScaledSize({ width: 4_032, height: 3_024 })).toEqual({ width: 2_400, height: 1_800 });
    expect(getScaledSize({ width: 3_000, height: 4_000, maxSide: 2_000 })).toEqual({ width: 1_500, height: 2_000 });
    expect(getScaledSize({ width: 800, height: 600 })).toEqual({ width: 800, height: 600 });
  });
});
