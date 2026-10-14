import type { Component, JSX } from 'solid-js';
import { createSignal, splitProps } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';
import { TextField } from '@/modules/ui/components/textfield';

type PasswordFieldProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  hidePasswordLabel: string;
  showPasswordLabel: string;
};

export const PasswordField: Component<PasswordFieldProps> = (props) => {
  const [isPasswordVisible, setIsPasswordVisible] = createSignal(false);
  const [local, inputProps] = splitProps(props, ['class', 'hidePasswordLabel', 'showPasswordLabel']);

  const togglePasswordVisibility = () => setIsPasswordVisible(isVisible => !isVisible);

  return (
    <div class="relative">
      <TextField
        {...inputProps}
        type={isPasswordVisible() ? 'text' : 'password'}
        class={cn('pr-10', local.class)}
      />
      <button
        type="button"
        class="absolute inset-y-0 right-0 grid w-10 place-items-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:(outline-none ring-3 ring-ring/30)"
        aria-label={isPasswordVisible() ? local.hidePasswordLabel : local.showPasswordLabel}
        aria-pressed={isPasswordVisible()}
        onClick={togglePasswordVisibility}
      >
        <span class={isPasswordVisible() ? 'i-tabler-eye-off size-4.5' : 'i-tabler-eye size-4.5'} aria-hidden="true" />
      </button>
    </div>
  );
};
