"use server";

import { refresh } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseImport } from "@/lib/tests/import-schema";

export type ImportState = { errors?: string[]; imported?: number };

const RPC_ERRORS: Record<string, string> = {
  invalid_content: "Nội dung đề không hợp lệ hoặc quá dài.",
  invalid_answer_key: "Đề thiếu đáp án.",
  invalid_transcript: "Đề Listening thiếu lời thoại.",
  import_limit: "Bạn đã nhập quá 100 đề trong 24 giờ. Nghỉ một chút nhé.",
  test_in_use: "Đề này đã được phát cho một nhóm nên không xóa được.",
  not_found: "Không tìm thấy đề, hoặc đề không phải của bạn.",
};

function describeError(message: string | undefined, fallback: string) {
  const key = Object.keys(RPC_ERRORS).find((k) => message?.includes(k));
  return key ? RPC_ERRORS[key] : fallback;
}

/** Re-validates the pasted JSON on the server, then stores each test. */
export async function importTests(pasted: string): Promise<ImportState> {
  await requireUser();
  if (pasted.length > 600_000) return { errors: ["Khối JSON quá lớn."] };

  const parsed = parseImport(pasted);
  if (!parsed.ok) return { errors: parsed.errors };

  const supabase = await createClient();
  let imported = 0;
  for (const test of parsed.tests) {
    const { error } = await supabase.rpc("import_test", {
      p_skill: test.skill,
      p_part: test.part,
      p_title: test.title,
      p_question_types: test.question_types,
      p_content: test.content,
      p_duration_sec: test.duration_sec,
      p_answer_key: test.answer_key,
      p_transcript: test.transcript,
    });
    if (error) {
      refresh();
      return {
        imported,
        errors: [`"${test.title}": ${describeError(error.message, "không lưu được.")}`],
      };
    }
    imported += 1;
  }

  refresh();
  return { imported };
}

export async function deleteTest(testId: string): Promise<{ error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_test", { p_test_id: testId });
  if (error) return { error: describeError(error.message, "Không xóa được đề.") };
  refresh();
  return {};
}
