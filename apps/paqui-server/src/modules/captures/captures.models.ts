import type { captureSessionsTable } from './captures.tables';
import { sha256 } from '../shared/crypto/hash';
import { generateRandomString } from '../shared/random/random.services';
import { CAPTURE_TOKEN_LENGTH, MAX_CAPTURE_FILES_BY_PURPOSE } from './captures.constants';

export type CaptureSession = typeof captureSessionsTable.$inferSelect;

export type CaptureSessionStatus = 'waiting' | 'receiving' | 'completed' | 'expired';

export function generateCaptureToken() {
  const token = generateRandomString({ length: CAPTURE_TOKEN_LENGTH });

  return { token, tokenHash: hashCaptureToken({ token }) };
}

export function hashCaptureToken({ token }: { token: string }) {
  return sha256(token, { digest: 'base64url' });
}

export function getCaptureSessionStatus({ captureSession, now = new Date() }: { captureSession: Pick<CaptureSession, 'documentIds' | 'completedAt' | 'expiresAt'>; now?: Date }): CaptureSessionStatus {
  if (captureSession.completedAt !== null) {
    return 'completed';
  }

  if (captureSession.expiresAt <= now) {
    return 'expired';
  }

  return captureSession.documentIds.length === 0 ? 'waiting' : 'receiving';
}

// A capture accepts files while it is open and until its purpose limit (one product image, many purchase papers)
export function canAddFileToCaptureSession({ captureSession, now = new Date() }: { captureSession: Pick<CaptureSession, 'documentIds' | 'completedAt' | 'expiresAt' | 'purpose'>; now?: Date }) {
  const status = getCaptureSessionStatus({ captureSession, now });

  return (status === 'waiting' || status === 'receiving') && captureSession.documentIds.length < MAX_CAPTURE_FILES_BY_PURPOSE[captureSession.purpose];
}

// What the computer that opened it sees, the token never leaves the creation response
export function formatCaptureSessionForApi({ captureSession, now = new Date() }: { captureSession: CaptureSession; now?: Date }) {
  return {
    id: captureSession.id,
    purpose: captureSession.purpose,
    status: getCaptureSessionStatus({ captureSession, now }),
    documentIds: captureSession.documentIds,
    expiresAt: captureSession.expiresAt,
    openedAt: captureSession.openedAt,
    completedAt: captureSession.completedAt,
    createdAt: captureSession.createdAt,
  };
}
