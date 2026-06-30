import { UserProvider } from '@/contexts/UserContext'
import { AccentColorProvider } from '@/contexts/AccentColorContext'
import { MobileSidebarProvider } from '@/contexts/MobileSidebarContext'
import { UnreadMessagesProvider } from '@/contexts/UnreadMessagesContext'
import { WorkspaceProvider } from '@/contexts/WorkspaceContext'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileSidebar } from '@/components/layout/MobileSidebar'
import { SetPasswordBanner } from '@/components/layout/SetPasswordBanner'
import OnboardingChecklist from '@/components/onboarding/OnboardingChecklist'
import { QuickNoteModal } from '@/components/notes/QuickNoteModal'
import SupportWidgetLoader from '@/components/SupportWidgetLoader'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <AccentColorProvider>
        <MobileSidebarProvider>
          <UnreadMessagesProvider>
              <WorkspaceProvider>
                <div className="min-h-screen bg-[#F5F5F5]">
                  <MobileSidebar />
                  <Sidebar />
                  <main className="lg:ml-[200px] min-h-screen overflow-y-auto overflow-x-hidden flex flex-col">
                    <SetPasswordBanner />
                    {children}
                  </main>
                  <OnboardingChecklist />
                  <QuickNoteModal />
                  <SupportWidgetLoader />
                </div>
              </WorkspaceProvider>
            </UnreadMessagesProvider>
        </MobileSidebarProvider>
      </AccentColorProvider>
    </UserProvider>
  )
}
