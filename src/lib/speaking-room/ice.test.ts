import { describe, expect, it, vi } from "vitest";
import { loadIceConfig } from "./ice";

const cloudflareReply = {
  iceServers: [
    { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
    {
      urls: [
        "turn:turn.cloudflare.com:3478?transport=udp",
        "turn:turn.cloudflare.com:53?transport=udp",
        "turns:turn.cloudflare.com:443?transport=tcp",
      ],
      username: "user",
      credential: "pass",
    },
  ],
};

describe("speaking room connection servers", () => {
  it("offers only a direct connection when no relay is configured", async () => {
    const fetcher = vi.fn();
    const config = await loadIceConfig({}, fetcher);
    expect(config.relay).toBe(false);
    expect(config.servers).toHaveLength(1);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("asks Cloudflare for short-lived relay credentials and drops port 53", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(cloudflareReply), { status: 201 }));
    const config = await loadIceConfig({ CLOUDFLARE_TURN_KEY_ID: "key", CLOUDFLARE_TURN_API_TOKEN: "token" }, fetcher);

    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://rtc.live.cloudflare.com/v1/turn/keys/key/credentials/generate-ice-servers");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token");

    expect(config.relay).toBe(true);
    expect(config.servers[1]).toEqual({
      urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:443?transport=tcp"],
      username: "user",
      credential: "pass",
    });
  });

  it("falls back to a direct connection when the relay service refuses", async () => {
    const fetcher = vi.fn(async () => new Response("no", { status: 401 }));
    const config = await loadIceConfig({ CLOUDFLARE_TURN_KEY_ID: "key", CLOUDFLARE_TURN_API_TOKEN: "bad" }, fetcher);
    expect(config.relay).toBe(false);
  });

  it("accepts a fixed relay from any other service", async () => {
    const config = await loadIceConfig({
      TURN_URLS: "turn:relay.example.com:3478, turns:relay.example.com:443?transport=tcp, https://not-a-relay",
      TURN_USERNAME: "user",
      TURN_CREDENTIAL: "pass",
    });
    expect(config.relay).toBe(true);
    expect(config.servers[1].urls).toEqual(["turn:relay.example.com:3478", "turns:relay.example.com:443?transport=tcp"]);
  });
});
