import type { DemoCustomPropertyDefinitionFixture } from './custom-property-definitions.fixtures';
import type { DemoTagFixtureNames } from './tags.fixtures';

export type DemoDocumentCustomPropertyValue = {
  key: DemoCustomPropertyDefinitionFixture['key'];
  value: unknown;
};

// Where a seeded document is filed: one of the manual folders, or the folder of a supplier
export type DemoDocumentFolder = { manual: 'Contratos' | 'Impuestos' | 'Seguros' | 'Banco' } | { supplierTaxId: string };

export type DemoDocumentFixture = {
  name: string;
  /** Days before the visit: the demo never ages */
  daysAgo: number;
  /** Rendered as a PDF at seed time, also the text the search reads */
  title: string;
  lines: string[];
  tags: DemoTagFixtureNames[];
  folder?: DemoDocumentFolder;
  customProperties?: DemoDocumentCustomPropertyValue[];
};
