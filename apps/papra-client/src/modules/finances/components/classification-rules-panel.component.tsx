import type { Component } from 'solid-js';
import type { RuleCondition } from '../finances.types';
import { createMutation, useQuery, useQueryClient } from '@tanstack/solid-query';
import { createSignal, For, Index, Show } from 'solid-js';
import { createStore, produce, reconcile } from 'solid-js/store';
import { useConfirmModal } from '@/modules/shared/confirm';
import { cn } from '@/modules/shared/style/cn';
import { DocumentTagPicker } from '@/modules/tags/components/tag-picker.component';
import { fetchTags } from '@/modules/tags/tags.services';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldRoot } from '@/modules/ui/components/textfield';
import {
  autoClassifyTransactions,
  createClassificationRule,
  deleteClassificationRule,
  fetchClassificationRules,
  updateClassificationRule,
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
    { value: 'contains', label: 'contains' },
    { value: 'equals', label: 'equals' },
    { value: 'starts_with', label: 'starts with' },
  ],
  description: [
    { value: 'contains', label: 'contains' },
    { value: 'equals', label: 'equals' },
    { value: 'starts_with', label: 'starts with' },
  ],
  amount: [
    { value: 'gt', label: 'greater than' },
    { value: 'lt', label: 'less than' },
    { value: 'equals', label: 'equals' },
  ],
};

const classificationColors: Record<string, string> = {
  expense: 'bg-red-500/10 text-red-600 border-red-500/20',
  income: 'bg-green-500/10 text-green-600 border-green-500/20',
  owner_transfer: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  internal_transfer: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
};

const defaultCondition = (): RuleCondition => ({ field: 'counterparty', operator: 'contains', value: '' });

export const ClassificationRulesPanel: Component<{ organizationId: string }> = (props) => {
  const queryClient = useQueryClient();
  const { confirm } = useConfirmModal();
  const [isDialogOpen, setIsDialogOpen] = createSignal(false);
  const [editingRuleId, setEditingRuleId] = createSignal<string | null>(null);
  const [ruleName, setRuleName] = createSignal('');
  const [ruleClassification, setRuleClassification] = createSignal<string>('expense');
  const [conditionMatchMode, setConditionMatchMode] = createSignal<'all' | 'any'>('all');
  const [conditions, setConditions] = createStore<RuleCondition[]>([defaultCondition()]);
  const [ruleTagIds, setRuleTagIds] = createSignal<string[]>([]);

  const isEditing = () => editingRuleId() !== null;

  const resetForm = () => {
    setEditingRuleId(null);
    setRuleName('');
    setRuleClassification('expense');
    setConditionMatchMode('all');
    setConditions(reconcile([defaultCondition()]));
    setRuleTagIds([]);
  };

  const openAddDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (rule: { id: string; name: string; classification: string; conditions: RuleCondition[]; conditionMatchMode: string; tagIds?: string[] }) => {
    setEditingRuleId(rule.id);
    setRuleName(rule.name);
    setRuleClassification(rule.classification);
    setConditionMatchMode((rule.conditionMatchMode as 'all' | 'any') ?? 'all');
    setConditions(reconcile(rule.conditions.length > 0 ? [...rule.conditions] : [defaultCondition()]));
    setRuleTagIds(rule.tagIds ?? []);
    setIsDialogOpen(true);
  };

  const updateCondition = (index: number, patch: Partial<RuleCondition>) => {
    // Reset operator when field changes
    if (patch.field && patch.field !== conditions[index].field) {
      patch.operator = operatorOptions[patch.field]?.[0]?.value ?? 'contains';
    }
    setConditions(index, patch);
  };

  const addCondition = () => setConditions(produce(s => s.push(defaultCondition())));

  const removeCondition = (index: number) => setConditions(produce(s => s.splice(index, 1)));

  const rulesQuery = useQuery(() => ({
    queryKey: ['organizations', props.organizationId, 'finances', 'classification-rules'],
    queryFn: () => fetchClassificationRules({ organizationId: props.organizationId }),
  }));

  const tagsQuery = useQuery(() => ({
    queryKey: ['organizations', props.organizationId, 'tags'],
    queryFn: () => fetchTags({ organizationId: props.organizationId }),
  }));

  const tagsMap = () => {
    const map = new Map<string, { name: string; color: string | null }>();
    for (const tag of tagsQuery.data?.tags ?? []) {
      map.set(tag.id, { name: tag.name, color: tag.color });
    }
    return map;
  };

  const createMut = createMutation(() => ({
    mutationFn: () => createClassificationRule({
      organizationId: props.organizationId,
      rule: {
        name: ruleName(),
        classification: ruleClassification(),
        conditions: [...conditions],
        conditionMatchMode: conditionMatchMode(),
        tagIds: ruleTagIds(),
      },
    }),
    onSuccess: () => {
      createToast({ message: 'Rule created', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', props.organizationId, 'finances', 'classification-rules'] });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: () => {
      createToast({ message: 'Failed to create rule', type: 'error' });
    },
  }));

  const updateMut = createMutation(() => ({
    mutationFn: () => updateClassificationRule({
      organizationId: props.organizationId,
      ruleId: editingRuleId()!,
      updates: {
        name: ruleName(),
        classification: ruleClassification(),
        conditions: [...conditions],
        conditionMatchMode: conditionMatchMode(),
        tagIds: ruleTagIds(),
      },
    }),
    onSuccess: () => {
      createToast({ message: 'Rule updated', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', props.organizationId, 'finances', 'classification-rules'] });
      setIsDialogOpen(false);
      resetForm();
    },
    onError: () => {
      createToast({ message: 'Failed to update rule', type: 'error' });
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

  const isFormValid = () => ruleName().trim().length > 0 && conditions.every(c => c.value.trim().length > 0);

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
            <div class={cn('i-tabler-rocket size-4 mr-1', autoClassifyMut.isPending && 'animate-pulse')} />
            {autoClassifyMut.isPending ? 'Classifying...' : 'Run Rules'}
          </Button>
          <Button size="sm" onClick={openAddDialog}>
            <div class="i-tabler-plus size-4 mr-1" />
            Add Rule
          </Button>
        </div>
      </div>

      <Show
        when={(rulesQuery.data?.rules?.length ?? 0) > 0}
        fallback={
          <p class="text-sm text-muted-foreground text-center py-4">No rules yet. Add a rule to auto-classify transactions.</p>
        }
      >
        <div class="flex flex-col gap-2">
          <For each={rulesQuery.data?.rules}>
            {rule => (
              <div class="flex items-start gap-3 p-2.5 bg-muted/30 rounded-lg text-sm">
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-medium">{rule.name}</span>
                    <Badge class={cn('text-xs', classificationColors[rule.classification])}>
                      {classificationOptions.find(c => c.value === rule.classification)?.label}
                    </Badge>
                    <For each={rule.tagIds ?? []}>
                      {(tagId) => {
                        const tag = () => tagsMap().get(tagId);
                        return (
                          <Show when={tag()}>
                            <Badge variant="outline" class="text-xs">
                              <div class="size-2 rounded-full mr-1" style={{ background: tag()!.color ?? '#888' }} />
                              {tag()!.name}
                            </Badge>
                          </Show>
                        );
                      }}
                    </For>
                  </div>
                  <div class="text-xs text-muted-foreground mt-1 flex flex-col gap-0.5">
                    <For each={rule.conditions}>
                      {(cond, idx) => (
                        <span>
                          <span class="text-muted-foreground/60">
                            {idx() === 0 ? 'When ' : (rule.conditionMatchMode === 'any' ? 'or ' : 'and ')}
                          </span>
                          <span class="font-mono">{cond.field}</span>
                          {' '}
                          <span>{operatorOptions[cond.field]?.find(o => o.value === cond.operator)?.label ?? cond.operator}</span>
                          {' '}
                          <span class="font-mono">
                            "
                            {cond.value}
                            "
                          </span>
                        </span>
                      )}
                    </For>
                  </div>
                </div>
                <div class="flex shrink-0 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    class="shrink-0"
                    onClick={() => openEditDialog(rule)}
                  >
                    <div class="i-tabler-pencil size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    class="text-destructive hover:text-destructive shrink-0"
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Delete classification rule',
                        message: `Delete rule "${rule.name}"? This cannot be undone.`,
                        confirmButton: { text: 'Delete', variant: 'destructive' },
                      });
                      if (ok) {
                        deleteMut.mutate(rule.id);
                      }
                    }}
                  >
                    <div class="i-tabler-trash size-4" />
                  </Button>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Dialog
        open={isDialogOpen()}
        onOpenChange={(v) => {
          setIsDialogOpen(v);
          if (!v) {
            resetForm();
          }
        }}
      >
        <DialogContent class="max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEditing() ? 'Edit Classification Rule' : 'Add Classification Rule'}</DialogTitle>
          </DialogHeader>
          <div class="flex flex-col gap-4 mt-4">
            {/* Rule name */}
            <div>
              <label class="text-sm font-medium mb-1.5 block">Rule Name</label>
              <TextFieldRoot>
                <TextField
                  placeholder="e.g. Revolut transfers"
                  value={ruleName()}
                  onInput={e => setRuleName(e.currentTarget.value)}
                />
              </TextFieldRoot>
            </div>

            {/* Classify as */}
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

            {/* Apply tags */}
            <div>
              <label class="text-sm font-medium mb-1.5 block">Apply tags (optional)</label>
              <p class="text-xs text-muted-foreground mb-1.5">Tags will be added to transactions when this rule matches</p>
              <DocumentTagPicker
                organizationId={props.organizationId}
                tagIds={ruleTagIds()}
                onTagsChange={({ tags }) => setRuleTagIds(tags.map(t => t.id))}
              />
            </div>

            {/* Conditions */}
            <div>
              <div class="flex items-center justify-between mb-2">
                <label class="text-sm font-medium">Conditions</label>
                <Show when={conditions.length > 1}>
                  <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span>Match</span>
                    <button
                      type="button"
                      class={cn('px-2 py-0.5 rounded border text-xs font-medium transition-colors', conditionMatchMode() === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')}
                      onClick={() => setConditionMatchMode('all')}
                    >
                      all
                    </button>
                    <button
                      type="button"
                      class={cn('px-2 py-0.5 rounded border text-xs font-medium transition-colors', conditionMatchMode() === 'any' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted')}
                      onClick={() => setConditionMatchMode('any')}
                    >
                      any
                    </button>
                  </div>
                </Show>
              </div>

              <div class="flex flex-col gap-2">
                <For each={conditions}>
                  {(condition, index) => {
                    const ops = () => operatorOptions[condition.field] ?? operatorOptions.counterparty;
                    return (
                      <div class="flex items-center gap-2">
                        <span class="text-xs text-muted-foreground w-8 shrink-0 text-right">
                          {index() === 0 ? 'When' : (conditionMatchMode() === 'any' ? 'or' : 'and')}
                        </span>
                        <Select
                          options={fieldOptions}
                          optionValue="value"
                          optionTextValue="label"
                          value={fieldOptions.find(f => f.value === condition.field)}
                          onChange={v => v && updateCondition(index(), { field: v.value })}
                          itemComponent={prps => <SelectItem item={prps.item}>{prps.item.rawValue.label}</SelectItem>}
                        >
                          <SelectTrigger class="flex-1 min-w-0">
                            <SelectValue<typeof fieldOptions[0]>>{state => state.selectedOption()?.label}</SelectValue>
                          </SelectTrigger>
                          <SelectContent />
                        </Select>
                        <Select
                          options={ops()}
                          optionValue="value"
                          optionTextValue="label"
                          value={ops().find(o => o.value === condition.operator)}
                          onChange={v => v && updateCondition(index(), { operator: v.value })}
                          itemComponent={prps => <SelectItem item={prps.item}>{prps.item.rawValue.label}</SelectItem>}
                        >
                          <SelectTrigger class="flex-1 min-w-0">
                            <SelectValue<{ value: string; label: string }>>{state => state.selectedOption()?.label}</SelectValue>
                          </SelectTrigger>
                          <SelectContent />
                        </Select>
                        <TextFieldRoot class="flex-1 min-w-0">
                          <TextField
                            placeholder={condition.field === 'amount' ? '1000' : 'value'}
                            value={condition.value}
                            onInput={e => updateCondition(index(), { value: e.currentTarget.value })}
                          />
                        </TextFieldRoot>
                        <Show when={conditions.length > 1}>
                          <Button size="icon" variant="ghost" class="size-8 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeCondition(index())}>
                            <div class="i-tabler-x size-3.5" />
                          </Button>
                        </Show>
                      </div>
                    );
                  }}
                </For>
              </div>

              <Button size="sm" variant="outline" class="mt-2 w-full" onClick={addCondition}>
                <div class="i-tabler-plus size-3.5 mr-1" />
                Add condition
              </Button>
            </div>

            <div class="flex gap-2 mt-2">
              <Button variant="outline" class="flex-1" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button
                class="flex-1"
                onClick={() => isEditing() ? updateMut.mutate() : createMut.mutate()}
                disabled={(isEditing() ? updateMut.isPending : createMut.isPending) || !isFormValid()}
              >
                {isEditing()
                  ? (updateMut.isPending ? 'Saving...' : 'Save Changes')
                  : (createMut.isPending ? 'Creating...' : 'Create Rule')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
