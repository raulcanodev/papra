import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'solid-js';
import { cva } from 'class-variance-authority';
import { splitProps } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus-visible:(outline-none ring-1.5 ring-ring)',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-destructive/20 bg-destructive/10 text-destructive',
        success: 'border-success/20 bg-success/10 text-success',
        warning: 'border-warning/20 bg-warning/10 text-warning',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export function Badge(props: ComponentProps<'div'> & VariantProps<typeof badgeVariants>) {
  const [local, rest] = splitProps(props, ['class', 'variant']);

  return (
    <div
      class={cn(
        badgeVariants({
          variant: local.variant,
        }),
        local.class,
      )}
      {...rest}
    />
  );
}
