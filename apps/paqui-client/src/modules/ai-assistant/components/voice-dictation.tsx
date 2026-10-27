import type { Component } from 'solid-js';
import { createSignal, Index, onCleanup } from 'solid-js';
import { cn } from '@/modules/shared/style/cn';

// Bars of the waveform, the most recent on the right; each one is the loudness of one moment
export const WAVEFORM_BARS = 64;
const WAVEFORM_SAMPLE_MS = 50;
// A dictated message, not a meeting: stopped on its own after this
const MAX_RECORDING_MS = 5 * 60 * 1000;

// Opus in WebM where the browser has it (Chrome, Firefox, Android), AAC in MP4 on Safari and iOS:
// both small and accepted by the transcription
const RECORDING_FORMATS = [
  { mimeType: 'audio/webm;codecs=opus', extension: 'webm' },
  { mimeType: 'audio/webm', extension: 'webm' },
  { mimeType: 'audio/mp4', extension: 'mp4' },
  { mimeType: 'audio/ogg;codecs=opus', extension: 'ogg' },
];

export type DictationState = 'idle' | 'recording' | 'transcribing';

export function isVoiceDictationSupported() {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && navigator.mediaDevices?.getUserMedia !== undefined;
}

/**
 * Records the microphone while the user speaks, with the live levels for the waveform.
 * stop() hands the recording to onRecorded (to be transcribed), cancel() throws it away.
 */
export function createVoiceDictation({ onRecorded, onError }: {
  onRecorded: (recording: { audio: Blob; fileName: string }) => Promise<void>;
  onError: (error: { reason: 'permission-denied' | 'unavailable' | 'failed' }) => void;
}) {
  const [state, setState] = createSignal<DictationState>('idle');
  const [levels, setLevels] = createSignal<number[]>(Array.from({ length: WAVEFORM_BARS }, () => 0));
  const [elapsedMs, setElapsedMs] = createSignal(0);

  let stream: MediaStream | undefined;
  let recorder: MediaRecorder | undefined;
  let audioContext: AudioContext | undefined;
  let sampler: ReturnType<typeof setInterval> | undefined;
  let isCancelled = false;

  function release() {
    clearInterval(sampler);
    sampler = undefined;
    stream?.getTracks().forEach(track => track.stop());
    stream = undefined;
    void audioContext?.close().catch(() => {});
    audioContext = undefined;
    recorder = undefined;
  }

  async function start() {
    if (state() !== 'idle') {
      return;
    }

    // Created in the tap itself: iOS only lets audio start from a user gesture
    audioContext = new AudioContext();
    setState('recording');
    setElapsedMs(0);
    setLevels(Array.from({ length: WAVEFORM_BARS }, () => 0));
    isCancelled = false;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch (error) {
      release();
      setState('idle');
      onError({ reason: error instanceof DOMException && error.name === 'NotAllowedError' ? 'permission-denied' : 'unavailable' });
      return;
    }

    // Cancelled while the browser was asking for the microphone
    if (state() !== 'recording') {
      release();
      return;
    }

    const format = RECORDING_FORMATS.find(({ mimeType }) => MediaRecorder.isTypeSupported(mimeType));
    const chunks: Blob[] = [];
    recorder = new MediaRecorder(stream, format ? { mimeType: format.mimeType, audioBitsPerSecond: 32_000 } : undefined);
    const mimeType = recorder.mimeType || format?.mimeType || 'audio/webm';
    const extension = RECORDING_FORMATS.find(candidate => mimeType.startsWith(candidate.mimeType.split(';')[0]!))?.extension ?? 'webm';

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    });

    recorder.addEventListener('stop', () => {
      release();
      if (isCancelled || chunks.length === 0) {
        setState('idle');
        return;
      }

      setState('transcribing');
      const audio = new Blob(chunks, { type: mimeType.split(';')[0] });
      onRecorded({ audio, fileName: `dictation.${extension}` })
        .catch(() => onError({ reason: 'failed' }))
        .finally(() => setState('idle'));
    });

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    audioContext.createMediaStreamSource(stream).connect(analyser);
    void audioContext.resume();
    const samples = new Float32Array(analyser.fftSize);
    const startedAt = Date.now();

    // Loudness as the root mean square of the signal, scaled so normal speech fills most of the height
    sampler = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
      const level = Math.min(1, rms * 6);
      setLevels(current => [...current.slice(1), level]);

      const elapsed = Date.now() - startedAt;
      setElapsedMs(elapsed);
      if (elapsed >= MAX_RECORDING_MS) {
        stop();
      }
    }, WAVEFORM_SAMPLE_MS);

    recorder.start();
  }

  function stop() {
    if (recorder?.state === 'recording') {
      recorder.stop();
    } else if (state() === 'recording') {
      // Still waiting for the microphone permission: nothing recorded yet
      cancel();
    }
  }

  function cancel() {
    isCancelled = true;
    if (recorder?.state === 'recording') {
      recorder.stop();
      return;
    }
    release();
    setState('idle');
  }

  onCleanup(cancel);

  return { state, levels, elapsedMs, start, stop, cancel };
}

function formatElapsed(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

// The voice as it is heard: quiet moments are a dot, words rise from the middle
export const VoiceWaveform: Component<{ levels: number[]; elapsedMs: number; class?: string }> = props => (
  <div class={cn('flex min-w-0 flex-1 items-center gap-3', props.class)} aria-hidden="true">
    <div class="flex h-8 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_20%)]">
      <Index each={props.levels}>
        {level => (
          <div
            class="w-[3px] shrink-0 rounded-full bg-foreground/80 transition-[height] duration-75"
            style={{ height: `${Math.max(3, Math.round(level() * 32))}px` }}
          />
        )}
      </Index>
    </div>
    <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{formatElapsed(props.elapsedMs)}</span>
  </div>
);
