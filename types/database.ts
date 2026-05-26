export type UserRole = 'admin' | 'commercial'

export interface UserProfile {
  id: string
  email: string
  full_name: string
  role: UserRole
  company_id: string
  is_active: boolean
  created_at: string
}

export interface Company {
  id: string
  name: string
  created_at: string
}

export interface Client {
  id: string
  company_id: string
  name: string
  description: string | null
  created_at: string
  last_note_at: string | null
  notes_count?: number
}

export interface Note {
  id: string
  client_id: string
  company_id: string
  user_id: string
  content: string
  source: 'vocal' | 'text'
  is_deleted: boolean
  created_at: string
}

export interface Document {
  id: string
  client_id: string
  company_id: string
  uploaded_by: string
  file_name: string
  file_url: string
  file_type: 'pdf' | 'docx' | 'xlsx'
  is_indexed: boolean
  created_at: string
}

export interface Chunk {
  id: string
  company_id: string
  client_id: string
  source_type: 'note' | 'document'
  source_id: string
  content: string
  embedding: number[]
  metadata: Record<string, unknown>
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
