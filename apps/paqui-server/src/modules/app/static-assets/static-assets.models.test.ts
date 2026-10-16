import { describe, expect, test } from 'vitest';
import { isApiRoute, isAssetRoute } from './static-assets.models';

describe('static-assets models', () => {
  describe('isApiRoute', () => {
    test('an api route starts with /api/*', () => {
      expect(isApiRoute({ path: '/api/test' })).to.equal(true);
      expect(isApiRoute({ path: '/api/' })).to.equal(true);
      expect(isApiRoute({ path: '/api' })).to.equal(true);

      expect(isApiRoute({ path: '/apitest' })).to.equal(false);
      expect(isApiRoute({ path: '/' })).to.equal(false);
      expect(isApiRoute({ path: '' })).to.equal(false);
      expect(isApiRoute({ path: '/index.html' })).to.equal(false);
    });
  });

  describe('isAssetRoute', () => {
    test('build assets live under /assets/', () => {
      expect(isAssetRoute({ path: '/assets/index-abc123.js' })).to.equal(true);
      expect(isAssetRoute({ path: '/assets/' })).to.equal(true);

      expect(isAssetRoute({ path: '/assetsfoo' })).to.equal(false);
      expect(isAssetRoute({ path: '/organizations/org_1/assets' })).to.equal(false);
      expect(isAssetRoute({ path: '/' })).to.equal(false);
    });
  });
});
