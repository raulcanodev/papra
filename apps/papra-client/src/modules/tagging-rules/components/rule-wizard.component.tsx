import type { Component } from 'solid-js';
import { A, useNavigate, useParams } from '@solidjs/router';
import { createMutation } from '@tanstack/solid-query';
import { createSignal, For, Show } from 'solid-js';
import { useFeatureFlags } from '@/modules/feature-flags/feature-flags.provider';
import type { TaggingRuleForCreation } from '../tagging-rules.types';
import { createClassificationRule } from '@/modules/finances/finances.services';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { DocumentTagPicker } from '@/modules/tags/components/tag-picker.component';
import { Button } from '@/modules/ui/components/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';
import { createToast } from '@/modules/ui/components/sonner';
import { TextField, TextFieldLabel, TextFieldRoot } from '@/modules/ui/components/textfield';
import { createTaggingRule } from '../tagging-rules.services';

type RuleType = 'document' | 'transaction';
type Condition = { field: string; operator: string; value: string };

const DOC_FIELDS = [
  { value: 'name', label: 'Document Name' },
  { value: 'content', label: 'Document Content' },
];

const TXN_FIELDS = [
  { value: 'counterparty', label: 'Counterparty' },
  { value: 'description', label: 'Description' },
  { value: 'amount', label: 'Amount' },
];

const DOC_OPERATORS = [
  { value: 'equal', label: 'equals' },
  { value: 'not_equal', label: 'not equal' },
  { value: 'contains', label: 'contains' },
  { value: 'not_contains', label: 'not contains' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'ends_with', label: 'ends with' },
];

const TXN_OPERATORS = [
  { value: 'contains', label: 'contains' },
  { value: 'equals', label: 'equals' },
  { value: 'starts_with', label: 'starts with' },
  { value: 'gt', label: 'greater than' },
  { value: 'lt', label: 'less than' },
];

const CLASSIFICATIONS = [
  { value: '', label: 'None' },
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'owner_transfer', label: 'Owner Transfer' },
  { value: 'internal_transfer', label: 'Internal Transfer' },
];

export const RuleWizard: Component = () => {
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

  const fields = () => ruleType() === 'document' ? DOC_FIELDS : TXN_FIELDS;
  const operators = () => ruleType() === 'document' ? DOC_OPERATORS : TXN_OPERATORS;

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
    if (ruleType() === 'document') return tagIds().length > 0;
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
      createToast({ message: 'Document rule created', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'tagging-rules'] });
      navigate(`/organizations/${params.organizationId}/tagging-rules`);
    },
    onError: () => {
      createToast({ message: 'Failed to create rule', type: 'error' });
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
      createToast({ message: 'Transaction rule created', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['organizations', params.organizationId, 'finances', 'classification-rules'] });
      navigate(`/organizations/${params.organizationId}/tagging-rules`);
    },
    onError: () => {
      createToast({ message: 'Failed to create rule', type: 'error' });
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

  const steps = [
    { num: 1, label: 'Type & Name' },
    { num: 2, label: 'Conditions' },
    { num: 3, label: 'Actions' },
  ];

  return (
    <div class="p-6 max-w-screen-md mx-auto mt-4">
      {/* Back link */}
      <A href={`/organizations/${params.organizationId}/tagging-rules`} class="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <div class="i-tabler-arrow-left size-4" />
        Back to Rules
      </A>

      {/* Step indicator */}
      <div class="flex items-center gap-2 mb-8">
        <For each={steps}>
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
                onClick={() => { if (s.num < step()) setStep(s.num); }}
              >
                <div class={cn(
                  'size-5 rounded-full flex items-center justify-center text-xs font-medium',
                  step() >= s.num ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}>
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
            <p class="text-sm font-medium mb-3">Rule Type</p>
            <div class="grid grid-cols-2 gap-3">
              <button
                class={cn(
                  'p-4 rounded-lg border-2 text-left transition-colors',
                  ruleType() === 'document' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50',
                )}
                onClick={() => { setRuleType('document'); setConditions([]); }}
              >
                <div class="i-tabler-file-text size-6 mb-2 text-muted-foreground" />
                <div class="font-medium text-sm">Document Rule</div>
                <div class="text-xs text-muted-foreground mt-0.5">Auto-tag documents based on name or content</div>
              </button>

              <Show when={hasFlag('llc_finances')}>
                <button
                  class={cn(
                    'p-4 rounded-lg border-2 text-left transition-colors',
                    ruleType() === 'transaction' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50',
                  )}
                  onClick={() => { setRuleType('transaction'); setConditions([]); }}
                >
                  <div class="i-tabler-arrows-exchange size-6 mb-2 text-muted-foreground" />
                  <div class="font-medium text-sm">Transaction Rule</div>
                  <div class="text-xs text-muted-foreground mt-0.5">Classify and tag transactions automatically</div>
                </button>
              </Show>
            </div>
          </div>

          <TextFieldRoot class="flex flex-col gap-1">
            <TextFieldLabel>Rule Name</TextFieldLabel>
            <TextField
              type="text"
              placeholder="e.g. Tag invoices, Classify rent payments..."
              value={name()}
              onInput={e => setName(e.currentTarget.value)}
            />
          </TextFieldRoot>

          <TextFieldRoot class="flex flex-col gap-1">
            <TextFieldLabel>Description (optional)</TextFieldLabel>
            <TextField
              type="text"
              placeholder="Brief description of what this rule does"
              value={description()}
              onInput={e => setDescription(e.currentTarget.value)}
            />
          </TextFieldRoot>

          <div class="flex justify-end">
            <Button onClick={() => setStep(2)} disabled={!canProceedStep1()}>
              Next
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
              <p class="text-sm font-medium">Conditions</p>
              <p class="text-xs text-muted-foreground">Define when this rule should apply. Leave empty to match all.</p>
            </div>
            <Select
              options={['all', 'any']}
              value={conditionMatchMode()}
              onChange={v => v && setConditionMatchMode(v as 'all' | 'any')}
              itemComponent={props => <SelectItem item={props.item}>{props.item.rawValue === 'all' ? 'Match ALL conditions' : 'Match ANY condition'}</SelectItem>}
            >
              <SelectTrigger class="w-[200px]">
                <SelectValue<string>>{state => state.selectedOption() === 'all' ? 'Match ALL' : 'Match ANY'}</SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>
          </div>

          <For each={conditions()}>
            {(cond, index) => (
              <div class="flex flex-wrap gap-2 items-center bg-card border rounded-lg p-3">
                <div class="text-xs text-muted-foreground w-12 shrink-0">
                  {index() === 0 ? 'When' : (conditionMatchMode() === 'all' ? 'AND' : 'OR')}
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
                    placeholder="Value..."
                    value={cond.value}
                    onInput={e => updateCondition(index(), 'value', e.currentTarget.value)}
                  />
                </TextFieldRoot>

                <Button variant="ghost" size="icon" class="size-8 shrink-0 text-destructive hover:text-destructive" onClick={() => removeCondition(index())}>
                  <div class="i-tabler-x size-4" />
                </Button>
              </div>
            )}
          </For>

          <Button variant="outline" size="sm" class="gap-1.5" onClick={addCondition}>
            <div class="i-tabler-plus size-3.5" />
            Add Condition
          </Button>

          <div class="flex justify-between pt-4">
            <Button variant="outline" onClick={() => setStep(1)}>
              <div class="i-tabler-arrow-left size-4 mr-1" />
              Back
            </Button>
            <Button onClick={() => setStep(3)} disabled={!canProceedStep2()}>
              Next
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
              <p class="text-sm font-medium mb-2">Classification</p>
              <p class="text-xs text-muted-foreground mb-3">Choose how matching transactions should be classified.</p>
              <div class="grid grid-cols-2 gap-2">
                <For each={CLASSIFICATIONS}>
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
            <p class="text-sm font-medium mb-2">Tags to Apply</p>
            <p class="text-xs text-muted-foreground mb-3">
              {ruleType() === 'document'
                ? 'Select tags that will be applied to matching documents. (Required)'
                : 'Optionally add tags to matching transactions.'}
            </p>
            <DocumentTagPicker
              organizationId={params.organizationId}
              tagIds={tagIds()}
              onTagsChange={({ tags }) => setTagIds(tags.map(t => t.id))}
            />
          </div>

          {/* Summary */}
          <div class="bg-muted/50 rounded-lg p-4 border">
            <p class="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Rule Summary</p>
            <div class="space-y-1 text-sm">
              <div><span class="text-muted-foreground">Type:</span> {ruleType() === 'document' ? 'Document' : 'Transaction'}</div>
              <div><span class="text-muted-foreground">Name:</span> {name()}</div>
              <div><span class="text-muted-foreground">Conditions:</span> {conditions().length === 0 ? 'Match all' : `${conditions().length} condition(s)`}</div>
              <Show when={ruleType() === 'transaction'}>
                <div><span class="text-muted-foreground">Classification:</span> {CLASSIFICATIONS.find(c => c.value === classification())?.label ?? 'None'}</div>
              </Show>
              <div><span class="text-muted-foreground">Tags:</span> {tagIds().length === 0 ? 'None' : `${tagIds().length} tag(s)`}</div>
            </div>
          </div>

          <div class="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              <div class="i-tabler-arrow-left size-4 mr-1" />
              Back
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit() || isPending()} isLoading={isPending()}>
              Create Rule
            </Button>
          </div>
        </div>
      </Show>
    </div>
  );
};
