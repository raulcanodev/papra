import { CATCH_ALL_INTAKE_EMAIL_DRIVER_NAME, catchAllIntakeEmailDriverFactory } from './catch-all/catch-all.intake-email-driver';
import { RESEND_INTAKE_EMAIL_DRIVER_NAME, resendIntakeEmailDriverFactory } from './resend/resend.intake-email-driver';

export const intakeEmailDrivers = {
  [RESEND_INTAKE_EMAIL_DRIVER_NAME]: resendIntakeEmailDriverFactory,
  [CATCH_ALL_INTAKE_EMAIL_DRIVER_NAME]: catchAllIntakeEmailDriverFactory,
} as const;

export type IntakeEmailDriverName = keyof typeof intakeEmailDrivers;
