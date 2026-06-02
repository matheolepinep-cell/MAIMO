import { UserProvider } from '@/contexts/UserContext'
import { AccentColorProvider } from '@/contexts/AccentColorContext'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileSidebar } from '@/components/layout/MobileSidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <AccentColorProvider>
        <div className="flex min-h-screen bg-[#F0F4FF] overflow-x-hidden">
          <MobileSidebar />
          <Sidebar />
          <main className="flex-1 flex flex-col min-w-0 ml-11 md:ml-0 overflow-x-hidden">
            {children}
          </main>
        </div>
      </AccentColorProvider>
    </UserProvider>
  )
}
