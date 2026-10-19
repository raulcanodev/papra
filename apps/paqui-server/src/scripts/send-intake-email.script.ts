import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';
import { buildUrl } from '@corentinth/chisels';
import { getServerBaseUrl } from '../modules/config/config.models';
import { INTAKE_EMAILS_INGEST_ROUTE } from '../modules/intake-emails/intake-emails.constants';
import { runScriptWithDb } from './commons/run-script';

await runScriptWithDb(
  { scriptName: 'simulate-intake-email' },
  async ({ config }) => {
    const { serverBaseUrl } = getServerBaseUrl({ config });
    const { webhookSecret } = config.intakeEmails;

    const webhookUrl = buildUrl({ baseUrl: serverBaseUrl, path: INTAKE_EMAILS_INGEST_ROUTE });

    const payload = JSON.stringify({
      type: 'email.received',
      created_at: new Date().toISOString(),
      data: {
        email_id: 'local-test-email',
        created_at: new Date().toISOString(),
        from: 'Test <test@example.com>',
        to: ['jocrimar@heypaqui.com'],
        received_for: ['jocrimar@heypaqui.com'],
        bcc: [],
        cc: [],
        message_id: 'local-test-message',
        subject: 'Local Resend webhook test',
        attachments: [],
      },
    });

    const id = 'local-webhook-test';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const key = Buffer.from(webhookSecret.replace(/^whsec_/, ''), 'base64');
    const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64');

    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'svix-id': id,
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${signature}`,
      },
      body: payload,
    });
  },
);
