/// <reference lib="webworker" />
import { pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

// Whisper speech-to-text, entirely on the device: the recording never leaves
// the browser for transcription.

export type SttRequest = { audio: Float32Array };
export type SttMessage =
  | { type: "status"; message: string }
  | { type: "done"; text: string }
  | { type: "error"; message: string };

const post = (message: SttMessage) => (self as DedicatedWorkerGlobalScope).postMessage(message);

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;

async function load(): Promise<AutomaticSpeechRecognitionPipeline> {
  const webgpu = "gpu" in navigator;
  post({ type: "status", message: "Đang tải Whisper (chỉ tải lần đầu)" });
  // base.en on a GPU; the smaller tiny.en keeps weaker machines responsive.
  const create = pipeline as unknown as (
    task: string,
    model: string,
    options: Record<string, unknown>,
  ) => Promise<AutomaticSpeechRecognitionPipeline>;
  if (webgpu) {
    try {
      return await create("automatic-speech-recognition", "onnx-community/whisper-base.en", {
        device: "webgpu",
        dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
      });
    } catch {
      // No usable adapter: fall through to WASM.
    }
  }
  return create("automatic-speech-recognition", "onnx-community/whisper-tiny.en", {
    device: "wasm",
    dtype: "q8",
  });
}

self.onmessage = async (event: MessageEvent<SttRequest>) => {
  try {
    transcriberPromise ??= load();
    const transcriber = await transcriberPromise;
    post({ type: "status", message: "Đang chuyển giọng nói thành chữ" });
    const output = await transcriber(event.data.audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    const text = Array.isArray(output) ? output.map((o) => o.text).join(" ") : output.text;
    post({ type: "done", text: text.trim() });
  } catch (error) {
    transcriberPromise = null;
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
