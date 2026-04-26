import type { Metadata } from "next"
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google"
import { ClerkProvider } from "@clerk/nextjs"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"
import { cn } from "@/lib/utils"

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })
const instrumentSerif = Instrument_Serif({ weight: ["400"], style: ["normal", "italic"], subsets: ['latin'], variable: '--font-instrument-serif' })

export const metadata: Metadata = {
  title: "BrainMate – The AI that teaches, not just answers.",
  description: "BrainMate is an intelligent AI teacher for developers, students, and creators.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
      </head>
      <body className={cn('antialiased', geist.variable, geistMono.variable, instrumentSerif.variable)}>
        <ClerkProvider>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange={false}>
            {children}
          </ThemeProvider>
        </ClerkProvider>
      </body>
    </html>
  )
}
