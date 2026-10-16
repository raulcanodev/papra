import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase } from '../app/database/database.test-utils';
import { createGestoriasRepository } from './gestorias.repository';
import { gestoriaClientsTable, gestoriaMembersTable, gestoriasTable } from './gestorias.tables';
import { ensureGestoriaCanReadClient } from './gestorias.usecases';

async function setup() {
  const { db } = await createInMemoryDatabase({
    users: [
      { id: 'usr_gestor', email: 'gestor@example.com', name: 'Gestor' },
      { id: 'usr_outsider', email: 'outsider@example.com', name: 'Outsider' },
    ],
    organizations: [
      { id: 'org_111111111111111111111111', name: 'Client' },
      { id: 'org_222222222222222222222222', name: 'Not a client' },
      { id: 'org_333333333333333333333333', name: 'Deleted client', deletedAt: new Date('2026-01-01') },
    ],
  });

  await db.insert(gestoriasTable).values({ id: 'gst_aaaaaaaaaaaaaaaaaaaaaaaa', name: 'Gestoría' });
  await db.insert(gestoriaMembersTable).values({ gestoriaId: 'gst_aaaaaaaaaaaaaaaaaaaaaaaa', userId: 'usr_gestor' });
  await db.insert(gestoriaClientsTable).values([
    { gestoriaId: 'gst_aaaaaaaaaaaaaaaaaaaaaaaa', organizationId: 'org_111111111111111111111111', modules: ['invoices'] },
    { gestoriaId: 'gst_aaaaaaaaaaaaaaaaaaaaaaaa', organizationId: 'org_333333333333333333333333', modules: ['invoices'] },
  ]);

  return { gestoriasRepository: createGestoriasRepository({ db }) };
}

describe('gestorias usecases', () => {
  describe('ensureGestoriaCanReadClient', () => {
    test('a member reads the granted modules of a client company', async () => {
      const { gestoriasRepository } = await setup();

      const { access } = await ensureGestoriaCanReadClient({ userId: 'usr_gestor', gestoriaId: 'gst_aaaaaaaaaaaaaaaaaaaaaaaa', organizationId: 'org_111111111111111111111111', module: 'invoices', gestoriasRepository });

      expect(access.modules).to.eql(['invoices']);
    });

    test('a module that was not granted is refused', async () => {
      const { gestoriasRepository } = await setup();

      await expect(ensureGestoriaCanReadClient({ userId: 'usr_gestor', gestoriaId: 'gst_aaaaaaaaaaaaaaaaaaaaaaaa', organizationId: 'org_111111111111111111111111', module: 'purchases', gestoriasRepository }))
        .rejects
        .toMatchObject({ code: 'gestoria.client_access_denied' });
    });

    test('a company that is not a client, or was deleted, is refused', async () => {
      const { gestoriasRepository } = await setup();

      for (const organizationId of ['org_222222222222222222222222', 'org_333333333333333333333333']) {
        await expect(ensureGestoriaCanReadClient({ userId: 'usr_gestor', gestoriaId: 'gst_aaaaaaaaaaaaaaaaaaaaaaaa', organizationId, gestoriasRepository }))
          .rejects
          .toMatchObject({ code: 'gestoria.client_access_denied' });
      }
    });

    test('someone who is not a member of the gestoría is refused, even for its clients', async () => {
      const { gestoriasRepository } = await setup();

      await expect(ensureGestoriaCanReadClient({ userId: 'usr_outsider', gestoriaId: 'gst_aaaaaaaaaaaaaaaaaaaaaaaa', organizationId: 'org_111111111111111111111111', module: 'invoices', gestoriasRepository }))
        .rejects
        .toMatchObject({ code: 'gestoria.user_not_member' });
    });
  });
});
