import { createErrorFactory } from '../shared/errors/errors';

export const createCaptureSessionNotFoundError = createErrorFactory({
  message: 'This capture link does not exist or has expired, open a new one from the computer.',
  code: 'capture_session.not_found',
  statusCode: 404,
});

export const createCaptureSessionClosedError = createErrorFactory({
  message: 'This capture is already finished.',
  code: 'capture_session.closed',
  statusCode: 409,
});

export const createCaptureFileLimitReachedError = createErrorFactory({
  message: 'No more files can be added to this capture.',
  code: 'capture_session.file_limit_reached',
  statusCode: 409,
});

export const createCaptureFileTypeNotAllowedError = createErrorFactory({
  message: 'This type of file cannot be captured here.',
  code: 'capture_session.file_type_not_allowed',
  statusCode: 400,
});
