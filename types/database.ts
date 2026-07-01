export type UserRole = 'admin' | 'commercial'
export type WorkspaceRole = 'admin' | 'member' | 'contributeur'

export interface UserProfile {
  id: string
  email: string
  full_name: string
  role: UserRole
  company_id: string
  is_active: boolean
  is_super_admin?: boolean
  created_at: string
  google_calendar_connected?: boolean
  has_set_password?: boolean
  onboarding_completed?: boolean
  onboarding_steps_completed?: number[]
  phone?: string | null
}

export interface Workspace {
  id: string
  company_id: string
  name: string
  description: string | null
  color: string
  created_by: string | null
  created_at: string
  is_default: boolean
  role?: WorkspaceRole
  company_name?: string | null
  company_sector?: string | null
  company_description?: string | null
  company_services?: string | null
  company_zone?: string | null
  company_clients_type?: string | null
  company_values?: string | null
  company_differentiator?: string | null
}

export interface WorkspaceMember {
  id: string
  workspace_id: string
  user_id: string
  role: WorkspaceRole
  is_active: boolean
  created_at: string
}

export interface Company {
  id: string
  name: string
  created_at: string
}

export interface Account {
  id: string
  company_id: string
  name: string
  description: string | null
  siret: string | null
  address: string | null
  city: string | null
  postal_code: string | null
  phone: string | null
  email: string | null
  website: string | null
  industry: string | null
  revenue: string | null
  employees: string | null
  notes_general: string | null
  status: 'client' | 'prospect'
  created_by: string | null
  created_at: string
  last_note_at: string | null
}

export interface Contact {
  id: string
  company_id: string
  account_id: string
  first_name: string
  last_name: string
  role: string | null
  phone: string | null
  email: string | null
  notes: string | null
  is_main_contact: boolean
  created_at: string
}

export interface Note {
  id: string
  account_id: string
  company_id: string
  user_id: string
  title: string | null
  content: string
  source: 'vocal' | 'text'
  is_deleted: boolean
  created_at: string
}

export interface Document {
  id: string
  account_id: string
  company_id: string
  user_id: string
  note_id: string | null
  folder_id: string | null
  file_name: string
  file_url: string
  file_size: number | null
  file_type: 'pdf' | 'docx' | 'xlsx' | 'image'
  title: string | null
  is_deleted: boolean
  is_indexed: boolean
  indexed_at: string | null
  created_at: string
}

export interface Chunk {
  id: string
  company_id: string
  account_id: string
  source_type: 'note' | 'document'
  source_id: string
  content: string
  embedding: number[]
  created_at: string
}

export interface Permission {
  id: string
  user_id: string
  client_id: string
  company_id: string
  can_read: boolean
  created_at: string
}

export interface Portfolio {
  id: string
  company_id: string
  user_id: string
  account_id: string
  is_private: boolean
  visibility: 'team' | 'private' | 'custom'
  created_at: string
}

export interface PortfolioAccess {
  id: string
  portfolio_id: string
  user_id: string
  created_at: string
}

export interface Notification {
  id: string
  account_id: string | null
  user_id: string
  type: 'note_added' | 'document_added' | 'document_shared' | 'message_received' | 'company_updated'
  title: string
  body: string | null
  data: Record<string, string>
  read: boolean
  created_at: string
}

export interface MutedCompany {
  id: string
  user_id: string
  company_id: string
  created_at: string
}

export interface SearchSource {
  type: 'note' | 'document'
  id: string
  title: string
  date?: string
  author?: string
  file_name?: string
  url?: string
  company_name?: string
  account_id?: string
  excerpt?: string
}
