import type { ListeningContent, ListeningTranscript, VoiceKind } from "@/lib/tests/types";

/** One stretch of the recording: a spoken line, or silence. */
export type Segment = { text: string; voice: string } | { silence: number };

// Kokoro voices per accent and gender, best-rated first. A second speaker of
// the same kind gets the next voice so two people never sound identical.
const VOICES: Record<VoiceKind, string[]> = {
  female_uk: ["bf_emma", "bf_isabella"],
  male_uk: ["bm_george", "bm_fable"],
  female_us: ["af_heart", "af_bella"],
  male_us: ["am_michael", "am_fenrir"],
};

const NARRATOR = "bm_lewis";

const ORDINALS = ["one", "two", "three", "four"];

/**
 * Turns a listening script into the running order of the real test: the
 * narrator introduces each part, there is time to read the questions, the
 * part plays once, then a short pause.
 */
export function buildSegments(content: ListeningContent, transcript: ListeningTranscript): Segment[] {
  const segments: Segment[] = [];

  for (const part of transcript.parts) {
    const context = content.parts.find((p) => p.part === part.part)?.context ?? "";
    const used: Partial<Record<VoiceKind, number>> = {};
    const voiceOf = new Map<string, string>();
    for (const speaker of part.speakers) {
      const index = used[speaker.voice] ?? 0;
      used[speaker.voice] = index + 1;
      const pool = VOICES[speaker.voice];
      voiceOf.set(speaker.id, pool[index % pool.length]);
    }

    segments.push(
      {
        text: `Part ${ORDINALS[part.part - 1] ?? part.part}. ${context} First, you have some time to look at the questions.`,
        voice: NARRATOR,
      },
      { silence: 12 },
      { text: "Now listen carefully and answer the questions.", voice: NARRATOR },
      { silence: 1 },
    );
    for (const line of part.script) {
      segments.push({ text: line.text, voice: voiceOf.get(line.speaker) ?? NARRATOR }, { silence: 0.45 });
    }
    segments.push(
      { silence: 1.5 },
      { text: `That is the end of part ${ORDINALS[part.part - 1] ?? part.part}.`, voice: NARRATOR },
      { silence: 4 },
    );
  }

  segments.push({ text: "That is the end of the recording. You now have time to check your answers.", voice: NARRATOR });
  return segments;
}
