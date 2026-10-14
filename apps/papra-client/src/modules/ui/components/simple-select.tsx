import { createMemo } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

export type SimpleSelectOption = { value: string; label: string };

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
  const selected = createMemo(() => props.options.find(option => option.value === props.value) ?? null);

  return (
    <Select<SimpleSelectOption>
      class={props.class}
      options={[...props.options]}
      optionValue="value"
      optionTextValue="label"
      value={selected()}
      onChange={option => option && props.onChange(option.value)}
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
