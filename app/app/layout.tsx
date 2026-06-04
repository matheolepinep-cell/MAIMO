import { UserProvider } from '@/contexts/UserContext'
import { AccentColorProvider } from '@/contexts/AccentColorContext'
import { MobileSidebarProvider } from '@/contexts/MobileSidebarContext'
import { NotificationProvider } from '@/contexts/NotificationContext'
import { UnreadMessagesProvider } from '@/contexts/UnreadMessagesContext'
import { WorkspaceProvider } from '@/contexts/WorkspaceContext'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileSidebar } from '@/components/layout/MobileSidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <AccentColorProvider>
        <MobileSidebarProvider>
          <NotificationProvider>
            <UnreadMessagesProvider>
              <WorkspaceProvider>
                <div className="min-h-screen bg-[#F0F4FF]">
                  <MobileSidebar />
                  <Sidebar />
                  <main className="md:ml-[200px] min-h-screen overflow-y-auto overflow-x-hidden flex flex-col">
                    {children}
                  </main>
                </div>
              </WorkspaceProvider>
            </UnreadMessagesProvider>
          </NotificationProvider>
        </MobileSidebarProvider>
      </AccentColorProvider>
    </UserProvider>
  )
}
