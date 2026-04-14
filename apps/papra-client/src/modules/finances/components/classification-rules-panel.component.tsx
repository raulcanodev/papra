import type { Component } from 'solid-js';
import { createMutation, useQuery, useQueryClient } from '@tanstack/solid-query';
import { createSignal, For, Show } from 'solid-js';
import { useConfirmModal } from '@/modules/shared/confirm';
import { cn } from '@/modules/shared/style/cn';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
import { createToast } from '@/modules/ui/components/sonner';
import {
  autoClassifyTransactions,
  createClassificationRule,
  deleteClassificationRule,
  fetchClassificationRules,
} from '../finances.services';

const classificationOptions = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'owner_transfer', label: 'Owner Transfer' },
  { value: 'internal_transfer', label: 'Internal Transfer' },
];

const fieldOptions = [
  { value: 'counterparty', label: 'Counterparty' },
  { value: 'description', label: 'Description' },
  { value: 'amount', label: 'Amount' },
];

const operatorOptions: Record<string, Array<{ value: string; label: string }>> = {
  counterparty: [
    { value: 'contains', label: 'Contains' },
    { value: 'equals', label: 'Equals' },
    { value: 'starts_with', label: 'Starts with' },
  ],
  description: [
    { value: 'contains', label: 'Contains' },
    { value: 'equals', label: 'Equals' },
    { value: 'starts_with', label: 'Starts with' },
  ],
  amount: [
    { value: 'gt', label: 'Greater than' },
    { value: 'lt', label: 'Less than' },
    { value: 'equals', label: 'Equals' },
  ],
};

const classificationColors: Record<string, string> = {
  expense: 'bg-red-500/10 text-red-600 border-red-500/20',
  income: 'bg-green-500/10 text-green-600 border-green-500/20',
  owner_transfer: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  internal_transfer: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
};

export const ClassificationRulesPanel: Component<{ organizationId: string }> = (props) => {
  const queryClient = useQueryClient();
  const { confirm } = useConfirmModal();
  const [isAddOpen, setIsAddOpen] = createSignal(false);
  const [ruleName, setRuleName] = createSignal('');
  const [ruleClassification, setRuleClassification] = createSignal<string>('expense');
  const [ruleField, setRuleField] = createSignal<string>('counterparty');
  const [ruleOperator, setRuleOperator] = createSignal<string>('contains');
  const [ruleValue, setRuleValue] = createSignal('');

  const rulesQuery = useQuery(() => ({
    queryKey: ['organizations', props.organizationId, 'finances', 'classification-rules'],
    queryFn: () => fetchClassificationRules({ organizationId: props.organizationId }),
  }));

  const createMut = createMutation(() => ({
    mutationFn: () => createClassificationRule({
      organizationId: props.organizationId,
      rule: {
        name: ruleName(),
        classification: ruleClassification(),
        field: ruleField(),
        operator: ruleOperator(),
        value: ruleValue(),
      },
    }),
    onSuccess: () => {
      createToast({ message: 'Rule created', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', props.organizationId, 'finances', 'classification-rules'] });
      setIsAddOpen(false);
      setRuleName('');
      setRuleValue('');
    },
    onError: () => {
      createToast({ message: 'Failed to create rule', type: 'error' });
    },
  }));

  const deleteMut = createMutation(() => ({
    mutationFn: (ruleId: string) => deleteClassificationRule({ organizationId: props.organizationId, ruleId }),
    onSuccess: () => {
      createToast({ message: 'Rule deleted', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', props.organizationId, 'finances', 'classification-rules'] });
    },
  }));

  const autoClassifyMut = createMutation(() => ({
    mutationFn: () => autoClassifyTransactions({ organizationId: props.organizationId }),
    onSuccess: (data) => {
      createToast({ message: `Auto-classified ${data.classifiedCount} transactions`, type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', props.organizationId, 'finances', 'transactions'] });
    },
    onError: () => {
      createToast({ message: 'Failed to auto-classify', type: 'error' });
    },
  }));

  const currentOperators = () => operatorOptions[ruleField()] ?? operatorOptions.counterparty;

  return (
    <div class="border rounded-lg p-4 mb-6">
      <div class="flex items-center justify-between mb-3">
        <div>
          <h3 class="font-medium text-sm">Auto-Classification Rules</h3>
          <p class="text-xs text-muted-foreground mt-0.5">Automatically classify transactions based on rules</p>
        </div>
        <div class="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => autoClassifyMut.mutate()}
            disabled={autoClassifyMut.isPending}
          >
            <div class={cn('i-tabler-sparkles size-4 mr-1', autoClassifyMut.isPending && 'animate-pulse')} />
            {autoClassifyMut.isPending ? 'Classifying...' : 'Run Rules'}
          </Button>
          <Button size="sm" onClick={() => setIsAddOpen(true)}>
            <div class="i-tabler-plus size-4 mr-1" />
            Add Rule
          </Button>
        </div>
      </div>

      <Show when={(rulesQuery.data?.rules?.length ?? 0) > 0} fallback={
        <p class="text-sm text-muted-foreground text-center py-4">No rules yet. Add a rule to auto-classify transactions.</p>
      }>
        <div class="flex flex-col gap-2">
          <For each={rulesQuery.data?.rules}>
            {rule => (
              <div class="flex items-center gap-3 p-2.5 bg-muted/30 rounded-lg text-sm">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2">
                    <span class="font-medium">{rule.name}</span>
                    <Badge class={cn('text-xs', classificationColors[rule.classification])}>
                      {classificationOptions.find(c => c.value === rule.classification)?.label}
                    </Badge>
                  </div>
                  <div class="text-xs text-muted-foreground mt-0.5">
                    When
                    {' '}
                    <span class="font-mono">{rule.field}</span>
                    {' '}
                    {rule.operator.replace('_', ' ')}
                    {' '}
                    <span class="font-mono">"{rule.value}"</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  class="text-destructive hover:text-destructive"
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Delete classification rule',
                      message: `Delete rule "${rule.name}"? This cannot be undone.`,
                      confirmButton: { text: 'Delete', variant: 'destructive' },
                    });
                    if (ok) deleteMut.mutate(rule.id);
                  }}
                >
                  <div class="i-tabler-trash size-4" />
                </Button>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Dialog open={isAddOpen()} onOpenChange={setIsAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Classification Rule</DialogTitle>
          </DialogHeader>
          <div class="flex flex-col gap-4 mt-4">
            <div>
              <label class="text-sm font-medium mb-1.5 block">Rule Name</label>
              <TextFieldRoot>
                <TextField
                  placeholder="e.g. Revolut transfers = owner transfer"
                  value={ruleName()}
                  onInput={e => setRuleName(e.currentTarget.value)}
                />
              </TextFieldRoot>
            </div>

            <div>
              <label class="text-sm font-medium mb-1.5 block">Classify as</label>
              <Select
                options={classificationOptions}
                optionValue="value"
                optionTextValue="label"
                value={classificationOptions.find(c => c.value === ruleClassification())}
                onChange={v => v && setRuleClassification(v.value)}
                itemComponent={prps => <SelectItem item={prps.item}>{prps.item.rawValue.label}</SelectItem>}
              >
                <SelectTrigger>
                  <SelectValue<typeof classificationOptions[0]>>{state => state.selectedOption()?.label}</SelectValue>
                </SelectTrigger>
                <SelectContent />
              </Select>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-sm font-medium mb-1.5 block">Field</label>
                <Select
                  options={fieldOptions}
                  optionValue="value"
                  optionTextValue="label"
                  value={fieldOptions.find(f => f.value === ruleField())}
                  onChange={(v) => {
                    if (v) {
                      setRuleField(v.value);
                      const ops = operatorOptions[v.value];
                      if (ops?.[0]) setRuleOperator(ops[0].value);
                    }
                  }}
                  itemComponent={prps => <SelectItem item={prps.item}>{prps.item.rawValue.label}</SelectItem>}
                >
                  <SelectTrigger>
                    <SelectValue<typeof fieldOptions[0]>>{state => state.selectedOption()?.label}</SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </div>
              <div>
                <label class="text-sm font-medium mb-1.5 block">Operator</label>
                <Select
                  options={currentOperators()}
                  optionValue="value"
                  optionTextValue="label"
                  value={currentOperators().find(o => o.value === ruleOperator())}
                  onChange={v => v && setRuleOperator(v.value)}
                  itemComponent={prps => <SelectItem item={prps.item}>{prps.item.rawValue.label}</SelectItem>}
                >
                  <SelectTrigger>
                    <SelectValue<{ value: string; label: string }>>{state => state.selectedOption()?.label}</SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </div>
            </div>

            <div>
              <label class="text-sm font-medium mb-1.5 block">Value</label>
              <TextFieldRoot>
                <TextField
                  placeholder={ruleField() === 'amount' ? 'e.g. 1000' : 'e.g. Revolut'}
                  value={ruleValue()}
                  onInput={e => setRuleValue(e.currentTarget.value)}
                />
              </TextFieldRoot>
            </div>

            <div class="flex gap-2 mt-2">
              <Button variant="outline" class="flex-1" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button
                class="flex-1"
                onClick={() => createMut.mutate()}
                disabled={createMut.isPending || !ruleName() || !ruleValue()}
              >
                {createMut.isPending ? 'Creating...' : 'Create Rule'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
