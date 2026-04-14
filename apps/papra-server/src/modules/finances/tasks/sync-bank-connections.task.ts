import type { Database } from '../../app/database/database.types';
import type { Config } from '../../config/config.types';
import type { TaskServices } from '../../tasks/tasks.services';
import { createLogger } from '../../shared/logger/logger';
import { createFinancesRepository } from '../finances.repository';
import { syncBankTransactions } from '../finances.usecases';

const logger = createLogger({ namespace: 'finances:tasks:syncBankConnections' });

export async function registerSyncBankConnectionsTask({ taskServices, db, config }: { taskServices: TaskServices; db: Database; config: Config }) {
  const taskName = 'sync-bank-connections';
  const cron = '0 2 * * *'; // Every day at 2:00 AM

  taskServices.registerTask({
    taskName,
    handler: async () => {
      const financesRepository = createFinancesRepository({ db, authSecret: config.auth.secret });
      const { bankConnections } = await financesRepository.getAllActiveBankConnections();

      let totalSynced = 0;
      let errors = 0;

      for (const connection of bankConnections) {
        try {
          const { insertedCount } = await syncBankTransactions({
            bankConnectionId: connection.id,
            organizationId: connection.organizationId,
            financesRepository,
          });
          totalSynced += insertedCount;
          logger.info({ connectionId: connection.id, provider: connection.provider, insertedCount }, 'Bank connection synced');
        }
        catch (error) {
          errors++;
          logger.error({ connectionId: connection.id, provider: connection.provider, error }, 'Failed to sync bank connection');
        }
      }

      logger.info({ totalConnections: bankConnections.length, totalSynced, errors }, 'Bank sync task completed');
    },
  });

  await taskServices.schedulePeriodicJob({
    scheduleId: `periodic-${taskName}`,
    taskName,
    cron,
    immediate: false,
  });

  logger.info({ taskName, cron }, 'Sync bank connections task registered');
}
