import "server-only";
import listening from "@/content/bank/listening.json";
import reading from "@/content/bank/reading.json";
import speaking from "@/content/bank/speaking.json";
import writing from "@/content/bank/writing.json";
import type { ImportableTest } from "@/lib/tests/import-schema";

// The pre-written bank, built from content/bank by `npm run bank:build`.
// Server-only: these files hold the answer keys.
export type BankTest = ImportableTest & { key: string };

export const bankTests = [...reading, ...listening, ...writing, ...speaking] as unknown as BankTest[];
