import { describe, expect, test } from 'vitest';
import { isIosDevice, isStandaloneDisplay } from './pwa.models';

describe('pwa models', () => {
  describe('isIosDevice', () => {
    test('iPhones and iPads are iOS devices', () => {
      expect(isIosDevice({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', maxTouchPoints: 5 })).toBe(true);
      expect(isIosDevice({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15', maxTouchPoints: 5 })).toBe(true);
    });

    test('an iPad asking for the desktop site says it is a Mac, its touch screen gives it away', () => {
      expect(isIosDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', maxTouchPoints: 5 })).toBe(true);
      expect(isIosDevice({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', maxTouchPoints: 0 })).toBe(false);
    });

    test('android phones and computers are not', () => {
      expect(isIosDevice({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128.0 Mobile', maxTouchPoints: 5 })).toBe(false);
      expect(isIosDevice({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128.0', maxTouchPoints: 0 })).toBe(false);
    });
  });

  describe('isStandaloneDisplay', () => {
    test('the app runs on its own when the display mode says so, or when Safari on iOS flags it', () => {
      expect(isStandaloneDisplay({ matchesStandaloneMedia: true })).toBe(true);
      expect(isStandaloneDisplay({ matchesStandaloneMedia: false, navigatorStandalone: true })).toBe(true);
      expect(isStandaloneDisplay({ matchesStandaloneMedia: false, navigatorStandalone: false })).toBe(false);
      expect(isStandaloneDisplay({ matchesStandaloneMedia: false })).toBe(false);
    });
  });
});
