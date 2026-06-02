import { UserProvider } from '@/contexts/UserContext'
import { AccentColorProvider } from '@/contexts/AccentColorContext'
import { MobileSidebarProvider } from '@/contexts/MobileSidebarContext'
import { NotificationProvider } from '@/contexts/NotificationContext'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileSidebar } from '@/components/layout/MobileSidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <AccentColorProvider>
        <MobileSidebarProvider>
          <NotificationProvider>
            <div className="flex min-h-screen bg-[#F0F4FF] overflow-x-hidden">
              <MobileSidebar />
              <Sidebar />
              <main className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
                {children}
              </main>
            </div>
          </NotificationProvider>
        </MobileSidebarProvider>
      </AccentColorProvider>
    </UserProvider>
  )
}
