import type { CreateDocumentUsecase } from '../documents/documents.usecases';
import type { PlansRepository } from '../plans/plans.repository';
import type { Logger } from '../shared/logger/logger';
import type { SubscriptionsRepository } from '../subscriptions/subscriptions.repository';
import type { IntakeEmailsServices } from './drivers/intake-emails.drivers.models';
import type { IntakeEmailsRepository } from './intake-emails.repository';
import { safely } from '@corentinth/chisels';
import { getOrganizationPlan } from '../plans/plans.usecases';
import { addLogContext, createLogger } from '../shared/logger/logger';
import { coerceFileMimeType } from '../shared/mime-types/mime-types.usecases';
import { fileToReadableStream } from '../shared/streams/readable-stream';
import { createIntakeEmailAlreadyExistsError, createIntakeEmailLimitReachedError, createIntakeEmailNotFoundError } from './intake-emails.errors';
import { buildEmailAddress, getIsFromAllowedOrigin } from './intake-emails.models';

export async function createIntakeEmail({
  alias,
  initialAllowedOrigins,
  organizationId,
  intakeEmailsRepository,
  intakeEmailsServices,
  plansRepository,
  subscriptionsRepository,
}: {
  alias: string;
  initialAllowedOrigins?: string[];
  organizationId: string;
  intakeEmailsRepository: IntakeEmailsRepository;
  intakeEmailsServices: IntakeEmailsServices;
  plansRepository: PlansRepository;
  subscriptionsRepository: SubscriptionsRepository;
}) {
  await checkIfOrganizationCanCreateNewIntakeEmail({
    organizationId,
    plansRepository,
    subscriptionsRepository,
    intakeEmailsRepository,
  });

  const domain = intakeEmailsServices.getEmailDomain();
  if (domain !== null) {
    const candidateAddress = buildEmailAddress({ username: alias, domain }).toLowerCase();
    const { intakeEmail: existing } = await intakeEmailsRepository.getIntakeEmailByEmailAddress({ emailAddress: candidateAddress });
    if (existing) {
      throw createIntakeEmailAlreadyExistsError();
    }
  }

  const { emailAddress } = await intakeEmailsServices.createEmailAddress({ username: alias });
  try {
    const { intakeEmail } = await intakeEmailsRepository.createIntakeEmail({ organizationId, emailAddress, allowedOrigins: initialAllowedOrigins });
    return { intakeEmail };
  } catch (error) {
    // Avoid leaving an external provider address without an owner after a database race or insertion failure.
    await intakeEmailsServices.deleteEmailAddress({ emailAddress });
    throw error;
  }
}

// Called with each document created from an email, e.g. to read it as an invoice to pay
export type OnIntakeDocumentCreated = (args: { organizationId: string; document: { id: string; mimeType: string; originalSize: number } }) => Promise<unknown>;

export async function processIntakeEmailIngestion({
  fromAddress,
  recipientsAddresses,
  subject,
  providerMessageId,
  attachments,
  intakeEmailsRepository,
  createDocument,
  onDocumentCreated,
}: {
  fromAddress: string;
  recipientsAddresses: string[];
  subject?: string;
  providerMessageId?: string;
  attachments: File[];
  intakeEmailsRepository: IntakeEmailsRepository;
  createDocument: CreateDocumentUsecase;
  onDocumentCreated?: OnIntakeDocumentCreated;
}) {
  return Promise.all(
    recipientsAddresses.map(async recipientAddress => safely(
      ingestEmailForRecipient({
        fromAddress,
        recipientAddress,
        subject,
        providerMessageId,
        attachments,
        intakeEmailsRepository,
        createDocument,
        onDocumentCreated,
      }),
    )),
  );
}

export async function ingestEmailForRecipient({
  fromAddress,
  recipientAddress,
  subject,
  providerMessageId,
  attachments,
  intakeEmailsRepository,
  logger = createLogger({ namespace: 'intake-emails.ingest' }),
  createDocument,
  onDocumentCreated,
}: {
  fromAddress: string;
  recipientAddress: string;
  subject?: string;
  providerMessageId?: string;
  attachments: File[];
  intakeEmailsRepository: IntakeEmailsRepository;
  logger?: Logger;
  createDocument: CreateDocumentUsecase;
  onDocumentCreated?: OnIntakeDocumentCreated;
}) {
  const { intakeEmail } = await intakeEmailsRepository.getIntakeEmailByEmailAddress({ emailAddress: recipientAddress });

  if (!intakeEmail) {
    logger.info({ recipientAddress }, 'Intake email not found');

    return;
  }

  if (providerMessageId !== undefined) {
    const { delivery } = await intakeEmailsRepository.getIntakeEmailDeliveryByProviderMessageId({
      intakeEmailId: intakeEmail.id,
      providerMessageId,
    });

    if (delivery) {
      logger.info({ providerMessageId }, 'Intake email was already processed');
      return;
    }
  }

  addLogContext({ intakeEmailId: intakeEmail.id });

  if (!intakeEmail.isEnabled) {
    logger.info('Intake email is disabled');

    await intakeEmailsRepository.createIntakeEmailDelivery({
      intakeEmailId: intakeEmail.id,
      organizationId: intakeEmail.organizationId,
      providerMessageId,
      fromAddress,
      recipientAddress,
      subject,
      attachmentCount: attachments.length,
      status: 'address_disabled',
    });

    return;
  }

  const isFromAllowedOrigin = getIsFromAllowedOrigin({
    origin: fromAddress,
    allowedOrigins: intakeEmail.allowedOrigins,
  });

  if (!isFromAllowedOrigin) {
    logger.warn({ fromAddress }, 'Origin not allowed');

    await intakeEmailsRepository.createIntakeEmailDelivery({
      intakeEmailId: intakeEmail.id,
      organizationId: intakeEmail.organizationId,
      providerMessageId,
      fromAddress,
      recipientAddress,
      subject,
      attachmentCount: attachments.length,
      status: 'blocked_sender',
    });

    return;
  }

  if (attachments.length === 0) {
    logger.info('Intake email has no attachments');

    await intakeEmailsRepository.createIntakeEmailDelivery({
      intakeEmailId: intakeEmail.id,
      organizationId: intakeEmail.organizationId,
      providerMessageId,
      fromAddress,
      recipientAddress,
      subject,
      attachmentCount: 0,
      status: 'no_attachments',
    });

    return;
  }

  await Promise.all(attachments.map(async (file) => {
    const { mimeType } = await coerceFileMimeType({ file });

    const [result, error] = await safely(createDocument({
      fileStream: fileToReadableStream(file),
      fileName: file.name,
      mimeType,
      organizationId: intakeEmail.organizationId,
    }));

    if (error) {
      logger.error({ error }, 'Failed to create document for intake email ingestion');
    } else {
      logger.info({ documentId: result.document.id }, 'Document created for intake email ingestion');

      const [, hookError] = await safely(onDocumentCreated?.({ organizationId: intakeEmail.organizationId, document: result.document }) ?? Promise.resolve());
      if (hookError) {
        logger.error({ error: hookError, documentId: result.document.id }, 'Failed to process the document created for intake email ingestion');
      }
    }
  }));

  await intakeEmailsRepository.createIntakeEmailDelivery({
    intakeEmailId: intakeEmail.id,
    organizationId: intakeEmail.organizationId,
    providerMessageId,
    fromAddress,
    recipientAddress,
    subject,
    attachmentCount: attachments.length,
    status: 'processed',
  });
}

export async function checkIfOrganizationCanCreateNewIntakeEmail({
  organizationId,
  plansRepository,
  subscriptionsRepository,
  intakeEmailsRepository,
}: {
  organizationId: string;
  plansRepository: PlansRepository;
  subscriptionsRepository: SubscriptionsRepository;
  intakeEmailsRepository: IntakeEmailsRepository;
}) {
  const { intakeEmailCount } = await intakeEmailsRepository.getOrganizationIntakeEmailsCount({ organizationId });
  const { organizationPlan } = await getOrganizationPlan({ organizationId, plansRepository, subscriptionsRepository });

  if (intakeEmailCount >= organizationPlan.limits.maxIntakeEmailsCount) {
    throw createIntakeEmailLimitReachedError();
  }
}

export async function deleteIntakeEmail({
  intakeEmailId,
  organizationId,
  intakeEmailsRepository,
  intakeEmailsServices,
}: {
  intakeEmailId: string;
  organizationId: string;
  intakeEmailsRepository: IntakeEmailsRepository;
  intakeEmailsServices: IntakeEmailsServices;
}) {
  const { intakeEmail } = await intakeEmailsRepository.getIntakeEmail({ intakeEmailId, organizationId });

  if (!intakeEmail) {
    throw createIntakeEmailNotFoundError();
  }

  await intakeEmailsRepository.deleteIntakeEmail({ organizationId: intakeEmail.organizationId, intakeEmailId });
  await intakeEmailsServices.deleteEmailAddress({ emailAddress: intakeEmail.emailAddress });
}
