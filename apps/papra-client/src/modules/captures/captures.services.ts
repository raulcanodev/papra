import type { AsDto } from '../shared/http/http-client.types';
import type { CapturePurpose, CaptureSession, PublicCapture } from './captures.types';
import { apiClient } from '../shared/http/api-client';
import { getFormData } from '../shared/http/http-client.models';

function toCaptureSession(dto: AsDto<CaptureSession>): CaptureSession {
  return {
    ...(dto as unknown as CaptureSession),
    expiresAt: new Date(dto.expiresAt),
    completedAt: dto.completedAt === null ? null : new Date(dto.completedAt),
    createdAt: new Date(dto.createdAt),
  };
}

const organizationPath = (organizationId: string) => `/api/organizations/${organizationId}/captures`;

export async function openCaptureSession({ organizationId, purpose }: { organizationId: string; purpose: CapturePurpose }) {
  const { captureSession, token } = await apiClient<{ captureSession: AsDto<CaptureSession>; token: string }>({ path: organizationPath(organizationId), method: 'POST', body: { purpose } });

  return { captureSession: toCaptureSession(captureSession), token };
}

export async function fetchCaptureSession({ organizationId, captureSessionId }: { organizationId: string; captureSessionId: string }) {
  const { captureSession } = await apiClient<{ captureSession: AsDto<CaptureSession> }>({ path: `${organizationPath(organizationId)}/${captureSessionId}`, method: 'GET' });

  return { captureSession: toCaptureSession(captureSession) };
}

export async function completeCaptureSession({ organizationId, captureSessionId }: { organizationId: string; captureSessionId: string }) {
  const { captureSession } = await apiClient<{ captureSession: AsDto<CaptureSession> }>({ path: `${organizationPath(organizationId)}/${captureSessionId}/complete`, method: 'POST' });

  return { captureSession: toCaptureSession(captureSession) };
}

// --- The phone, with the token of the QR code and no session

export async function fetchPublicCapture({ token }: { token: string }) {
  const { capture } = await apiClient<{ capture: AsDto<PublicCapture> }>({ path: `/api/captures/${token}`, method: 'GET' });

  return { capture: { ...(capture as unknown as PublicCapture), expiresAt: new Date(capture.expiresAt) } };
}

export async function uploadCaptureFile({ token, file }: { token: string; file: File }) {
  return apiClient<{ fileCount: number }>({ path: `/api/captures/${token}/files`, method: 'POST', body: getFormData({ file }) });
}

export async function completePublicCapture({ token }: { token: string }) {
  return apiClient<{ fileCount: number }>({ path: `/api/captures/${token}/complete`, method: 'POST' });
}
