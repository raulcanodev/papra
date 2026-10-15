import type { Readable } from 'node:stream';
import type { CreateDocumentUsecase } from '../documents/documents.usecases';
import type { CapturePurpose } from './captures.constants';
import type { CapturesRepository } from './captures.repository';
import { CAPTURE_MIME_TYPES, CAPTURE_SESSION_TTL_MS } from './captures.constants';
import { createCaptureFileLimitReachedError, createCaptureFileTypeNotAllowedError, createCaptureSessionClosedError, createCaptureSessionNotFoundError } from './captures.errors';
import { canAddFileToCaptureSession, generateCaptureToken, getCaptureSessionStatus, hashCaptureToken } from './captures.models';

export async function openCaptureSession({ organizationId, userId, purpose, capturesRepository, now = new Date() }: { organizationId: string; userId: string; purpose: CapturePurpose; capturesRepository: CapturesRepository; now?: Date }) {
  const { token, tokenHash } = generateCaptureToken();

  const { captureSession } = await capturesRepository.createCaptureSession({ organizationId, userId, purpose, tokenHash, expiresAt: new Date(now.getTime() + CAPTURE_SESSION_TTL_MS) });

  return { captureSession, token };
}

// An unknown and an expired token look the same to the phone: nothing tells an attacker which tokens existed
export async function getOpenCaptureSessionByToken({ token, capturesRepository, now = new Date() }: { token: string; capturesRepository: CapturesRepository; now?: Date }) {
  const { captureSession } = await capturesRepository.getCaptureSessionByTokenHash({ tokenHash: hashCaptureToken({ token }) });

  if (!captureSession || getCaptureSessionStatus({ captureSession, now }) === 'expired') {
    throw createCaptureSessionNotFoundError();
  }

  return { captureSession };
}

// The file becomes a regular document of the organization, uploaded on behalf of who opened the capture
export async function addFileToCaptureSession({
  token,
  getFile,
  createDocument,
  capturesRepository,
  now = new Date(),
}: {
  token: string;
  // Read once the capture is known to accept files: no upload is parsed for a closed or unknown capture
  getFile: () => Promise<{ fileStream: Readable; fileName: string; mimeType: string }>;
  createDocument: CreateDocumentUsecase;
  capturesRepository: CapturesRepository;
  now?: Date;
}) {
  const { captureSession } = await getOpenCaptureSessionByToken({ token, capturesRepository, now });

  if (captureSession.completedAt !== null) {
    throw createCaptureSessionClosedError();
  }

  if (!canAddFileToCaptureSession({ captureSession, now })) {
    throw createCaptureFileLimitReachedError();
  }

  const { fileStream, fileName, mimeType } = await getFile();

  if (!CAPTURE_MIME_TYPES[captureSession.purpose].includes(mimeType)) {
    // Drained so the request completes instead of hanging on an unread body
    fileStream.resume();
    throw createCaptureFileTypeNotAllowedError();
  }

  const { document } = await createDocument({ fileStream, fileName, mimeType, userId: captureSession.userId, organizationId: captureSession.organizationId });

  return capturesRepository.appendDocumentToCaptureSession({ captureSessionId: captureSession.id, documentId: document.id });
}

export async function completeCaptureSessionByToken({ token, capturesRepository, now = new Date() }: { token: string; capturesRepository: CapturesRepository; now?: Date }) {
  const { captureSession } = await getOpenCaptureSessionByToken({ token, capturesRepository, now });

  return capturesRepository.completeCaptureSession({ captureSessionId: captureSession.id, now });
}
