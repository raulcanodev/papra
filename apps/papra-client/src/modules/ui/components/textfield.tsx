import type { PolymorphicProps } from '@kobalte/core/polymorphic';
import type {
  TextFieldDescriptionProps,
  TextFieldErrorMessageProps,
  TextFieldLabelProps,
  TextFieldRootProps,
} from '@kobalte/core/text-field';
import type { JSX, ValidComponent } from 'solid-js';
import { TextField as TextFieldPrimitive } from '@kobalte/core/text-field';
import { cva } from 'class-variance-authority';
import { splitProps } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';

type textFieldProps<T extends ValidComponent = 'div'>
  = TextFieldRootProps<T> & {
    class?: string;
  };

export function TextFieldRoot<T extends ValidComponent = 'div'>(props: PolymorphicProps<T, textFieldProps<T>>) {
  const [local, rest] = splitProps(props as textFieldProps, ['class']);

  return <TextFieldPrimitive class={cn('space-y-1', local.class)} {...rest} />;
}

export const textfieldLabel = cva(
  'text-sm data-[disabled]:(cursor-not-allowed opacity-70) font-medium',
  {
    variants: {
      label: {
        true: 'data-[invalid]:text-destructive',
      },
      error: {
        true: 'text-destructive text-xs',
      },
      description: {
        true: 'font-normal text-muted-foreground',
      },
    },
    defaultVariants: {
      label: true,
    },
  },
);

type textFieldLabelProps<T extends ValidComponent = 'label'>
  = TextFieldLabelProps<T> & {
    class?: string;
  };

export function TextFieldLabel<T extends ValidComponent = 'label'>(props: PolymorphicProps<T, textFieldLabelProps<T>>) {
  const [local, rest] = splitProps(props as textFieldLabelProps, ['class']);

  return (
    <TextFieldPrimitive.Label
      class={cn(textfieldLabel(), local.class)}
      {...rest}
    />
  );
}

type textFieldErrorMessageProps<T extends ValidComponent = 'div'>
  = TextFieldErrorMessageProps<T> & {
    class?: string;
  };

export function TextFieldErrorMessage<T extends ValidComponent = 'div'>(props: PolymorphicProps<T, textFieldErrorMessageProps<T>>) {
  const [local, rest] = splitProps(props as textFieldErrorMessageProps, [
    'class',
  ]);

  return (
    <TextFieldPrimitive.ErrorMessage
      class={cn(textfieldLabel({ error: true }), local.class)}
      {...rest}
    />
  );
}

type textFieldDescriptionProps<T extends ValidComponent = 'div'>
  = TextFieldDescriptionProps<T> & {
    class?: string;
  };

export function TextFieldDescription<T extends ValidComponent = 'div'>(props: PolymorphicProps<T, textFieldDescriptionProps<T>>) {
  const [local, rest] = splitProps(props as textFieldDescriptionProps, [
    'class',
  ]);

  return (
    <TextFieldPrimitive.Description
      class={cn(textfieldLabel({ description: true }), local.class)}
      {...rest}
    />
  );
}

type textFieldInputProps = JSX.InputHTMLAttributes<HTMLInputElement> & { class?: string; autoFocus?: boolean };

export function TextField(props: textFieldInputProps) {
  const [local, rest] = splitProps(props, ['class', 'autoFocus']);

  return (
    <input
      autofocus={local.autoFocus}
      class={cn(
        'flex h-9 w-full rounded-md border border-input bg-field px-3 py-1 text-sm shadow-xs file:(border-0 bg-transparent text-sm font-medium) placeholder:text-muted-foreground focus-visible:(outline-none border-ring ring-3 ring-ring/30) aria-[invalid=true]:border-destructive disabled:(cursor-not-allowed opacity-50) transition-[color,box-shadow,border-color]',
        local.class,
      )}
      {...rest}
    />
  );
}
