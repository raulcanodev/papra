import { describe, expect, test } from 'vitest';
import { applyPreferencesPatch, toggleHiddenId } from './preferences.models';
import { DEFAULT_MEMBER_PREFERENCES } from './preferences.types';

describe('preferences models', () => {
  test('a patch only changes the fields it carries', () => {
    expect(applyPreferencesPatch({ preferences: DEFAULT_MEMBER_PREFERENCES, patch: { dashboard: { revenueMode: 'profit' } } })).to.eql({
      dashboard: { hiddenWidgetIds: [], revenueMode: 'profit' },
      navigation: { hiddenItemIds: [] },
    });
  });

  test('hiding and showing an id never duplicates it', () => {
    expect(toggleHiddenId({ hiddenIds: ['a'], id: 'a', isHidden: true })).to.eql(['a']);
    expect(toggleHiddenId({ hiddenIds: ['a', 'b'], id: 'a', isHidden: false })).to.eql(['b']);
    expect(toggleHiddenId({ hiddenIds: [], id: 'c', isHidden: true })).to.eql(['c']);
  });
});
