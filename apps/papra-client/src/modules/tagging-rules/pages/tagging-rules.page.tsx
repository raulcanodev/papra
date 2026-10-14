import type { Component } from 'solid-js';
import type { TaggingRule } from '../tagging-rules.types';
import type { ClassificationRule, RuleCondition } from '@/modules/finances/finances.types';
import { A, useParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createSignal, For, Index, Match, Show, Switch } from 'solid-js';
import { useFeatureFlags } from '@/modules/feature-flags/feature-flags.provider';
import { classificationLabelKeys, getClassificationLabelKey, transactionClassifications } from '@/modules/finances/finances-labels';
import { autoClassifyTransactions, fetchClassificationRules, updateClassificationRule } from '@/modules/finances/finances.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { useConfirmModal } from '@/modules/shared/confirm';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { DocumentTagPicker } from '@/modules/tags/components/tag-picker.component';
import { fetchTags } from '@/modules/tags/tags.services';
import { Badge } from '@/modules/ui/components/badge';
import { Button } from '@/modules/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/modules/ui/components/dialog';
import { EmptyState } from '@/modules/ui/components/empty';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldLabel, TextFieldRoot } from '@/modules/ui/components/textfield';
import { getOrganizationRouteChildHref } from '@/modules/ui/navigation/organization-navigation';
import { documentFieldLabelKeys, ruleOperatorLabelKeys, transactionFieldLabelKeys } from '../rule-labels';
import { applyTaggingRuleToExistingDocuments, deleteTaggingRule, fetchTaggingRules } from '../tagging-rules.services';

const classificationColors: Record<string, string> = {
  expense: 'bg-red-500/10 text-red-600 border-red-500/20',
  income: 'bg-green-500/10 text-green-600 border-green-500/20',
  owner_transfer: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  internal_transfer: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
};

const DocumentRuleCard: Component<{ taggingRule: TaggingRule }> = (props) => {
  const { t } = useI18n();
  const { confirm } = useConfirmModal();

  const conditionsSummary = () => {
    const count = props.taggingRule.conditions.length;
    if (count === 0) {
      return t('tagging-rules.page.no-conditions');
    }
    const connector = props.taggingRule.conditionMatchMode === 'any' ? t('tagging-rules.form.conditions.connector.or') : t('tagging-rules.form.conditions.connector.and');
    const field = (value: string) => documentFieldLabelKeys[value] ? t(documentFieldLabelKeys[value]!) : value;
    const operator = (value: string) => ruleOperatorLabelKeys[value] ? t(ruleOperatorLabelKeys[value]!) : value;
    return props.taggingRule.conditions
      .map((c, i) => `${i === 0 ? '' : `${connector} `}${field(c.field)} ${operator(c.operator)} "${c.value}"`)
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
          <A href={getOrganizationRouteChildHref({ organizationId: props.taggingRule.organizationId, routeId: 'settingsAutomations', childPath: props.taggingRule.id })} class="font-medium text-sm hover:underline">
            {props.taggingRule.name}
          </A>
          <Badge variant="outline" class="text-xs">{t('tagging-rules.page.badge.document')}</Badge>

        </div>
        <div class="text-xs text-muted-foreground mt-0.5">{conditionsSummary()}</div>
        <Show when={props.taggingRule.description}>
          <div class="text-xs text-muted-foreground mt-0.5">{props.taggingRule.description}</div>
        </Show>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <Button variant="outline" size="sm" class="h-7 text-xs gap-1" onClick={handleApplyRule} disabled={applyRuleMutation.isPending}>
          <div class="i-tabler-player-play size-3.5" />
          {applyRuleMutation.isPending ? t('tagging-rules.page.applying') : t('tagging-rules.page.apply-to-docs')}
        </Button>
        <Button as={A} href={getOrganizationRouteChildHref({ organizationId: props.taggingRule.organizationId, routeId: 'settingsAutomations', childPath: props.taggingRule.id })} variant="ghost" size="icon" class="size-7" aria-label={t('tagging-rules.page.edit')}>
          <div class="i-tabler-edit size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="size-7 text-destructive hover:text-destructive"
          onClick={async () => {
            const ok = await confirm({
              title: t('tagging-rules.page.delete-document.title'),
              message: t('tagging-rules.page.delete.message', { name: props.taggingRule.name }),
              confirmButton: { text: t('tagging-rules.page.delete'), variant: 'destructive' },
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
  onPriorityChange: (newPriority: number) => void;
}> = (props) => {
  const { t } = useI18n();
  const { confirm } = useConfirmModal();
  const [showAllConditions, setShowAllConditions] = createSignal(false);
  const MAX_VISIBLE = 3;

  const conditions = () => props.rule.conditions as RuleCondition[];
  const visibleConditions = () => showAllConditions() ? conditions() : conditions().slice(0, MAX_VISIBLE);
  const hiddenCount = () => Math.max(0, conditions().length - MAX_VISIBLE);

  const deleteMut = createMutation(() => ({
    mutationFn: async () => {
      const { deleteClassificationRule } = await import('@/modules/finances/finances.services');
      await deleteClassificationRule({ organizationId: props.organizationId, ruleId: props.rule.id });
    },
    onSuccess: () => {
      createToast({ message: t('tagging-rules.page.toast.deleted'), type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', props.organizationId, 'finances', 'classification-rules'] });
    },
  }));

  return (
    <div class="flex items-start gap-3 p-3 bg-card rounded-lg border">
      {/* Priority Input */}
      <div class="flex flex-col items-center shrink-0 w-11 mt-0.5" title={t('tagging-rules.page.priority.title')}>
        <span class="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mb-1">{t('tagging-rules.page.priority')}</span>
        <input
          type="number"
          value={props.rule.priority}
          onChange={e => props.onPriorityChange(Number(e.currentTarget.value))}
          class="w-full text-center text-[10px] font-mono bg-muted/30 hover:bg-muted focus:bg-background border border-transparent hover:border-border/50 focus:border-primary/50 rounded py-1 outline-none transition-colors"
        />
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="font-medium text-sm">{props.rule.name}</span>
          <Badge variant="outline" class="text-xs">{t('tagging-rules.page.badge.transaction')}</Badge>
          <Badge class={cn('text-xs pointer-events-none', classificationColors[props.rule.classification])}>
            {getClassificationLabelKey(props.rule.classification) ? t(getClassificationLabelKey(props.rule.classification)!) : props.rule.classification}
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
        <div class="text-xs text-muted-foreground mt-1.5 flex flex-wrap items-center gap-1">
          <Show when={conditions().length > 1}>
            <span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 mr-0.5">
              {props.rule.conditionMatchMode === 'any' ? t('tagging-rules.page.any-of') : t('tagging-rules.page.all-of')}
            </span>
          </Show>
          <For each={visibleConditions()}>
            {cond => (
              <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted border border-border/50 font-mono text-[11px]">
                <span class="text-muted-foreground/70">{transactionFieldLabelKeys[cond.field] ? t(transactionFieldLabelKeys[cond.field]!) : cond.field}</span>
                <span class="text-muted-foreground/50">{ruleOperatorLabelKeys[cond.operator] ? t(ruleOperatorLabelKeys[cond.operator]!) : cond.operator}</span>
                <span class="font-medium text-foreground/80">
                  "
                  {cond.value}
                  "
                </span>
              </span>
            )}
          </For>
          <Show when={hiddenCount() > 0 && !showAllConditions()}>
            <button
              type="button"
              class="inline-flex items-center px-1.5 py-0.5 rounded bg-muted/60 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
              onClick={() => setShowAllConditions(true)}
            >
              {t('tagging-rules.page.more', { count: hiddenCount() })}
            </button>
          </Show>
          <Show when={showAllConditions() && conditions().length > MAX_VISIBLE}>
            <button
              type="button"
              class="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              onClick={() => setShowAllConditions(false)}
            >
              {t('tagging-rules.page.show-less')}
            </button>
          </Show>
        </div>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <Button variant="outline" size="sm" class="h-7 text-xs gap-1" onClick={props.onRunRule} disabled={props.isRunning}>
          <div class="i-tabler-player-play size-3.5" />
          {props.isRunning ? t('tagging-rules.page.running') : t('tagging-rules.page.run')}
        </Button>
        <Button variant="ghost" size="icon" class="size-7" aria-label={t('tagging-rules.page.edit')} onClick={() => props.onEdit(props.rule)}>
          <div class="i-tabler-edit size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="size-7 text-destructive hover:text-destructive"
          onClick={async () => {
            const ok = await confirm({
              title: t('tagging-rules.page.delete-transaction.title'),
              message: t('tagging-rules.page.delete.message', { name: props.rule.name }),
              confirmButton: { text: t('tagging-rules.page.delete'), variant: 'destructive' },
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
  const { t } = useI18n();
  const params = useParams();
  const { hasFlag } = useFeatureFlags();
  const [editingRule, setEditingRule] = createSignal<ClassificationRule | null>(null);
  const [editName, setEditName] = createSignal('');
  const [editClassification, setEditClassification] = createSignal('');
  const [editTagIds, setEditTagIds] = createSignal<string[]>([]);
  const [editConditions, setEditConditions] = createSignal<RuleCondition[]>([]);
  const [editMatchMode, setEditMatchMode] = createSignal<'all' | 'any'>('all');
  const [editPriority, setEditPriority] = createSignal(0);

  const openEdit = (rule: ClassificationRule) => {
    setEditName(rule.name);
    setEditClassification(rule.classification);
    setEditTagIds(rule.tagIds ?? []);
    setEditConditions((rule.conditions ?? []).map(c => ({ ...c })));
    setEditMatchMode(rule.conditionMatchMode ?? 'all');
    setEditPriority(rule.priority);
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

  const docRules = () => taggingRulesQuery.data?.taggingRules ?? [];
  const txnRules = () => classificationRulesQuery.data?.rules ?? [];
  const totalRules = () => docRules().length + txnRules().length;

  const autoClassifyMut = createMutation(() => ({
    mutationFn: () => autoClassifyTransactions({ organizationId: params.organizationId }),
    onSuccess: (data) => {
      createToast({ message: t('tagging-rules.page.toast.classified', { count: data.classifiedCount }), type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finances', 'transactions'] });
    },
    onError: () => {
      createToast({ message: t('tagging-rules.page.toast.classify-error'), type: 'error' });
    },
  }));

  const updateRuleMut = createMutation(() => ({
    mutationFn: async () => {
      const rule = editingRule();
      if (!rule) {
        return;
      }

      const classification = editClassification() || rule.classification;
      const priority = editPriority();

      // Validate priority uniqueness
      if (txnRules().some(r => r.id !== rule.id && r.classification === classification && r.priority === priority)) {
        throw new Error(t('tagging-rules.page.priority.taken', { priority, classification: getClassificationLabelKey(classification) ? t(getClassificationLabelKey(classification)!) : classification }));
      }

      await updateClassificationRule({
        organizationId: params.organizationId,
        ruleId: rule.id,
        updates: {
          name: editName(),
          classification,
          tagIds: editTagIds(),
          conditions: editConditions(),
          conditionMatchMode: editMatchMode(),
          priority,
        },
      });
    },
    onSuccess: () => {
      createToast({ message: t('tagging-rules.page.toast.updated'), type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finances', 'classification-rules'] });
      setEditingRule(null);
    },
    onError: (error: any) => {
      createToast({ message: error.message || t('tagging-rules.page.toast.update-error'), type: 'error' });
    },
  }));

  const classifications = () => [
    { value: '', label: t('tagging-rules.wizard.summary.none') },
    ...transactionClassifications.map(value => ({ value, label: t(classificationLabelKeys[value]) })),
  ];

  return (
    <div class="page">
      {/* Header */}
      <div class="page-header">
        <div>
          <h1 class="page-title">{t('tagging-rules.page.title')}</h1>
          <p class="page-description">{t('tagging-rules.page.description')}</p>
        </div>
        <div class="flex items-center gap-2">
          <Show when={hasFlag('llc_finances') && txnRules().length > 0}>
            <Button
              size="sm"
              variant="outline"
              class="h-8 text-xs gap-1.5"
              onClick={() => autoClassifyMut.mutate()}
              disabled={autoClassifyMut.isPending}
            >
              <div class={cn('i-tabler-rocket size-3.5', autoClassifyMut.isPending && 'animate-pulse')} />
              {autoClassifyMut.isPending ? t('tagging-rules.page.running') : t('tagging-rules.page.run-all')}
            </Button>
          </Show>
          <Button as={A} href={getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: 'settingsAutomations', childPath: 'create' })} size="sm" class="h-8 text-xs gap-1.5">
            <div class="i-tabler-plus size-3.5" />
            {t('tagging-rules.page.new')}
          </Button>
        </div>
      </div>

      <div>
        <Switch>
          <Match when={totalRules() === 0}>
            <div class="mt-16">
              <EmptyState
                title={t('tagging-rules.page.empty.title')}
                description={t('tagging-rules.page.empty.description')}
                class="pt-0"
                icon="i-tabler-list-check"
                cta={(
                  <Button as={A} href={getOrganizationRouteChildHref({ organizationId: params.organizationId, routeId: 'settingsAutomations', childPath: 'create' })}>
                    <div class="i-tabler-plus size-4 mr-2" />
                    {t('tagging-rules.create.submit')}
                  </Button>
                )}
              />
            </div>
          </Match>

          <Match when={totalRules() > 0}>
            {/* Document Rules */}
            <Show when={docRules().length > 0}>
              <div class="mb-6">
                <h3 class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{t('tagging-rules.page.document-rules')}</h3>
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
                <div class="flex items-center gap-2 mb-2">
                  <h3 class="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('tagging-rules.page.transaction-rules')}</h3>
                  <div class="text-[10px] text-muted-foreground bg-muted/50 px-2 py-0.5 rounded border border-border/50" title={t('tagging-rules.page.priority-hint.title')}>
                    {t('tagging-rules.page.priority-hint')}
                  </div>
                </div>
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
                        onPriorityChange={async (newPriority) => {
                          if (newPriority === rule.priority) {
                            return;
                          }

                          // Validate uniqueness per classification
                          const isUsed = txnRules().some(r => r.id !== rule.id && r.classification === rule.classification && r.priority === newPriority);
                          if (isUsed) {
                            createToast({
                              message: t('tagging-rules.page.priority.taken', { priority: newPriority, classification: getClassificationLabelKey(rule.classification) ? t(getClassificationLabelKey(rule.classification)!) : rule.classification }),
                              type: 'error',
                            });
                            // Trigger re-render to reset input value
                            queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finances', 'classification-rules'] });
                            return;
                          }

                          await updateClassificationRule({
                            organizationId: params.organizationId,
                            ruleId: rule.id,
                            updates: { priority: newPriority },
                          });
                          queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finances', 'classification-rules'] });
                        }}
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
      <Dialog
        open={editingRule() !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingRule(null);
          }
        }}
      >
        <DialogContent class="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('tagging-rules.page.edit-transaction')}</DialogTitle>
          </DialogHeader>
          <div class="space-y-5 pt-2">
            {/* Name */}
            <TextFieldRoot class="flex flex-col gap-1">
              <TextFieldLabel>{t('tagging-rules.page.name')}</TextFieldLabel>
              <TextField
                type="text"
                value={editName()}
                onInput={e => setEditName(e.currentTarget.value)}
              />
            </TextFieldRoot>

            {/* Classification */}
            <div>
              <p class="text-sm font-medium mb-2">{t('tagging-rules.wizard.classification')}</p>
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <For each={classifications()}>
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
                <p class="text-sm font-medium">{t('tagging-rules.wizard.step.conditions')}</p>
                <Select
                  options={['all', 'any']}
                  value={editMatchMode()}
                  onChange={v => v && setEditMatchMode(v as 'all' | 'any')}
                  itemComponent={props => <SelectItem item={props.item}>{props.item.rawValue === 'all' ? t('tagging-rules.wizard.match.all') : t('tagging-rules.wizard.match.any')}</SelectItem>}
                >
                  <SelectTrigger class="w-[130px] h-7 text-xs">
                    <SelectValue<string>>{state => state.selectedOption() === 'all' ? t('tagging-rules.wizard.match.all') : t('tagging-rules.wizard.match.any')}</SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>
              </div>

              <div class="space-y-2">
                <Index each={editConditions()}>
                  {(cond, index) => (
                    <div class="flex flex-wrap gap-2 items-center bg-muted/50 rounded-lg p-2.5 border">
                      <div class="text-xs text-muted-foreground w-10 shrink-0">
                        {index === 0 ? t('tagging-rules.form.conditions.connector.when') : (editMatchMode() === 'all' ? t('tagging-rules.wizard.connector.and') : t('tagging-rules.wizard.connector.or'))}
                      </div>

                      <Select
                        options={['counterparty', 'description', 'amount']}
                        value={cond().field}
                        onChange={v => v && setEditConditions(prev => prev.map((c, i) => i === index ? { ...c, field: v } : c))}
                        itemComponent={props => <SelectItem item={props.item}>{transactionFieldLabelKeys[props.item.rawValue] ? t(transactionFieldLabelKeys[props.item.rawValue]!) : props.item.rawValue}</SelectItem>}
                      >
                        <SelectTrigger class="min-w-[130px] whitespace-nowrap">
                          <SelectValue<string>>{state => transactionFieldLabelKeys[state.selectedOption()] ? t(transactionFieldLabelKeys[state.selectedOption()]!) : state.selectedOption()}</SelectValue>
                        </SelectTrigger>
                        <SelectContent />
                      </Select>

                      <Select
                        options={['contains', 'equals', 'starts_with', 'gt', 'lt']}
                        value={cond().operator}
                        onChange={v => v && setEditConditions(prev => prev.map((c, i) => i === index ? { ...c, operator: v } : c))}
                        itemComponent={props => <SelectItem item={props.item}>{ruleOperatorLabelKeys[props.item.rawValue] ? t(ruleOperatorLabelKeys[props.item.rawValue]!) : props.item.rawValue}</SelectItem>}
                      >
                        <SelectTrigger class="min-w-[120px] whitespace-nowrap">
                          <SelectValue<string>>{state => ruleOperatorLabelKeys[state.selectedOption()] ? t(ruleOperatorLabelKeys[state.selectedOption()]!) : state.selectedOption()}</SelectValue>
                        </SelectTrigger>
                        <SelectContent />
                      </Select>

                      <TextFieldRoot class="flex-1 min-w-[120px]">
                        <TextField
                          type="text"
                          placeholder={t('tagging-rules.wizard.value.placeholder')}
                          value={cond().value}
                          onInput={e => setEditConditions(prev => prev.map((c, i) => i === index ? { ...c, value: e.currentTarget.value } : c))}
                        />
                      </TextFieldRoot>

                      <Button variant="ghost" size="icon" class="size-7 shrink-0 text-destructive hover:text-destructive" aria-label={t('tagging-rules.wizard.remove-condition')} onClick={() => setEditConditions(prev => prev.filter((_, i) => i !== index))}>
                        <div class="i-tabler-x size-3.5" />
                      </Button>
                    </div>
                  )}
                </Index>
              </div>

              <Button
                variant="outline"
                size="sm"
                class="mt-2 gap-1.5 text-xs"
                onClick={() => setEditConditions(prev => [...prev, { field: 'counterparty', operator: 'contains', value: '' }])}
              >
                <div class="i-tabler-plus size-3.5" />
                {t('tagging-rules.form.conditions.add-condition')}
              </Button>
            </div>

            {/* Tags */}
            <div>
              <p class="text-sm font-medium mb-2">{t('tagging-rules.page.tags')}</p>
              <DocumentTagPicker
                organizationId={params.organizationId}
                tagIds={editTagIds()}
                onTagsChange={({ tags }) => setEditTagIds(tags.map(t => t.id))}
              />
            </div>

            {/* Priority */}
            <TextFieldRoot class="flex flex-col gap-1">
              <TextFieldLabel>
                {t('tagging-rules.page.priority')}
                <span class="ml-1.5 text-xs text-muted-foreground font-normal">{t('tagging-rules.page.priority.help')}</span>
              </TextFieldLabel>
              <TextField
                type="number"
                value={editPriority()}
                onInput={e => setEditPriority(Number(e.currentTarget.value))}
              />
            </TextFieldRoot>

            <div class="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingRule(null)}>{t('tagging-rules.page.cancel')}</Button>
              <Button onClick={() => updateRuleMut.mutate()} disabled={updateRuleMut.isPending || !editName().trim()} isLoading={updateRuleMut.isPending}>
                {t('tagging-rules.page.save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
