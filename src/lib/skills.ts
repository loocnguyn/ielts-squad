import { BookOpen, Headphones, Mic, PenLine, type LucideIcon } from "lucide-react";
import type { Skill } from "@/lib/types";

export const SKILLS: Skill[] = ["reading", "listening", "writing", "speaking"];

export const SKILL_META: Record<
  Skill,
  {
    label: string;
    icon: LucideIcon;
    /** CSS variable holding the skill color, defined in globals.css. */
    color: string;
    text: string;
    bg: string;
    border: string;
  }
> = {
  reading: {
    label: "Reading",
    icon: BookOpen,
    color: "var(--skill-reading)",
    text: "text-skill-reading",
    bg: "bg-skill-reading",
    border: "border-skill-reading",
  },
  listening: {
    label: "Listening",
    icon: Headphones,
    color: "var(--skill-listening)",
    text: "text-skill-listening",
    bg: "bg-skill-listening",
    border: "border-skill-listening",
  },
  writing: {
    label: "Writing",
    icon: PenLine,
    color: "var(--skill-writing)",
    text: "text-skill-writing",
    bg: "bg-skill-writing",
    border: "border-skill-writing",
  },
  speaking: {
    label: "Speaking",
    icon: Mic,
    color: "var(--skill-speaking)",
    text: "text-skill-speaking",
    bg: "bg-skill-speaking",
    border: "border-skill-speaking",
  },
};

export function isSkill(value: string): value is Skill {
  return (SKILLS as string[]).includes(value);
}
