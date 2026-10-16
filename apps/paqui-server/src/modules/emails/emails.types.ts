import type { Buffer } from 'node:buffer';
import type { Config } from '../config/config.types';
import type { Logger } from '../shared/logger/logger';

export type EmailServices = {
  name: string;
  sendEmail: (args: {
    to: string;
    subject: string;
    html: string;
    from?: string;
    replyTo?: string;
    attachments?: Array<{
      filename: string;
      content: Buffer;
      contentType: string;
    }>;
  }) => Promise<void>;
};

export type EmailDriverFactory = (args: { config: Config; logger: Logger }) => EmailServices;
