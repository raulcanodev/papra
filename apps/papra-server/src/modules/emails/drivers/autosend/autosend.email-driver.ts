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
    sendEmail: async ({ to, subject, html, from }) => {
      const fromAddress = from ?? fromEmail;
      const fromParts = fromAddress.match(/^(.+?)\s*<(.+?)>$/);

      const { error } = await autosendClient.emails.send({
        from: fromParts
          ? { name: fromParts[1]!.trim(), email: fromParts[2]! }
          : { email: fromAddress },
        to: { email: to },
        subject,
        html,
      });

      if (error) {
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
