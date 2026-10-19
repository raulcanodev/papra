import type { Document } from '../../documents/documents.types';
import { Buffer } from 'node:buffer';
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createInMemoryDatabase } from '../../app/database/database.test-utils';
import { createServer } from '../../app/server';
import { createTestServerDependencies } from '../../app/server.test-utils';
import { overrideConfig } from '../../config/config.test-utils';
import { ORGANIZATION_ROLES } from '../../organizations/organizations.constants';
import { MIME_TYPES } from '../../shared/mime-types/mime-types.constants';
import { pick } from '../../shared/objects';

const RESEND_WEBHOOK_SECRET = `whsec_${Buffer.from('intake-email-test-secret').toString('base64')}`;

type TestEmailAttachment = { filename: string; mimeType: string; content: string | ArrayBuffer };

function serializeEmailForWebhook({ email }: {
  email: {
    from: { address: string; name?: string };
    to: Array<{ address: string; name?: string }>;
    subject?: string;
    attachments?: TestEmailAttachment[];
    cc?: Array<{ address: string; name?: string }>;
    html?: string;
    text?: string;
  };
}) {
  const emailId = 'resend-email-test';
  const attachments = email.attachments ?? [];

  if (attachments.length > 0) {
    mockResendAttachments({ emailId, attachments });
  }

  return {
    body: JSON.stringify({
      type: 'email.received',
      created_at: new Date().toISOString(),
      data: {
        email_id: emailId,
        created_at: new Date().toISOString(),
        from: email.from.name !== undefined ? `${email.from.name} <${email.from.address}>` : email.from.address,
        to: email.to.map(({ address }) => address),
        received_for: email.to.map(({ address }) => address),
        bcc: [],
        cc: email.cc?.map(({ address }) => address) ?? [],
        message_id: 'message-test',
        subject: email.subject ?? '',
        attachments: attachments.map((attachment, index) => ({
          id: `attachment-${index}`,
          filename: attachment.filename,
          content_type: attachment.mimeType,
          content_disposition: 'attachment',
          content_id: null,
        })),
      },
    }),
  };
}

async function signBody({ bodyBuffer, secret }: { bodyBuffer: ArrayBuffer; secret: string }) {
  const id = 'webhook-test';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = new TextDecoder().decode(bodyBuffer);
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64');

  return { id, timestamp, signature: `v1,${signature}` };
}

function mockResendAttachments({ emailId, attachments }: { emailId: string; attachments: TestEmailAttachment[] }) {
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : input.toString();

    if (url.endsWith(`/emails/receiving/${emailId}/attachments`)) {
      return Response.json({
        object: 'list',
        has_more: false,
        data: attachments.map((attachment, index) => ({
          id: `attachment-${index}`,
          filename: attachment.filename,
          size: typeof attachment.content === 'string' ? new TextEncoder().encode(attachment.content).byteLength : attachment.content.byteLength,
          content_type: attachment.mimeType,
          content_disposition: 'attachment',
          download_url: `https://attachments.test/${index}`,
          expires_at: new Date(Date.now() + 60_000).toISOString(),
        })),
      });
    }

    const attachmentIndex = Number(new URL(url).pathname.slice(1));
    const attachment = attachments[attachmentIndex];
    return attachment ? new Response(attachment.content) : new Response(null, { status: 404 });
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe('intake-emails e2e', () => {
  test('an organization chooses a globally unique alias and the API exposes its configured domain', async () => {
    const userId = 'usr_111111111111111111111111';
    const firstOrganizationId = 'org_111111111111111111111111';
    const secondOrganizationId = 'org_222222222222222222222222';
    const { db } = await createInMemoryDatabase({
      users: [{ id: userId, email: 'owner@example.com' }],
      organizations: [{ id: firstOrganizationId, name: 'Jocrimar' }, { id: secondOrganizationId, name: 'Other' }],
      organizationMembers: [
        { id: 'org_member_1', organizationId: firstOrganizationId, userId, role: ORGANIZATION_ROLES.OWNER },
        { id: 'org_member_2', organizationId: secondOrganizationId, userId, role: ORGANIZATION_ROLES.OWNER },
      ],
    });
    const { app } = createServer(createTestServerDependencies({
      db,
      config: overrideConfig({
        env: 'test',
        organizationPlans: { isFreePlanUnlimited: true },
        intakeEmails: { isEnabled: true, driver: 'resend', drivers: { resend: { domain: 'heypaqui.com' } } },
      }),
    }));

    const first = await app.request(`/api/organizations/${firstOrganizationId}/intake-emails`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alias: 'Jocrimar' }) }, { loggedInUserId: userId });
    expect(first.status).to.eql(200);
    const { intakeEmail: created } = await first.json() as { intakeEmail: { emailAddress: string; allowedOrigins: string[] } };
    expect(pick(created, ['emailAddress', 'allowedOrigins'])).to.eql({
      emailAddress: 'jocrimar@heypaqui.com',
      allowedOrigins: ['owner@example.com'],
    });

    const duplicate = await app.request(`/api/organizations/${secondOrganizationId}/intake-emails`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ alias: 'jocrimar' }) }, { loggedInUserId: userId });
    expect(duplicate.status).to.eql(400);
    expect((await duplicate.json() as { error: { code: string } }).error.code).to.eql('intake_email.already_exists');

    const list = await app.request(`/api/organizations/${firstOrganizationId}/intake-emails`, { method: 'GET' }, { loggedInUserId: userId });
    expect(await list.json()).to.include({ domain: 'heypaqui.com' });
  });

  describe('ingest an intake email', () => {
    test('when intake email ingestion is disabled, a 403 is returned', async () => {
      const { db } = await createInMemoryDatabase();
      const { app } = createServer(createTestServerDependencies({
        db,
        config: overrideConfig({
          intakeEmails: {
            isEnabled: false,
          },
        }),
      }));

      const { body } = serializeEmailForWebhook({ email: {
        from: { address: 'foo@example.fr', name: 'Foo' },
        to: [{ address: 'bar@example.fr', name: 'Bar' }],
      } });

      const response = await app.request('/api/intake-emails/ingest', {
        method: 'POST',
        body,
      });

      expect(response.status).to.eql(403);
      expect(await response.json()).to.eql({
        error: {
          code: 'intake_emails.disabled',
          message: 'Intake emails are disabled',
        },
      });
    });

    describe('when ingesting an email, the request must have valid Resend signature headers', async () => {
      test('when the header is missing, a 400 is returned', async () => {
        const { db } = await createInMemoryDatabase();
        const { app } = createServer(createTestServerDependencies({
          db,
          config: overrideConfig({
            intakeEmails: {
              isEnabled: true,
              webhookSecret: RESEND_WEBHOOK_SECRET,
            },
          }),
        }));

        const { body } = serializeEmailForWebhook({ email: {
          from: { address: 'foo@example.fr', name: 'Foo' },
          to: [{ address: 'bar@example.fr', name: 'Bar' }],
        } });

        const response = await app.request('/api/intake-emails/ingest', {
          method: 'POST',
          body,
        });

        expect(response.status).to.eql(400);
        expect(await response.json()).to.eql({
          error: {
            code: 'intake_emails.signature_header_required',
            message: 'Resend signature headers are required',
          },
        });
      });

      test('when the header is invalid, a 401 is returned', async () => {
        const { db } = await createInMemoryDatabase();
        const { app } = createServer(createTestServerDependencies({
          db,
          config: overrideConfig({
            intakeEmails: {
              isEnabled: true,
              webhookSecret: RESEND_WEBHOOK_SECRET,
            },
          }),
        }));

        const { body } = serializeEmailForWebhook({ email: {
          from: { address: 'foo@example.fr', name: 'Foo' },
          to: [{ address: 'bar@example.fr', name: 'Bar' }],
        } });

        const response = await app.request('/api/intake-emails/ingest', {
          method: 'POST',
          headers: {
            'svix-id': 'webhook-test',
            'svix-timestamp': Math.floor(Date.now() / 1000).toString(),
            'svix-signature': 'v1,invalid',
          },
          body,
        });

        expect(response.status).to.eql(401);
        expect(await response.json()).to.eql({
          error: {
            code: 'auth.unauthorized',
            message: 'Unauthorized',
          },
        });
      });
    });

    test('when the ingestion is enabled and the request signature is valid, the email attachments are added to the organization', async () => {
      const { db } = await createInMemoryDatabase({
        users: [{ id: 'usr_111111111111111111111111', email: 'foo@example.fr' }],
        organizations: [{ id: 'org_111111111111111111111111', name: 'Organization 1' }],
        organizationMembers: [{ id: 'org_member_1', organizationId: 'org_111111111111111111111111', userId: 'usr_111111111111111111111111', role: ORGANIZATION_ROLES.OWNER }],
        intakeEmails: [{ id: 'ie_1', organizationId: 'org_111111111111111111111111', emailAddress: 'email-1@paqui.email', allowedOrigins: ['foo@example.fr'] }],
      });

      const { app } = createServer(createTestServerDependencies({
        db,
        config: overrideConfig({
          env: 'test',
          intakeEmails: { isEnabled: true, webhookSecret: RESEND_WEBHOOK_SECRET },
        }),
      }));

      const { body } = serializeEmailForWebhook({ email: {
        from: { address: 'foo@example.fr', name: 'Foo' },
        to: [{ address: 'email-1@paqui.email', name: 'Bar' }],
        attachments: [{ filename: 'test.txt', mimeType: 'text/plain', content: 'hello world' }],

        // unused fields, but very likely to be present in the payload
        subject: 'Hello world',
        cc: [{ address: 'cc@example.fr', name: 'Cc' }],
        html: '<p>Hello world</p>',
        text: 'Hello world',
      } });
      const bodyResponse = new Response(body);
      const headers = Object.fromEntries(bodyResponse.headers.entries());
      const bodyArrayBuffer = await bodyResponse.arrayBuffer();
      const signature = await signBody({ bodyBuffer: bodyArrayBuffer, secret: RESEND_WEBHOOK_SECRET });
      headers['svix-id'] = signature.id;
      headers['svix-timestamp'] = signature.timestamp;
      headers['svix-signature'] = signature.signature;

      const ingestionResponse = await app.request('/api/intake-emails/ingest', {
        method: 'POST',
        headers,
        body: bodyArrayBuffer,
      });

      expect(ingestionResponse.status).to.eql(202);

      const documentsResponse = await app.request(
        '/api/organizations/org_111111111111111111111111/documents',
        { method: 'GET' },
        { loggedInUserId: 'usr_111111111111111111111111' },
      );

      expect(documentsResponse.status).to.eql(200);
      const { documents } = await documentsResponse.json() as { documents: Document[] };

      expect(documents).to.have.length(1);

      const document = documents[0]!;

      expect(
        pick(document, ['organizationId', 'createdBy', 'mimeType', 'originalName', 'originalSize']),
      ).to.eql({
        organizationId: 'org_111111111111111111111111',
        createdBy: null,
        mimeType: 'text/plain',
        originalName: 'test.txt',
        originalSize: 11,
      });

      const storedFileContentResponse = await app.request(
        `/api/organizations/org_111111111111111111111111/documents/${document.id}/file`,
        { method: 'GET' },
        { loggedInUserId: 'usr_111111111111111111111111' },
      );

      expect(storedFileContentResponse.status).to.eql(200);
      const storedFileContent = await storedFileContentResponse.text();

      expect(storedFileContent).to.eql('hello world');
    });

    test('an email without attachments is kept in recent activity and creates no document', async () => {
      const userId = 'usr_111111111111111111111111';
      const organizationId = 'org_111111111111111111111111';
      const { db } = await createInMemoryDatabase({
        users: [{ id: userId, email: 'foo@example.fr' }],
        organizations: [{ id: organizationId, name: 'Organization 1' }],
        organizationMembers: [{ id: 'org_member_1', organizationId, userId, role: ORGANIZATION_ROLES.OWNER }],
        intakeEmails: [{ id: 'ie_1', organizationId, emailAddress: 'jocrimar@heypaqui.com', allowedOrigins: ['foo@example.fr'] }],
      });
      const { app } = createServer(createTestServerDependencies({
        db,
        config: overrideConfig({ env: 'test', intakeEmails: { isEnabled: true, webhookSecret: RESEND_WEBHOOK_SECRET } }),
      }));
      const { body } = serializeEmailForWebhook({ email: {
        from: { address: 'foo@example.fr', name: 'Foo' },
        to: [{ address: 'jocrimar@heypaqui.com', name: 'Jocrimar' }],
        subject: 'Hola, ¿cómo estás?',
      } });
      const bodyResponse = new Response(body);
      const headers = Object.fromEntries(bodyResponse.headers.entries());
      const bodyArrayBuffer = await bodyResponse.arrayBuffer();
      const signature = await signBody({ bodyBuffer: bodyArrayBuffer, secret: RESEND_WEBHOOK_SECRET });
      headers['svix-id'] = signature.id;
      headers['svix-timestamp'] = signature.timestamp;
      headers['svix-signature'] = signature.signature;

      const ingestion = await app.request('/api/intake-emails/ingest', { method: 'POST', headers, body: bodyArrayBuffer });
      expect(ingestion.status).to.eql(202);

      const replay = await app.request('/api/intake-emails/ingest', { method: 'POST', headers, body: bodyArrayBuffer });
      expect(replay.status).to.eql(202);

      const activity = await app.request(`/api/organizations/${organizationId}/intake-emails`, { method: 'GET' }, { loggedInUserId: userId });
      const payload = await activity.json() as { deliveries: Array<{ subject: string; status: string; attachmentCount: number }> };
      expect(payload.deliveries).to.have.length(1);
      expect(payload.deliveries[0]).to.include({ subject: 'Hola, ¿cómo estás?', status: 'no_attachments', attachmentCount: 0 });

      const documents = await app.request(`/api/organizations/${organizationId}/documents`, { method: 'GET' }, { loggedInUserId: userId });
      expect((await documents.json() as { documents: Document[] }).documents).to.eql([]);
    });

    test('when the attachment is a PDF with an octet-stream mime type, the mime type is correctly detected and the file is stored with the correct mime type', async () => {
      const minimalPdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);

      const { db } = await createInMemoryDatabase({
        users: [{ id: 'usr_111111111111111111111111', email: 'foo@example.fr' }],
        organizations: [{ id: 'org_111111111111111111111111', name: 'Organization 1' }],
        organizationMembers: [{ id: 'org_member_1', organizationId: 'org_111111111111111111111111', userId: 'usr_111111111111111111111111', role: ORGANIZATION_ROLES.OWNER }],
        intakeEmails: [{ id: 'ie_1', organizationId: 'org_111111111111111111111111', emailAddress: 'email-1@paqui.email', allowedOrigins: ['foo@example.fr'] }],
      });

      const { app } = createServer(createTestServerDependencies({
        db,
        config: overrideConfig({
          env: 'test',
          intakeEmails: { isEnabled: true, webhookSecret: RESEND_WEBHOOK_SECRET },
        }),
      }));

      const { body } = serializeEmailForWebhook({ email: {
        from: { address: 'foo@example.fr', name: 'Foo' },
        to: [{ address: 'email-1@paqui.email', name: 'Bar' }],
        attachments: [{ filename: 'test.pdf', mimeType: MIME_TYPES.OCTET_STREAM, content: minimalPdfBytes.buffer }],
      } });
      const bodyResponse = new Response(body);
      const headers = Object.fromEntries(bodyResponse.headers.entries());
      const bodyArrayBuffer = await bodyResponse.arrayBuffer();
      const signature = await signBody({ bodyBuffer: bodyArrayBuffer, secret: RESEND_WEBHOOK_SECRET });
      headers['svix-id'] = signature.id;
      headers['svix-timestamp'] = signature.timestamp;
      headers['svix-signature'] = signature.signature;

      const ingestionResponse = await app.request('/api/intake-emails/ingest', {
        method: 'POST',
        headers,
        body: bodyArrayBuffer,
      });

      expect(ingestionResponse.status).to.eql(202);

      const documentsResponse = await app.request(
        '/api/organizations/org_111111111111111111111111/documents',
        { method: 'GET' },
        { loggedInUserId: 'usr_111111111111111111111111' },
      );

      expect(documentsResponse.status).to.eql(200);
      const { documents } = await documentsResponse.json() as { documents: Document[] };

      expect(documents).to.have.length(1);

      const document = documents[0]!;

      expect(
        pick(document, ['organizationId', 'createdBy', 'mimeType', 'originalName', 'originalSize']),
      ).to.eql({
        organizationId: 'org_111111111111111111111111',
        createdBy: null,
        mimeType: 'application/pdf',
        originalName: 'test.pdf',
        originalSize: minimalPdfBytes.length,
      });

      const storedFileContentResponse = await app.request(
        `/api/organizations/org_111111111111111111111111/documents/${document.id}/file`,
        { method: 'GET' },
        { loggedInUserId: 'usr_111111111111111111111111' },
      );

      expect(storedFileContentResponse.status).to.eql(200);
      const storedFileContent = new Uint8Array(await storedFileContentResponse.arrayBuffer());

      expect(storedFileContent).to.eql(minimalPdfBytes);
    });
  });
});
