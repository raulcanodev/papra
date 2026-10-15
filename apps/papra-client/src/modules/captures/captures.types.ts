export type CapturePurpose = 'purchase' | 'product_image';

export type CaptureSessionStatus = 'waiting' | 'receiving' | 'completed' | 'expired';

// What the computer that opened the capture follows
export type CaptureSession = {
  id: string;
  purpose: CapturePurpose;
  status: CaptureSessionStatus;
  documentIds: string[];
  expiresAt: Date;
  completedAt: Date | null;
  createdAt: Date;
};

// What the phone sees with the token of the QR code
export type PublicCapture = {
  purpose: CapturePurpose;
  status: CaptureSessionStatus;
  fileCount: number;
  maxFiles: number;
  expiresAt: Date;
  organizationName: string | null;
};
