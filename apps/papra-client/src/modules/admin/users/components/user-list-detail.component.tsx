import type { Component } from 'solid-js';
import { A } from '@solidjs/router';
import { DiceBearAvatar } from '@/modules/ui/components/dicebear-avatar';

export const UserListDetail: Component<{ id: string; name?: string | null; email: string; href?: string }> = (props) => {
  return (
    <A href={props.href ?? `/admin/users/${props.id}`} class="flex items-center gap-2 group">
      <DiceBearAvatar seed={props.id} type="user" alt="" class="size-9 rounded-full border bg-white" />

      <div>

        <div class="font-medium group-hover:text-primary transition">
          {props.name || '-'}
        </div>

        <div class="text-muted-foreground text-xs">
          {props.email}
        </div>
      </div>
    </A>
  );
};
