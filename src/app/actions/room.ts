"use server";

import { requireUser } from "@/lib/auth";
import { loadIceConfig, type IceConfig } from "@/lib/speaking-room/ice";

/** The servers a signed-in member's browser may use to set up the video call. */
export async function getIceConfig(): Promise<IceConfig> {
  await requireUser();
  return loadIceConfig(process.env);
}
