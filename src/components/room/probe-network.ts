"use client";

/**
 * Whether this device sits behind a NAT that hands out a different public port
 * for every server it talks to ("symmetric"), as VPNs such as Cloudflare WARP
 * and many mobile networks do. Two such devices cannot open a direct call; only
 * a relay gets through. Null when the browser does not reveal enough to tell.
 */
export async function detectSymmetricNat(timeoutMs = 4000): Promise<boolean | null> {
  let pc: RTCPeerConnection | null = null;
  try {
    pc = new RTCPeerConnection({
      // Two unrelated servers: an ordinary NAT shows both the same public port.
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }],
    });
    pc.createDataChannel("probe");
    const mapped = new Map<string, Set<string>>();
    pc.onicecandidate = ({ candidate }) => {
      if (candidate?.type !== "srflx" || !candidate.address) return;
      // Group by the local socket; when the browser hides it, it uses one socket per address family.
      const local = candidate.relatedPort
        ? `${candidate.relatedAddress}:${candidate.relatedPort}`
        : `${candidate.address.includes(":") ? "v6" : "v4"} ${candidate.address}`;
      if (!mapped.has(local)) mapped.set(local, new Set());
      mapped.get(local)!.add(`${candidate.address}:${candidate.port}`);
    };
    await pc.setLocalDescription();
    const done = pc;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, timeoutMs);
      done.onicegatheringstatechange = () => {
        if (done.iceGatheringState === "complete") {
          clearTimeout(timer);
          resolve();
        }
      };
    });
    if (!mapped.size) return null;
    return [...mapped.values()].some((ports) => ports.size > 1);
  } catch {
    return null;
  } finally {
    pc?.close();
  }
}
