// Row shapes for the tables in supabase/migrations. Kept by hand; replace with
// `supabase gen types typescript` output if the schema grows.

export type Skill = "reading" | "listening" | "writing" | "speaking";
export type GradeSource = "auto" | "claude-pro" | "peer";
export type MemberRole = "owner" | "member";

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  current_band: number | null;
  target_band: number;
  exam_date: string | null;
  onboarded_at: string | null;
  created_at: string;
};

export type Group = {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string;
  cutoff_time: string;
  full_test_sunday: boolean;
  created_at: string;
};

export type GroupMember = {
  group_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
};

export type TestRow = {
  id: string;
  skill: Skill;
  part: string;
  question_types: string[];
  title: string;
  content: unknown;
  duration_sec: number;
  audio_path: string | null;
  created_by: string | null;
  created_at: string;
};

export type DailySet = {
  id: string;
  group_id: string;
  date: string;
  reading_test_id: string | null;
  listening_test_id: string | null;
  writing_test_id: string | null;
  speaking_test_id: string | null;
  closes_at: string;
  created_at: string;
};

export type Attempt = {
  id: string;
  daily_set_id: string;
  user_id: string;
  skill: Skill;
  answers: Record<string, string> | null;
  essay_text: string | null;
  transcript: string | null;
  audio_path: string | null;
  speaking_seconds: number | null;
  started_at: string;
  submitted_at: string | null;
};

export type Grade = {
  id: string;
  attempt_id: string;
  band: number;
  raw_score: number | null;
  raw_total: number | null;
  criteria: unknown;
  feedback: unknown;
  source: GradeSource;
  graded_by: string | null;
  created_at: string;
};

export type PeerReview = {
  id: string;
  attempt_id: string;
  reviewer_id: string;
  band: number | null;
  comment: string | null;
  vote: boolean;
  created_at: string;
};

export type Streak = {
  user_id: string;
  group_id: string;
  current: number;
  best: number;
  last_full_day: string | null;
};

export type Badge = {
  id: string;
  user_id: string;
  code: string;
  earned_at: string;
};

export type ProgressRow = {
  user_id: string;
  skill: Skill;
  started_at: string;
  submitted_at: string | null;
};

/** What a form action returns to `useActionState`. */
export type ActionState = { error?: string; ok?: boolean } | undefined;
