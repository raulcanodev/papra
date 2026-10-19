import { buildEmailAddress } from '../../intake-emails.models';
import { defineIntakeEmailDriver } from '../intake-emails.drivers.models';

export const RESEND_INTAKE_EMAIL_DRIVER_NAME = 'resend';

// Resend receives the whole domain as a catch-all. Aliases only need to exist in our database.
export const resendIntakeEmailDriverFactory = defineIntakeEmailDriver(({ config }) => {
  const { domain } = config.intakeEmails.drivers.resend;

  return {
    name: RESEND_INTAKE_EMAIL_DRIVER_NAME,
    getEmailDomain: () => domain,
    createEmailAddress: async ({ username }) => ({
      emailAddress: buildEmailAddress({ username, domain }),
    }),
    deleteEmailAddress: async () => {},
  };
});
