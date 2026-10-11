import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro, Geist_Mono } from "next/font/google";
import { ThemeScript } from "@/components/theme";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const beVietnam = Be_Vietnam_Pro({
  variable: "--font-be-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "IELTS Squad", template: "%s · IELTS Squad" },
  description:
    "Ôn IELTS Academic theo nhóm: mỗi ngày một bộ đề đủ 4 kỹ năng, cùng nhau lên band 8.0.",
};

export const viewport: Viewport = {
  themeColor: "#12141f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="vi"
      className={`dark ${beVietnam.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeScript />
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
