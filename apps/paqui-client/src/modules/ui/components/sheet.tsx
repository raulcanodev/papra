import type {
  DialogContentProps,
  DialogDescriptionProps,
  DialogTitleProps,
} from '@kobalte/core/dialog';
import type { PolymorphicProps } from '@kobalte/core/polymorphic';
import type { VariantProps } from 'class-variance-authority';
import type { ComponentProps, ParentProps, ValidComponent } from 'solid-js';
import { Dialog as DialogPrimitive } from '@kobalte/core/dialog';
import { cva } from 'class-variance-authority';
import { mergeProps, splitProps } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';

export const Sheet = DialogPrimitive;
export const SheetTrigger = DialogPrimitive.Trigger;

export const sheetVariants = cva(
  'fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out duration-200 data-[expanded]:(animate-in duration-200) data-[closed]:(animate-out duration-200)',
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 border-b data-[closed]:slide-out-to-top data-[expanded]:slide-in-from-top',
        bottom: 'inset-x-0 bottom-0 border-t data-[closed]:slide-out-to-bottom data-[expanded]:slide-in-from-bottom',
        left: 'inset-y-0 left-0 h-full w-3/4 border-r data-[closed]:slide-out-to-left data-[expanded]:slide-in-from-left sm:max-w-sm',
        right: 'inset-y-0 right-0 h-full w-3/4 border-l data-[closed]:slide-out-to-right data-[expanded]:slide-in-from-right sm:max-w-sm',
      },
    },
    defaultVariants: {
      side: 'right',
    },
  },
);

type sheetContentProps<T extends ValidComponent = 'div'> = ParentProps<
  DialogContentProps<T>
  & VariantProps<typeof sheetVariants> & {
    class?: string;
    /** A sheet from the bottom closes when it is dragged down with the finger, as on a phone */
    onDragClose?: () => void;
  }
>;

// Pulled further than this, or flicked down, the sheet closes; less, it goes back up
const DRAG_CLOSE_DISTANCE_PX = 90;
const DRAG_CLOSE_VELOCITY_PX_PER_MS = 0.5;

// Something scrolled inside the sheet scrolls back up first: the sheet only follows the finger from the top
function isInsideScrolledArea({ target, container }: { target: EventTarget | null; container: HTMLElement }) {
  for (let element = target instanceof HTMLElement ? target : null; element && element !== container; element = element.parentElement) {
    if (element.scrollTop > 0) {
      return true;
    }
  }

  return false;
}

type DragEvent = TouchEvent & { currentTarget: HTMLElement };

function createDragToClose({ onClose }: { onClose: () => void }) {
  let start: { y: number; time: number } | undefined;
  let offset = 0;

  const moveTo = (element: HTMLElement, y: number, animated: boolean) => {
    element.style.transition = animated ? 'transform 200ms ease-out' : 'none';
    element.style.transform = y === 0 ? '' : `translateY(${y}px)`;
  };

  return {
    onTouchStart: (event: DragEvent) => {
      const touch = event.touches[0];
      start = touch && event.touches.length === 1 && !isInsideScrolledArea({ target: event.target, container: event.currentTarget }) ? { y: touch.clientY, time: event.timeStamp } : undefined;
      offset = 0;
    },
    onTouchMove: (event: DragEvent) => {
      const touch = event.touches[0];
      if (!start || !touch) {
        return;
      }
      offset = Math.max(0, touch.clientY - start.y);
      moveTo(event.currentTarget, offset, false);
    },
    onTouchEnd: (event: DragEvent) => {
      if (!start) {
        return;
      }
      const velocity = offset / Math.max(1, event.timeStamp - start.time);
      start = undefined;

      if (offset > DRAG_CLOSE_DISTANCE_PX || (offset > 20 && velocity > DRAG_CLOSE_VELOCITY_PX_PER_MS)) {
        // Leaves from where the finger let go, then the closing animation takes over
        event.currentTarget.style.transition = '';
        onClose();
        return;
      }
      moveTo(event.currentTarget, 0, true);
    },
  };
}

export function SheetContent<T extends ValidComponent = 'div'>(props: PolymorphicProps<T, sheetContentProps<T>>) {
  const merge = mergeProps<sheetContentProps<T>[]>({ side: 'right' }, props);
  const [local, rest] = splitProps(merge as sheetContentProps, [
    'class',
    'children',
    'side',
    'onDragClose',
  ]);
  const drag = createDragToClose({ onClose: () => local.onDragClose?.() });
  const isDraggable = () => local.side === 'bottom' && local.onDragClose !== undefined;

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        class={cn(
          'fixed inset-0 z-50 bg-black/40 data-[expanded]:(animate-in fade-in-0) data-[closed]:(animate-out fade-out-0)',
        )}
        {...rest}
      />
      <DialogPrimitive.Content
        class={sheetVariants({ side: local.side, class: local.class })}
        onTouchStart={(event: DragEvent) => isDraggable() && drag.onTouchStart(event)}
        onTouchMove={(event: DragEvent) => isDraggable() && drag.onTouchMove(event)}
        onTouchEnd={(event: DragEvent) => isDraggable() && drag.onTouchEnd(event)}
        onTouchCancel={(event: DragEvent) => isDraggable() && drag.onTouchEnd(event)}
        {...rest}
      >
        {local.children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

type sheetTitleProps<T extends ValidComponent = 'h2'> = DialogTitleProps<T> & {
  class?: string;
};

export function SheetTitle<T extends ValidComponent = 'h2'>(props: PolymorphicProps<T, sheetTitleProps<T>>) {
  const [local, rest] = splitProps(props as sheetTitleProps, ['class']);

  return (
    <DialogPrimitive.Title
      class={cn('text-lg font-semibold text-foreground', local.class)}
      {...rest}
    />
  );
}

type sheetDescriptionProps<T extends ValidComponent = 'p'>
  = DialogDescriptionProps<T> & {
    class?: string;
  };

export function SheetDescription<T extends ValidComponent = 'p'>(props: PolymorphicProps<T, sheetDescriptionProps<T>>) {
  const [local, rest] = splitProps(props as sheetDescriptionProps, ['class']);

  return (
    <DialogPrimitive.Description
      class={cn('text-sm text-muted-foreground', local.class)}
      {...rest}
    />
  );
}

export function SheetHeader(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class']);

  return (
    <div
      class={cn(
        'flex flex-col space-y-2 text-center sm:text-left',
        local.class,
      )}
      {...rest}
    />
  );
}

export function SheetFooter(props: ComponentProps<'div'>) {
  const [local, rest] = splitProps(props, ['class']);

  return (
    <div
      class={cn(
        'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
        local.class,
      )}
      {...rest}
    />
  );
}
