import type { Component } from 'solid-js';
import type { TaggingRule } from '../tagging-rules.types';
import type { ClassificationRule, RuleCondition } from '@/modules/finances/finances.types';
import { A, useParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createSignal, For, Match, Show, Switch } from 'solid-js';
import { useFeatureFlags } from '@/modules/feature-flags/feature-flags.provider';
import { autoClassifyTransactions, fetchClassificationRules, updateClassificationRule } from '@/modules/finances/finances.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { useConfirmModal } from '@/modules/shared/confirm';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { fetchTags } from '@/modules/tags/tags.services';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { EmptyState } from '@/modules/ui/components/empty';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldLabel, TextFieldRoot } from '@/modules/ui/components/textfield';
import { DocumentTagPicker } from '@/modules/tags/components/tag-picker.component';
import { applyTaggingRuleToExistingDocuments, deleteTaggingRule, fetchTaggingRules } from '../tagging-rules.services';

const classificationColors: Record<string, string> = {
  expense: 'bg-red-500/10 text-red-600 border-red-500/20',
  income: 'bg-green-500/10 text-green-600 border-green-500/20',
  owner_transfer: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  internal_transfer: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
};

const classificationLabels: Record<string, string> = {
  expense: 'Expense',
  income: 'Income',
  owner_transfer: 'Owner Transfer',
  internal_transfer: 'Internal Transfer',
};

const operatorLabels: Record<string, string> = {
  contains: 'contains',
  equals: 'equals',
  equal: 'equals',
  not_equal: 'not equal',
  starts_with: 'starts with',
  ends_with: 'ends with',
  not_contains: 'not contains',
  gt: '>',
  lt: '<',
};

const DocumentRuleCard: Component<{ taggingRule: TaggingRule }> = (props) => {
  const { t } = useI18n();
  const { confirm } = useConfirmModal();

  const conditionsSummary = () => {
    const count = props.taggingRule.conditions.length;
    if (count === 0) return 'No conditions (matches all)';
    return props.taggingRule.conditions
      .map((c, i) => `${i === 0 ? '' : (props.taggingRule.conditionMatchMode === 'any' ? 'or ' : 'and ')}${c.field} ${operatorLabels[c.operator] ?? c.operator} "${c.value}"`)
      .join(' ');
  };

  const deleteTaggingRuleMutation = createMutation(() => ({
    mutationFn: async () => {
      await deleteTaggingRule({ organizationId: props.taggingRule.organizationId, taggingRuleId: props.taggingRule.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', props.taggingRule.organizationId, 'tagging-rules'] });
    },
  }));

  const applyRuleMutation = createMutation(() => ({
    mutationFn: async () => {
      return applyTaggingRuleToExistingDocuments({
        organizationId: props.taggingRule.organizationId,
        taggingRuleId: props.taggingRule.id,
      });
    },
    onSuccess: () => {
      createToast({ message: t('tagging-rules.apply.success'), type: 'success' });
    },
    onError: () => {
      createToast({ message: t('tagging-rules.apply.error'), type: 'error' });
    },
  }));

  const handleApplyRule = async () => {
    const isConfirmed = await confirm({
      title: t('tagging-rules.apply.confirm.title'),
      message: t('tagging-rules.apply.confirm.description'),
      confirmButton: { text: t('tagging-rules.apply.confirm.button') },
    });
    if (isConfirmed) {
      applyRuleMutation.mutate();
    }
  };

  return (
    <div class="flex items-start gap-3 p-3 bg-card rounded-lg border">
      <div class="i-tabler-file-text size-5 text-muted-foreground mt-0.5 shrink-0" />
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <A href={`/organizations/${props.taggingRule.organizationId}/tagging-rules/${props.taggingRule.id}`} class="font-medium text-sm hover:underline">
            {props.taggingRule.name}
          </A>
          <Badge variant="outline" class="text-xs">Document</Badge>

        </div>
        <div class="text-xs text-muted-foreground mt-0.5">{conditionsSummary()}</div>
        <Show when={props.taggingRule.description}>
          <div class="text-xs text-muted-foreground mt-0.5">{props.taggingRule.description}</div>
        </Show>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <Button variant="outline" size="sm" class="h-7 text-xs gap-1" onClick={handleApplyRule} disabled={applyRuleMutation.isPending}>
          <div class="i-tabler-player-play size-3.5" />
          {applyRuleMutation.isPending ? 'Applying...' : 'Apply to docs'}
        </Button>
        <Button as={A} href={`/organizations/${props.taggingRule.organizationId}/tagging-rules/${props.taggingRule.id}`} variant="ghost" size="icon" class="size-7">
          <div class="i-tabler-edit size-3.5" />
        </Button>
        <Button variant="ghost" size="icon" class="size-7 text-destructive hover:text-destructive"
          onClick={async () => {
            const ok = await confirm({
              title: 'Delete document rule',
              message: `Delete rule "${props.taggingRule.name}"?`,
              confirmButton: { text: 'Delete', variant: 'destructive' },
            });
            if (ok) {
              deleteTaggingRuleMutation.mutate();
            }
          }}
          disabled={deleteTaggingRuleMutation.isPending}
        >
          <div class="i-tabler-trash size-3.5" />
        </Button>
      </div>
    </div>
  );
};

const TransactionRuleCard: Component<{
  rule: ClassificationRule;
  organizationId: string;
  tagsMap: Map<string, { name: string; color: string | null }>;
  onRunRule: () => void;
  onEdit: (rule: ClassificationRule) => void;
  isRunning: boolean;
}> = (props) => {
  const { confirm } = useConfirmModal();

  const conditionsSummary = () => {
    return (props.rule.conditions as RuleCondition[])
      .map((c, i) => `${i === 0 ? '' : (props.rule.conditionMatchMode === 'any' ? 'or ' : 'and ')}${c.field} ${operatorLabels[c.operator] ?? c.operator} "${c.value}"`)
      .join(' ');
  };

  const deleteMut = createMutation(() => ({
    mutationFn: async () => {
      const { deleteClassificationRule } = await import('@/modules/finances/finances.services');
      await deleteClassificationRule({ organizationId: props.organizationId, ruleId: props.rule.id });
    },
    onSuccess: () => {
      createToast({ message: 'Rule deleted', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', props.organizationId, 'finances', 'classification-rules'] });
    },
  }));

  return (
    <div class="flex items-start gap-3 p-3 bg-card rounded-lg border">
      <div class="i-tabler-arrows-exchange size-5 text-muted-foreground mt-0.5 shrink-0" />
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-medium text-sm">{props.rule.name}</span>
          <Badge variant="outline" class="text-xs">Transaction</Badge>
          <Badge class={cn('text-xs pointer-events-none', classificationColors[props.rule.classification])}>
            {classificationLabels[props.rule.classification] ?? props.rule.classification}
          </Badge>
          <For each={props.rule.tagIds ?? []}>
            {(tagId) => {
              const tag = () => props.tagsMap.get(tagId);
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
        <div class="text-xs text-muted-foreground mt-0.5">{conditionsSummary()}</div>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <Button variant="outline" size="sm" class="h-7 text-xs gap-1" onClick={props.onRunRule} disabled={props.isRunning}>
          <div class="i-tabler-player-play size-3.5" />
          {props.isRunning ? 'Running...' : 'Run'}
        </Button>
        <Button variant="ghost" size="icon" class="size-7" onClick={() => props.onEdit(props.rule)}>
          <div class="i-tabler-edit size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="size-7 text-destructive hover:text-destructive"
          onClick={async () => {
            const ok = await confirm({
              title: 'Delete classification rule',
              message: `Delete rule "${props.rule.name}"?`,
              confirmButton: { text: 'Delete', variant: 'destructive' },
            });
            if (ok) {
              deleteMut.mutate();
            }
          }}
          disabled={deleteMut.isPending}
        >
          <div class="i-tabler-trash size-3.5" />
        </Button>
      </div>
    </div>
  );
};

export const TaggingRulesPage: Component = () => {
  const params = useParams();
  const { hasFlag } = useFeatureFlags();
  const [editingRule, setEditingRule] = createSignal<ClassificationRule | null>(null);
  const [editName, setEditName] = createSignal('');
  const [editClassification, setEditClassification] = createSignal('');
  const [editTagIds, setEditTagIds] = createSignal<string[]>([]);
  const [editConditions, setEditConditions] = createSignal<RuleCondition[]>([]);
  const [editMatchMode, setEditMatchMode] = createSignal<'all' | 'any'>('all');

  const openEdit = (rule: ClassificationRule) => {
    setEditName(rule.name);
    setEditClassification(rule.classification);
    setEditTagIds(rule.tagIds ?? []);
    setEditConditions((rule.conditions ?? []).map(c => ({ ...c })));
    setEditMatchMode(rule.conditionMatchMode ?? 'all');
    setEditingRule(rule);
  };

  const taggingRulesQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'tagging-rules'],
    queryFn: () => fetchTaggingRules({ organizationId: params.organizationId }),
  }));

  const classificationRulesQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'finances', 'classification-rules'],
    queryFn: () => fetchClassificationRules({ organizationId: params.organizationId }),
    enabled: hasFlag('llc_finances'),
  }));

  const tagsQuery = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'tags'],
    queryFn: () => fetchTags({ organizationId: params.organizationId }),
  }));

  const tagsMap = () => {
    const map = new Map<string, { name: string; color: string | null }>();
    for (const tag of tagsQuery.data?.tags ?? []) {
      map.set(tag.id, { name: tag.name, color: tag.color });
    }
    return map;
  };

  const autoClassifyMut = createMutation(() => ({
    mutationFn: () => autoClassifyTransactions({ organizationId: params.organizationId }),
    onSuccess: (data) => {
      createToast({ message: `Auto-classified ${data.classifiedCount} transactions`, type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finances', 'transactions'] });
    },
    onError: () => {
      createToast({ message: 'Failed to auto-classify', type: 'error' });
    },
  }));

  const updateRuleMut = createMutation(() => ({
    mutationFn: async () => {
      const rule = editingRule();
      if (!rule) return;
      await updateClassificationRule({
        organizationId: params.organizationId,
        ruleId: rule.id,
        updates: {
          name: editName(),
          classification: editClassification() || undefined,
          tagIds: editTagIds(),
          conditions: editConditions(),
          conditionMatchMode: editMatchMode(),
        },
      });
    },
    onSuccess: () => {
      createToast({ message: 'Rule updated', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finances', 'classification-rules'] });
      setEditingRule(null);
    },
    onError: () => {
      createToast({ message: 'Failed to update rule', type: 'error' });
    },
  }));

  const docRules = () => taggingRulesQuery.data?.taggingRules ?? [];
  const txnRules = () => classificationRulesQuery.data?.rules ?? [];
  const totalRules = () => docRules().length + txnRules().length;

  const CLASSIFICATIONS = [
    { value: '', label: 'None' },
    { value: 'expense', label: 'Expense' },
    { value: 'income', label: 'Income' },
    { value: 'owner_transfer', label: 'Owner Transfer' },
    { value: 'internal_transfer', label: 'Internal Transfer' },
  ];

  return (
    <div class="flex flex-col h-full">
      {/* Header */}
      <div class="border-b px-6 py-3 flex items-center justify-between shrink-0 bg-background">
        <div>
          <h1 class="text-sm font-semibold leading-none">Rules</h1>
          <p class="text-xs text-muted-foreground mt-0.5">Automate tagging and classification for documents and transactions</p>
        </div>
        <div class="flex items-center gap-2">
          <Button as={A} href={`/organizations/${params.organizationId}/tagging-rules/create`} size="sm" class="h-8 text-xs gap-1.5">
            <div class="i-tabler-plus size-3.5" />
            New Rule
          </Button>
        </div>
      </div>

      <div class="p-6 pb-32 max-w-4xl mx-auto w-full overflow-y-auto flex-1">
        <Switch>
          <Match when={totalRules() === 0}>
            <div class="mt-16">
              <EmptyState
                title="No rules yet"
                description="Create rules to automatically tag documents or classify transactions"
                class="pt-0"
                icon="i-tabler-list-check"
                cta={(
                  <Button as={A} href={`/organizations/${params.organizationId}/tagging-rules/create`}>
                    <div class="i-tabler-plus size-4 mr-2" />
                    Create Rule
                  </Button>
                )}
              />
            </div>
          </Match>

          <Match when={totalRules() > 0}>
            {/* Document Rules */}
            <Show when={docRules().length > 0}>
              <div class="mb-6">
                <h3 class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Document Rules</h3>
                <div class="flex flex-col gap-2">
                  <For each={docRules()}>
                    {rule => <DocumentRuleCard taggingRule={rule} />}
                  </For>
                </div>
              </div>
            </Show>

            {/* Transaction Rules */}
            <Show when={hasFlag('llc_finances') && txnRules().length > 0}>
              <div class="mb-6">
                <h3 class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Transaction Rules</h3>
                <div class="flex flex-col gap-2">
                  <For each={txnRules()}>
                    {rule => (
                      <TransactionRuleCard
                        rule={rule}
                        organizationId={params.organizationId}
                        tagsMap={tagsMap()}
                        onRunRule={() => autoClassifyMut.mutate()}
                        onEdit={openEdit}
                        isRunning={autoClassifyMut.isPending}
                      />
                    )}
                  </For>
                </div>
              </div>
            </Show>
          </Match>
        </Switch>
      </div>

      {/* Edit Transaction Rule Dialog */}
      <Dialog open={editingRule() !== null} onOpenChange={(open) => { if (!open) setEditingRule(null); }}>
        <DialogContent class="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Transaction Rule</DialogTitle>
          </DialogHeader>
          <div class="space-y-5 pt-2">
            {/* Name */}
            <TextFieldRoot class="flex flex-col gap-1">
              <TextFieldLabel>Name</TextFieldLabel>
              <TextField
                type="text"
                value={editName()}
                onInput={e => setEditName(e.currentTarget.value)}
              />
            </TextFieldRoot>

            {/* Classification */}
            <div>
              <p class="text-sm font-medium mb-2">Classification</p>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <For each={CLASSIFICATIONS}>
                  {cls => (
                    <button
                      class={cn(
                        'p-2.5 rounded-lg border-2 text-left text-sm transition-colors',
                        editClassification() === cls.value ? 'border-primary bg-primary/5 font-medium' : 'border-border hover:border-muted-foreground/50',
                      )}
                      onClick={() => setEditClassification(cls.value)}
                    >
                      {cls.label}
                    </button>
                  )}
                </For>
              </div>
            </div>

            {/* Conditions */}
            <div>
              <div class="flex items-center justify-between mb-2">
                <p class="text-sm font-medium">Conditions</p>
                <Select
                  options={['all', 'any']}
                  value={editMatchMode()}
                  onChange={v => v && setEditMatchMode(v as 'all' | 'any')}
                  itemComponent={props => <SelectItem item={props.item}>{props.item.rawValue === 'all' ? 'Match ALL' : 'Match ANY'}</SelectItem>}
                >
                  <SelectTrigger class="w-[130px] h-7 text-xs">
                    <SelectValue<string>>{state => state.selectedOption() === 'all' ? 'Match ALL' : 'Match ANY'}</SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </div>

              <div class="space-y-2">
                <For each={editConditions()}>
                  {(cond, index) => (
                    <div class="flex flex-wrap gap-2 items-center bg-muted/50 rounded-lg p-2.5 border">
                      <div class="text-xs text-muted-foreground w-10 shrink-0">
                        {index() === 0 ? 'When' : (editMatchMode() === 'all' ? 'AND' : 'OR')}
                      </div>

                      <Select
                        options={['counterparty', 'description', 'amount']}
                        value={cond.field}
                        onChange={v => v && setEditConditions(prev => prev.map((c, i) => i === index() ? { ...c, field: v } : c))}
                        itemComponent={props => <SelectItem item={props.item}>{{ counterparty: 'Counterparty', description: 'Description', amount: 'Amount' }[props.item.rawValue] ?? props.item.rawValue}</SelectItem>}
                      >
                        <SelectTrigger class="min-w-[130px] whitespace-nowrap">
                          <SelectValue<string>>{state => ({ counterparty: 'Counterparty', description: 'Description', amount: 'Amount' })[state.selectedOption()] ?? state.selectedOption()}</SelectValue>
                        </SelectTrigger>
                        <SelectContent />
                      </Select>

                      <Select
                        options={['contains', 'equals', 'starts_with', 'gt', 'lt']}
                        value={cond.operator}
                        onChange={v => v && setEditConditions(prev => prev.map((c, i) => i === index() ? { ...c, operator: v } : c))}
                        itemComponent={props => <SelectItem item={props.item}>{{ contains: 'contains', equals: 'equals', starts_with: 'starts with', gt: '>', lt: '<' }[props.item.rawValue] ?? props.item.rawValue}</SelectItem>}
                      >
                        <SelectTrigger class="min-w-[120px] whitespace-nowrap">
                          <SelectValue<string>>{state => ({ contains: 'contains', equals: 'equals', starts_with: 'starts with', gt: '>', lt: '<' })[state.selectedOption()] ?? state.selectedOption()}</SelectValue>
                        </SelectTrigger>
                        <SelectContent />
                      </Select>

                      <TextFieldRoot class="flex-1 min-w-[120px]">
                        <TextField
                          type="text"
                          placeholder="Value..."
                          value={cond.value}
                          onInput={e => setEditConditions(prev => prev.map((c, i) => i === index() ? { ...c, value: e.currentTarget.value } : c))}
                        />
                      </TextFieldRoot>

                      <Button variant="ghost" size="icon" class="size-7 shrink-0 text-destructive hover:text-destructive" onClick={() => setEditConditions(prev => prev.filter((_, i) => i !== index()))}>
                        <div class="i-tabler-x size-3.5" />
                      </Button>
                    </div>
                  )}
                </For>
              </div>

              <Button
                variant="outline"
                size="sm"
                class="mt-2 gap-1.5 text-xs"
                onClick={() => setEditConditions(prev => [...prev, { field: 'counterparty', operator: 'contains', value: '' }])}
              >
                <div class="i-tabler-plus size-3.5" />
                Add Condition
              </Button>
            </div>

            {/* Tags */}
            <div>
              <p class="text-sm font-medium mb-2">Tags</p>
              <DocumentTagPicker
                organizationId={params.organizationId}
                tagIds={editTagIds()}
                onTagsChange={({ tags }) => setEditTagIds(tags.map(t => t.id))}
              />
            </div>

            <div class="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingRule(null)}>Cancel</Button>
              <Button onClick={() => updateRuleMut.mutate()} disabled={updateRuleMut.isPending || !editName().trim()} isLoading={updateRuleMut.isPending}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
