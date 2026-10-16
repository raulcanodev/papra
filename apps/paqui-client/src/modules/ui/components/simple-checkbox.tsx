import type { JSX } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';
import { Checkbox, CheckboxControl, CheckboxLabel } from './checkbox';

/** Checkbox + optional inline label built on the shadcn Checkbox. */
export function SimpleCheckbox(props: {
  'checked': boolean;
  'onChange': (checked: boolean) => void;
  'label'?: JSX.Element;
  'class'?: string;
  'disabled'?: boolean;
  'aria-label'?: string;
}) {
  return (
    <Checkbox
      class={cn('flex items-center gap-2', props.class)}
      checked={props.checked}
      onChange={props.onChange}
      disabled={props.disabled}
    >
      <CheckboxControl inputProps={{ 'aria-label': props['aria-label'] }} />
      {props.label !== undefined && <CheckboxLabel class="text-sm">{props.label}</CheckboxLabel>}
    </Checkbox>
  );
}
