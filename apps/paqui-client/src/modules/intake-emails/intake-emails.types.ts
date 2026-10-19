export type IntakeEmail = {
  id: string;
  emailAddress: string;
  organizationId: string;
  isEnabled: boolean;
  allowedOrigins: string[];

  createdAt: Date;
  updatedAt: Date;
};

export type IntakeEmailDelivery = {
  id: string;
  intakeEmailId: string;
  organizationId: string;
  fromAddress: string;
  recipientAddress: string;
  subject: string | null;
  attachmentCount: number;
  status: 'processed' | 'no_attachments' | 'blocked_sender' | 'address_disabled';
  createdAt: Date;
  updatedAt: Date;
};
