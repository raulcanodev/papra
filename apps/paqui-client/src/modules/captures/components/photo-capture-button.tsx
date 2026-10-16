import type { JSX } from 'solid-js';
import type { CapturePurpose } from '../captures.types';
import { createSignal } from 'solid-js';
import { Button } from '@/modules/ui/components/button';
import { isTouchDevice, preparePhotoForUpload } from '../captures.models';
import { CaptureQrDialog } from './capture-qr-dialog';

type PhotoCaptureOptions = {
  organizationId: string;
  purpose: CapturePurpose;
  onFiles: (files: File[]) => void;
  onDocuments: (documentIds: string[]) => void;
};

// "Take a photo": the camera of a phone or a tablet, or on a computer a QR code to take it with the phone.
// A photo taken here arrives as files (to upload as the caller sees fit), photos from the phone as documents already uploaded.
// `open` starts it from any trigger; `elements` (the hidden camera input and the QR dialog) must be rendered.
export function createPhotoCapture(props: PhotoCaptureOptions) {
  const [isQrOpen, setIsQrOpen] = createSignal(false);
  const [isPreparing, setIsPreparing] = createSignal(false);
  let cameraInput: HTMLInputElement | undefined;

  const onCameraChange = async (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    setIsPreparing(true);
    try {
      props.onFiles(await Promise.all(files.map(async file => preparePhotoForUpload({ file }))));
    } finally {
      setIsPreparing(false);
    }
  };

  const elements = (
    <>
      <input
        ref={cameraInput}
        type="file"
        class="hidden"
        accept="image/*"
        capture="environment"
        onChange={(event) => {
          const files = [...(event.currentTarget.files ?? [])];
          event.currentTarget.value = '';
          void onCameraChange(files);
        }}
      />
      <CaptureQrDialog open={isQrOpen()} onOpenChange={setIsQrOpen} organizationId={props.organizationId} purpose={props.purpose} onDocuments={props.onDocuments} />
    </>
  );

  return {
    open: () => (isTouchDevice() ? cameraInput?.click() : setIsQrOpen(true)),
    isPreparing,
    elements,
  };
}

export function PhotoCaptureButton(props: PhotoCaptureOptions & {
  children: JSX.Element;
  isLoading?: boolean;
  variant?: 'default' | 'primary' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm';
  class?: string;
}) {
  const capture = createPhotoCapture(props);

  return (
    <>
      <Button
        variant={props.variant}
        size={props.size}
        class={props.class}
        isLoading={props.isLoading || capture.isPreparing()}
        onClick={() => capture.open()}
      >
        {props.children}
      </Button>
      {capture.elements}
    </>
  );
}
