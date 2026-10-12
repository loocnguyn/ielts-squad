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

/**
 * Transcribes several clips with one Whisper worker, so the model loads once.
 * A clip that fails or times out comes back as an empty string.
 */
export async function transcribeMany(
  clips: Float32Array[],
  onProgress: (done: number, total: number, status?: string) => void,
  timeoutPerClipMs = 3 * 60_000,
): Promise<string[]> {
  const worker = new Worker(new URL("../../workers/stt.worker.ts", import.meta.url), { type: "module" });
  const texts: string[] = [];
  try {
    for (const [index, audio] of clips.entries()) {
      onProgress(index, clips.length);
      const text = await new Promise<string>((resolve) => {
        // The first clip also waits for the model to download.
        const timer = setTimeout(() => resolve(""), index === 0 ? timeoutPerClipMs * 2 : timeoutPerClipMs);
        worker.onmessage = (event: MessageEvent<SttMessage>) => {
          const message = event.data;
          if (message.type === "status") onProgress(index, clips.length, message.message);
          if (message.type === "done" || message.type === "error") {
            clearTimeout(timer);
            resolve(message.type === "done" ? message.text : "");
          }
        };
        worker.onerror = () => {
          clearTimeout(timer);
          resolve("");
        };
        worker.postMessage({ audio } satisfies SttRequest, [audio.buffer]);
      });
      texts.push(text);
    }
    onProgress(clips.length, clips.length);
    return texts;
  } finally {
    worker.terminate();
  }
}

/** Seconds of a 16 kHz clip in which someone is actually speaking (a simple energy gate). */
export function voicedSeconds(pcm: Float32Array, sampleRate = 16000) {
  const frame = Math.round(sampleRate * 0.03);
  let voiced = 0;
  for (let start = 0; start + frame <= pcm.length; start += frame) {
    let energy = 0;
    for (let i = start; i < start + frame; i++) energy += pcm[i] * pcm[i];
    if (Math.sqrt(energy / frame) > 0.012) voiced += 1;
  }
  return (voiced * frame) / sampleRate;
}
