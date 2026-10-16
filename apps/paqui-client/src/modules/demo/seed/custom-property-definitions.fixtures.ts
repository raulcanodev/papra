import type { CustomPropertySelectOption, CustomPropertyType } from '../../custom-properties/custom-properties.types';

export type DemoCustomPropertyDefinitionFixture = {
  name: string;
  key: string;
  description?: string;
  type: CustomPropertyType;
  options?: CustomPropertySelectOption[];
};

export const customPropertyDefinitionsFixtures: DemoCustomPropertyDefinitionFixture[] = [
  {
    name: 'Estado',
    key: 'status',
    description: 'En qué punto está el documento',
    type: 'select',
    options: [
      { id: 'opt_status_pending', key: 'pending', name: 'Pendiente de revisar', displayOrder: 0 },
      { id: 'opt_status_reviewed', key: 'reviewed', name: 'Revisado', displayOrder: 1 },
      { id: 'opt_status_sent', key: 'sent_to_accountant', name: 'Enviado a la gestoría', displayOrder: 2 },
    ],
  },
  {
    name: 'Importe',
    key: 'amount',
    description: 'Importe en euros',
    type: 'number',
  },
  {
    name: 'Vencimiento',
    key: 'due_date',
    description: 'Fecha límite de pago o de renovación',
    type: 'date',
  },
  {
    name: 'Referencia',
    key: 'reference',
    description: 'Número de póliza, contrato o expediente',
    type: 'text',
  },
  {
    name: 'Confidencial',
    key: 'confidential',
    description: 'Solo para la dirección',
    type: 'boolean',
  },
] as const satisfies DemoCustomPropertyDefinitionFixture[];
