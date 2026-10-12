"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Records the speaking session as one video: every camera, the question on
// screen and everybody's sound, mixed in the browser. The file is written
// straight to a place the user picks (a synced Drive folder works), or
// downloaded at the end where the browser cannot do that.

export type RecorderTile = { id: string; label: string; stream: MediaStream | null };
export type RecorderPanel = { title: string; subtitle: string; body: string; timer: string | null; footer: string };

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 24;
const VIDEO_AREA = 832;

const MIME_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

type SaveTarget = { write: (chunk: Blob) => Promise<void>; close: () => Promise<void> } | null;
type PickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>;
};

function wrap(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && context.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Where each camera goes in the left part of the frame. */
function tileRects(count: number) {
  if (count <= 1) return [{ x: 0, y: 0, w: VIDEO_AREA, h: HEIGHT }];
  if (count === 2) {
    return [
      { x: 0, y: 0, w: VIDEO_AREA, h: HEIGHT / 2 },
      { x: 0, y: HEIGHT / 2, w: VIDEO_AREA, h: HEIGHT / 2 },
    ];
  }
  const rows = Math.ceil(count / 2);
  return Array.from({ length: count }, (_, i) => ({
    x: (i % 2) * (VIDEO_AREA / 2),
    y: Math.floor(i / 2) * (HEIGHT / rows),
    w: VIDEO_AREA / 2,
    h: HEIGHT / rows,
  }));
}

export function useSessionRecorder(args: {
  /** Read on every frame, so they always show the current state. */
  getTiles: () => RecorderTile[];
  getPanel: () => RecorderPanel;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const argsRef = useRef(args);
  useEffect(() => {
    argsRef.current = args;
  });
  const stopRef = useRef<(() => Promise<void>) | null>(null);

  const start = useCallback(async (fileStem: string) => {
    if (stopRef.current) return true;
    const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("unsupported");
    const extension = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
    const fileName = `${fileStem}.${extension}`;

    // Ask where to save first, while the click that started this still counts.
    let target: SaveTarget = null;
    const picker = (window as PickerWindow).showSaveFilePicker;
    if (picker) {
      try {
        const handle = await picker({
          suggestedName: fileName,
          types: [{ description: "Video", accept: { [mimeType.split(";")[0]]: [`.${extension}`] } }],
        });
        target = await handle.createWritable();
      } catch (error) {
        if ((error as DOMException).name === "AbortError") return false;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const context = canvas.getContext("2d")!;
    const videos = new Map<string, HTMLVideoElement>();
    const audio = new AudioContext();
    const mix = audio.createMediaStreamDestination();
    const sources = new Map<string, MediaStreamAudioSourceNode>();
    const startedAt = Date.now();

    const draw = () => {
      const { getTiles, getPanel } = argsRef.current;
      const tiles = getTiles();

      // Keep one hidden <video> and one audio input per stream.
      for (const tile of tiles) {
        const stream = tile.stream;
        if (!stream) continue;
        if (!videos.has(stream.id)) {
          const video = document.createElement("video");
          video.muted = true;
          video.playsInline = true;
          video.srcObject = stream;
          void video.play().catch(() => {});
          videos.set(stream.id, video);
        }
        if (!sources.has(stream.id) && stream.getAudioTracks().length > 0) {
          const source = audio.createMediaStreamSource(stream);
          source.connect(mix);
          sources.set(stream.id, source);
        }
      }

      context.fillStyle = "#0b1220";
      context.fillRect(0, 0, WIDTH, HEIGHT);

      tileRects(tiles.length).forEach((rect, index) => {
        const tile = tiles[index];
        const video = tile.stream ? videos.get(tile.stream.id) : undefined;
        context.fillStyle = "#162036";
        context.fillRect(rect.x + 4, rect.y + 4, rect.w - 8, rect.h - 8);
        if (video && video.videoWidth > 0 && tile.stream?.getVideoTracks().some((track) => track.enabled)) {
          const scale = Math.min((rect.w - 8) / video.videoWidth, (rect.h - 8) / video.videoHeight);
          const w = video.videoWidth * scale;
          const h = video.videoHeight * scale;
          context.drawImage(video, rect.x + (rect.w - w) / 2, rect.y + (rect.h - h) / 2, w, h);
        }
        context.font = "600 20px system-ui, sans-serif";
        const labelWidth = context.measureText(tile.label).width + 20;
        context.fillStyle = "rgba(0, 0, 0, 0.6)";
        context.fillRect(rect.x + 14, rect.y + rect.h - 46, labelWidth, 32);
        context.fillStyle = "#ffffff";
        context.textBaseline = "middle";
        context.fillText(tile.label, rect.x + 24, rect.y + rect.h - 30);
      });

      const panel = getPanel();
      const left = VIDEO_AREA + 28;
      const width = WIDTH - left - 28;
      context.textBaseline = "alphabetic";
      context.fillStyle = "#93a4c4";
      context.font = "600 18px system-ui, sans-serif";
      context.fillText(panel.title, left, 48);
      context.fillStyle = "#ffffff";
      context.font = "700 30px system-ui, sans-serif";
      context.fillText(panel.subtitle, left, 90);

      context.font = "400 23px system-ui, sans-serif";
      context.fillStyle = "#e6ecf8";
      wrap(context, panel.body, width)
        .slice(0, 15)
        .forEach((line, index) => context.fillText(line, left, 140 + index * 32));

      if (panel.timer) {
        context.font = "700 64px system-ui, sans-serif";
        context.fillStyle = "#ffd166";
        context.fillText(panel.timer, left, HEIGHT - 80);
      }
      context.font = "400 16px system-ui, sans-serif";
      context.fillStyle = "#93a4c4";
      context.fillText(panel.footer, left, HEIGHT - 30);
    };

    draw();
    const drawTimer = setInterval(draw, 1000 / FPS);
    const clock = setInterval(() => setSeconds(Math.round((Date.now() - startedAt) / 1000)), 1000);

    const stream = new MediaStream([
      ...canvas.captureStream(FPS).getVideoTracks(),
      ...mix.stream.getAudioTracks(),
    ]);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 900_000, audioBitsPerSecond: 96_000 });
    const chunks: Blob[] = [];
    let writing = Promise.resolve();
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      if (target) writing = writing.then(() => target!.write(event.data)).catch(() => {});
      else chunks.push(event.data);
    };
    recorder.start(2000);
    setSeconds(0);
    setRecording(true);

    stopRef.current = async () => {
      stopRef.current = null;
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
      clearInterval(drawTimer);
      clearInterval(clock);
      stream.getTracks().forEach((track) => track.stop());
      videos.forEach((video) => (video.srcObject = null));
      void audio.close();
      if (target) {
        await writing;
        await target.close();
      } else {
        const url = URL.createObjectURL(new Blob(chunks, { type: mimeType }));
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      setRecording(false);
    };
    return true;
  }, []);

  const stop = useCallback(async () => {
    await stopRef.current?.();
  }, []);

  // Leaving the page finishes the file instead of losing it.
  useEffect(() => () => void stopRef.current?.(), []);

  return { recording, seconds, start, stop };
}
