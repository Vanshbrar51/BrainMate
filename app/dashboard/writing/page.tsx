
'use client'

import * as React from 'react';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@clerk/nextjs';
import { useErrorToast } from '@/lib/writeright-toast';
import {
  Mic, MicOff, Paperclip, ChevronDown, ChevronUp, ChevronRight, X, ArrowUpRight,
  Mail, MessageSquare, Linkedin, Globe, Copy, Check, RefreshCcw, Trash2, Plus,
  Share2, BookmarkPlus, Search, BarChart3, LayoutTemplate, Pencil, Wand2, ArrowRight
} from 'lucide-react';
import Link from 'next/link';

// --- I18n ---
const UI_LOCALE_MAP: Record<string, string> = {
  "hi": "hi", "hi-IN": "hi",
  "ar": "ar", "ar-SA": "ar",
  "fr": "fr", "fr-FR": "fr",
  "es": "es", "es-ES": "es", "es-419": "es",
  "pt": "pt", "pt-BR": "pt", "pt-PT": "pt",
  "de": "de", "de-DE": "de",
};

function useLocale(): string {
  return useMemo(() => {
    if (typeof navigator === "undefined") return "en";
    const lang = navigator.language ?? "en";
    return UI_LOCALE_MAP[lang] ?? UI_LOCALE_MAP[lang.split("-")[0]] ?? "en";
  }, []);
}

const STRINGS = {
  en: {
    hero_title: "WriteRight",
    hero_subtitle: "Improve your writing instantly",
    improve_btn: "Improve",
    before_label: "BEFORE",
    after_label: "IMPROVED",
    copy: "Copy", copied: "Copied!",
    teaching_summary: (n: number) => `${n} improvement${n === 1 ? "" : "s"} identified`,
    show_diff: "Show diff",
    expand: "Expand",
    save: "Save",
    share: "Share",
  },
} as const;

const RTL_LOCALES = new Set(["ar"]);

// --- Components ---

function describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number) {
  const polarToCartesian = (cx: number, cy: number, r: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return {
      x: cx + (r * Math.cos(angleInRadians)),
      y: cy + (r * Math.sin(angleInRadians))
    };
  }
  const start = polarToCartesian(x, y, radius, endAngle);
  const end = polarToCartesian(x, y, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  const d = ["M", start.x, start.y, "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y].join(" ");
  return d;
}

function ArcGauge({ score, label, prevScore }: { score: number; label: string; prevScore?: number }) {
  const RADIUS = 14;
  const SWEEP = 220;
  const circumference = 2 * Math.PI * RADIUS * (SWEEP / 360);
  const offset = circumference * (1 - (score / 10));
  const color = score >= 8 ? "var(--wr-score-good)" : score >= 5 ? "var(--wr-score-mid)" : "var(--wr-score-low)";
  const delta = prevScore !== undefined ? score - prevScore : null;

  return (
    <div className="flex flex-col items-center gap-1" aria-label={`${label}: ${score} out of 10`}>
      <div className="relative w-12 h-12">
        <svg viewBox="0 0 36 36" className="w-full h-full transform">
          <path d={describeArc(18, 18, RADIUS, -110, 110)} fill="none" stroke="var(--wr-border)" strokeWidth="3" strokeLinecap="round" />
          <path
            d={describeArc(18, 18, RADIUS, -110, 110)}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            className="wr-arc-fill"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ "--wr-arc-pct": `${score / 10}` } as React.CSSProperties}
          />
          <text x="18" y="22" className="text-xs font-semibold fill-current" textAnchor="middle">{score}</text>
        </svg>
      </div>
      <div className="flex items-center gap-1">
         <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{label}</span>
         {delta !== null && delta !== 0 && (
           <span className={`text-[9px] px-1 rounded-sm ${delta > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
             {delta > 0 ? "+" : ""}{delta}
           </span>
         )}
      </div>
    </div>
  );
}

function TransformPanel({ before, after, scores, strings }: { before: string; after: string; scores?: { clarity: number; tone: number; impact: number; verdict: string }; strings: Record<string, unknown> }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(after);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-[var(--wr-r-card)] border border-[var(--wr-border)] overflow-hidden shadow-sm flex flex-col">
      <div className="p-4 border-b border-[var(--wr-before-bdr)] bg-[var(--wr-before-bg)] relative group">
        <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
           <button className="text-xs font-medium text-gray-500 hover:text-gray-900 bg-white px-2 py-1 rounded shadow-sm border border-gray-200">{strings.show_diff as unknown as string}</button>
           <button className="text-xs font-medium text-gray-500 hover:text-gray-900 bg-white px-2 py-1 rounded shadow-sm border border-gray-200">{strings.expand as unknown as string}</button>
        </div>
        <h3 className="text-[10px] font-bold text-red-700 tracking-wider mb-2">{strings.before_label as unknown as string}</h3>
        <div className="text-[13px] text-[var(--wr-ink-3)] border-l-[3px] border-[var(--wr-before-bdr)] pl-3 max-h-16 overflow-hidden relative">
          {before}
          <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[var(--wr-before-bg)] to-transparent pointer-events-none"></div>
        </div>
      </div>

      <div className="p-5 bg-[var(--wr-after-bg)] relative">
        <div className="absolute top-4 right-4 flex gap-2">
           <button onClick={handleCopy} className="flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-900 bg-green-50 hover:bg-green-100 px-2 py-1 rounded shadow-sm border border-green-200 transition-all">
             {copied ? <Check size={12}/> : <Copy size={12}/>}
             {copied ? strings.copied as unknown as string : strings.copy as unknown as string}
           </button>
        </div>
        <h3 className="text-[10px] font-bold text-green-700 tracking-wider mb-2">{strings.after_label as unknown as string}</h3>
        <div className={`text-[15px] text-[var(--wr-ink)] font-medium border-l-[3px] border-[var(--wr-after-bdr)] pl-4 leading-relaxed wr-after-text ${copied ? 'wr-copy-flash' : ''}`} data-animate="true">
          {after.split(' ').map((word: string, i: number) => (
            <span key={i} data-w="true" style={{ "--w-idx": i } as React.CSSProperties}>{word} </span>
          ))}
        </div>
      </div>

      {scores && (
         <div className="p-4 bg-gray-50 border-t border-[var(--wr-border)] flex justify-between items-center">
            <div className="flex gap-4">
              <ArcGauge score={scores.clarity} label="Clarity" />
              <ArcGauge score={scores.tone} label="Tone" />
              <ArcGauge score={scores.impact} label="Impact" />
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-[var(--wr-accent)]">{scores.verdict}</div>
            </div>
         </div>
      )}
    </div>
  );
}

export default function WriteRightPage() {
  const locale = useLocale();
  const isRtl = RTL_LOCALES.has(locale);
  const strings = STRINGS[locale as keyof typeof STRINGS] || STRINGS.en;

  const [hasStarted, setHasStarted] = useState(true); // default true for preview
  const [inputText, setInputText] = useState("");
  const [mode, setMode] = useState("email");
  const [tone, setTone] = useState("Professional");

  return (
    <div
      className="flex h-screen bg-[var(--wr-surface)] text-[var(--wr-ink)]"
      dir={isRtl ? "rtl" : "ltr"}
      style={{ fontFamily: "var(--wr-body)" }}
    >
      <div className="flex-1 flex flex-col overflow-hidden">
         {/* Main feed */}
         <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
            <div className="max-w-3xl mx-auto w-full flex justify-end">
               <div className="bg-gray-100 border border-gray-200 rounded-2xl rounded-tr-sm p-3 max-w-[75%] text-[14px]">
                 I need to tell my team the project is delayed because of the vendor, and they need to wait until Friday.
               </div>
            </div>

            <div className="max-w-3xl mx-auto w-full">
               <TransformPanel
                 before="I need to tell my team the project is delayed because of the vendor, and they need to wait until Friday."
                 after="Please note that the project timeline has been extended to this Friday due to unexpected vendor delays. Thank you for your patience as we resolve this."
                 scores={{ clarity: 9, tone: 8, impact: 8, verdict: "Ready to send" }}
                 strings={strings}
               />
            </div>
         </div>

         {/* Input bar */}
         <div className="p-4 bg-[var(--wr-surface)] border-t border-[var(--wr-border)]">
            <div className="max-w-3xl mx-auto w-full bg-white rounded-[var(--wr-r-card)] border border-[var(--wr-border)] overflow-hidden shadow-sm focus-within:ring-2 ring-[var(--wr-accent-ring)] transition-all">
               <div className="flex border-b border-[var(--wr-border)]" role="tablist">
                  {['email', 'paragraph', 'linkedin', 'whatsapp'].map(m => (
                    <button
                      key={m}
                      role="tab"
                      aria-selected={mode === m}
                      onClick={() => setMode(m)}
                      className={`px-4 py-2 text-sm font-medium capitalize ${mode === m ? 'border-b-2 border-[var(--wr-accent)] text-[var(--wr-accent)]' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                      {m === 'linkedin' ? 'in LinkedIn' : m}
                    </button>
                  ))}
               </div>
               <div className="p-2 border-b border-[var(--wr-border)] flex gap-2 overflow-x-auto">
                  {['Professional', 'Friendly', 'Concise', 'Academic', 'Assertive'].map(t => (
                    <button
                      key={t}
                      aria-pressed={tone === t}
                      onClick={() => setTone(t)}
                      className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition-colors ${tone === t ? 'bg-[var(--wr-accent-dim)] text-[var(--wr-accent)]' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {t}
                    </button>
                  ))}
               </div>
               <div className="p-3 relative">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Paste your email draft or type..."
                    className="w-full h-[60px] resize-none outline-none text-base bg-transparent p-1"
                  />
                  <div className="absolute bottom-3 right-3 text-xs text-gray-400">
                    {inputText.length > 100 && `${inputText.length} / 10000`}
                  </div>
               </div>
               <div className="p-3 bg-gray-50 border-t border-[var(--wr-border)] flex justify-between items-center">
                  <div className="flex gap-2">
                     <button className="p-2 text-gray-500 hover:bg-gray-200 rounded-lg"><Mic size={18}/></button>
                     <button className="p-2 text-gray-500 hover:bg-gray-200 rounded-lg"><Paperclip size={18}/></button>
                  </div>
                  <button
                    disabled={!inputText.trim()}
                    className="px-4 py-2 bg-[var(--mod-write)] text-white font-medium rounded-[var(--wr-r-btn)] flex items-center gap-2 disabled:opacity-50 transition-all hover:bg-purple-700"
                  >
                    <Wand2 size={16}/>
                    {strings.improve_btn as unknown as string}
                  </button>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
}
