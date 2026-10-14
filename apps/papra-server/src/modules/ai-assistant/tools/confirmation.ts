// A write tool does not act: it returns this, the client shows an approve / skip card, and approving calls the executor.
export function createConfirmationResult({ toolName, description, args }: { toolName: string; description: string; args: Record<string, unknown> }) {
  return {
    requiresConfirmation: true,
    toolName,
    description,
    args,
    status: 'PENDING_USER_APPROVAL',
    message: 'This action has NOT been executed yet. A confirmation card is now shown to the user. Do NOT say you created/updated/deleted anything — say the action is pending approval. Wait for the user to respond before continuing.',
  };
}
