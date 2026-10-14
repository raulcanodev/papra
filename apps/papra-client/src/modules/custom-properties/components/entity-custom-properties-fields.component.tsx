import type { CustomPropertyDefinition, EntityCustomPropertiesInput, EntityCustomProperty, GenericCustomPropertyEntityType } from '../custom-properties.types';
import { A } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { createEffect, For, Match, on, Show, Switch } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { queryClient } from '@/modules/shared/query/query-client';
import { cn } from '@/modules/shared/style/cn';
import { SimpleCheckbox } from '@/modules/ui/components/simple-checkbox';
import { SimpleSelect } from '@/modules/ui/components/simple-select';
import { TextField } from '@/modules/ui/components/textfield';
import { getOrganizationRouteHref } from '@/modules/ui/navigation/organization-navigation';
import { fetchCustomPropertyDefinitions, fetchEntityCustomProperties } from '../custom-properties.services';

function getEntityValuesQueryKey({ organizationId, entityType, entityId }: { organizationId: string; entityType: GenericCustomPropertyEntityType; entityId?: string }) {
  return ['organizations', organizationId, 'custom-properties', 'entities', entityType, ...(entityId === undefined ? [] : [entityId])];
}

/** To call once an entity has been saved, so its next edition loads the fresh values */
export async function invalidateEntityCustomProperties({ organizationId, entityType }: { organizationId: string; entityType: GenericCustomPropertyEntityType }) {
  await queryClient.invalidateQueries({ queryKey: getEntityValuesQueryKey({ organizationId, entityType }) });
}

function toInputValue({ property }: { property: EntityCustomProperty }): EntityCustomPropertiesInput[string] {
  const { type, value } = property;

  if (value === null || value === undefined) {
    return null;
  }

  switch (type) {
    case 'select': return (value as { optionId: string }).optionId;
    case 'multi_select': return (value as { optionId: string }[]).map(({ optionId }) => optionId);
    // Date inputs work with yyyy-mm-dd, values are stored as UTC midnight
    case 'date': return String(value).slice(0, 10);
    default: return value as string | number | boolean;
  }
}

/**
 * The custom properties of an entity, rendered as controlled fields of its create / edit form grid.
 * The values are submitted along with the entity, in the same request.
 */
export function EntityCustomPropertiesFields(props: {
  organizationId: string;
  entityType: GenericCustomPropertyEntityType;
  entityId: string | null;
  value: EntityCustomPropertiesInput;
  onChange: (value: EntityCustomPropertiesInput) => void;
}) {
  const { t } = useI18n();

  const definitionsQuery = useQuery(() => ({
    queryKey: ['organizations', props.organizationId, 'custom-properties', { entityType: props.entityType }],
    queryFn: () => fetchCustomPropertyDefinitions({ organizationId: props.organizationId, entityType: props.entityType }),
  }));

  const valuesQuery = useQuery(() => ({
    queryKey: getEntityValuesQueryKey({ organizationId: props.organizationId, entityType: props.entityType, entityId: props.entityId ?? '' }),
    queryFn: () => fetchEntityCustomProperties({ organizationId: props.organizationId, entityType: props.entityType, entityId: props.entityId! }),
    enabled: props.entityId !== null,
  }));

  // Seeds the form with the stored values, without overriding what the user already changed
  createEffect(on(() => valuesQuery.data, (data) => {
    if (!data) {
      return;
    }

    const storedValues = Object.fromEntries(data.customProperties.map(property => [property.propertyDefinitionId, toInputValue({ property })]));
    props.onChange({ ...storedValues, ...props.value });
  }));

  const set = (definitionId: string, value: EntityCustomPropertiesInput[string]) => props.onChange({ ...props.value, [definitionId]: value });
  const definitions = () => definitionsQuery.data?.propertyDefinitions ?? [];

  return (
    <Show when={definitions().length > 0}>
      <div class="col-span-full mt-2 flex items-center justify-between border-t pt-4">
        <p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('custom-properties.entity-fields.title')}</p>
        <A
          href={`${getOrganizationRouteHref({ organizationId: props.organizationId, routeId: 'settingsCustomProperties' })}?entityType=${props.entityType}`}
          class="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {t('custom-properties.entity-fields.manage')}
        </A>
      </div>

      <For each={definitions()}>
        {definition => (
          <EntityCustomPropertyField
            definition={definition}
            value={props.value[definition.id] ?? null}
            onChange={value => set(definition.id, value)}
          />
        )}
      </For>
    </Show>
  );
}

function EntityCustomPropertyField(props: { definition: CustomPropertyDefinition; value: EntityCustomPropertiesInput[string]; onChange: (value: EntityCustomPropertiesInput[string]) => void }) {
  const { t } = useI18n();
  const fieldId = () => `custom-property-${props.definition.id}`;
  const isWide = () => props.definition.type === 'multi_select';

  return (
    <div class={cn('text-sm font-medium', isWide() && 'col-span-full')}>
      <label for={fieldId()}>{props.definition.name}</label>
      <Show when={props.definition.description}>
        <p class="text-xs font-normal text-muted-foreground">{props.definition.description}</p>
      </Show>

      <div class="mt-1.5 font-normal">
        <Switch>
          <Match when={props.definition.type === 'text'}>
            <TextField id={fieldId()} maxLength={10_000} value={typeof props.value === 'string' ? props.value : ''} onInput={event => props.onChange(event.currentTarget.value || null)} />
          </Match>

          <Match when={props.definition.type === 'number'}>
            <TextField
              id={fieldId()}
              type="number"
              step="any"
              value={typeof props.value === 'number' ? props.value : ''}
              onInput={(event) => {
                const { value } = event.currentTarget;
                props.onChange(value === '' || Number.isNaN(Number(value)) ? null : Number(value));
              }}
            />
          </Match>

          <Match when={props.definition.type === 'date'}>
            <TextField id={fieldId()} type="date" value={typeof props.value === 'string' ? props.value : ''} onInput={event => props.onChange(event.currentTarget.value || null)} />
          </Match>

          <Match when={props.definition.type === 'boolean'}>
            <SimpleCheckbox class="h-10" aria-label={props.definition.name} checked={props.value === true} onChange={checked => props.onChange(checked)} label={t('custom-properties.entity-fields.boolean.yes')} />
          </Match>

          <Match when={props.definition.type === 'select'}>
            <SimpleSelect
              aria-label={props.definition.name}
              triggerClass="w-full"
              value={typeof props.value === 'string' ? props.value : ''}
              onChange={value => props.onChange(value || null)}
              options={[{ value: '', label: t('custom-properties.entity-fields.select.none') }, ...props.definition.options.map(option => ({ value: option.id, label: option.name }))]}
            />
          </Match>

          <Match when={props.definition.type === 'multi_select'}>
            <div class="flex flex-wrap gap-1.5" role="group" aria-label={props.definition.name}>
              <For each={props.definition.options}>
                {(option) => {
                  const selected = () => Array.isArray(props.value) && props.value.includes(option.id);
                  const toggle = () => {
                    const current = Array.isArray(props.value) ? props.value : [];
                    const next = selected() ? current.filter(id => id !== option.id) : [...current, option.id];
                    props.onChange(next.length > 0 ? next : null);
                  };

                  return (
                    <button
                      type="button"
                      aria-pressed={selected()}
                      class={cn('flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-accent', selected() && 'border-primary bg-primary/10 text-foreground')}
                      onClick={toggle}
                    >
                      <Show when={selected()}><div class="i-tabler-check size-3" /></Show>
                      {option.name}
                    </button>
                  );
                }}
              </For>
            </div>
          </Match>
        </Switch>
      </div>
    </div>
  );
}
