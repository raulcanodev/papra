import type { PolymorphicProps } from '@kobalte/core/polymorphic';
import type { ValidComponent } from 'solid-js';
import { Polymorphic } from '@kobalte/core/polymorphic';
import { splitProps } from 'solid-js';
import { appBrand } from '@/modules/config/branding';
import { cn } from '@/modules/shared/style/cn';

export function AppLogo<T extends ValidComponent = 'div'>(props: PolymorphicProps<T, { class?: string; iconClass?: string }>) {
  const [local, rest] = splitProps(props, ['class', 'iconClass']);

  return (
    <Polymorphic
      as="div"
      class={cn(`text-lg flex items-center gap-2 font-semibold group`, local.class)}
      {...rest}
    >
      <img src="/logo.svg" alt="" width="28" height="28" class={cn('size-7 [image-rendering:pixelated] group-hover:-translate-y-0.5 transition-transform', local.iconClass)} />
      {appBrand.name}
    </Polymorphic>
  );
}
