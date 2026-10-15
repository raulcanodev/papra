import { For, Show } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { useConfirmModal } from '@/modules/shared/confirm';
import { cn } from '@/modules/shared/style/cn';
import { Button } from './button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './dropdown-menu';

export type RowAction = {
  label: string;
  icon: string;
  onSelect: () => void;
  disabled?: boolean;
};

/**
 * The last column of every table: a ⋯ button with the actions of the row. Editing and deleting are always in the
 * same place; deleting asks first. Clicks never reach the row, whose own click opens the record.
 */
export function RowActions(props: {
  /** What the row is, for the screen readers and the delete confirmation ("Acme SL") */
  itemName: string;
  onEdit?: () => void;
  onDelete?: () => unknown;
  /** Why it cannot be deleted (an issued invoice...), the action stays visible but disabled */
  deleteDisabled?: boolean;
  /** Says what deleting really does when it is not a plain removal ("the invoices are kept") */
  deleteMessage?: string;
  /** Row specific actions shown above edit and delete (download, mark as paid...) */
  actions?: RowAction[];
}) {
  const { t } = useI18n();
  const { confirm } = useConfirmModal();

  const remove = async () => {
    const isConfirmed = await confirm({
      title: t('common.row-actions.delete-confirm.title', { name: props.itemName }),
      message: props.deleteMessage ?? t('common.row-actions.delete-confirm.message'),
      confirmButton: { text: t('common.row-actions.delete'), variant: 'destructive' },
      cancelButton: { text: t('common.row-actions.cancel') },
    });

    if (isConfirmed) {
      await props.onDelete?.();
    }
  };

  return (
    <div class="flex justify-end" onClick={event => event.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger as={Button} variant="ghost" size="icon" class="size-8 text-muted-foreground" aria-label={t('common.row-actions.open', { name: props.itemName })}>
          <div class="i-tabler-dots size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent class="min-w-40">
          <For each={props.actions ?? []}>
            {action => (
              <DropdownMenuItem class="gap-2" disabled={action.disabled} onSelect={() => action.onSelect()}>
                <div class={cn(action.icon, 'size-4 text-muted-foreground')} />
                {action.label}
              </DropdownMenuItem>
            )}
          </For>
          <Show when={(props.actions?.length ?? 0) > 0 && (props.onEdit !== undefined || props.onDelete !== undefined)}>
            <DropdownMenuSeparator />
          </Show>
          <Show when={props.onEdit}>
            {onEdit => (
              <DropdownMenuItem class="gap-2" onSelect={() => onEdit()()}>
                <div class="i-tabler-pencil size-4 text-muted-foreground" />
                {t('common.row-actions.edit')}
              </DropdownMenuItem>
            )}
          </Show>
          <Show when={props.onDelete}>
            <DropdownMenuItem class="gap-2 text-destructive focus:text-destructive" disabled={props.deleteDisabled} onSelect={() => void remove()}>
              <div class="i-tabler-trash size-4" />
              {t('common.row-actions.delete')}
            </DropdownMenuItem>
          </Show>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
