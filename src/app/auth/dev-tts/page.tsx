import { notFound } from "next/navigation";
import { TtsRenderer } from "./renderer";

// A local tool for rendering the bank's listening audio; it does not exist in production.
export default function DevTtsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <TtsRenderer />;
}
