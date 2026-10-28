import type { Component } from 'solid-js';
import type { Impersonation } from '../impersonation.services';
import { createMutation } from '@tanstack/solid-query';
import { createSignal, For, Show } from 'solid-js';
import { RelativeTime } from '@/modules/i18n/components/RelativeTime';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { useI18nApiErrors } from '@/modules/shared/http/composables/i18n-api-errors';
import { Button } from '@/modules/ui/components/button';
import { createToast } from '@/modules/ui/components/sonner';
import { Switch, SwitchControl, SwitchThumb } from '@/modules/ui/components/switch';
import { TextArea } from '@/modules/ui/components/textarea';
import { startImpersonation } from '../impersonation.services';

const REASON_MIN_LENGTH = 10;

export const ImpersonateUser: Component<{ userId: string; email: string; isImpersonable: boolean }> = (props) => {
  const { t } = useI18n();
  const { getErrorMessage } = useI18nApiErrors({ t });
  const [getReason, setReason] = createSignal('');
  // Off unless chosen on purpose before entering: a visit only looks, it can't change anything by mistake
  const [getCanWrite, setCanWrite] = createSignal(false);

  const mutation = createMutation(() => ({
    mutationFn: () => startImpersonation({ userId: props.userId, reason: getReason().trim(), canWrite: getCanWrite() }),
    onError: (error: unknown) => createToast({ type: 'error', message: getErrorMessage({ error, defaultMessage: t('admin.impersonation.start.error') }) }),
  }));

  const canSubmit = () => props.isImpersonable && getReason().trim().length >= REASON_MIN_LENGTH && !mutation.isPending;

  return (
    <Show
      when={props.isImpersonable}
      fallback={<p class="text-sm text-muted-foreground">{t('admin.impersonation.not-impersonable')}</p>}
    >
      <form
        class="flex flex-col gap-3 max-w-xl"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit()) {
            mutation.mutate();
          }
        }}
      >
        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium">{t('admin.impersonation.reason.label')}</span>
          <TextArea
            value={getReason()}
            onInput={event => setReason(event.currentTarget.value)}
            placeholder={t('admin.impersonation.reason.placeholder')}
            maxLength={500}
            rows={2}
          />
        </label>

        <Switch class="flex items-start justify-between gap-4" checked={getCanWrite()} onChange={setCanWrite}>
          <div>
            <div class="text-sm font-medium">{t('admin.impersonation.can-write.label')}</div>
            <div class="text-sm text-muted-foreground">{t('admin.impersonation.can-write.description')}</div>
          </div>
          <SwitchControl class="mt-0.5"><SwitchThumb /></SwitchControl>
        </Switch>

        <p class="text-xs text-muted-foreground">
          {getCanWrite()
            ? t('admin.impersonation.notice', { email: props.email })
            : t('admin.impersonation.notice.read-only', { email: props.email })}
        </p>

        <div>
          <Button type="submit" variant={getCanWrite() ? 'destructive' : 'default'} disabled={!canSubmit()} isLoading={mutation.isPending}>
            <div class={`${getCanWrite() ? 'i-tabler-pencil' : 'i-tabler-eye'} size-4 mr-2`} />
            {getCanWrite() ? t('admin.impersonation.start.can-write') : t('admin.impersonation.start')}
          </Button>
        </div>
      </form>
    </Show>
  );
};

export const ImpersonationHistory: Component<{ impersonations: Impersonation[]; userId: string }> = (props) => {
  const { t } = useI18n();

  return (
    <Show
      when={props.impersonations.length > 0}
      fallback={<p class="text-sm text-muted-foreground">{t('admin.impersonation.history.empty')}</p>}
    >
      <div class="divide-y">
        <For each={props.impersonations}>
          {impersonation => (
            <div class="py-3 first:pt-0 flex flex-col gap-0.5">
              <div class="flex flex-wrap items-baseline justify-between gap-x-4">
                <span class="text-sm font-medium">
                  {impersonation.targetUserId === props.userId
                    ? t('admin.impersonation.history.entered-by', { email: impersonation.adminEmail })
                    : t('admin.impersonation.history.entered', { email: impersonation.targetEmail })}
                </span>
                <RelativeTime class="text-xs text-muted-foreground" date={new Date(impersonation.createdAt)} />
              </div>
              <p class="text-sm text-muted-foreground">{impersonation.reason}</p>
              <p class="text-xs text-muted-foreground">
                {impersonation.canWrite ? t('admin.impersonation.history.can-write') : t('admin.impersonation.history.read-only')}
              </p>
              <p class="text-xs text-muted-foreground">
                {impersonation.endedAt
                  ? t('admin.impersonation.history.ended', { time: new Date(impersonation.endedAt).toLocaleString() })
                  : t('admin.impersonation.history.expires', { time: new Date(impersonation.expiresAt).toLocaleString() })}
                <Show when={impersonation.ipAddress}>
                  {ip => ` · ${ip()}`}
                </Show>
              </p>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
};
