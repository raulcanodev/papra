import { A } from '@solidjs/router';
import { For } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';
import { ResponsiveDialog } from './responsive-dialog';

export type ChoiceDialogOption = {
  id: string;
  icon: string;
  title: string;
  description: string;
  isHighlighted?: boolean;
  href?: string;
  onSelect?: () => void;
};

// One "Add" button opening a choice of how (upload, photo, by hand...), instead of a button per way
export function ChoiceDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  options: ChoiceDialogOption[];
}) {
  const optionClass = (option: ChoiceDialogOption) => cn(
    'flex w-full items-center gap-3.5 rounded-2xl border p-3.5 text-left transition-colors active:scale-98 sm:flex-col sm:items-start sm:gap-4 sm:p-4',
    option.isHighlighted ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-card hover:bg-muted/50',
  );

  const content = (option: ChoiceDialogOption) => (
    <>
      <span class={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', option.isHighlighted ? 'bg-primary-foreground/15' : 'bg-muted')}>
        <div class={cn(option.icon, 'size-5')} />
      </span>
      <span class="min-w-0">
        <span class="block text-[15px] font-semibold">{option.title}</span>
        <span class={cn('block text-sm', option.isHighlighted ? 'opacity-80' : 'text-muted-foreground')}>{option.description}</span>
      </span>
    </>
  );

  return (
    <ResponsiveDialog open={props.open} onOpenChange={props.onOpenChange} title={props.title} description={props.description} class="sm:max-w-2xl">
      <div class="grid gap-2.5 sm:grid-cols-3">
        <For each={props.options}>
          {option => (option.href
            ? <A href={option.href} class={optionClass(option)} onClick={() => props.onOpenChange(false)}>{content(option)}</A>
            : (
                // The chooser closes first: the file picker and the camera open over the page, not over the dialog
                <button
                  type="button"
                  class={optionClass(option)}
                  onClick={() => {
                    props.onOpenChange(false);
                    option.onSelect?.();
                  }}
                >
                  {content(option)}
                </button>
              ))}
        </For>
      </div>
    </ResponsiveDialog>
  );
}
