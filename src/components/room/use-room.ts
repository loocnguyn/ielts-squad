"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getIceConfig } from "@/app/actions/room";
import { STUN_ONLY, type IceConfig } from "@/lib/speaking-room/ice";
import { createClient } from "@/lib/supabase/client";

// The speaking room's plumbing: camera and microphone, a peer-to-peer video
// call between everyone present (a small mesh, signalled over the group's
// private Realtime channel), and a message bus for the exam itself.

export type RoomPeer = {
  id: string;
  name: string;
  stream: MediaStream | null;
  connection: RTCPeerConnectionState;
  /** How the call reaches them once connected: straight to their device, or through the relay. */
  route: "direct" | "relay" | null;
  /** Still not connected after a while: the two networks probably block each other. */
  stuck: boolean;
};

export type RoomStatus = "idle" | "connecting" | "joined" | "error";
/** camera: joined with sound only. all: no camera or microphone at all. */
export type MediaProblem = "camera" | "all" | null;

type Hello = { from: string; name: string; session: string; to?: string };
type Signal = { from: string; to: string; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
type AppMessage = { from: string; to?: string; event: string; data: unknown };

type PeerEntry = Omit<RoomPeer, "stuck"> & {
  session: string;
  pc: RTCPeerConnection;
  /** Perfect negotiation: the polite side backs off when two offers cross. */
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  /** Signals are applied one at a time: a candidate must not overtake its description. */
  queue: Promise<void>;
  /** When they last announced themselves; silence means they have left. */
  lastSeen: number;
  /** Since when the call has been down; it counts as stuck after a while. */
  since: number;
  /** When the search for a path was last started again. */
  retriedAt: number;
};

const HELLO_EVERY_MS = 5_000;
const GONE_AFTER_MS = 40_000;
const STUCK_AFTER_MS = 12_000;
// One side leads the retries so that two restarts do not keep cancelling each
// other; the other side steps in only if nothing has happened for much longer.
const RETRY_AFTER_MS = 20_000;
/** A path that fails outright is retried sooner, but never in a tight loop. */
const RETRY_FAILED_AFTER_MS = 4_000;
const FOLLOWER_WAITS = 3;

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
  /** Whether a relay is available for networks that block a direct call. Null until known. */
  const [relay, setRelay] = useState<boolean | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const peersRef = useRef(new Map<string, PeerEntry>());
  const localRef = useRef<MediaStream | null>(null);
  const handlersRef = useRef(new Map<string, Set<(data: unknown, from: string) => void>>());

  const publish = useCallback(() => {
    const now = Date.now();
    setPeers(
      [...peersRef.current.values()].map(({ id, name, stream, connection, route, since }) => ({
        id,
        name,
        stream,
        connection,
        route,
        stuck: connection !== "connected" && now - since > STUCK_AFTER_MS,
      })),
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
    let ice: IceConfig = STUN_ONLY;
    // Troubleshooting: /room/...?relay=1 sends the call through the relay only.
    const relayOnly = new URLSearchParams(window.location.search).get("relay") === "1";

    const raw = (event: string, payload: unknown) =>
      void channelRef.current?.send({ type: "broadcast", event, payload });

    const dropPeer = (id: string) => {
      const peer = peerMap.get(id);
      if (!peer) return;
      peer.pc.close();
      peerMap.delete(id);
      publish();
    };

    const addPeer = (id: string, name: string, peerSession: string) => {
      const existing = peerMap.get(id);
      if (existing?.session === peerSession) {
        existing.lastSeen = Date.now();
        return existing;
      }
      // A new session means the other side reloaded: start that connection again.
      if (existing) dropPeer(id);

      const pc = new RTCPeerConnection({ iceServers: ice.servers, iceTransportPolicy: relayOnly ? "relay" : "all" });
      const peer: PeerEntry = {
        id,
        name,
        session: peerSession,
        pc,
        stream: null,
        connection: pc.connectionState,
        route: null,
        polite: meId > id,
        makingOffer: false,
        ignoreOffer: false,
        queue: Promise.resolve(),
        lastSeen: Date.now(),
        since: Date.now(),
        retriedAt: Date.now(),
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
        if (peerMap.get(id) !== peer) return;
        if (peer.connection === "connected" && pc.connectionState !== "connected") peer.since = Date.now();
        peer.connection = pc.connectionState;
        if (pc.connectionState === "connected") void readRoute(peer);
        else peer.route = null;
        // A failed path is tried again with fresh addresses instead of giving up.
        if (pc.connectionState === "failed" && !peer.polite && Date.now() - peer.retriedAt > RETRY_FAILED_AFTER_MS) {
          revive(peer);
        }
        publish();
      };

      publish();
      return peer;
    };

    const readRoute = async (peer: PeerEntry) => {
      try {
        const stats = await peer.pc.getStats();
        let pair: { localCandidateId?: string; remoteCandidateId?: string } | undefined;
        stats.forEach((report) => {
          if (report.type === "transport" && report.selectedCandidatePairId) {
            pair = stats.get(report.selectedCandidatePairId);
          }
        });
        stats.forEach((report) => {
          if (!pair && report.type === "candidate-pair" && report.state === "succeeded" && report.nominated) pair = report;
        });
        if (!pair) return;
        const kinds = [pair.localCandidateId, pair.remoteCandidateId].map((key) => key && stats.get(key)?.candidateType);
        peer.route = kinds.includes("relay") ? "relay" : "direct";
        publish();
      } catch {
        // Only a label depends on this.
      }
    };

    /** Starts the search for a path again, for a call that failed or never got going. */
    const revive = (peer: PeerEntry) => {
      const { pc } = peer;
      peer.retriedAt = Date.now();
      // An offer the other side never answered would block every later one.
      const cleared =
        pc.signalingState === "have-local-offer" && !peer.makingOffer
          ? pc.setLocalDescription({ type: "rollback" }).catch(() => {})
          : Promise.resolve();
      void cleared.then(() => {
        if (pc.signalingState !== "closed") pc.restartIce();
      });
    };

    const sweep = () => {
      const now = Date.now();
      for (const peer of [...peerMap.values()]) {
        if (peer.connection === "connected") continue;
        const wait =
          (peer.connection === "failed" ? RETRY_FAILED_AFTER_MS : RETRY_AFTER_MS) * (peer.polite ? FOLLOWER_WAITS : 1);
        if (now - peer.lastSeen > GONE_AFTER_MS) dropPeer(peer.id);
        else if (now - peer.retriedAt > wait) revive(peer);
      }
      publish();
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

      try {
        ice = await getIceConfig();
      } catch {
        // Without the server's list a direct connection is still tried.
      }
      if (cancelled) return;
      setRelay(ice.relay);

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
            // Repeats cover a hello lost while the other side was still joining,
            // and tell the others that this device is still here.
            hello ??= setInterval(() => {
              announce();
              sweep();
            }, HELLO_EVERY_MS);
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
      setRelay(null);
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

  return { status, mediaProblem, relay, localStream, peers, micOn, camOn, toggleMic, toggleCam, send, on };
}
