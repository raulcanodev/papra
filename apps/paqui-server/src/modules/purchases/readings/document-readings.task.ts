import type { Database } from '../../app/database/database.types';
import type { Config } from '../../config/config.types';
import type { DocumentStorageService } from '../../documents/storage/documents.storage.services';
import type { TaskServices } from '../../tasks/tasks.services';
import { createLogger } from '../../shared/logger/logger';
import { DOCUMENT_READINGS_SWEEP_CRON, PROCESS_DOCUMENT_READINGS_TASK_NAME } from './document-readings.constants';
import { getDocumentReadingsRunner } from './document-readings.usecases';

const logger = createLogger({ namespace: 'purchases:document-readings:task' });

// The task only wakes the runner up and returns at once: the worker processes one task at a time and must not wait
// minutes behind AI calls (the OCR of new documents goes through it too). The readings themselves live in the database.
export async function registerProcessDocumentReadingsTask({ taskServices, db, config, documentsStorageService }: { taskServices: TaskServices; db: Database; config: Config; documentsStorageService: DocumentStorageService }) {
  const runner = getDocumentReadingsRunner({ db, config, documentsStorageService });

  taskServices.registerTask({
    taskName: PROCESS_DOCUMENT_READINGS_TASK_NAME,
    handler: async () => {
      void runner.sweep();
    },
  });

  // Every minute, and right now on startup: picks up what a restart or a lost wake-up left behind
  await taskServices.schedulePeriodicJob({
    scheduleId: `periodic-${PROCESS_DOCUMENT_READINGS_TASK_NAME}`,
    taskName: PROCESS_DOCUMENT_READINGS_TASK_NAME,
    cron: DOCUMENT_READINGS_SWEEP_CRON,
    immediate: true,
  });

  logger.info({ cron: DOCUMENT_READINGS_SWEEP_CRON }, 'Document readings task registered');
}

// Called right after enqueuing: in a process that also runs the worker the runner starts at once,
// otherwise a task tells the worker process
export async function wakeDocumentReadings({ taskServices, db, config, documentsStorageService }: { taskServices: TaskServices; db: Database; config: Config; documentsStorageService: DocumentStorageService }) {
  if (config.processMode !== 'web') {
    void getDocumentReadingsRunner({ db, config, documentsStorageService }).wake();
    return;
  }

  await taskServices.scheduleJob({ taskName: PROCESS_DOCUMENT_READINGS_TASK_NAME, deleteJobOnCompletion: true });
}
