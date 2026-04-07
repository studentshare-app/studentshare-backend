export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      notes: {
        Row: {
          id: string
          user_id: string
          title: string | null
          body: string | null
          color: string | null
          is_starred: boolean
          source: string | null
          course_id: string | null
          is_deleted: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title?: string | null
          body?: string | null
          color?: string | null
          is_starred?: boolean
          source?: string | null
          course_id?: string | null
          is_deleted?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string | null
          body?: string | null
          color?: string | null
          is_starred?: boolean
          source?: string | null
          course_id?: string | null
          is_deleted?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      posts: {
        Row: {
          id: string
          author_id: string
          title: string | null
          body: string | null
          image_url: string | null
          poll_options: Json | null
          reply_to_id: string | null
          is_anonymous: boolean
          deleted: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          author_id: string
          title?: string | null
          body?: string | null
          image_url?: string | null
          poll_options?: Json | null
          reply_to_id?: string | null
          is_anonymous?: boolean
          deleted?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          author_id?: string
          title?: string | null
          body?: string | null
          image_url?: string | null
          poll_options?: Json | null
          reply_to_id?: string | null
          is_anonymous?: boolean
          deleted?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      conversations: {
        Row: {
          id: string
          type: string
          other_user_id: string | null
          other_user_name: string | null
          other_user_avatar: string | null
          unread_count: number
          last_message: string | null
          last_message_at: string | null
          deleted: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          type: string
          other_user_id?: string | null
          other_user_name?: string | null
          other_user_avatar?: string | null
          unread_count?: number
          last_message?: string | null
          last_message_at?: string | null
          deleted?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          type?: string
          other_user_id?: string | null
          other_user_name?: string | null
          other_user_avatar?: string | null
          unread_count?: number
          last_message?: string | null
          last_message_at?: string | null
          deleted?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          sender_id: string
          content: string
          status: string
          deleted: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          sender_id: string
          content: string
          status?: string
          deleted?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          conversation_id?: string
          sender_id?: string
          content?: string
          status?: string
          deleted?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      download_folders: {
        Row: {
          id: string
          user_id: string
          name: string
          color: string
          material_ids: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          color: string
          material_ids?: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          color?: string
          material_ids?: string[]
          created_at?: string
          updated_at?: string
        }
      }
      materials: {
        Row: {
          id: string
          title: string
          course_id: string | null
          file_url: string
          type: string
          download_status: string
          local_path: string | null
          deleted: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          course_id?: string | null
          file_url: string
          type: string
          download_status?: string
          local_path?: string | null
          deleted?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          course_id?: string | null
          file_url?: string
          type?: string
          download_status?: string
          local_path?: string | null
          deleted?: boolean
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
