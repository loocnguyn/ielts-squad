/// <reference lib="webworker" />
import { Mp3Encoder } from "@breezystack/lamejs";
import { KokoroTTS, TextSplitterStream } from "kokoro-js";
import type { Segment } from "@/lib/audio/listening-script";

// Reads a listening script aloud with Kokoro and returns one MP3. Runs in a
// worker so a few minutes of synthesis never freezes the page.

export type TtsRequest = { segments: Segment[] };
export type TtsMessage =
  | { type: "status"; message: string }
  | { type: "progress"; done: number; total: number }
  | { type: "done"; mp3: ArrayBuffer; seconds: number }
  | { type: "error"; message: string };

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const SAMPLE_RATE = 24000;
const KBPS = 48;

const post = (message: TtsMessage, transfer: Transferable[] = []) =>
  (self as DedicatedWorkerGlobalScope).postMessage(message, transfer);

let ttsPromise: Promise<KokoroTTS> | null = null;

function loadModel() {
  if (!ttsPromise) {
    const webgpu = "gpu" in navigator;
    post({ type: "status", message: "Đang tải model giọng đọc (khoảng 90–300 MB, chỉ tải lần đầu)" });
    ttsPromise = KokoroTTS.from_pretrained(MODEL, {
      // WebGPU needs full precision; the 8-bit model keeps WASM usable.
      dtype: webgpu ? "fp32" : "q8",
      device: webgpu ? "webgpu" : "wasm",
    });
  }
  return ttsPromise;
}

function toInt16(samples: Float32Array) {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

self.onmessage = async (event: MessageEvent<TtsRequest>) => {
  try {
    const tts = await loadModel();
    const available = Object.keys(tts.voices);
    const encoder = new Mp3Encoder(1, SAMPLE_RATE, KBPS);
    const chunks: Uint8Array[] = [];
    let samples = 0;

    const encode = (pcm: Float32Array) => {
      const data = toInt16(pcm);
      samples += data.length;
      for (let i = 0; i < data.length; i += 1152) {
        const encoded = encoder.encodeBuffer(data.subarray(i, i + 1152));
        if (encoded.length) chunks.push(new Uint8Array(encoded));
      }
    };

    const { segments } = event.data;
    post({ type: "status", message: "Đang đọc lời thoại" });
    for (const [index, segment] of segments.entries()) {
      if ("silence" in segment) {
        encode(new Float32Array(Math.round(segment.silence * SAMPLE_RATE)));
      } else {
        const voice = available.includes(segment.voice) ? segment.voice : "af_heart";
        // stream() splits long lines into sentences, which generate() would truncate.
        // It only finishes once the splitter is closed, and it does not close one
        // it creates from a plain string, so we hand it a closed splitter.
        const splitter = new TextSplitterStream();
        splitter.push(segment.text);
        splitter.close();
        for await (const piece of tts.stream(splitter, { voice: voice as never })) {
          encode(piece.audio.audio as Float32Array);
        }
      }
      post({ type: "progress", done: index + 1, total: segments.length });
    }

    const tail = encoder.flush();
    if (tail.length) chunks.push(new Uint8Array(tail));

    const mp3 = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      mp3.set(chunk, offset);
      offset += chunk.length;
    }
    post({ type: "done", mp3: mp3.buffer, seconds: Math.round(samples / SAMPLE_RATE) }, [mp3.buffer]);
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
