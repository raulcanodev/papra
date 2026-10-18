import type { Database } from '../../app/database/database.types';
import type { Config } from '../../config/config.types';
import type { EmailsServices } from '../../emails/emails.services';
import type { TaskServices } from '../../tasks/tasks.services';
import { createLogger } from '../../shared/logger/logger';
import { SEND_DUE_REMINDERS_CRON, SEND_DUE_REMINDERS_TASK_NAME } from '../notifications.constants';
import { sendDueReminders } from '../notifications.usecases';

const logger = createLogger({ namespace: 'notifications:tasks:sendDueReminders' });

// Once a day: emails the reminders due today (see sendDueReminders) to the organizations that want them
export async function registerSendDueRemindersTask({ taskServices, db, config, emailsServices }: { taskServices: TaskServices; db: Database; config: Config; emailsServices: EmailsServices }) {
  taskServices.registerTask({
    taskName: SEND_DUE_REMINDERS_TASK_NAME,
    handler: async () => {
      const { sentCount } = await sendDueReminders({ db, emailsServices, config });

      logger.info({ sentCount }, 'Due reminders sent');
    },
  });

  await taskServices.schedulePeriodicJob({
    scheduleId: `periodic-${SEND_DUE_REMINDERS_TASK_NAME}`,
    taskName: SEND_DUE_REMINDERS_TASK_NAME,
    cron: SEND_DUE_REMINDERS_CRON,
  });

  logger.info({ cron: SEND_DUE_REMINDERS_CRON }, 'Send due reminders task registered');
}
