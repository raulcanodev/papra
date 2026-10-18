import { useParams } from '@solidjs/router';
import { createMutation, useQuery } from '@tanstack/solid-query';
import { createSignal, For, Match, onCleanup, Show, Switch } from 'solid-js';
import { useI18n } from '@/modules/i18n/i18n.provider';
import { AppLogo } from '@/modules/ui/components/app-logo';
import { Button } from '@/modules/ui/components/button';
import { CAPTURE_TEXT_I18N_KEYS } from '../captures.constants';
import { preparePhotoForUpload } from '../captures.models';
import { completePublicCapture, fetchPublicCapture, uploadCaptureFile } from '../captures.services';

type SentPhoto = { id: number; previewUrl: string; isImage: boolean; state: 'sending' | 'sent' | 'failed' };

// Opened on the phone by scanning the QR code of the computer: no session, the token in the link is the only access
export function CapturePage() {
  const { t } = useI18n();
  const params = useParams();
  const [photos, setPhotos] = createSignal<SentPhoto[]>([]);
  const [isDone, setIsDone] = createSignal(false);
  let cameraInput: HTMLInputElement | undefined;
  let galleryInput: HTMLInputElement | undefined;
  let nextPhotoId = 0;

  const query = useQuery(() => ({
    queryKey: ['captures', params.token],
    queryFn: () => fetchPublicCapture({ token: params.token! }),
    retry: false,
  }));

  const capture = () => query.data?.capture;
  const sentCount = () => photos().filter(photo => photo.state === 'sent').length;
  const isSending = () => photos().some(photo => photo.state === 'sending');
  const remaining = () => Math.max((capture()?.maxFiles ?? 0) - (capture()?.fileCount ?? 0) - photos().filter(photo => photo.state !== 'failed').length, 0);
  const isProduct = () => capture()?.purpose === 'product_image';

  onCleanup(() => photos().forEach(photo => URL.revokeObjectURL(photo.previewUrl)));

  const updatePhoto = (id: number, state: SentPhoto['state']) => setPhotos(current => current.map(photo => (photo.id === id ? { ...photo, state } : photo)));

  const completeMutation = createMutation(() => ({
    mutationFn: () => completePublicCapture({ token: params.token! }),
    onSuccess: () => setIsDone(true),
  }));

  const send = async (files: File[]) => {
    for (const original of files.slice(0, remaining())) {
      const id = nextPhotoId++;
      const file = await preparePhotoForUpload({ file: original });
      setPhotos(current => [...current, { id, previewUrl: URL.createObjectURL(file), isImage: file.type.startsWith('image/'), state: 'sending' }]);

      try {
        await uploadCaptureFile({ token: params.token!, file });
        updatePhoto(id, 'sent');
      } catch {
        updatePhoto(id, 'failed');
      }
    }

    // A product has a single photo: nothing else to do once it is sent
    if (isProduct() && sentCount() > 0) {
      completeMutation.mutate();
    }
  };

  const onInputChange = (event: Event & { currentTarget: HTMLInputElement }) => {
    const files = [...(event.currentTarget.files ?? [])];
    event.currentTarget.value = '';
    void send(files);
  };

  return (
    <main class="flex min-h-dvh flex-col bg-background px-4 py-6">
      <div class="mx-auto flex w-full max-w-md flex-1 flex-col">
        <AppLogo class="mb-8" />

        <Switch>
          <Match when={query.isLoading}>
            <div class="flex flex-1 items-center justify-center">
              <div class="i-tabler-loader-2 size-7 animate-spin text-muted-foreground" />
            </div>
          </Match>

          <Match when={query.isError || capture()?.status === 'expired' || (capture()?.status === 'completed' && !isDone())}>
            <div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <div class="i-tabler-link-off size-10 text-muted-foreground" />
              <h1 class="text-lg font-semibold">{t('captures.page.unavailable.title')}</h1>
              <p class="text-sm text-muted-foreground">{t('captures.page.unavailable.description')}</p>
            </div>
          </Match>

          <Match when={isDone()}>
            <div class="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <div class="i-tabler-circle-check size-12 text-emerald-600" />
              <h1 class="text-lg font-semibold">{t('captures.page.done.title')}</h1>
              <p class="text-sm text-muted-foreground">{t('captures.page.done.description')}</p>
            </div>
          </Match>

          <Match when={capture()}>
            {getCapture => (
              <div class="flex flex-1 flex-col gap-5">
                <div>
                  <p class="text-sm text-muted-foreground">{getCapture().organizationName}</p>
                  <h1 class="text-xl font-semibold">{t(CAPTURE_TEXT_I18N_KEYS[capture()?.purpose ?? 'purchase'].title)}</h1>
                  <p class="mt-1 text-sm text-muted-foreground">{t(CAPTURE_TEXT_I18N_KEYS[capture()?.purpose ?? 'purchase'].tip)}</p>
                </div>

                <Show when={photos().length > 0}>
                  <div class="grid grid-cols-3 gap-2">
                    <For each={photos()}>
                      {photo => (
                        <div class="relative aspect-3/4 overflow-hidden rounded-lg border bg-muted">
                          <Show when={photo.isImage} fallback={<div class="i-tabler-file-type-pdf m-auto mt-8 size-10 text-muted-foreground" />}>
                            <img src={photo.previewUrl} alt="" class="size-full object-cover" />
                          </Show>
                          <div class="absolute bottom-1 right-1 flex size-6 items-center justify-center rounded-full bg-background/90">
                            <Switch>
                              <Match when={photo.state === 'sending'}><div class="i-tabler-loader-2 size-4 animate-spin" /></Match>
                              <Match when={photo.state === 'sent'}><div class="i-tabler-check size-4 text-emerald-600" /></Match>
                              <Match when={photo.state === 'failed'}><div class="i-tabler-alert-triangle size-4 text-red-600" /></Match>
                            </Switch>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                  <Show when={photos().some(photo => photo.state === 'failed')}>
                    <p class="text-sm text-red-600">{t('captures.page.failed')}</p>
                  </Show>
                </Show>

                <div class="mt-auto flex flex-col gap-2 pb-[env(safe-area-inset-bottom)]">
                  <Show when={remaining() > 0}>
                    <Button size="lg" variant="primary" class="h-14 gap-2 text-base" disabled={isSending()} onClick={() => cameraInput?.click()}>
                      <div class="i-tabler-camera size-6" />
                      {photos().length === 0 ? t('captures.page.take-photo') : t('captures.page.take-another')}
                    </Button>
                    <Button variant="ghost" class="gap-2" disabled={isSending()} onClick={() => galleryInput?.click()}>
                      <div class="i-tabler-photo size-5" />
                      {t('captures.page.from-gallery')}
                    </Button>
                  </Show>
                  <Show when={!isProduct() && sentCount() > 0}>
                    <Button size="lg" class="h-12 gap-2" disabled={isSending()} isLoading={completeMutation.isPending} onClick={() => completeMutation.mutate()}>
                      <div class="i-tabler-send size-5" />
                      {t('captures.page.finish', { count: sentCount() })}
                    </Button>
                  </Show>
                </div>

                <input ref={cameraInput} type="file" class="hidden" accept="image/*" capture="environment" onChange={onInputChange} />
                <input ref={galleryInput} type="file" class="hidden" accept={isProduct() ? 'image/*' : 'image/*,application/pdf'} multiple={!isProduct()} onChange={onInputChange} />
              </div>
            )}
          </Match>
        </Switch>
      </div>
    </main>
  );
}
