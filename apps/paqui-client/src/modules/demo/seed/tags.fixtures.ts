export const tagsFixtures = [
  { name: 'Facturas recibidas', color: '#10b981', description: 'Facturas de proveedores' },
  { name: 'Contratos', color: '#3b82f6', description: 'Contratos con clientes, proveedores y oficina' },
  { name: 'Impuestos', color: '#ef4444', description: 'Modelos y justificantes de Hacienda' },
  { name: 'Seguros', color: '#f59e0b', description: 'Pólizas y recibos de seguros' },
  { name: 'Presupuestos', color: '#8b5cf6', description: 'Presupuestos enviados a clientes' },
  { name: 'Banco', color: '#0ea5e9', description: 'Extractos y certificados bancarios' },
] as const satisfies {
  name: string;
  color: string;
  description: string;
}[];

export type DemoTagFixtureNames = (typeof tagsFixtures)[number]['name'];
