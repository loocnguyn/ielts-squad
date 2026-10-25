// Sets up the relay (TURN) that lets the speaking room's video call cross
// networks that block a direct connection, then redeploys production.
//
//   npm run turn:setup
//
// It asks for a Cloudflare Realtime TURN key (Turn Token ID and API token),
// checks that Cloudflare accepts it, stores both as Vercel production
// environment variables and deploys. The token is typed into this terminal
// only: it is not echoed, logged or written to disk.

import { spawnSync } from "node:child_process";
import { loadIceConfig } from "../src/lib/speaking-room/ice.ts";

const NAMES = { id: "CLOUDFLARE_TURN_KEY_ID", token: "CLOUDFLARE_TURN_API_TOKEN" } as const;

const stdin = process.stdin;
let pending = "";

/** Reads one line from the terminal; a hidden one is not echoed. Works when piped too. */
function prompt(question: string, hidden = false): Promise<string> {
  process.stdout.write(question);
  stdin.setEncoding("utf8");
  if (stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve) => {
    const take = () => {
      const end = pending.search(/[\r\n]/);
      if (end < 0) return false;
      const line = pending.slice(0, end);
      pending = pending.slice(end + 1).replace(/^\n/, "");
      stdin.off("data", onData);
      if (stdin.isTTY) stdin.setRawMode(false);
      stdin.pause();
      process.stdout.write("\n");
      resolve(line.trim());
      return true;
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\u0003") process.exit(130);
        if (char === "\u007f" || char === "\b") {
          if (pending && !hidden && stdin.isTTY) process.stdout.write("\b \b");
          pending = pending.slice(0, -1);
          continue;
        }
        pending += char;
        if (!hidden && stdin.isTTY && char !== "\r" && char !== "\n") process.stdout.write(char);
      }
      take();
    };
    if (!take()) stdin.on("data", onData);
  });
}

function vercel(args: string[], input?: string) {
  const result = spawnSync("npx", ["--yes", "vercel@latest", ...args], {
    input,
    stdio: input === undefined ? "inherit" : ["pipe", "inherit", "inherit"],
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

console.log(`
Speaking room relay (Cloudflare Realtime TURN)

1. Sign in at https://dash.cloudflare.com and open Realtime > TURN Server.
2. Create a TURN key. Cloudflare shows a Turn Token ID and an API token.
3. Paste them below.
`);

const id = await prompt("Turn Token ID: ");
const token = await prompt("API token (hidden): ", true);
if (!id || !token) {
  console.error("Both values are needed.");
  process.exit(1);
}

process.stdout.write("Checking the key with Cloudflare... ");
const config = await loadIceConfig({ [NAMES.id]: id, [NAMES.token]: token });
if (!config.relay) {
  console.error("Cloudflare refused it. Check that you copied the Turn Token ID and its API token.");
  process.exit(1);
}
console.log("ok");

for (const [name, value] of [
  [NAMES.id, id],
  [NAMES.token, token],
] as const) {
  // Read from stdin, stored as a secret, replacing any earlier value.
  if (!vercel(["env", "add", name, "--environment", "production", "--sensitive", "--force", "--yes"], value)) {
    console.error(`Could not save ${name} on Vercel. Is the Vercel CLI signed in (npx vercel login)?`);
    process.exit(1);
  }
}

console.log("\nSaved on Vercel. Deploying production so the room picks it up...\n");
if (!vercel(["deploy", "--prod", "--yes"])) process.exit(1);
console.log("\nDone. In the speaking room a call that needs it now shows \"Qua máy chủ chuyển tiếp\".");
