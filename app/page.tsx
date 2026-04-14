"use client";

import { RecordForm } from "@/components/record-form";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-2xl flex-col justify-center px-4 py-8">
      <h1 className="mb-8 text-center text-2xl font-bold text-ink md:text-3xl">
        訪問看護AI記録支援アプリ
      </h1>
      <RecordForm showVoiceControls={false} />
    </main>
  );
}
