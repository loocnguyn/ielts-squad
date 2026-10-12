"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// The speaking room's plumbing: camera and microphone, a peer-to-peer video
// call between everyone present (a small mesh, signalled over the group's
// private Realtime channel), and a message bus for the exam itself.

export type RoomPeer = {
  id: string;
  name: string;
  stream: MediaStream | null;
  connection: RTCPeerConnectionState;
};

export type RoomStatus = "idle" | "connecting" | "joined" | "error";
/** camera: joined with sound only. all: no camera or microphone at all. */
export type MediaProblem = "camera" | "all" | null;

type Hello = { from: string; name: string; session: string; to?: string };
type Signal = { from: string; to: string; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
type AppMessage = { from: string; to?: string; event: string; data: unknown };

type PeerEntry = RoomPeer & {
  session: string;
  pc: RTCPeerConnection;
  /** Perfect negotiation: the polite side backs off when two offers cross. */
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  /** Signals are applied one at a time: a candidate must not overtake its description. */
  queue: Promise<void>;
  dropTimer: ReturnType<typeof setTimeout> | null;
};

// Public STUN finds a direct path on most home networks. A relay (TURN) can be
// added through the environment for networks that block direct connections.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ...(process.env.NEXT_PUBLIC_TURN_URL
    ? [
        {
          urls: process.env.NEXT_PUBLIC_TURN_URL,
          username: process.env.NEXT_PUBLIC_TURN_USERNAME,
          credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
        },
      ]
    : []),
];

const AUDIO: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
const VIDEO: MediaTrackConstraints = { width: { ideal: 640 }, height: { ideal: 360 }, frameRate: { ideal: 24 } };

export const roomChannel = (groupId: string) => `group:${groupId}:room`;

export function useRoom(args: { groupId: string; me: { id: string; name: string }; enabled: boolean }) {
  const { groupId, enabled } = args;
  const meId = args.me.id;
  const meName = args.me.name;

  const [status, setStatus] = useState<RoomStatus>("idle");
  const [mediaProblem, setMediaProblem] = useState<MediaProblem>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<RoomPeer[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const peersRef = useRef(new Map<string, PeerEntry>());
  const localRef = useRef<MediaStream | null>(null);
  const handlersRef = useRef(new Map<string, Set<(data: unknown, from: string) => void>>());

  const publish = useCallback(() => {
    setPeers(
      [...peersRef.current.values()].map(({ id, name, stream, connection }) => ({ id, name, stream, connection })),
    );
  }, []);

  /** Sends an exam message to everyone in the room, or to one member. */
  const send = useCallback(
    (event: string, data: unknown, to?: string) => {
      void channelRef.current?.send({
        type: "broadcast",
        event: "app",
        payload: { from: meId, to, event, data } satisfies AppMessage,
      });
    },
    [meId],
  );

  /** Listens for an exam message. Returns the function that stops listening. */
  const on = useCallback((event: string, handler: (data: unknown, from: string) => void) => {
    const handlers = handlersRef.current;
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event)!.add(handler);
    return () => {
      handlers.get(event)?.delete(handler);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const session = crypto.randomUUID();
    const peerMap = peersRef.current;
    const supabase = createClient();
    let hello: ReturnType<typeof setInterval> | null = null;

    const raw = (event: string, payload: unknown) =>
      void channelRef.current?.send({ type: "broadcast", event, payload });

    const dropPeer = (id: string) => {
      const peer = peerMap.get(id);
      if (!peer) return;
      if (peer.dropTimer) clearTimeout(peer.dropTimer);
      peer.pc.close();
      peerMap.delete(id);
      publish();
    };

    const addPeer = (id: string, name: string, peerSession: string) => {
      const existing = peerMap.get(id);
      if (existing?.session === peerSession) return existing;
      // A new session means the other side reloaded: start that connection again.
      if (existing) dropPeer(id);

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const peer: PeerEntry = {
        id,
        name,
        session: peerSession,
        pc,
        stream: null,
        connection: pc.connectionState,
        polite: meId > id,
        makingOffer: false,
        ignoreOffer: false,
        queue: Promise.resolve(),
        dropTimer: null,
      };
      peerMap.set(id, peer);

      const local = localRef.current;
      if (local) for (const track of local.getTracks()) pc.addTrack(track, local);
      // Still receive from others when this device has no camera or microphone.
      if (!local?.getAudioTracks().length) pc.addTransceiver("audio", { direction: "recvonly" });
      if (!local?.getVideoTracks().length) pc.addTransceiver("video", { direction: "recvonly" });

      const signal = (body: Omit<Signal, "from" | "to">) => raw("signal", { from: meId, to: id, ...body } satisfies Signal);

      pc.onnegotiationneeded = async () => {
        try {
          peer.makingOffer = true;
          await pc.setLocalDescription();
          if (pc.localDescription) signal({ description: pc.localDescription.toJSON() });
        } catch {
          // The next negotiation will try again.
        } finally {
          peer.makingOffer = false;
        }
      };
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) signal({ candidate: candidate.toJSON() });
      };
      pc.ontrack = ({ streams, track }) => {
        peer.stream = streams[0] ?? new MediaStream([track]);
        publish();
      };
      pc.onconnectionstatechange = () => {
        peer.connection = pc.connectionState;
        if (peer.dropTimer) clearTimeout(peer.dropTimer);
        peer.dropTimer = null;
        if (pc.connectionState === "failed" || pc.connectionState === "closed") dropPeer(id);
        // A short network hiccup recovers by itself; a long one means they left.
        else if (pc.connectionState === "disconnected") peer.dropTimer = setTimeout(() => dropPeer(id), 12_000);
        else publish();
      };

      publish();
      return peer;
    };

    const onHello = (message: Hello) => {
      if (message.from === meId || (message.to && message.to !== meId)) return;
      const known = peerMap.get(message.from)?.session === message.session;
      addPeer(message.from, message.name, message.session);
      // Answer newcomers so that they learn about us too.
      if (!known && !message.to) raw("hello", { from: meId, name: meName, session, to: message.from } satisfies Hello);
    };

    const onSignal = (message: Signal) => {
      if (message.to !== meId) return;
      const peer = peerMap.get(message.from);
      if (peer) peer.queue = peer.queue.then(() => applySignal(peer, message));
    };

    const applySignal = async (peer: PeerEntry, message: Signal) => {
      const { pc } = peer;
      try {
        if (message.description) {
          const collision =
            message.description.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
          peer.ignoreOffer = !peer.polite && collision;
          if (peer.ignoreOffer) return;
          await pc.setRemoteDescription(message.description);
          if (message.description.type === "offer") {
            await pc.setLocalDescription();
            if (pc.localDescription) {
              raw("signal", { from: meId, to: peer.id, description: pc.localDescription.toJSON() } satisfies Signal);
            }
          }
        } else if (message.candidate) {
          try {
            await pc.addIceCandidate(message.candidate);
          } catch (error) {
            if (!peer.ignoreOffer) throw error;
          }
        }
      } catch {
        // A failed exchange is retried by the next hello or renegotiation.
      }
    };

    const onApp = (message: AppMessage) => {
      if (message.from === meId || (message.to && message.to !== meId)) return;
      for (const handler of handlersRef.current.get(message.event) ?? []) handler(message.data, message.from);
    };

    (async () => {
      setStatus("connecting");
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: VIDEO, audio: AUDIO });
      } catch {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO });
          setMediaProblem("camera");
        } catch {
          setMediaProblem("all");
        }
      }
      if (cancelled) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      localRef.current = stream;
      setLocalStream(stream);
      setCamOn(Boolean(stream?.getVideoTracks().length));
      setMicOn(Boolean(stream?.getAudioTracks().length));

      await supabase.realtime.setAuth();
      if (cancelled) return;
      const channel = supabase.channel(roomChannel(groupId), {
        config: { private: true, broadcast: { self: false } },
      });
      channelRef.current = channel;
      const announce = () => raw("hello", { from: meId, name: meName, session } satisfies Hello);
      channel
        .on("broadcast", { event: "hello" }, ({ payload }) => onHello(payload as Hello))
        .on("broadcast", { event: "signal" }, ({ payload }) => onSignal(payload as Signal))
        .on("broadcast", { event: "bye" }, ({ payload }) => dropPeer((payload as { from: string }).from))
        .on("broadcast", { event: "app" }, ({ payload }) => onApp(payload as AppMessage))
        .subscribe((state) => {
          if (cancelled) return;
          if (state === "SUBSCRIBED") {
            setStatus("joined");
            announce();
            // Repeats cover a hello lost while the other side was still joining.
            hello ??= setInterval(announce, 15_000);
          } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT") {
            setStatus("error");
          }
        });
    })();

    const leave = () => raw("bye", { from: meId });
    window.addEventListener("pagehide", leave);

    return () => {
      cancelled = true;
      window.removeEventListener("pagehide", leave);
      if (hello) clearInterval(hello);
      leave();
      for (const id of [...peerMap.keys()]) dropPeer(id);
      localRef.current?.getTracks().forEach((track) => track.stop());
      localRef.current = null;
      setLocalStream(null);
      const channel = channelRef.current;
      channelRef.current = null;
      if (channel) void supabase.removeChannel(channel);
      setStatus("idle");
    };
  }, [enabled, groupId, meId, meName, publish]);

  const toggleMic = useCallback(() => {
    const tracks = localRef.current?.getAudioTracks() ?? [];
    if (!tracks.length) return;
    const next = !tracks[0].enabled;
    tracks.forEach((track) => (track.enabled = next));
    setMicOn(next);
  }, []);

  const toggleCam = useCallback(() => {
    const tracks = localRef.current?.getVideoTracks() ?? [];
    if (!tracks.length) return;
    const next = !tracks[0].enabled;
    tracks.forEach((track) => (track.enabled = next));
    setCamOn(next);
  }, []);

  return { status, mediaProblem, localStream, peers, micOn, camOn, toggleMic, toggleCam, send, on };
}
