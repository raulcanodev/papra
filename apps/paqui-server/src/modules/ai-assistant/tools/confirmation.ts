// A write tool does not act: it returns this, the client shows the action in a bar above the input, and approving calls the executor.
export function createConfirmationResult({ toolName, description, args }: { toolName: string; description: string; args: Record<string, unknown> }) {
  return {
    requiresConfirmation: true,
    toolName,
    description,
    args,
    status: 'PENDING_USER_APPROVAL',
    message: 'NOT executed yet. The user now sees this action, with its data, right above the message input, with Approve / Reject / Something else. Do NOT say you created/updated/deleted anything, do NOT repeat its fields, and do NOT mention cards, buttons, tools or approvals: the user already sees them. Stop and wait for their answer.',
  };
}
