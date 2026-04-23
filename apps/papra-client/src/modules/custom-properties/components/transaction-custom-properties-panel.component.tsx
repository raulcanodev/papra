import type { Component } from 'solid-js';
import type { CustomPropertyDefinition } from '../custom-properties.types';
import { createMemo, For, Match, Show, Switch as SolidSwitch } from 'solid-js';
import { useMutation } from '@tanstack/solid-query';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { deleteTransactionCustomPropertyValue, setTransactionCustomPropertyValue } from '@/modules/finances/finances.services';
import { useI18nApiErrors } from '@/modules/shared/http/composables/i18n-api-errors';
import { queryClient } from '@/modules/shared/query/query-client';
import { Separator } from '@/modules/ui/components/separator';
import { createToast } from '@/modules/ui/components/sonner';
import { rawPropertyValueAsOption, rawPropertyValueAsOptionArray } from '../custom-properties.models';
import {
  BooleanPropertyEditor,
  DatePropertyEditor,
  MultiSelectPropertyEditor,
  NumberPropertyEditor,
  SelectPropertyEditor,
  TextPropertyEditor,
} from './document-custom-properties-panel.component';

type TransactionCustomPropertyValueRow = {
  value: {
    id: string;
    propertyDefinitionId: string;
    textValue: string | null;
    numberValue: number | null;
    dateValue: string | null;
    booleanValue: boolean | null;
    selectOptionId: string | null;
  };
  definition: {
    id: string;
    name: string;
    key: string;
    type: string;
  };
  option: { id: string; name: string } | null;
};

function getDateValue(value: unknown): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function getRawValue(definition: CustomPropertyDefinition, rows: TransactionCustomPropertyValueRow[]): unknown {
  if (!rows || rows.length === 0) {
    return null;
  }
  const row = rows[0];
  switch (definition.type) {
    case 'text': return row.value.textValue;
    case 'number': return row.value.numberValue;
    case 'date': return row.value.dateValue;
    case 'boolean': return row.value.booleanValue;
    case 'select': return row.option ? { optionId: row.option.id, name: row.option.name } : null;
    case 'multi_select': return rows
      .filter(r => r.option !== null)
      .map(r => ({ optionId: r.option!.id, name: r.option!.name }));
    default: return null;
  }
}

const TransactionPropertyValueEditor: Component<{
  definition: CustomPropertyDefinition;
  rows: TransactionCustomPropertyValueRow[];
  transactionId: string;
  organizationId: string;
}> = (props) => {
  const { getErrorMessage } = useI18nApiErrors();

  const mutation = useMutation(() => ({
    mutationFn: (value: string | number | boolean | string[] | null) => {
      if (value === null) {
        return deleteTransactionCustomPropertyValue({
          organizationId: props.organizationId,
          transactionId: props.transactionId,
          propertyDefinitionId: props.definition.id,
        });
      }
      return setTransactionCustomPropertyValue({
        organizationId: props.organizationId,
        transactionId: props.transactionId,
        propertyDefinitionId: props.definition.id,
        value,
        type: props.definition.type,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: ['organizations', props.organizationId, 'finances', 'transactions', props.transactionId, 'custom-properties'],
    }),
    onError: (error: unknown) => {
      createToast({ message: getErrorMessage({ error }), type: 'error' });
    },
  }));

  const save = (value: string | number | boolean | string[] | null) => {
    mutation.mutate(value);
  };

  const rawValue = () => getRawValue(props.definition, props.rows);

  return (
    <SolidSwitch>
      <Match when={props.definition.type === 'text'}>
        <TextPropertyEditor
          value={typeof rawValue() === 'string' ? rawValue() as string : null}
          onSave={save}
          isPending={mutation.isPending}
        />
      </Match>
      <Match when={props.definition.type === 'number'}>
        <NumberPropertyEditor
          value={typeof rawValue() === 'number' ? rawValue() as number : null}
          onSave={save}
          isPending={mutation.isPending}
        />
      </Match>
      <Match when={props.definition.type === 'date'}>
        <DatePropertyEditor
          value={getDateValue(rawValue())}
          onSave={date => save(date ? date.toISOString() : null)}
          isPending={mutation.isPending}
        />
      </Match>
      <Match when={props.definition.type === 'boolean'}>
        <BooleanPropertyEditor
          value={typeof rawValue() === 'boolean' ? rawValue() as boolean : null}
          onSave={save}
          isPending={mutation.isPending}
        />
      </Match>
      <Match when={props.definition.type === 'select'}>
        <SelectPropertyEditor
          value={rawPropertyValueAsOption(rawValue())}
          options={props.definition.options}
          onSave={optionId => save(optionId)}
          isPending={mutation.isPending}
        />
      </Match>
      <Match when={props.definition.type === 'multi_select'}>
        <MultiSelectPropertyEditor
          value={rawPropertyValueAsOptionArray(rawValue())}
          options={props.definition.options}
          onSave={ids => save(ids)}
          isPending={mutation.isPending}
        />
      </Match>
    </SolidSwitch>
  );
};

export const TransactionCustomPropertiesPanel: Component<{
  transactionId: string;
  organizationId: string;
  propertyDefinitions: CustomPropertyDefinition[];
  values: TransactionCustomPropertyValueRow[];
}> = (props) => {
  const { t } = useI18n();

  const definitions = createMemo(() =>
    props.propertyDefinitions
      .filter(d => d.type !== 'user_relation' && d.type !== 'document_relation')
      .toSorted((a, b) => a.displayOrder - b.displayOrder),
  );

  const valuesByDefinitionId = createMemo(() => {
    const map = new Map<string, TransactionCustomPropertyValueRow[]>();
    for (const row of props.values ?? []) {
      const existing = map.get(row.definition.id) ?? [];
      existing.push(row);
      map.set(row.definition.id, existing);
    }
    return map;
  });

  return (
    <Show when={definitions().length > 0}>
      <>
        <div class="col-span-2 mt-4">
          <Separator class="mb-3" />
          <p class="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            {t('documents.custom-properties.section-title')}
          </p>
        </div>
        <For each={definitions()}>
          {definition => (
            <>
              <div class="py-1 pr-2 text-sm text-muted-foreground flex items-start">
                <div class="flex items-center gap-2 whitespace-nowrap">
                  <div class="i-tabler-tag size-4" />
                  {definition.name}
                </div>
              </div>
              <div class="py-1 pl-2 text-sm">
                <TransactionPropertyValueEditor
                  definition={definition}
                  rows={valuesByDefinitionId().get(definition.id) ?? []}
                  transactionId={props.transactionId}
                  organizationId={props.organizationId}
                />
              </div>
            </>
          )}
        </For>
      </>
    </Show>
  );
};
