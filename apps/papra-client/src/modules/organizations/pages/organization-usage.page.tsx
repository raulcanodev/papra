import type { Component } from 'solid-js';
import { formatBytes } from '@corentinth/chisels';
import { useParams } from '@solidjs/router';
import { useQuery } from '@tanstack/solid-query';
import { Show, Suspense } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { fetchOrganizationUsage } from '@/modules/subscriptions/subscriptions.services';
import { ProgressCircle } from '@/modules/ui/components/progress-circle';
import { SettingsSection, SettingsSections } from '@/modules/ui/components/settings-section';

const UsageSection: Component<{
  title: string;
  description: string;
  used: number;
  limit: number | null;
  formatValue?: (value: number) => string;
}> = (props) => {
  const { t } = useI18n();
  const percentage = () => {
    if (props.limit === null) {
      return 0;
    }
    return Math.min((props.used / props.limit) * 100, 100);
  };

  const formatValue = (value: number) => {
    return props.formatValue ? props.formatValue(value) : value.toString();
  };

  return (
    <SettingsSection title={props.title} description={props.description}>
      <div class="flex items-center gap-3">
        <ProgressCircle value={percentage()} size="xs" class="flex-shrink-0" />
        <div class="text-sm text-muted-foreground">{ `${formatValue(props.used)} / ${props.limit === null ? t('organization.usage.unlimited') : formatValue(props.limit)}${props.limit ? ` - ${percentage().toFixed(2)}%` : ''}`}</div>
      </div>
    </SettingsSection>
  );
};

export const OrganizationUsagePage: Component = () => {
  const params = useParams();
  const { t } = useI18n();

  const query = useQuery(() => ({
    queryKey: ['organizations', params.organizationId, 'usage'],
    queryFn: () => fetchOrganizationUsage({ organizationId: params.organizationId }),
  }));

  return (
    <div class="page-narrow">
      <Suspense>
        <Show when={query.data}>
          {getData => (
            <>
              <div class="page-header">
                <div>
                  <h1 class="page-title">{t('organization.usage.page.title')}</h1>
                  <p class="page-description">{t('organization.usage.page.description')}</p>
                </div>
              </div>

              <SettingsSections>
                <UsageSection
                  title={t('organization.usage.storage.title')}
                  description={t('organization.usage.storage.description')}
                  used={getData().usage.documentsStorage.used}
                  limit={getData().usage.documentsStorage.limit}
                  formatValue={bytes => formatBytes({ bytes, base: 1000 })}
                />

                <UsageSection
                  title={t('organization.usage.intake-emails.title')}
                  description={t('organization.usage.intake-emails.description')}
                  used={getData().usage.intakeEmailsCount.used}
                  limit={getData().usage.intakeEmailsCount.limit}
                />

                <UsageSection
                  title={t('organization.usage.members.title')}
                  description={t('organization.usage.members.description')}
                  used={getData().usage.membersCount.used}
                  limit={getData().usage.membersCount.limit}
                />
              </SettingsSections>
            </>
          )}
        </Show>
      </Suspense>
    </div>
  );
};
