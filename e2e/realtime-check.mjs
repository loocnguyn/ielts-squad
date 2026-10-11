// Checks the private group channel against the LOCAL Supabase stack:
// a member receives another member's "skill_done" broadcast, and an outsider
// cannot join the channel. Run: node e2e/realtime-check.mjs <groupId>
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// .env.development.local when local mode is switched on, else its checked-in template.
const envFile = [".env.development.local", ".env.development.local.example"]
  .map((name) => new URL(`../${name}`, import.meta.url))
  .find((file) => existsSync(file));
const env = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => line.split(/=(.*)/s).slice(0, 2).map((part) => part.trim())),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
  throw new Error("This check only runs against a local Supabase stack.");
}

const users = JSON.parse(readFileSync(new URL("./local-test-users.json", import.meta.url), "utf8"));
const groupId = process.argv[2];
if (!groupId) throw new Error("Usage: node e2e/realtime-check.mjs <groupId>");
const topic = `group:${groupId}`;

async function signedIn({ email, password }, { create = false } = {}) {
  const client = createClient(url, key, { auth: { persistSession: false } });
  const { error } = create
    ? await client.auth.signUp({ email, password })
    : await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`${email}: ${error.message}`);
  await client.realtime.setAuth();
  return client;
}

/** Resolves with the subscription status the server settles on. */
function subscribe(client, onEvent) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve("TIMED_OUT"), 8000);
    client
      .channel(topic, { config: { private: true } })
      .on("broadcast", { event: "skill_done" }, ({ payload }) => onEvent?.(payload))
      .subscribe((status) => {
        if (status !== "SUBSCRIBED" && status !== "CHANNEL_ERROR" && status !== "TIMED_OUT") return;
        clearTimeout(timer);
        resolve(status);
      });
  });
}

const results = [];
const check = (name, ok, detail = "") => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const listener = await signedIn(users.a);
const sender = await signedIn(users.b);
const outsider = await signedIn(
  { email: `outsider-${Date.now()}@ielts-squad.test`, password: users.a.password },
  { create: true },
);

let received = null;
const memberStatus = await subscribe(listener, (payload) => (received = payload));
check("member subscribes to the private group channel", memberStatus === "SUBSCRIBED", memberStatus);

const outsiderStatus = await subscribe(outsider);
check("outsider is refused", outsiderStatus !== "SUBSCRIBED", outsiderStatus);

// Same call the app makes after a submission: an HTTP broadcast, no subscription.
const channel = sender.channel(topic, { config: { private: true } });
const sent = await channel.httpSend("skill_done", { user_id: "b", name: users.b.name, skill: "reading" });
check("member sends a broadcast", sent.success, JSON.stringify(sent));

// The server rejects an outsider's broadcast; the client reports that by throwing.
const refused = await outsider
  .channel(topic, { config: { private: true } })
  .httpSend("skill_done", { user_id: "x", name: "Outsider", skill: "reading" })
  .then((result) => (result.success ? "accepted" : `refused: ${result.error}`))
  .catch((error) => `refused: ${error.message}`);
check("outsider cannot broadcast into the group", refused.startsWith("refused"), refused);

await new Promise((resolve) => setTimeout(resolve, 2000));
check("the other member receives it, and only that", received?.name === users.b.name, JSON.stringify(received));

await Promise.all([listener, sender, outsider].map((client) => client.removeAllChannels()));
process.exit(results.every(Boolean) ? 0 : 1);
