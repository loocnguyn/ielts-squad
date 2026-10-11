import type { SttMessage, SttRequest } from "@/workers/stt.worker";

/** Decodes a recording to the 16 kHz mono samples Whisper expects. */
export async function decodeTo16kMono(blob: Blob): Promise<Float32Array> {
  const context = new AudioContext({ sampleRate: 16000 });
  try {
    const buffer = await context.decodeAudioData(await blob.arrayBuffer());
    if (buffer.numberOfChannels === 1) return buffer.getChannelData(0).slice();
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const mono = new Float32Array(left.length);
    for (let i = 0; i < left.length; i++) mono[i] = (left[i] + right[i]) / 2;
    return mono;
  } finally {
    void context.close();
  }
}

/** Runs Whisper in a worker. Rejects on failure or if it takes longer than `timeoutMs`. */
export function transcribe(
  audio: Float32Array,
  onStatus: (message: string) => void,
  timeoutMs = 4 * 60_000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../../workers/stt.worker.ts", import.meta.url), { type: "module" });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("timeout"));
    }, timeoutMs);
    const finish = () => {
      clearTimeout(timer);
      worker.terminate();
    };

    worker.onmessage = (event: MessageEvent<SttMessage>) => {
      const message = event.data;
      if (message.type === "status") onStatus(message.message);
      if (message.type === "done") {
        finish();
        resolve(message.text);
      }
      if (message.type === "error") {
        finish();
        reject(new Error(message.message));
      }
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message));
    };
    worker.postMessage({ audio } satisfies SttRequest, [audio.buffer]);
  });
}

type RecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

/**
 * Live transcription through the browser's Web Speech API, as a fallback for
 * machines too weak for on-device Whisper. In Chrome this sends audio to
 * Google, so it is only started when the caller decides Whisper won't cope.
 */
export function startLiveRecognition(): { stop: () => string } | null {
  const scope = window as unknown as {
    SpeechRecognition?: new () => Recognition;
    webkitSpeechRecognition?: new () => Recognition;
  };
  const Ctor = scope.SpeechRecognition ?? scope.webkitSpeechRecognition;
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = "en-GB";
  recognition.continuous = true;
  recognition.interimResults = false;
  let text = "";
  let active = true;
  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) text += `${event.results[i][0].transcript.trim()} `;
    }
  };
  // Chrome ends recognition after a silence; keep it going until we stop it.
  recognition.onend = () => {
    if (active) recognition.start();
  };
  try {
    recognition.start();
  } catch {
    return null;
  }
  return {
    stop: () => {
      active = false;
      recognition.stop();
      return text.trim();
    },
  };
}

/** True when the device probably cannot run Whisper in reasonable time. */
export function shouldUseLiveRecognition() {
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  return !("gpu" in navigator) && memory < 4;
}
