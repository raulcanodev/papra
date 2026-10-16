import type { Component } from 'solid-js';
import type { Organization } from '@/modules/organizations/organizations.types';
import { useNavigate, useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { fetchOrganizations } from '@/modules/organizations/organizations.services';
import { cn } from '@/modules/shared/style/cn';
import { DiceBearAvatar } from '@/modules/ui/components/dicebear-avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';

// The current organization, and the others of the member to jump to (or a new one to create).
// Shared by the side menu of the computer and the header of the phone.
export const OrganizationSwitcher: Component<{ class?: string; triggerClass?: string }> = (props) => {
  const navigate = useNavigate();
  const params = useParams();
  const { t } = useI18n();

  const organizationsQuery = useQuery(() => ({
    queryKey: ['organizations'],
    queryFn: fetchOrganizations,
  }));

  return (
    <Select
      class={props.class}
      options={[...organizationsQuery.data?.organizations ?? [], { id: 'create' }]}
      optionValue="id"
      optionTextValue="name"
      value={organizationsQuery.data?.organizations.find(organization => organization.id === params.organizationId)}
      onChange={(value) => {
        if (!value || value.id === params.organizationId) {
          return;
        }

        return value && (
          value.id === 'create'
            ? navigate('/organizations/create')
            : navigate(`/organizations/${value.id}`));
      }}
      itemComponent={itemProps => itemProps.item.rawValue.id === 'create'
        ? (
            <SelectItem class="cursor-pointer" item={itemProps.item}>
              <div class="flex items-center gap-2 text-muted-foreground">
                <div class="i-tabler-plus size-4" />
                <div>{t('layout.organization.create')}</div>
              </div>
            </SelectItem>
          )
        : (
            <SelectItem class="cursor-pointer" item={itemProps.item}>
              <div class="flex min-w-0 items-center gap-2">
                <DiceBearAvatar
                  seed={itemProps.item.rawValue.id}
                  type="organization"
                  alt=""
                  class="size-6 rounded-sm border"
                />
                <span class="truncate">{itemProps.item.rawValue.name}</span>
              </div>
            </SelectItem>
          )}
    >
      <SelectTrigger
        class={cn('h-12 rounded-md border-0 bg-transparent px-2 shadow-none transition-colors hover:bg-sidebar-accent focus:ring-0 data-[expanded]:bg-sidebar-accent', props.triggerClass)}
        caretIcon={<div class="i-tabler-selector size-4 shrink-0 text-muted-foreground" />}
      >
        <SelectValue<Organization | undefined> class="flex min-w-0 items-center gap-2">
          {state => (
            <>
              <DiceBearAvatar
                seed={state.selectedOption()?.id ?? 'organization'}
                type="organization"
                alt=""
                class="size-8 shrink-0 rounded-md border"
              />

              <span class="truncate text-sm font-semibold">
                {state.selectedOption()?.name}
              </span>
            </>
          )}
        </SelectValue>
      </SelectTrigger>

      <SelectContent />
    </Select>
  );
};
