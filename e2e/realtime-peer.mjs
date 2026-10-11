// Plays the other group member against a real browser, on the LOCAL stack.
//   node e2e/realtime-peer.mjs send <groupId> [skill]    signs in as test user A and announces a finished skill
//   node e2e/realtime-peer.mjs listen <groupId> [secs]   signs in as test user A and prints what the group channel delivers
import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

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
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(url)) {
  throw new Error("This script only runs against a local Supabase stack.");
}

const [mode, groupId, extra] = process.argv.slice(2);
if (!["send", "listen"].includes(mode) || !groupId) {
  throw new Error("Usage: node e2e/realtime-peer.mjs send|listen <groupId> [skill|seconds]");
}

const { a } = JSON.parse(readFileSync(new URL("./local-test-users.json", import.meta.url), "utf8"));
const client = createClient(url, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
const { data, error } = await client.auth.signInWithPassword({ email: a.email, password: a.password });
if (error) throw new Error(error.message);
await client.realtime.setAuth();
const channel = client.channel(`group:${groupId}`, { config: { private: true } });

if (mode === "send") {
  const result = await channel.httpSend("skill_done", {
    user_id: data.user.id,
    name: a.name,
    skill: extra ?? "reading",
  });
  console.log(result.success ? `sent as ${a.name}` : `failed: ${result.error}`);
  process.exit(result.success ? 0 : 1);
}

const seconds = Number(extra ?? 60);
channel
  .on("broadcast", { event: "skill_done" }, ({ payload }) => {
    console.log(`RECEIVED ${JSON.stringify({ name: payload.name, skill: payload.skill })}`);
    process.exit(0);
  })
  .subscribe((status) => console.log(`status ${status}`));
setTimeout(() => {
  console.log("TIMEOUT: nothing received");
  process.exit(1);
}, seconds * 1000);
