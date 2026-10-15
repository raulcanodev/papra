import { defineHandler } from '../demo-api-mock.models';
import { createId, randomString } from '../demo.models';

const CAPTURE_TTL_MS = 15 * 60 * 1_000;

// The demo lives in the browser: a phone cannot reach it. The QR code is shown and waits, so the visitor sees the flow,
// and the phone side answers like an expired link
const captureSessions = new Map<string, { id: string; purpose: string; createdAt: string; expiresAt: string }>();

function toCaptureSession(session: { id: string; purpose: string; createdAt: string; expiresAt: string }) {
  const isExpired = new Date(session.expiresAt).getTime() <= Date.now();

  return { ...session, status: isExpired ? 'expired' : 'waiting', documentIds: [], completedAt: null };
}

function throwCaptureNotFound(): never {
  throw Object.assign(new Error('Capture not found'), { status: 404, data: { error: { message: 'This capture link does not exist or has expired, open a new one from the computer.', code: 'capture_session.not_found' } } });
}

export const capturesHandlers = {
  ...defineHandler({
    path: '/api/organizations/:organizationId/captures',
    method: 'POST',
    handler: ({ body }) => {
      const now = new Date();
      const session = { id: createId({ prefix: 'cap' }), purpose: (body as { purpose: string }).purpose, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + CAPTURE_TTL_MS).toISOString() };
      captureSessions.set(session.id, session);

      return { captureSession: toCaptureSession(session), token: randomString({ length: 40 }) };
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/captures/:captureSessionId',
    method: 'GET',
    handler: ({ params: { captureSessionId } }) => {
      const session = captureSessions.get(captureSessionId);
      return session ? { captureSession: toCaptureSession(session) } : throwCaptureNotFound();
    },
  }),
  ...defineHandler({
    path: '/api/organizations/:organizationId/captures/:captureSessionId/complete',
    method: 'POST',
    handler: ({ params: { captureSessionId } }) => {
      const session = captureSessions.get(captureSessionId);
      captureSessions.delete(captureSessionId);
      return session ? { captureSession: { ...toCaptureSession(session), status: 'completed', completedAt: new Date().toISOString() } } : throwCaptureNotFound();
    },
  }),
  ...defineHandler({ path: '/api/captures/:token', method: 'GET', handler: () => throwCaptureNotFound() }),
  ...defineHandler({ path: '/api/captures/:token/files', method: 'POST', handler: () => throwCaptureNotFound() }),
  ...defineHandler({ path: '/api/captures/:token/complete', method: 'POST', handler: () => throwCaptureNotFound() }),
};
