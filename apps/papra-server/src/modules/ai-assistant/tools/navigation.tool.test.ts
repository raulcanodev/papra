import { describe, expect, test } from 'vitest';
import { createNavigationTool, isPathInsideOrganization } from './navigation.tool';

const ORG = 'org_1';

describe('navigation tool', () => {
  describe('isPathInsideOrganization', () => {
    test('accepts pages of the workspace', () => {
      expect(isPathInsideOrganization({ path: '/organizations/org_1/invoicing/invoices', organizationId: ORG })).to.eql(true);
      expect(isPathInsideOrganization({ path: '/organizations/org_1/invoicing/invoices/inv_1/edit', organizationId: ORG })).to.eql(true);
    });

    test.each([
      'https://evil.example/organizations/org_1/x',
      '//evil.example/organizations/org_1/x',
      '/organizations/org_2/home',
      '/organizations/org_1/../org_2/home',
      '/organizations/org_1/invoicing/:invoiceId/edit',
      '/organizations/org_1/\\evil',
      'javascript:alert(1)',
    ])('refuses %s', (path) => {
      expect(isPathInsideOrganization({ path, organizationId: ORG })).to.eql(false);
    });
  });

  test('returns the navigation for the stream with the label of a known page', async () => {
    const navigate = createNavigationTool({
      organizationId: ORG,
      pageContext: { path: '/organizations/org_1/home', params: {}, entityPages: [], pages: [{ path: '/organizations/org_1/taxes', label: 'Quarterly taxes' }] },
    });

    const result = await navigate.execute!({ path: '/organizations/org_1/taxes', reason: 'Para ver tus impuestos' }, { toolCallId: 't', messages: [] });

    expect(result).to.eql({ navigation: { path: '/organizations/org_1/taxes', label: 'Quarterly taxes', reason: 'Para ver tus impuestos' } });
  });

  test('tells the model when the path is not a page of the workspace', async () => {
    const navigate = createNavigationTool({ organizationId: ORG, pageContext: undefined });

    const result = await navigate.execute!({ path: 'https://evil.example' }, { toolCallId: 't', messages: [] });

    expect(result).to.have.property('error');
  });
});
