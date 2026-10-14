import { createMemo } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

export type SimpleSelectOption = { value: string; label: string };

// Kobalte treats an empty string key as "no selection", so empty values travel under a sentinel.
const EMPTY_VALUE = '__empty__';
const encode = (value: string) => (value === '' ? EMPTY_VALUE : value);
const decode = (value: string) => (value === EMPTY_VALUE ? '' : value);

/** Single-value select built on the shadcn Select, driven by a flat options list. */
export function SimpleSelect(props: {
  'options': readonly SimpleSelectOption[];
  'value': string;
  'onChange': (value: string) => void;
  'class'?: string;
  'triggerClass'?: string;
  'disabled'?: boolean;
  'placeholder'?: string;
  'aria-label'?: string;
}) {
  const options = createMemo(() => props.options.map(option => ({ ...option, value: encode(option.value) })));
  const selected = createMemo(() => options().find(option => option.value === encode(props.value)) ?? null);

  return (
    <Select<SimpleSelectOption>
      class={props.class}
      options={options()}
      optionValue="value"
      optionTextValue="label"
      value={selected()}
      onChange={option => option && props.onChange(decode(option.value))}
      disabled={props.disabled}
      placeholder={props.placeholder}
      itemComponent={itemProps => <SelectItem item={itemProps.item}>{itemProps.item.rawValue.label}</SelectItem>}
    >
      <SelectTrigger aria-label={props['aria-label']} class={cn(props.triggerClass)}>
        <SelectValue<SimpleSelectOption>>{state => state.selectedOption()?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent />
    </Select>
  );
}
