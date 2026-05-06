import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Metadata } from 'next';

interface SharePageProps {
  params: Promise<{ token: string }>;
}

async function getShareData(token: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const res = await fetch(`${appUrl}/api/writeright/public/share/${token}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    return null;
  }

  return res.json();
}

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'WriteRight | Shared Document',
    description: 'A document improved by WriteRight',
  };
}

export default async function SharePage({ params }: SharePageProps) {
  const { token } = await params;
  const data = await getShareData(token);

  if (!data) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center py-12 px-4 sm:px-6">
      <div className="w-full max-w-3xl flex items-center justify-between mb-8">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-[var(--mod-write)] flex items-center justify-center text-white">
            <Sparkles size={16} />
          </div>
          <span className="text-xl font-medium tracking-tight" style={{ fontFamily: "var(--font-display)", fontStyle: "italic" }}>
            WriteRight
          </span>
        </div>
        <Link
          href="/"
          className="px-4 py-2 bg-[var(--mod-write)] text-white text-sm font-medium rounded-full hover:bg-purple-700 transition-colors"
        >
          Try WriteRight
        </Link>
      </div>

      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-sm border border-[var(--border)] overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-[var(--border)] flex items-center gap-3 text-sm text-gray-500">
          <span className="font-medium bg-gray-200 px-2 py-0.5 rounded text-gray-700 capitalize">{data.mode}</span>
          <span>•</span>
          <span className="capitalize">{data.tone} tone</span>
        </div>

        <div className="p-6 md:p-8 space-y-8">
          <div>
            <h3 className="text-xs font-bold text-gray-400 tracking-wider mb-3">BEFORE</h3>
            <div className="p-4 rounded-xl bg-[var(--wr-before-bg)] border-l-4 border-[var(--wr-before-bdr)] text-gray-700 text-sm md:text-base whitespace-pre-wrap">
              {data.before}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-bold text-green-600 tracking-wider mb-3">IMPROVED</h3>
            <div className="p-4 md:p-5 rounded-xl bg-[var(--wr-after-bg)] border-l-4 border-[var(--wr-after-bdr)] text-gray-900 font-medium text-base md:text-lg whitespace-pre-wrap leading-relaxed shadow-sm">
              {data.after}
            </div>
          </div>
        </div>

        {data.scores && (
          <div className="bg-gray-50 p-4 border-t border-[var(--border)] flex justify-between items-center text-sm">
             <div className="flex gap-4">
                <span className="text-gray-600">Clarity: <strong className="text-gray-900">{data.scores.clarity}/10</strong></span>
                <span className="text-gray-600">Tone: <strong className="text-gray-900">{data.scores.tone}/10</strong></span>
                <span className="text-gray-600">Impact: <strong className="text-gray-900">{data.scores.impact}/10</strong></span>
             </div>
             <span className="font-medium text-[var(--mod-write)]">{data.scores.verdict}</span>
          </div>
        )}
      </div>

      <div className="mt-8 text-center text-sm text-gray-500">
        Shared on {new Date(data.created_at).toLocaleDateString()}
      </div>
    </div>
  );
}
