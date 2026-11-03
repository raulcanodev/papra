import type { ComponentProps } from 'solid-js';
import { createEffect, createSignal, on, splitProps } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';
import { TextField } from './textfield';

/** Numbers typed by hand: "2,35", "2.35" or "1.234,5", rounded to `maxDecimals`; null when it is empty or not a number */
export function parseDecimal(text: string, { maxDecimals }: { maxDecimals: number }) {
  const trimmed = text.trim().replace(/\s/g, '');
  if (trimmed === '') {
    return null;
  }
  // A comma is the decimal separator when present, dots are then thousands separators
  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed;
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** maxDecimals;
  return Math.round(value * factor) / factor;
}

export function formatDecimal(value: number, { maxDecimals }: { maxDecimals: number }) {
  return value.toLocaleString('es-ES', { maximumFractionDigits: maxDecimals, useGrouping: false });
}

type DecimalFieldProps = Omit<ComponentProps<typeof TextField>, 'value' | 'onInput' | 'type'> & {
  value: number;
  onValueChange: (value: number) => void;
  maxDecimals: number;
};

/**
 * A number field that takes a comma or a dot as the decimal separator. A `type="number"` input empties its value
 * while the text is "2," (or rejects the comma altogether in some browsers), so the field keeps what is typed
 * and only reports the numbers it can read.
 */
export function DecimalField(props: DecimalFieldProps) {
  const [local, rest] = splitProps(props, ['value', 'onValueChange', 'maxDecimals', 'onBlur', 'class']);
  const format = (value: number) => formatDecimal(value, { maxDecimals: local.maxDecimals });
  const parse = (text: string) => parseDecimal(text, { maxDecimals: local.maxDecimals });
  const [text, setText] = createSignal(format(local.value));

  // A value changed from outside (a product picked, a saved invoice loaded) replaces the text
  createEffect(on(() => local.value, (value) => {
    if (parse(text()) !== value) {
      setText(format(value));
    }
  }, { defer: true }));

  return (
    <TextField
      inputMode="decimal"
      autocomplete="off"
      aria-invalid={parse(text()) === null}
      {...rest}
      class={cn('text-right tabular-nums', local.class)}
      value={text()}
      onInput={(event) => {
        setText(event.currentTarget.value);
        const value = parse(event.currentTarget.value);
        if (value !== null) {
          local.onValueChange(value);
        }
      }}
      onBlur={(event) => {
        setText(format(local.value));
        if (typeof local.onBlur === 'function') {
          local.onBlur(event);
        }
      }}
    />
  );
}
