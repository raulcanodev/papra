import { Autosend } from 'autosendjs';
import { createError } from '../../../shared/errors/errors';
import { defineEmailDriverFactory } from '../email-driver.models';

export const AUTOSEND_EMAIL_DRIVER_NAME = 'autosend';

export const autosendEmailDriverFactory = defineEmailDriverFactory(({ config, logger }) => {
  const { fromEmail } = config.emails;
  const { autosendApiKey } = config.emails.drivers.autosend;

  const autosendClient = new Autosend(autosendApiKey);

  return {
    name: AUTOSEND_EMAIL_DRIVER_NAME,
    sendEmail: async ({ to, subject, html, from, attachments }) => {
      if ((attachments?.length ?? 0) > 0) {
        throw createError({
          code: 'email.attachments_unsupported',
          message: 'The AutoSend email driver does not support attachments',
          statusCode: 501,
          isInternal: true,
        });
      }
      const fromAddress = from ?? fromEmail;
      const separatorIndex = fromAddress.lastIndexOf('<');
      const hasNamedAddress = separatorIndex > 0 && fromAddress.endsWith('>');

      const { error } = await autosendClient.emails.send({
        from: hasNamedAddress
          ? { name: fromAddress.slice(0, separatorIndex).trim(), email: fromAddress.slice(separatorIndex + 1, -1).trim() }
          : { email: fromAddress },
        to: { email: to },
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
