import type { ButtonRootProps } from '@kobalte/core/button';
import type { PolymorphicProps } from '@kobalte/core/polymorphic';
import type { VariantProps } from 'class-variance-authority';
import type { JSX, ValidComponent } from 'solid-js';
import { Button as ButtonPrimitive } from '@kobalte/core/button';
import { cva } from 'class-variance-authority';
import { splitProps } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all outline-none focus-visible:(ring-3 ring-ring/40) disabled:(pointer-events-none opacity-50)',
  {
    variants: {
      variant: {
        // Soft, slightly glossy surface: a light top edge and a shaded bottom, pressed in on click.
        default: [
          'border border-neutral-300 bg-gradient-to-b from-white to-neutral-100 text-foreground',
          'shadow-[inset_0_1px_0_rgb(255_255_255),inset_0_-2px_1px_rgb(0_0_0/0.06),0_1px_2px_rgb(0_0_0/0.08)]',
          'hover:(from-neutral-50 to-neutral-200/70)',
          'active:(shadow-[inset_0_2px_3px_rgb(0_0_0/0.1)] from-neutral-100 to-neutral-100)',
          'dark:(border-white/10 from-zinc-700 to-zinc-800 text-foreground)',
          'dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.12),inset_0_-2px_1px_rgb(0_0_0/0.3),0_1px_2px_rgb(0_0_0/0.4)]',
          'dark:hover:(from-zinc-600 to-zinc-700)',
          'dark:active:(shadow-[inset_0_2px_3px_rgb(0_0_0/0.4)] from-zinc-800 to-zinc-800)',
        ].join(' '),
        primary: 'bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90 dark:bg-destructive/70',
        outline: 'border border-border bg-card shadow-xs hover:(bg-accent text-accent-foreground) dark:(bg-field border-input hover:bg-accent)',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:(bg-accent text-accent-foreground) dark:hover:bg-accent/60',
        link: 'text-foreground underline-offset-4 hover:underline',
      },
      size: {
        'default': 'h-9 px-4 py-2',
        'sm': 'h-8 gap-1.5 px-3',
        'lg': 'h-10 px-6',
        'icon': 'h-9 w-9',
        'icon-sm': 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

type buttonProps<T extends ValidComponent = 'button'> = ButtonRootProps<T>
  & VariantProps<typeof buttonVariants> & {
    class?: string;
    isLoading?: boolean;
    children?: JSX.Element;
  };

export function Button<T extends ValidComponent = 'button'>(props: PolymorphicProps<T, buttonProps<T>>) {
  const [local, rest] = splitProps(props as buttonProps, [
    'class',
    'variant',
    'size',
    'isLoading',
    'children',
    'disabled',
  ]);

  return (
    <ButtonPrimitive
      class={cn(
        buttonVariants({
          size: local.size,
          variant: local.variant,
        }),
        local.class,
      )}
      disabled={local.isLoading || local.disabled}
      {...rest}
    >
      {local.isLoading && <div class="i-tabler-loader-2 animate-spin mr-2" />}
      {local.children}
    </ButtonPrimitive>
  );
}
