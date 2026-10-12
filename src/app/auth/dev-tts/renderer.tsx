"use client";

import { useEffect, useRef, useState } from "react";
import type { TtsMessage, TtsRequest } from "@/workers/tts.worker";

// Development-only: renders the audio of the pre-written listening bank with
// the same worker the app uses, taking scripts from `tsx scripts/bank/cli.mts
// serve-audio` and handing the MP3s back to it.

const HELPER = "http://127.0.0.1:4777";

export function TtsRenderer() {
  const [log, setLog] = useState<string[]>([]);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const say = (line: string) => setLog((lines) => [...lines.slice(-40), `${new Date().toLocaleTimeString()} ${line}`]);
    const worker = new Worker(new URL("../../../workers/tts.worker.ts", import.meta.url), { type: "module" });

    const render = (request: TtsRequest) =>
      new Promise<{ mp3: ArrayBuffer; seconds: number }>((resolve, reject) => {
        worker.onmessage = (event: MessageEvent<TtsMessage>) => {
          const message = event.data;
          if (message.type === "done") resolve(message);
          if (message.type === "error") reject(new Error(message.message));
          if (message.type === "progress") document.title = `${message.done}/${message.total}`;
        };
        worker.postMessage(request);
      });

    (async () => {
      for (;;) {
        const job = (await (await fetch(`${HELPER}/next`)).json()) as { key?: string; segments?: TtsRequest["segments"] };
        if (!job.key || !job.segments) {
          say("idle: nothing to render");
          await new Promise((r) => setTimeout(r, 30_000));
          continue;
        }
        const began = performance.now();
        say(`${job.key}: rendering`);
        try {
          const { mp3, seconds } = await render({ segments: job.segments });
          await fetch(`${HELPER}/done?key=${job.key}&seconds=${seconds}`, { method: "POST", body: mp3 });
          say(`${job.key}: ${seconds}s of audio in ${Math.round((performance.now() - began) / 1000)}s`);
        } catch (error) {
          say(`${job.key}: FAILED ${error instanceof Error ? error.message : String(error)}`);
          await new Promise((r) => setTimeout(r, 10_000));
        }
      }
    })();
  }, []);

  return <pre id="tts-log" className="p-4 text-xs">{log.join("\n") || "starting"}</pre>;
}
