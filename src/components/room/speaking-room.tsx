"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Circle,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Square,
  Video,
  VideoOff,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { decodeTo16kMono, transcribeMany, voicedSeconds } from "@/lib/audio/recording";
import {
  EXAMINER_LINES,
  buildExamSteps,
  formatTranscript,
  type AnsweredStep,
  type ExamStep,
} from "@/lib/speaking-room/script";
import { createClient } from "@/lib/supabase/client";
import type { FullSpeakingContent } from "@/lib/tests/types";
import { cn } from "@/lib/utils";
import { useRoom, type RoomPeer } from "./use-room";
import { useSessionRecorder } from "./use-session-recorder";

export type SpeakingTurn = {
  id: string;
  candidate_id: string;
  examiner_id: string | null;
  attempt_id: string | null;
  started_at: string | null;
  finished_at: string | null;
};

type Member = { id: string; name: string };

type Props = {
  group: { id: string; name: string };
  me: Member;
  members: Member[];
  date: string;
  initialTurns: SpeakingTurn[];
};

/** What the examiner's device tells the room, on every change and as a heartbeat. */
type ExamState = {
  turnId: string;
  attemptId: string;
  candidateId: string;
  examinerId: string;
  step: number;
  total: number;
  part: 1 | 2 | 3;
  kind: ExamStep["kind"];
  prompt: string;
  timer: number | null;
  elapsedMs: number;
  status: "running" | "finished" | "cancelled";
};

/** The test the examiner is holding, and how far through it they are. */
type ExaminerSheet = {
  turn: SpeakingTurn;
  steps: ExamStep[];
  status: "ready" | "running" | "finished";
  attemptId: string | null;
  step: number;
  stepStartedAt: number;
};

const RPC_ERRORS: Record<string, string> = {
  no_test: "Ngân hàng hết đề Speaking đầy đủ. Hãy nạp thêm đề ở trang Ngân hàng đề.",
  already_done: "Bạn ấy đã thi xong hôm nay rồi.",
  day_closed: "Ngày hôm nay đã chốt, không bắt đầu lượt mới được.",
  own_turn: "Bạn không tự làm giám khảo cho mình được.",
};

function describeRpcError(message: string | undefined) {
  const key = Object.keys(RPC_ERRORS).find((k) => message?.includes(k));
  return key ? RPC_ERRORS[key] : "Không thực hiện được. Thử lại nhé.";
}

function clock(seconds: number) {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function VideoTile({
  stream,
  label,
  badge,
  muted,
  connecting,
}: {
  stream: MediaStream | null;
  label: string;
  badge?: string;
  muted?: boolean;
  connecting?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl border bg-card">
      <video ref={ref} autoPlay playsInline muted={muted} className={cn("size-full object-cover", muted && "-scale-x-100")} />
      {connecting && (
        <p className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Đang kết nối…</p>
      )}
      <p className="absolute bottom-2 left-2 flex items-center gap-2 rounded-lg bg-black/60 px-2.5 py-1 text-sm font-medium text-white">
        {label}
        {badge && <span className="rounded bg-white/20 px-1.5 text-xs">{badge}</span>}
      </p>
    </div>
  );
}

export function SpeakingRoom({ group, me, members, date, initialTurns }: Props) {
  const [joined, setJoined] = useState(false);
  const room = useRoom({ groupId: group.id, me, enabled: joined });
  const { send, on } = room;

  const [turns, setTurns] = useState(initialTurns);
  const [sheet, setSheet] = useState<ExaminerSheet | null>(null);
  const [remote, setRemote] = useState<(ExamState & { receivedAt: number }) | null>(null);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState<{ done: number; total: number; status?: string } | null>(null);
  const [recordingBy, setRecordingBy] = useState<string[]>([]);

  const nameOf = useCallback(
    (id: string) => (id === me.id ? me.name : (members.find((m) => m.id === id)?.name ?? "Thành viên")),
    [members, me],
  );

  const refreshTurns = useCallback(async () => {
    const { data } = await createClient()
      .from("speaking_turns")
      .select("id, candidate_id, examiner_id, attempt_id, started_at, finished_at")
      .eq("group_id", group.id)
      .eq("date", date);
    if (data) setTurns(data as SpeakingTurn[]);
  }, [group.id, date]);

  // ---------------------------------------------------------------------
  // Examiner: holds the test and drives the room.
  // ---------------------------------------------------------------------

  const stateOf = useCallback(
    (current: ExaminerSheet, status: ExamState["status"]): ExamState => {
      const step = current.steps[current.step];
      return {
        turnId: current.turn.id,
        attemptId: current.attemptId ?? "",
        candidateId: current.turn.candidate_id,
        examinerId: me.id,
        step: current.step,
        total: current.steps.length,
        part: step.part,
        kind: step.kind,
        prompt: step.prompt,
        timer: step.timer ?? null,
        elapsedMs: Date.now() - current.stepStartedAt,
        status,
      };
    },
    [me.id],
  );

  // Heartbeat: late joiners and anyone who missed a message catch up within seconds.
  useEffect(() => {
    if (!sheet || sheet.status === "ready") return;
    const status = sheet.status === "finished" ? "finished" : "running";
    send("exam", stateOf(sheet, status));
    const beat = setInterval(() => send("exam", stateOf(sheet, status)), 3000);
    return () => clearInterval(beat);
  }, [sheet, send, stateOf]);

  async function claim(candidateId: string) {
    setBusy(true);
    const { data, error } = await createClient().rpc("claim_speaking_turn", {
      p_group_id: group.id,
      p_candidate_id: candidateId,
    });
    setBusy(false);
    if (error || !data) {
      toast.error(describeRpcError(error?.message));
      return;
    }
    const { turn, test } = data as { turn: SpeakingTurn; test: { content: FullSpeakingContent } };
    setSheet({
      turn,
      steps: buildExamSteps(test.content),
      status: "ready",
      attemptId: null,
      step: 0,
      stepStartedAt: 0,
    });
    void refreshTurns();
  }

  async function begin() {
    if (!sheet) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("begin_speaking_turn", { p_turn_id: sheet.turn.id });
    setBusy(false);
    if (error || !data) {
      toast.error(describeRpcError(error?.message));
      return;
    }
    setSheet({ ...sheet, status: "running", attemptId: data as string, step: 0, stepStartedAt: Date.now() });
    send("turns", null);
  }

  const goTo = useCallback((step: number) => {
    setSheet((current) => {
      if (!current || current.status !== "running") return current;
      if (step >= current.steps.length) return { ...current, status: "finished" };
      return { ...current, step: Math.max(0, step), stepStartedAt: Date.now() };
    });
  }, []);

  async function cancel() {
    if (!sheet) return;
    if (sheet.status !== "ready") {
      send("exam", stateOf(sheet, "cancelled"));
      await createClient().rpc("cancel_speaking_turn", { p_turn_id: sheet.turn.id });
      send("turns", null);
    }
    setSheet(null);
    void refreshTurns();
  }

  // The minute of preparation ends by itself; the two-minute talk is ended by the examiner.
  const sheetStep = sheet?.status === "running" ? sheet.steps[sheet.step] : null;
  const sheetStepIndex = sheet?.step ?? 0;
  const sheetStepStartedAt = sheet?.stepStartedAt ?? 0;
  useEffect(() => {
    if (sheetStep?.kind !== "prep" || !sheetStep.timer) return;
    const wait = sheetStepStartedAt + sheetStep.timer * 1000 - Date.now();
    const timer = setTimeout(() => goTo(sheetStepIndex + 1), Math.max(0, wait));
    return () => clearTimeout(timer);
  }, [sheetStep, sheetStepIndex, sheetStepStartedAt, goTo]);

  // ---------------------------------------------------------------------
  // Candidate: records their own microphone, then transcribes it.
  // ---------------------------------------------------------------------

  const capture = useRef<{
    turnId: string;
    attemptId: string;
    recorder: MediaRecorder;
    chunks: Blob[];
    startedAt: number;
    marks: { at: number; step: Pick<ExamStep, "part" | "kind" | "prompt">; index: number }[];
  } | null>(null);
  const handled = useRef(new Set<string>());
  const localStreamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    localStreamRef.current = room.localStream;
  }, [room.localStream]);

  const submitTurn = useCallback(
    async (session: NonNullable<typeof capture.current>) => {
      setProcessing({ done: 0, total: 1, status: "Đang xử lý bản ghi" });
      const supabase = createClient();
      let transcript = "";
      let seconds = 0;
      let audioPath: string | null = null;
      const blob = new Blob(session.chunks, { type: session.recorder.mimeType || "audio/webm" });

      try {
        const pcm = await decodeTo16kMono(blob);
        const total = pcm.length / 16000;
        const answered = session.marks
          .map((mark, i) => ({ mark, from: mark.at / 1000, to: (session.marks[i + 1]?.at ?? total * 1000) / 1000 }))
          .filter(({ mark }) => mark.step.kind !== "prep")
          .map(({ mark, from, to }) => {
            const clip = pcm.slice(Math.floor(from * 16000), Math.floor(Math.min(to, total) * 16000));
            return { step: mark.step, clip, voiced: voicedSeconds(clip) };
          });
        seconds = Math.round(answered.reduce((sum, a) => sum + a.voiced, 0));
        // Silence makes Whisper invent words, so near-silent clips are skipped.
        const spoken = answered.filter((a) => a.voiced >= 0.4);
        const texts = await transcribeMany(
          spoken.map((a) => a.clip),
          (done, total, status) => setProcessing({ done, total, status: status ?? "Đang chuyển giọng nói thành chữ" }),
        );
        const textOf = new Map(spoken.map((a, i) => [a, texts[i]]));
        const steps: AnsweredStep[] = answered.map((a) => ({ ...a.step, answer: textOf.get(a) ?? "" }));
        transcript = formatTranscript(steps);
      } catch {
        toast.error("Không chuyển được giọng nói thành chữ. Bản ghi âm vẫn được lưu.");
      }

      setProcessing({ done: 1, total: 1, status: "Đang lưu bản ghi" });
      const path = `${me.id}/${session.attemptId}.webm`;
      const upload = await supabase.storage
        .from("recordings")
        .upload(path, blob, { contentType: blob.type || "audio/webm", upsert: true });
      if (!upload.error) audioPath = path;

      const { error } = await supabase.rpc("finish_speaking_turn", {
        p_turn_id: session.turnId,
        p_transcript: transcript,
        p_audio_path: audioPath,
        p_speaking_seconds: seconds,
      });
      setProcessing(null);
      if (error) toast.error("Không lưu được lượt thi. Báo giám khảo bắt đầu lại nhé.");
      else toast.success("Đã lưu lượt thi của bạn. Vào Buổi nói để xem transcript và chấm điểm.");
      send("turns", null);
      void refreshTurns();
    },
    [me.id, send, refreshTurns],
  );

  const onExam = useCallback(
    (data: unknown) => {
      const state = data as ExamState;
      setRemote({ ...state, receivedAt: Date.now() });
      if (state.candidateId !== me.id) return;

      const session = capture.current;
      if (state.status === "running") {
        if (handled.current.has(state.turnId) && !session) return;
        if (!session || session.turnId !== state.turnId) {
          const tracks = localStreamRef.current?.getAudioTracks() ?? [];
          if (!tracks.length) return;
          const recorder = new MediaRecorder(new MediaStream(tracks), { audioBitsPerSecond: 32_000 });
          const chunks: Blob[] = [];
          recorder.ondataavailable = (event) => {
            if (event.data.size) chunks.push(event.data);
          };
          recorder.start(1000);
          capture.current = {
            turnId: state.turnId,
            attemptId: state.attemptId,
            recorder,
            chunks,
            startedAt: Date.now(),
            marks: [{ at: 0, index: state.step, step: { part: state.part, kind: state.kind, prompt: state.prompt } }],
          };
          return;
        }
        if (session.marks[session.marks.length - 1].index !== state.step) {
          session.marks.push({
            // The step began a little before this message arrived.
            at: Math.max(0, Date.now() - session.startedAt - state.elapsedMs),
            index: state.step,
            step: { part: state.part, kind: state.kind, prompt: state.prompt },
          });
        }
        return;
      }

      if (!session || session.turnId !== state.turnId) return;
      capture.current = null;
      handled.current.add(state.turnId);
      session.recorder.onstop = () => {
        if (state.status === "finished") void submitTurn(session);
      };
      session.recorder.stop();
    },
    [me.id, submitTurn],
  );

  useEffect(() => on("exam", onExam), [on, onExam]);
  useEffect(() => on("turns", () => void refreshTurns()), [on, refreshTurns]);
  useEffect(
    () =>
      on("recording", (data, from) => {
        const active = (data as { on: boolean }).on;
        setRecordingBy((list) => (active ? [...new Set([...list, from])] : list.filter((id) => id !== from)));
      }),
    [on],
  );

  // ---------------------------------------------------------------------
  // What everyone sees
  // ---------------------------------------------------------------------

  const examinerView: ExamState | null =
    sheet && sheet.status !== "ready" ? stateOf(sheet, sheet.status === "finished" ? "finished" : "running") : null;
  // A remote state goes stale when its examiner stops sending (left, or closed the sheet).
  const liveRemote = remote && remote.status === "running" && now - remote.receivedAt < 10_000 ? remote : null;
  const view = examinerView?.status === "running" ? examinerView : liveRemote;
  const viewStartedAt = view ? (examinerView ? sheetStepStartedAt : remote!.receivedAt - remote!.elapsedMs) : 0;
  const remaining = view?.timer ? view.timer - (now - viewStartedAt) / 1000 : null;
  const iAmCandidate = view?.candidateId === me.id;
  const iAmExaminer = Boolean(examinerView);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(tick);
  }, []);

  // The examiner's sheet closes once the candidate's upload has landed.
  const sheetTurnId = sheet?.turn.id;
  const sheetFinished = sheet?.status === "finished";
  const sheetSaved = turns.some((t) => t.id === sheetTurnId && t.finished_at);
  useEffect(() => {
    if (!sheetFinished || !sheetSaved) return;
    const timer = setTimeout(() => setSheet(null), 0);
    return () => clearTimeout(timer);
  }, [sheetFinished, sheetSaved]);

  const roleOf = (id: string) =>
    view ? (id === view.candidateId ? "Thí sinh" : id === view.examinerId ? "Giám khảo" : undefined) : undefined;

  const viewRef = useRef({ view, remaining, peers: room.peers, localStream: room.localStream });
  useEffect(() => {
    viewRef.current = { view, remaining, peers: room.peers, localStream: room.localStream };
  });

  const recorder = useSessionRecorder({
    getTiles: () => {
      const current = viewRef.current;
      const role = (id: string) =>
        current.view
          ? id === current.view.candidateId
            ? " · Candidate"
            : id === current.view.examinerId
              ? " · Examiner"
              : ""
          : "";
      return [
        { id: me.id, label: `${me.name}${role(me.id)}`, stream: current.localStream },
        ...current.peers.map((peer) => ({ id: peer.id, label: `${peer.name}${role(peer.id)}`, stream: peer.stream })),
      ];
    },
    getPanel: () => {
      const current = viewRef.current;
      const v = current.view;
      return {
        title: `IELTS Speaking · ${group.name}`,
        subtitle: v ? `Part ${v.part}${v.kind === "prep" ? " · preparation" : v.kind === "talk" ? " · long turn" : ""}` : "Speaking room",
        body: v ? v.prompt : "Waiting for the next turn to start.",
        timer: v && current.remaining != null ? clock(current.remaining) : null,
        footer: v ? `${date} · Question ${v.step + 1} of ${v.total}` : date,
      };
    },
  });

  async function toggleRecording() {
    if (recorder.recording) {
      await recorder.stop();
      send("recording", { on: false });
      toast.success("Đã lưu video buổi nói.");
      return;
    }
    try {
      const started = await recorder.start(`ielts-speaking-${date}`);
      if (started) send("recording", { on: true });
    } catch {
      toast.error("Trình duyệt này không ghi hình được. Hãy dùng Chrome hoặc Edge trên máy tính.");
    }
  }

  // ---------------------------------------------------------------------

  if (!joined) {
    return (
      <main className="grid min-h-dvh place-items-center p-5">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border bg-card p-8 text-center">
          <h1 className="font-heading text-2xl font-bold">Phòng nói · {group.name}</h1>
          <p className="text-muted-foreground">
            Vào phòng là camera và micro được bật. Một người làm giám khảo, bấm hiện câu hỏi rồi đọc cho
            người kia trả lời; mỗi người nhận một đề riêng gồm đủ Part 1, 2 và 3.
          </p>
          <Button size="lg" className="h-11 px-5 text-base" onClick={() => setJoined(true)}>
            <Video /> Vào phòng nói
          </Button>
          <Link href={`/groups/${group.id}`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            Quay lại nhóm
          </Link>
        </div>
      </main>
    );
  }

  const present = new Set([me.id, ...room.peers.map((p) => p.id)]);
  const turnOf = (id: string) => turns.find((t) => t.candidate_id === id);
  const recordingNames = recordingBy.filter((id) => present.has(id)).map(nameOf);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
        <Link href={`/groups/${group.id}`} aria-label="Rời phòng" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-5" />
        </Link>
        <h1 className="mr-auto font-heading font-bold">Phòng nói · {group.name}</h1>
        {(recorder.recording || recordingNames.length > 0) && (
          <p className="flex items-center gap-1.5 text-sm text-destructive" role="status">
            <Circle className="size-3 fill-current" />
            {recorder.recording ? `Đang ghi hình ${clock(recorder.seconds)}` : `${recordingNames.join(", ")} đang ghi hình`}
          </p>
        )}
        <Button variant="outline" size="icon" aria-label={room.micOn ? "Tắt micro" : "Bật micro"} onClick={room.toggleMic}>
          {room.micOn ? <Mic /> : <MicOff className="text-destructive" />}
        </Button>
        <Button variant="outline" size="icon" aria-label={room.camOn ? "Tắt camera" : "Bật camera"} onClick={room.toggleCam}>
          {room.camOn ? <Video /> : <VideoOff className="text-destructive" />}
        </Button>
        <Button variant={recorder.recording ? "destructive" : "outline"} className="h-9" onClick={toggleRecording}>
          {recorder.recording ? <Square /> : <Circle />} {recorder.recording ? "Dừng ghi hình" : "Ghi hình"}
        </Button>
        <Button asChild variant="outline" className="h-9">
          <Link href={`/groups/${group.id}/speaking`}>
            <PhoneOff /> Rời phòng
          </Link>
        </Button>
      </header>

      <main className="grid flex-1 gap-4 p-4 lg:grid-cols-[1fr_26rem]">
        <section className="flex flex-col gap-3">
          {room.mediaProblem && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {room.mediaProblem === "all"
                ? "Trình duyệt chưa được phép dùng camera và micro. Hãy cho phép ở thanh địa chỉ rồi tải lại trang."
                : "Không mở được camera, bạn đang vào phòng chỉ với micro."}
            </p>
          )}
          {room.status === "error" && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Mất kết nối tới phòng. Tải lại trang để vào lại.
            </p>
          )}
          <div className={cn("grid gap-3", room.peers.length > 0 && "sm:grid-cols-2")}>
            <VideoTile stream={room.localStream} label={`${me.name} (bạn)`} badge={roleOf(me.id)} muted />
            {room.peers.map((peer: RoomPeer) => (
              <VideoTile
                key={peer.id}
                stream={peer.stream}
                label={peer.name}
                badge={roleOf(peer.id)}
                connecting={peer.connection !== "connected"}
              />
            ))}
          </div>
          {room.peers.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {room.status === "joined" ? "Chưa có ai khác trong phòng. Nhắn bạn cùng nhóm vào nhé." : "Đang vào phòng…"}
            </p>
          )}
        </section>

        <aside className="flex flex-col gap-4 rounded-2xl border bg-card p-5">
          {processing ? (
            <div className="flex flex-col gap-3" role="status">
              <h2 className="font-heading font-bold">Đang lưu lượt thi của bạn</h2>
              <p className="flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" /> {processing.status}
                {processing.total > 1 && ` (${processing.done}/${processing.total})`}
              </p>
              <Progress value={(processing.done / Math.max(1, processing.total)) * 100} />
              <p className="text-sm text-muted-foreground">Đừng đóng trang cho tới khi xong.</p>
            </div>
          ) : sheet?.status === "ready" ? (
            <div className="flex flex-col gap-3">
              <h2 className="font-heading font-bold">Bạn làm giám khảo cho {nameOf(sheet.turn.candidate_id)}</h2>
              <p className="text-sm text-muted-foreground">
                Đề gồm {sheet.steps.length} bước qua Part 1, 2 và 3. Khi bấm bắt đầu, câu hỏi chỉ hiện ở máy bạn;
                cue card Part 2 sẽ hiện ở máy bạn ấy trong 1 phút chuẩn bị và 2 phút nói.
              </p>
              <Button className="h-10" disabled={busy} onClick={begin}>
                {busy && <Loader2 className="animate-spin" />} Hiện câu hỏi và bắt đầu
              </Button>
              <Button variant="ghost" className="h-9" onClick={cancel}>
                Để sau
              </Button>
            </div>
          ) : sheet?.status === "finished" ? (
            <div className="flex flex-col gap-3" role="status">
              <h2 className="font-heading font-bold">Đã hỏi xong</h2>
              <p className="flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" /> Máy của {nameOf(sheet.turn.candidate_id)} đang chuyển bản ghi
                thành transcript.
              </p>
              <p className="text-sm text-muted-foreground">{EXAMINER_LINES.closing}</p>
            </div>
          ) : sheet && examinerView ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between">
                <h2 className="font-heading font-bold">
                  Part {examinerView.part} · bước {examinerView.step + 1}/{examinerView.total}
                </h2>
                <span className="text-sm text-muted-foreground">Hỏi {nameOf(examinerView.candidateId)}</span>
              </div>
              {(examinerView.step === 0 ||
                examinerView.kind !== "question" ||
                sheet.steps[examinerView.step - 1]?.part !== examinerView.part) && (
                <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground">
                  {examinerView.step === 0
                    ? EXAMINER_LINES.opening
                    : examinerView.kind === "prep"
                      ? EXAMINER_LINES.prep
                      : examinerView.kind === "talk"
                        ? EXAMINER_LINES.talk
                        : EXAMINER_LINES.part3}
                </p>
              )}
              {sheet.steps[examinerView.step].heading && (
                <p className="text-sm font-semibold text-muted-foreground">{sheet.steps[examinerView.step].heading}</p>
              )}
              <p className="whitespace-pre-line text-lg leading-7 font-medium">{examinerView.prompt}</p>
              {remaining != null && (
                <p className={cn("font-heading text-4xl font-bold tabular-nums", remaining <= 0 && "text-destructive")}>
                  {clock(remaining)}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {examinerView.kind === "prep" ? "chuẩn bị" : remaining <= 0 ? "hết 2 phút, mời dừng" : "đang nói"}
                  </span>
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button className="h-10" onClick={() => goTo(examinerView.step + 1)}>
                  {examinerView.step + 1 >= examinerView.total ? (
                    <>
                      <Check /> Kết thúc bài thi
                    </>
                  ) : examinerView.kind === "prep" ? (
                    "Cho nói luôn"
                  ) : (
                    <>
                      Câu tiếp <ArrowRight />
                    </>
                  )}
                </Button>
                {examinerView.step > 0 && (
                  <Button variant="outline" className="h-10" onClick={() => goTo(examinerView.step - 1)}>
                    Quay lại
                  </Button>
                )}
                <Button variant="ghost" className="h-10 text-destructive" onClick={cancel}>
                  Huỷ lượt
                </Button>
              </div>
              {sheet.steps[examinerView.step + 1] && (
                <p className="text-sm text-muted-foreground">
                  Tiếp theo: {sheet.steps[examinerView.step + 1].prompt.split("\n")[0]}
                </p>
              )}
            </div>
          ) : view && iAmCandidate ? (
            <div className="flex flex-col gap-4">
              <h2 className="font-heading font-bold">
                Bạn đang thi · Part {view.part} · bước {view.step + 1}/{view.total}
              </h2>
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Circle className="size-3 fill-destructive text-destructive" /> Câu trả lời của bạn đang được ghi âm
              </p>
              {view.kind === "question" ? (
                <p className="text-muted-foreground">Nghe {nameOf(view.examinerId)} hỏi rồi trả lời như thi thật.</p>
              ) : (
                <>
                  <p className="rounded-xl border bg-background p-4 text-lg leading-7 font-medium whitespace-pre-line">
                    {view.prompt}
                  </p>
                  {remaining != null && (
                    <p className={cn("font-heading text-5xl font-bold tabular-nums", remaining <= 0 && "text-destructive")}>
                      {clock(remaining)}
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {view.kind === "prep" ? "chuẩn bị, có thể ghi chú" : "nói tới khi giám khảo dừng"}
                      </span>
                    </p>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <h2 className="font-heading font-bold">Buổi nói hôm nay</h2>
              {view && !iAmExaminer && (
                <p className="rounded-lg bg-secondary px-3 py-2 text-sm">
                  {nameOf(view.examinerId)} đang hỏi {nameOf(view.candidateId)} · Part {view.part}
                </p>
              )}
              <ul className="divide-y">
                {members.map((member) => {
                  const turn = turnOf(member.id);
                  const here = present.has(member.id);
                  const done = Boolean(turn?.finished_at);
                  return (
                    <li key={member.id} className="flex items-center gap-3 py-2.5">
                      <span className={cn("size-2.5 shrink-0 rounded-full", here ? "bg-success" : "bg-border")} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {member.name}
                          {member.id === me.id && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(bạn)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {done ? "Đã thi xong" : here ? "Trong phòng, chưa thi" : "Chưa vào phòng"}
                        </p>
                      </div>
                      {done ? (
                        <Check className="size-5 text-success" />
                      ) : (
                        member.id !== me.id &&
                        here &&
                        !view && (
                          <Button variant="outline" className="h-9" disabled={busy} onClick={() => claim(member.id)}>
                            Hỏi {member.name.split(" ").slice(-1)[0]}
                          </Button>
                        )
                      )}
                    </li>
                  );
                })}
              </ul>
              {!turnOf(me.id)?.finished_at && (
                <p className="text-sm text-muted-foreground">
                  Tới lượt bạn thi khi một bạn trong phòng bấm hỏi bạn. Đề của bạn chỉ người hỏi nhìn thấy.
                </p>
              )}
              <Button asChild variant="outline" className="h-9 w-fit">
                <Link href={`/groups/${group.id}/speaking`}>Xem transcript và chấm điểm</Link>
              </Button>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}
