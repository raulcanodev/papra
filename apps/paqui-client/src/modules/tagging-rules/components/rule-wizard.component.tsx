import type { Component } from 'solid-js';
import type { TaggingRuleForCreation } from '../tagging-rules.types';
import { A, useNavigate, useParams } from '@solidjs/router';
import { createMutation } from '@tanstack/solid-query';
import { createSignal, For, Show } from 'solid-js';
import { useFeatureFlags } from '@/modules/feature-flags/feature-flags.provider';
import { classificationLabelKeys, transactionClassifications } from '@/modules/finances/finances-labels';
import { createClassificationRule } from '@/modules/finances/finances.services';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { DocumentTagPicker } from '@/modules/tags/components/tag-picker.component';
import { Button } from '@/modules/ui/components/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldLabel, TextFieldRoot } from '@/modules/ui/components/textfield';
import { getOrganizationRouteHref } from '@/modules/ui/navigation/organization-navigation';
import { documentFieldLabelKeys, ruleOperatorLabelKeys, transactionFieldLabelKeys } from '../rule-labels';
import { createTaggingRule } from '../tagging-rules.services';

type RuleType = 'document' | 'transaction';
type Condition = { field: string; operator: string; value: string };

const DOC_FIELDS = ['name', 'content'];
const TXN_FIELDS = ['counterparty', 'description', 'amount'];
const DOC_OPERATORS = ['equal', 'not_equal', 'contains', 'not_contains', 'starts_with', 'ends_with'];
const TXN_OPERATORS = ['contains', 'equals', 'starts_with', 'gt', 'lt'];

export const RuleWizard: Component = () => {
  const { t } = useI18n();
  const params = useParams();
  const navigate = useNavigate();
  const { hasFlag } = useFeatureFlags();

  const [step, setStep] = createSignal(1);
  const [ruleType, setRuleType] = createSignal<RuleType>('document');
  const [name, setName] = createSignal('');
  const [description, setDescription] = createSignal('');
  const [conditionMatchMode, setConditionMatchMode] = createSignal<'all' | 'any'>('all');
  const [conditions, setConditions] = createSignal<Condition[]>([]);
  const [tagIds, setTagIds] = createSignal<string[]>([]);
  const [classification, setClassification] = createSignal('');

  const fields = () => (ruleType() === 'document' ? DOC_FIELDS : TXN_FIELDS).map(value => ({ value, label: t((ruleType() === 'document' ? documentFieldLabelKeys : transactionFieldLabelKeys)[value]!) }));
  const operators = () => (ruleType() === 'document' ? DOC_OPERATORS : TXN_OPERATORS).map(value => ({ value, label: t(ruleOperatorLabelKeys[value]!) }));
  const classifications = () => [
    { value: '', label: t('tagging-rules.wizard.summary.none') },
    ...transactionClassifications.map(value => ({ value, label: t(classificationLabelKeys[value]) })),
  ];

  const addCondition = () => {
    setConditions([...conditions(), { field: fields()[0].value, operator: operators()[0].value, value: '' }]);
  };

  const removeCondition = (index: number) => {
    setConditions(prev => prev.filter((_, i) => i !== index));
  };

  const updateCondition = (index: number, key: keyof Condition, value: string) => {
    setConditions(prev => prev.map((c, i) => i === index ? { ...c, [key]: value } : c));
  };

  const canProceedStep1 = () => name().trim().length > 0;
  const canProceedStep2 = () => true; // conditions are optional
  const canSubmit = () => {
    if (ruleType() === 'document') {
      return tagIds().length > 0;
    }
    return classification().length > 0 || tagIds().length > 0;
  };

  const createDocRuleMut = createMutation(() => ({
    mutationFn: async () => {
      await createTaggingRule({
        organizationId: params.organizationId,
        taggingRule: {
          name: name(),
          description: description(),
          conditionMatchMode: conditionMatchMode(),
          conditions: conditions() as TaggingRuleForCreation['conditions'],
          tagIds: tagIds(),
        },
      });
    },
    onSuccess: () => {
      createToast({ message: t('tagging-rules.wizard.toast.document-created'), type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'tagging-rules'] });
      navigate(getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'settingsAutomations' }));
    },
    onError: () => {
      createToast({ message: t('tagging-rules.wizard.toast.error'), type: 'error' });
    },
  }));

  const createTxnRuleMut = createMutation(() => ({
    mutationFn: async () => {
      await createClassificationRule({
        organizationId: params.organizationId,
        rule: {
          name: name(),
          classification: classification() || undefined,
          conditions: conditions(),
          conditionMatchMode: conditionMatchMode(),
          tagIds: tagIds(),
        },
      });
    },
    onSuccess: () => {
      createToast({ message: t('tagging-rules.wizard.toast.transaction-created'), type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finances', 'classification-rules'] });
      navigate(getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'settingsAutomations' }));
    },
    onError: () => {
      createToast({ message: t('tagging-rules.wizard.toast.error'), type: 'error' });
    },
  }));

  const handleSubmit = () => {
    if (ruleType() === 'document') {
      createDocRuleMut.mutate();
    } else {
      createTxnRuleMut.mutate();
    }
  };

  const isPending = () => createDocRuleMut.isPending || createTxnRuleMut.isPending;

  const steps = () => [
    { num: 1, label: t('tagging-rules.wizard.step.type') },
    { num: 2, label: t('tagging-rules.wizard.step.conditions') },
    { num: 3, label: t('tagging-rules.wizard.step.actions') },
  ];

  return (
    <div class="page-narrow">
      {/* Back link */}
      <A href={getOrganizationRouteHref({ organizationId: params.organizationId, routeId: 'settingsAutomations' })} class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <div class="i-tabler-arrow-left size-4" />
        {t('tagging-rules.wizard.back-to-rules')}
      </A>

      {/* Step indicator */}
      <div class="flex items-center gap-2 mb-8">
        <For each={steps()}>
          {(s, i) => (
            <>
              <Show when={i() > 0}>
                <div class={cn('flex-1 h-px', step() > s.num ? 'bg-primary' : 'bg-border')} />
              </Show>
              <button
                class={cn(
                  'flex items-center gap-2 text-sm px-3 py-1.5 rounded-full border transition-colors',
                  step() === s.num && 'border-primary bg-primary/10 text-primary font-medium',
                  step() > s.num && 'border-primary/50 text-primary',
                  step() < s.num && 'border-border text-muted-foreground',
                )}
                onClick={() => {
                  if (s.num < step()) {
                    setStep(s.num);
                  }
                }}
              >
                <div class={cn(
                  'size-5 rounded-full flex items-center justify-center text-xs font-medium',
                  step() >= s.num ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
                >
                  {step() > s.num ? '✓' : s.num}
                </div>
                {s.label}
              </button>
            </>
          )}
        </For>
      </div>

      {/* Step 1: Type & Name */}
      <Show when={step() === 1}>
        <div class="space-y-6">
          <div>
            <p class="text-sm font-medium mb-3">{t('tagging-rules.wizard.rule-type')}</p>
            <div class="grid grid-cols-2 gap-3">
              <button
                class={cn(
                  'p-4 rounded-lg border-2 text-left transition-colors',
                  ruleType() === 'document' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50',
                )}
                onClick={() => {
                  setRuleType('document');
                  setConditions([]);
                }}
              >
                <div class="i-tabler-file-text size-6 mb-2 text-muted-foreground" />
                <div class="font-medium text-sm">{t('tagging-rules.wizard.document-rule')}</div>
                <div class="text-xs text-muted-foreground mt-0.5">{t('tagging-rules.wizard.document-rule.description')}</div>
              </button>

              <Show when={hasFlag('llc_finances')}>
                <button
                  class={cn(
                    'p-4 rounded-lg border-2 text-left transition-colors',
                    ruleType() === 'transaction' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50',
                  )}
                  onClick={() => {
                    setRuleType('transaction');
                    setConditions([]);
                  }}
                >
                  <div class="i-tabler-arrows-exchange size-6 mb-2 text-muted-foreground" />
                  <div class="font-medium text-sm">{t('tagging-rules.wizard.transaction-rule')}</div>
                  <div class="text-xs text-muted-foreground mt-0.5">{t('tagging-rules.wizard.transaction-rule.description')}</div>
                </button>
              </Show>
            </div>
          </div>

          <TextFieldRoot class="flex flex-col gap-1">
            <TextFieldLabel>{t('tagging-rules.wizard.name')}</TextFieldLabel>
            <TextField
              type="text"
              placeholder={t('tagging-rules.wizard.name.placeholder')}
              value={name()}
              onInput={e => setName(e.currentTarget.value)}
            />
          </TextFieldRoot>

          <TextFieldRoot class="flex flex-col gap-1">
            <TextFieldLabel>{t('tagging-rules.wizard.description')}</TextFieldLabel>
            <TextField
              type="text"
              placeholder={t('tagging-rules.wizard.description.placeholder')}
              value={description()}
              onInput={e => setDescription(e.currentTarget.value)}
            />
          </TextFieldRoot>

          <div class="flex justify-end">
            <Button onClick={() => setStep(2)} disabled={!canProceedStep1()}>
              {t('tagging-rules.wizard.next')}
              <div class="i-tabler-arrow-right size-4 ml-1" />
            </Button>
          </div>
        </div>
      </Show>

      {/* Step 2: Conditions */}
      <Show when={step() === 2}>
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium">{t('tagging-rules.wizard.step.conditions')}</p>
              <p class="text-xs text-muted-foreground">{t('tagging-rules.wizard.conditions.description')}</p>
            </div>
            <Select
              options={['all', 'any']}
              value={conditionMatchMode()}
              onChange={v => v && setConditionMatchMode(v as 'all' | 'any')}
              itemComponent={props => <SelectItem item={props.item}>{props.item.rawValue === 'all' ? t('tagging-rules.wizard.match.all-conditions') : t('tagging-rules.wizard.match.any-condition')}</SelectItem>}
            >
              <SelectTrigger class="w-[200px]">
                <SelectValue<string>>{state => state.selectedOption() === 'all' ? t('tagging-rules.wizard.match.all') : t('tagging-rules.wizard.match.any')}</SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>
          </div>

          <For each={conditions()}>
            {(cond, index) => (
              <div class="flex flex-wrap gap-2 items-center bg-card border rounded-lg p-3">
                <div class="text-xs text-muted-foreground w-12 shrink-0">
                  {index() === 0 ? t('tagging-rules.form.conditions.connector.when') : (conditionMatchMode() === 'all' ? t('tagging-rules.wizard.connector.and') : t('tagging-rules.wizard.connector.or'))}
                </div>

                <Select
                  options={fields().map(f => f.value)}
                  value={cond.field}
                  onChange={v => v && updateCondition(index(), 'field', v)}
                  itemComponent={props => <SelectItem item={props.item}>{fields().find(f => f.value === props.item.rawValue)?.label}</SelectItem>}
                >
                  <SelectTrigger class="min-w-[160px] whitespace-nowrap">
                    <SelectValue<string>>{state => fields().find(f => f.value === state.selectedOption())?.label}</SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>

                <Select
                  options={operators().map(o => o.value)}
                  value={cond.operator}
                  onChange={v => v && updateCondition(index(), 'operator', v)}
                  itemComponent={props => <SelectItem item={props.item}>{operators().find(o => o.value === props.item.rawValue)?.label}</SelectItem>}
                >
                  <SelectTrigger class="min-w-[140px] whitespace-nowrap">
                    <SelectValue<string>>{state => operators().find(o => o.value === state.selectedOption())?.label}</SelectValue>
                  </SelectTrigger>
                  <SelectContent />
                </Select>

                <TextFieldRoot class="flex-1 min-w-[140px]">
                  <TextField
                    type="text"
                    placeholder={t('tagging-rules.wizard.value.placeholder')}
                    value={cond.value}
                    onInput={e => updateCondition(index(), 'value', e.currentTarget.value)}
                  />
                </TextFieldRoot>

                <Button variant="ghost" size="icon" class="size-8 shrink-0 text-destructive hover:text-destructive" aria-label={t('tagging-rules.wizard.remove-condition')} onClick={() => removeCondition(index())}>
                  <div class="i-tabler-x size-4" />
                </Button>
              </div>
            )}
          </For>

          <Button variant="outline" size="sm" class="gap-1.5" onClick={addCondition}>
            <div class="i-tabler-plus size-3.5" />
            {t('tagging-rules.form.conditions.add-condition')}
          </Button>

          <div class="flex justify-between pt-4">
            <Button variant="outline" onClick={() => setStep(1)}>
              <div class="i-tabler-arrow-left size-4 mr-1" />
              {t('tagging-rules.wizard.back')}
            </Button>
            <Button onClick={() => setStep(3)} disabled={!canProceedStep2()}>
              {t('tagging-rules.wizard.next')}
              <div class="i-tabler-arrow-right size-4 ml-1" />
            </Button>
          </div>
        </div>
      </Show>

      {/* Step 3: Actions */}
      <Show when={step() === 3}>
        <div class="space-y-6">
          <Show when={ruleType() === 'transaction'}>
            <div>
              <p class="text-sm font-medium mb-2">{t('tagging-rules.wizard.classification')}</p>
              <p class="text-xs text-muted-foreground mb-3">{t('tagging-rules.wizard.classification.description')}</p>
              <div class="grid grid-cols-2 gap-2">
                <For each={classifications()}>
                  {cls => (
                    <button
                      class={cn(
                        'p-3 rounded-lg border-2 text-left text-sm transition-colors',
                        classification() === cls.value ? 'border-primary bg-primary/5 font-medium' : 'border-border hover:border-muted-foreground/50',
                      )}
                      onClick={() => setClassification(cls.value)}
                    >
                      {cls.label}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <div>
            <p class="text-sm font-medium mb-2">{t('tagging-rules.wizard.tags')}</p>
            <p class="text-xs text-muted-foreground mb-3">
              {ruleType() === 'document'
                ? t('tagging-rules.wizard.tags.document')
                : t('tagging-rules.wizard.tags.transaction')}
            </p>
            <DocumentTagPicker
              organizationId={params.organizationId}
              tagIds={tagIds()}
              onTagsChange={({ tags }) => setTagIds(tags.map(t => t.id))}
            />
          </div>

          {/* Summary */}
          <div class="bg-muted/50 rounded-lg p-4 border">
            <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">{t('tagging-rules.wizard.summary')}</p>
            <div class="space-y-1 text-sm">
              <div>
                <span class="text-muted-foreground">{t('tagging-rules.wizard.summary.type')}</span>
                {' '}
                {ruleType() === 'document' ? t('tagging-rules.wizard.summary.type.document') : t('tagging-rules.wizard.summary.type.transaction')}
              </div>
              <div>
                <span class="text-muted-foreground">{t('tagging-rules.wizard.summary.name')}</span>
                {' '}
                {name()}
              </div>
              <div>
                <span class="text-muted-foreground">{t('tagging-rules.wizard.summary.conditions')}</span>
                {' '}
                {conditions().length === 0 ? t('tagging-rules.wizard.summary.conditions.all') : t('tagging-rules.wizard.summary.conditions.count', { count: conditions().length })}
              </div>
              <Show when={ruleType() === 'transaction'}>
                <div>
                  <span class="text-muted-foreground">{t('tagging-rules.wizard.summary.classification')}</span>
                  {' '}
                  {classifications().find(c => c.value === classification())?.label ?? t('tagging-rules.wizard.summary.none')}
                </div>
              </Show>
              <div>
                <span class="text-muted-foreground">{t('tagging-rules.wizard.summary.tags')}</span>
                {' '}
                {tagIds().length === 0 ? t('tagging-rules.wizard.summary.none') : t('tagging-rules.wizard.summary.tags.count', { count: tagIds().length })}
              </div>
            </div>
          </div>

          <div class="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              <div class="i-tabler-arrow-left size-4 mr-1" />
              {t('tagging-rules.wizard.back')}
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit() || isPending()} isLoading={isPending()}>
              {t('tagging-rules.create.submit')}
            </Button>
          </div>
        </div>
      </Show>
    </div>
  );
};
