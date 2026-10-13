import { defineEmailDriverFactory } from '../email-driver.models';

export const LOGGER_EMAIL_DRIVER_NAME = 'logger';

export const loggerEmailDriverFactory = defineEmailDriverFactory(({ config, logger }) => {
  const { fromEmail } = config.emails;
  const { level } = config.emails.drivers.logger;

  return {
    name: LOGGER_EMAIL_DRIVER_NAME,
    sendEmail: async ({ to, subject, html, from, attachments }) => {
      logger[level]({
        to,
        subject,
        from: from ?? fromEmail,
        html,
        attachments: attachments?.map(({ filename, contentType, content }) => ({ filename, contentType, size: content.byteLength })),
      }, 'Sending email');
    },
  };
});
