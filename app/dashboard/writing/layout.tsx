// app/dashboard/writing/layout.tsx — SERVER COMPONENT
// This layout intentionally bypasses DashboardShell to render WriteRight full-screen.
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function WritingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: '#f5f4ef' }}>
      {children}
    </div>
  )
}
