import { Autosend } from 'autosendjs';
import { createError } from '../../../shared/errors/errors';
import { parseEmailAddress } from '../../emails.models';
import { defineEmailDriverFactory } from '../email-driver.models';

export const AUTOSEND_EMAIL_DRIVER_NAME = 'autosend';

export const autosendEmailDriverFactory = defineEmailDriverFactory(({ config, logger }) => {
  const { fromEmail } = config.emails;
  const { autosendApiKey } = config.emails.drivers.autosend;

  const autosendClient = new Autosend(autosendApiKey);

  return {
    name: AUTOSEND_EMAIL_DRIVER_NAME,
    sendEmail: async ({ to, subject, html, from, replyTo, attachments }) => {
      if ((attachments?.length ?? 0) > 0) {
        throw createError({
          code: 'email.attachments_unsupported',
          message: 'The AutoSend email driver does not support attachments',
          statusCode: 501,
          isInternal: true,
        });
      }
      const { error } = await autosendClient.emails.send({
        from: parseEmailAddress({ address: from ?? fromEmail }),
        to: { email: to },
        replyTo: replyTo === undefined ? undefined : parseEmailAddress({ address: replyTo }),
        subject,
        html,
      });

      if (error !== null && error !== undefined) {
        logger.error({ error, to, subject, from }, 'Failed to send email with AutoSend');

        throw createError({
          code: 'email.send_failed',
          message: 'Failed to send email',
          statusCode: 500,
          isInternal: true,
        });
      }

      logger.info({ to, subject, from }, 'Email sent');
    },
  };
});
