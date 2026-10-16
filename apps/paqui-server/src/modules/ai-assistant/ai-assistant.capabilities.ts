// What the assistant may do for this user. Personal finances (bank transactions, classification rules, budgets)
// is behind the `llc_finances` feature flag: without it, its tools do not exist for the model, cannot be
// executed from an approval card, and the system prompt never mentions them.
export type AssistantCapabilities = {
  personalFinances: boolean;
};

export const PERSONAL_FINANCES_TOOL_NAMES: ReadonlySet<string> = new Set([
  'listTransactions',
  'searchTransactions',
  'getSpendingBreakdown',
  'getOverviewStats',
  'getAccountBalances',
  'analyzeUnclassifiedTransactions',
  'autoClassifyTransactions',
  'listClassificationRules',
  'createClassificationRule',
  'updateClassificationRule',
  'deleteClassificationRule',
  'consolidateClassificationRules',
  'getFinanceBudgetGoal',
  'listFinanceBudgetVersions',
  'restoreFinanceBudgetVersion',
  'getFinanceBudgetActuals',
  'getTransactionCustomProperties',
  'setTransactionCustomProperty',
  'deleteTransactionCustomProperty',
]);

export function isToolAllowed({ toolName, capabilities }: { toolName: string; capabilities: AssistantCapabilities }) {
  return capabilities.personalFinances || !PERSONAL_FINANCES_TOOL_NAMES.has(toolName);
}

export function pickAllowedTools<T>({ tools, capabilities }: { tools: Record<string, T>; capabilities: AssistantCapabilities }): Record<string, T> {
  return Object.fromEntries(Object.entries(tools).filter(([toolName]) => isToolAllowed({ toolName, capabilities })));
}
