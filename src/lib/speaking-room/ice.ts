// Which servers the speaking room's video call may use to find a path between
// two devices. STUN is enough when both networks allow a direct connection; a
// VPN, mobile data or a strict office network needs a relay (TURN) in between.

export type IceServer = { urls: string[]; username?: string; credential?: string };
export type IceConfig = { servers: IceServer[]; relay: boolean };

type Env = Record<string, string | undefined>;

const STUN: IceServer = { urls: ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"] };

export const STUN_ONLY: IceConfig = { servers: [STUN], relay: false };

const isRelay = (server: IceServer) => server.urls.some((url) => url.startsWith("turn"));

function clean(servers: unknown): IceServer[] {
  if (!Array.isArray(servers)) return [];
  return servers.flatMap((server): IceServer[] => {
    const { urls, username, credential } = (server ?? {}) as Record<string, unknown>;
    const list = (Array.isArray(urls) ? urls : [urls])
      .filter((url): url is string => typeof url === "string" && /^(stun|turns?):/.test(url))
      // Browsers refuse port 53, so that address would only add a timeout.
      .filter((url) => !/:53(\?|$)/.test(url));
    if (!list.length) return [];
    return [
      {
        urls: list,
        ...(typeof username === "string" && typeof credential === "string" ? { username, credential } : {}),
      },
    ];
  });
}

/**
 * Cloudflare Realtime TURN hands out short-lived credentials from a key that
 * stays on the server.
 */
async function cloudflare(keyId: string, token: string, fetcher: typeof fetch): Promise<IceServer[]> {
  const response = await fetcher(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      // Longer than any speaking session.
      body: JSON.stringify({ ttl: 6 * 60 * 60 }),
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    },
  );
  if (!response.ok) throw new Error(`turn_credentials_${response.status}`);
  return clean(((await response.json()) as { iceServers?: unknown }).iceServers);
}

export async function loadIceConfig(env: Env, fetcher: typeof fetch = fetch): Promise<IceConfig> {
  let relays: IceServer[] = [];

  if (env.CLOUDFLARE_TURN_KEY_ID && env.CLOUDFLARE_TURN_API_TOKEN) {
    try {
      relays = (await cloudflare(env.CLOUDFLARE_TURN_KEY_ID, env.CLOUDFLARE_TURN_API_TOKEN, fetcher)).filter(isRelay);
    } catch {
      // Fall through: a direct connection is still worth trying.
    }
  }

  // Any other TURN service: fixed addresses and one username and password.
  if (!relays.length && env.TURN_URLS && env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    relays = clean([
      {
        urls: env.TURN_URLS.split(",").map((url) => url.trim()),
        username: env.TURN_USERNAME,
        credential: env.TURN_CREDENTIAL,
      },
    ]).filter(isRelay);
  }

  return { servers: [STUN, ...relays], relay: relays.length > 0 };
}
