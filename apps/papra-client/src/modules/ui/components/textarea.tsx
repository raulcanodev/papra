import type { JSX } from 'solid-js';
import { splitProps } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';

type textAreaProps = JSX.TextareaHTMLAttributes<HTMLTextAreaElement> & { class?: string; autoFocus?: boolean; autoResize?: boolean };

export function TextArea(props: textAreaProps) {
  const [local, rest] = splitProps(props, ['class', 'autoFocus', 'autoResize']);

  return (
    <textarea
      autofocus={local.autoFocus}
      class={cn(
        'flex min-h-[60px] w-full rounded-md border border-input bg-field px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:(outline-none border-ring ring-3 ring-ring/30) disabled:(cursor-not-allowed opacity-50)',
        local.class,
      )}
      {...rest}
    />
  );
}
