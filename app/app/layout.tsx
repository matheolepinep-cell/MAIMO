import { UserProvider } from '@/contexts/UserContext'
import { AccentColorProvider } from '@/contexts/AccentColorContext'
import { Sidebar } from '@/components/layout/Sidebar'
import { BottomNav } from '@/components/layout/BottomNav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <AccentColorProvider>
        <div className="flex min-h-screen bg-[#F0F4FF] overflow-x-hidden">
          <Sidebar />
          <main className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0 overflow-x-hidden">
            {children}
          </main>
          <BottomNav />
        </div>
      </AccentColorProvider>
    </UserProvider>
  )
}
