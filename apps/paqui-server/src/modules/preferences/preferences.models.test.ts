import { describe, expect, test } from 'vitest';
import { mergePreferences, parseStoredPreferences } from './preferences.models';

describe('preferences models', () => {
  test('nothing stored yet hides secondary documents and uses billed revenue', () => {
    expect(parseStoredPreferences({ stored: undefined })).to.eql({
      dashboard: { hiddenWidgetIds: [], revenueMode: 'billed' },
      navigation: { hiddenItemIds: ['documents'] },
    });
  });

  test('a stored value that is no longer valid falls back to the defaults instead of breaking the page', () => {
    expect(parseStoredPreferences({ stored: { dashboard: { revenueMode: 'unknown' } } }).dashboard.revenueMode).to.eql('billed');
  });

  test('missing sections are completed and unknown keys dropped', () => {
    expect(parseStoredPreferences({ stored: { navigation: { hiddenItemIds: ['salesRepresentatives'] }, legacy: true } })).to.eql({
      dashboard: { hiddenWidgetIds: [], revenueMode: 'billed' },
      navigation: { hiddenItemIds: ['salesRepresentatives'] },
    });
  });

  test('an update only replaces the fields it carries', () => {
    const current = parseStoredPreferences({ stored: { dashboard: { hiddenWidgetIds: ['documents'] }, navigation: { hiddenItemIds: ['calendar'] } } });

    expect(mergePreferences({ current, patch: { dashboard: { revenueMode: 'profit' } } })).to.eql({
      dashboard: { hiddenWidgetIds: ['documents'], revenueMode: 'profit' },
      navigation: { hiddenItemIds: ['calendar'] },
    });
  });
});
