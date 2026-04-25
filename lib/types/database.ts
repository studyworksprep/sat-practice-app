// Auto-generated TypeScript types for the Supabase schema.
//
// DO NOT edit by hand. Regenerated whenever a migration lands via:
//
//   supabase gen types typescript --project-id noqtadytxyslkoetchrs
//
// or by invoking the Supabase MCP `generate_typescript_types` tool.
// The Database export below is consumed by lib/types/db.ts (which
// re-exports the Tables<>/Row<> aliases the rest of the codebase
// imports) so call sites never reach into this file directly.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      act_answer_options: {
        Row: {
          content_html: string
          id: string
          is_correct: boolean
          label: string
          ordinal: number
          question_id: string
        }
        Insert: {
          content_html: string
          id?: string
          is_correct?: boolean
          label: string
          ordinal: number
          question_id: string
        }
        Update: {
          content_html?: string
          id?: string
          is_correct?: boolean
          label?: string
          ordinal?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "act_answer_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "act_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      act_attempts: {
        Row: {
          created_at: string
          id: string
          is_correct: boolean
          question_id: string
          selected_option_id: string | null
          source: string
          time_spent_ms: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_correct: boolean
          question_id: string
          selected_option_id?: string | null
          source?: string
          time_spent_ms?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_correct?: boolean
          question_id?: string
          selected_option_id?: string | null
          source?: string
          time_spent_ms?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "act_attempts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "act_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "act_attempts_selected_option_id_fkey"
            columns: ["selected_option_id"]
            isOneToOne: false
            referencedRelation: "act_answer_options"
            referencedColumns: ["id"]
          },
        ]
      }
      act_questions: {
        Row: {
          category: string
          category_code: string | null
          created_at: string
          difficulty: number | null
          external_id: string | null
          highlight_ref: number | null
          id: string
          is_broken: boolean
          is_modeling: boolean
          question_type: string
          rationale_html: string | null
          section: string
          source_ordinal: number | null
          source_test: string | null
          stem_html: string
          stimulus_html: string | null
          subcategory: string | null
          subcategory_code: string | null
        }
        Insert: {
          category: string
          category_code?: string | null
          created_at?: string
          difficulty?: number | null
          external_id?: string | null
          highlight_ref?: number | null
          id?: string
          is_broken?: boolean
          is_modeling?: boolean
          question_type?: string
          rationale_html?: string | null
          section: string
          source_ordinal?: number | null
          source_test?: string | null
          stem_html: string
          stimulus_html?: string | null
          subcategory?: string | null
          subcategory_code?: string | null
        }
        Update: {
          category?: string
          category_code?: string | null
          created_at?: string
          difficulty?: number | null
          external_id?: string | null
          highlight_ref?: number | null
          id?: string
          is_broken?: boolean
          is_modeling?: boolean
          question_type?: string
          rationale_html?: string | null
          section?: string
          source_ordinal?: number | null
          source_test?: string | null
          stem_html?: string
          stimulus_html?: string | null
          subcategory?: string | null
          subcategory_code?: string | null
        }
        Relationships: []
      }
      answer_options: {
        Row: {
          content_html: string
          content_text: string | null
          created_at: string
          id: string
          label: string | null
          metadata: Json | null
          ordinal: number
          question_version_id: string
        }
        Insert: {
          content_html: string
          content_text?: string | null
          created_at?: string
          id: string
          label?: string | null
          metadata?: Json | null
          ordinal: number
          question_version_id: string
        }
        Update: {
          content_html?: string
          content_text?: string | null
          created_at?: string
          id?: string
          label?: string | null
          metadata?: Json | null
          ordinal?: number
          question_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "answer_options_question_version_id_fkey"
            columns: ["question_version_id"]
            isOneToOne: false
            referencedRelation: "question_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answer_options_question_version_id_fkey"
            columns: ["question_version_id"]
            isOneToOne: false
            referencedRelation: "questions_current"
            referencedColumns: ["question_version_id"]
          },
        ]
      }
      assignment_students_v2: {
        Row: {
          assignment_id: string
          completed_at: string | null
          created_at: string
          student_id: string
        }
        Insert: {
          assignment_id: string
          completed_at?: string | null
          created_at?: string
          student_id: string
        }
        Update: {
          assignment_id?: string
          completed_at?: string | null
          created_at?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_students_v2_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_students_v2_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_students_v2_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_students_v2_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      assignments_v2: {
        Row: {
          archived_at: string | null
          assignment_type: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          due_date: string | null
          filter_criteria: Json | null
          id: string
          lesson_id: string | null
          practice_test_id: string | null
          question_ids: string[] | null
          teacher_id: string
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          archived_at?: string | null
          assignment_type: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          filter_criteria?: Json | null
          id?: string
          lesson_id?: string | null
          practice_test_id?: string | null
          question_ids?: string[] | null
          teacher_id: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          archived_at?: string | null
          assignment_type?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          due_date?: string | null
          filter_criteria?: Json | null
          id?: string
          lesson_id?: string | null
          practice_test_id?: string | null
          question_ids?: string[] | null
          teacher_id?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_v2_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_v2_practice_test_id_fkey"
            columns: ["practice_test_id"]
            isOneToOne: false
            referencedRelation: "practice_tests_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_v2_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_v2_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_v2_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      attempts: {
        Row: {
          created_at: string
          id: string
          is_correct: boolean
          question_id: string
          response_json: Json | null
          response_text: string | null
          selected_option_id: string | null
          source: string
          time_spent_ms: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_correct: boolean
          question_id: string
          response_json?: Json | null
          response_text?: string | null
          selected_option_id?: string | null
          source?: string
          time_spent_ms?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_correct?: boolean
          question_id?: string
          response_json?: Json | null
          response_text?: string | null
          selected_option_id?: string | null
          source?: string
          time_spent_ms?: number | null
          user_id?: string
        }
        Relationships: []
      }
      bug_reports: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          image_url: string | null
          status: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          image_url?: string | null
          status?: string
          title?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          image_url?: string | null
          status?: string
          title?: string
        }
        Relationships: []
      }
      class_enrollments: {
        Row: {
          class_id: string
          created_at: string | null
          student_id: string
        }
        Insert: {
          class_id: string
          created_at?: string | null
          student_id: string
        }
        Update: {
          class_id?: string
          created_at?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      class_invites: {
        Row: {
          class_id: string
          code: string
          created_at: string | null
          expires_at: string | null
          id: string
          max_uses: number | null
          uses: number
        }
        Insert: {
          class_id: string
          code: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          uses?: number
        }
        Update: {
          class_id?: string
          code?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "class_invites_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          created_at: string | null
          id: string
          name: string
          teacher_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          teacher_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      concept_tags: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      correct_answers: {
        Row: {
          answer_type: string
          correct_number: number | null
          correct_option_id: string | null
          correct_option_ids: string[] | null
          correct_text: string | null
          created_at: string
          id: string
          numeric_tolerance: number | null
          question_version_id: string
        }
        Insert: {
          answer_type: string
          correct_number?: number | null
          correct_option_id?: string | null
          correct_option_ids?: string[] | null
          correct_text?: string | null
          created_at?: string
          id: string
          numeric_tolerance?: number | null
          question_version_id: string
        }
        Update: {
          answer_type?: string
          correct_number?: number | null
          correct_option_id?: string | null
          correct_option_ids?: string[] | null
          correct_text?: string | null
          created_at?: string
          id?: string
          numeric_tolerance?: number | null
          question_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "correct_answers_correct_option_id_fkey"
            columns: ["correct_option_id"]
            isOneToOne: false
            referencedRelation: "answer_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correct_answers_question_version_id_fkey"
            columns: ["question_version_id"]
            isOneToOne: false
            referencedRelation: "question_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "correct_answers_question_version_id_fkey"
            columns: ["question_version_id"]
            isOneToOne: false
            referencedRelation: "questions_current"
            referencedColumns: ["question_version_id"]
          },
        ]
      }
      desmos_saved_states: {
        Row: {
          created_at: string
          id: string
          question_id: string
          saved_by: string
          state_json: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          question_id: string
          saved_by: string
          state_json: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          question_id?: string
          saved_by?: string
          state_json?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "desmos_saved_states_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "desmos_saved_states_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "questions_current"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "desmos_saved_states_saved_by_fkey"
            columns: ["saved_by"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "desmos_saved_states_saved_by_fkey"
            columns: ["saved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "desmos_saved_states_saved_by_fkey"
            columns: ["saved_by"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: string | null
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string | null
        }
        Relationships: []
      }
      flashcard_sets: {
        Row: {
          created_at: string | null
          id: string
          is_default: boolean
          name: string
          parent_set_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_default?: boolean
          name: string
          parent_set_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_default?: boolean
          name?: string
          parent_set_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_sets_parent_set_id_fkey"
            columns: ["parent_set_id"]
            isOneToOne: false
            referencedRelation: "flashcard_sets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_sets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_sets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_sets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      flashcards: {
        Row: {
          back: string
          created_at: string | null
          front: string
          id: string
          mastery: number
          reviewed_at: string | null
          set_id: string
        }
        Insert: {
          back: string
          created_at?: string | null
          front: string
          id?: string
          mastery?: number
          reviewed_at?: string | null
          set_id: string
        }
        Update: {
          back?: string
          created_at?: string | null
          front?: string
          id?: string
          mastery?: number
          reviewed_at?: string | null
          set_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_set_id_fkey"
            columns: ["set_id"]
            isOneToOne: false
            referencedRelation: "flashcard_sets"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_assignment_students: {
        Row: {
          assignment_id: string
          created_at: string | null
          student_id: string
        }
        Insert: {
          assignment_id: string
          created_at?: string | null
          student_id: string
        }
        Update: {
          assignment_id?: string
          created_at?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_assignment_students_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "lesson_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_assignment_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_assignment_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_assignment_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      lesson_assignments: {
        Row: {
          created_at: string | null
          due_date: string | null
          id: string
          lesson_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string | null
          due_date?: string | null
          id?: string
          lesson_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string | null
          due_date?: string | null
          id?: string
          lesson_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_assignments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      lesson_blocks: {
        Row: {
          block_type: string
          content: Json
          created_at: string | null
          id: string
          lesson_id: string
          sort_order: number
        }
        Insert: {
          block_type: string
          content?: Json
          created_at?: string | null
          id?: string
          lesson_id: string
          sort_order?: number
        }
        Update: {
          block_type?: string
          content?: Json
          created_at?: string | null
          id?: string
          lesson_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "lesson_blocks_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          check_answers: Json
          completed_at: string | null
          completed_blocks: string[]
          lesson_id: string
          started_at: string | null
          student_id: string
        }
        Insert: {
          check_answers?: Json
          completed_at?: string | null
          completed_blocks?: string[]
          lesson_id: string
          started_at?: string | null
          student_id: string
        }
        Update: {
          check_answers?: Json
          completed_at?: string | null
          completed_blocks?: string[]
          lesson_id?: string
          started_at?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      lesson_topics: {
        Row: {
          domain_name: string
          id: string
          lesson_id: string
          skill_code: string | null
        }
        Insert: {
          domain_name: string
          id?: string
          lesson_id: string
          skill_code?: string | null
        }
        Update: {
          domain_name?: string
          id?: string
          lesson_id?: string
          skill_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_topics_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          author_id: string
          created_at: string | null
          description: string | null
          id: string
          status: string
          title: string
          updated_at: string | null
          visibility: string
        }
        Insert: {
          author_id: string
          created_at?: string | null
          description?: string | null
          id?: string
          status?: string
          title: string
          updated_at?: string | null
          visibility?: string
        }
        Update: {
          author_id?: string
          created_at?: string | null
          description?: string | null
          id?: string
          status?: string
          title?: string
          updated_at?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      manager_teacher_assignments: {
        Row: {
          created_at: string | null
          manager_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string | null
          manager_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string | null
          manager_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_teacher_assignments_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_teacher_assignments_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_teacher_assignments_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "manager_teacher_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_teacher_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_teacher_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      practice_sessions: {
        Row: {
          created_at: string
          current_position: number
          draft_answers: Json
          expires_at: string
          filter_criteria: Json
          id: string
          last_activity_at: string
          mode: string
          question_ids: Json
          status: string
          test_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_position?: number
          draft_answers?: Json
          expires_at?: string
          filter_criteria?: Json
          id?: string
          last_activity_at?: string
          mode?: string
          question_ids?: Json
          status?: string
          test_type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_position?: number
          draft_answers?: Json
          expires_at?: string
          filter_criteria?: Json
          id?: string
          last_activity_at?: string
          mode?: string
          question_ids?: Json
          status?: string
          test_type?: string
          user_id?: string
        }
        Relationships: []
      }
      practice_test_attempts: {
        Row: {
          adaptive_version: string | null
          composite_score: number | null
          finished_at: string | null
          id: string
          math_scaled: number | null
          metadata: Json
          practice_test_id: string
          rw_scaled: number | null
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          adaptive_version?: string | null
          composite_score?: number | null
          finished_at?: string | null
          id?: string
          math_scaled?: number | null
          metadata?: Json
          practice_test_id: string
          rw_scaled?: number | null
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          adaptive_version?: string | null
          composite_score?: number | null
          finished_at?: string | null
          id?: string
          math_scaled?: number | null
          metadata?: Json
          practice_test_id?: string
          rw_scaled?: number | null
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      practice_test_attempts_v2: {
        Row: {
          adaptive_version: string | null
          composite_score: number | null
          finished_at: string | null
          id: string
          math_scaled: number | null
          practice_test_id: string
          rw_scaled: number | null
          source: string
          started_at: string
          status: string
          time_multiplier: number
          uploaded_by: string | null
          user_id: string
        }
        Insert: {
          adaptive_version?: string | null
          composite_score?: number | null
          finished_at?: string | null
          id?: string
          math_scaled?: number | null
          practice_test_id: string
          rw_scaled?: number | null
          source?: string
          started_at?: string
          status: string
          time_multiplier?: number
          uploaded_by?: string | null
          user_id: string
        }
        Update: {
          adaptive_version?: string | null
          composite_score?: number | null
          finished_at?: string | null
          id?: string
          math_scaled?: number | null
          practice_test_id?: string
          rw_scaled?: number | null
          source?: string
          started_at?: string
          status?: string
          time_multiplier?: number
          uploaded_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_test_attempts_v2_practice_test_id_fkey"
            columns: ["practice_test_id"]
            isOneToOne: false
            referencedRelation: "practice_tests_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_test_item_attempts: {
        Row: {
          attempt_id: string
          id: string
          practice_test_module_attempt_id: string
          practice_test_module_item_id: string
        }
        Insert: {
          attempt_id: string
          id?: string
          practice_test_module_attempt_id: string
          practice_test_module_item_id: string
        }
        Update: {
          attempt_id?: string
          id?: string
          practice_test_module_attempt_id?: string
          practice_test_module_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_test_item_attempts_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_test_item_attempts_practice_test_module_attempt_i_fkey"
            columns: ["practice_test_module_attempt_id"]
            isOneToOne: false
            referencedRelation: "practice_test_module_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_test_item_attempts_practice_test_module_item_id_fkey"
            columns: ["practice_test_module_item_id"]
            isOneToOne: false
            referencedRelation: "practice_test_module_items"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_test_item_attempts_v2: {
        Row: {
          attempt_id: string
          id: string
          marked_for_review: boolean
          practice_test_module_attempt_id: string
          practice_test_module_item_id: string
        }
        Insert: {
          attempt_id: string
          id?: string
          marked_for_review?: boolean
          practice_test_module_attempt_id: string
          practice_test_module_item_id: string
        }
        Update: {
          attempt_id?: string
          id?: string
          marked_for_review?: boolean
          practice_test_module_attempt_id?: string
          practice_test_module_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_test_item_attempts_v_practice_test_module_attempt_fkey"
            columns: ["practice_test_module_attempt_id"]
            isOneToOne: false
            referencedRelation: "practice_test_module_attempts_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_test_item_attempts_v_practice_test_module_item_id_fkey"
            columns: ["practice_test_module_item_id"]
            isOneToOne: false
            referencedRelation: "practice_test_module_items_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_test_item_attempts_v2_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_test_module_attempts: {
        Row: {
          correct_count: number | null
          finished_at: string | null
          id: string
          metadata: Json
          practice_test_attempt_id: string
          practice_test_module_id: string
          raw_score: number | null
          started_at: string
        }
        Insert: {
          correct_count?: number | null
          finished_at?: string | null
          id?: string
          metadata?: Json
          practice_test_attempt_id: string
          practice_test_module_id: string
          raw_score?: number | null
          started_at?: string
        }
        Update: {
          correct_count?: number | null
          finished_at?: string | null
          id?: string
          metadata?: Json
          practice_test_attempt_id?: string
          practice_test_module_id?: string
          raw_score?: number | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_test_module_attempts_practice_test_attempt_id_fkey"
            columns: ["practice_test_attempt_id"]
            isOneToOne: false
            referencedRelation: "practice_test_attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_test_module_attempts_practice_test_module_id_fkey"
            columns: ["practice_test_module_id"]
            isOneToOne: false
            referencedRelation: "practice_test_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_test_module_attempts_v2: {
        Row: {
          correct_count: number | null
          finished_at: string | null
          id: string
          practice_test_attempt_id: string
          practice_test_module_id: string
          raw_score: number | null
          started_at: string
        }
        Insert: {
          correct_count?: number | null
          finished_at?: string | null
          id?: string
          practice_test_attempt_id: string
          practice_test_module_id: string
          raw_score?: number | null
          started_at?: string
        }
        Update: {
          correct_count?: number | null
          finished_at?: string | null
          id?: string
          practice_test_attempt_id?: string
          practice_test_module_id?: string
          raw_score?: number | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_test_module_attempts_v2_practice_test_attempt_id_fkey"
            columns: ["practice_test_attempt_id"]
            isOneToOne: false
            referencedRelation: "practice_test_attempts_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_test_module_attempts_v2_practice_test_module_id_fkey"
            columns: ["practice_test_module_id"]
            isOneToOne: false
            referencedRelation: "practice_test_modules_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_test_module_items: {
        Row: {
          created_at: string
          id: string
          ordinal: number
          practice_test_module_id: string
          question_version_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ordinal: number
          practice_test_module_id: string
          question_version_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ordinal?: number
          practice_test_module_id?: string
          question_version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_test_module_items_practice_test_module_id_fkey"
            columns: ["practice_test_module_id"]
            isOneToOne: false
            referencedRelation: "practice_test_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_test_module_items_question_version_id_fkey"
            columns: ["question_version_id"]
            isOneToOne: false
            referencedRelation: "question_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_test_module_items_question_version_id_fkey"
            columns: ["question_version_id"]
            isOneToOne: false
            referencedRelation: "questions_current"
            referencedColumns: ["question_version_id"]
          },
        ]
      }
      practice_test_module_items_v2: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          ordinal: number
          practice_test_module_id: string
          question_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          ordinal: number
          practice_test_module_id: string
          question_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          ordinal?: number
          practice_test_module_id?: string
          question_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practice_test_module_items_v2_practice_test_module_id_fkey"
            columns: ["practice_test_module_id"]
            isOneToOne: false
            referencedRelation: "practice_test_modules_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_test_module_items_v2_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_test_modules: {
        Row: {
          created_at: string
          id: string
          module_number: number
          practice_test_id: string
          route_code: string
          subject_code: string
          time_limit_seconds: number
        }
        Insert: {
          created_at?: string
          id?: string
          module_number: number
          practice_test_id: string
          route_code: string
          subject_code: string
          time_limit_seconds: number
        }
        Update: {
          created_at?: string
          id?: string
          module_number?: number
          practice_test_id?: string
          route_code?: string
          subject_code?: string
          time_limit_seconds?: number
        }
        Relationships: []
      }
      practice_test_modules_v2: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          module_number: number
          practice_test_id: string
          route_code: string
          subject_code: string
          time_limit_seconds: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          module_number: number
          practice_test_id: string
          route_code: string
          subject_code: string
          time_limit_seconds: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          module_number?: number
          practice_test_id?: string
          route_code?: string
          subject_code?: string
          time_limit_seconds?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "practice_test_modules_v2_practice_test_id_fkey"
            columns: ["practice_test_id"]
            isOneToOne: false
            referencedRelation: "practice_tests_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_test_routing_rules: {
        Row: {
          created_at: string
          from_module_number: number
          id: string
          metric: string
          operator: string
          practice_test_id: string
          subject_code: string
          threshold: number
          to_route_code: string
        }
        Insert: {
          created_at?: string
          from_module_number: number
          id?: string
          metric: string
          operator: string
          practice_test_id: string
          subject_code: string
          threshold: number
          to_route_code: string
        }
        Update: {
          created_at?: string
          from_module_number?: number
          id?: string
          metric?: string
          operator?: string
          practice_test_id?: string
          subject_code?: string
          threshold?: number
          to_route_code?: string
        }
        Relationships: []
      }
      practice_tests: {
        Row: {
          adaptive_version: string | null
          code: string
          created_at: string
          id: string
          is_adaptive: boolean
          is_frozen: boolean
          is_published: boolean
          name: string
        }
        Insert: {
          adaptive_version?: string | null
          code: string
          created_at?: string
          id?: string
          is_adaptive?: boolean
          is_frozen?: boolean
          is_published?: boolean
          name: string
        }
        Update: {
          adaptive_version?: string | null
          code?: string
          created_at?: string
          id?: string
          is_adaptive?: boolean
          is_frozen?: boolean
          is_published?: boolean
          name?: string
        }
        Relationships: []
      }
      practice_tests_v2: {
        Row: {
          adaptive_version: string | null
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          is_adaptive: boolean
          is_frozen: boolean
          is_published: boolean
          math_route_threshold: number | null
          name: string
          rw_route_threshold: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          adaptive_version?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_adaptive?: boolean
          is_frozen?: boolean
          is_published?: boolean
          math_route_threshold?: number | null
          name: string
          rw_route_threshold?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          adaptive_version?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          is_adaptive?: boolean
          is_frozen?: boolean
          is_published?: boolean
          math_route_threshold?: number | null
          name?: string
          rw_route_threshold?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          first_name: string | null
          graduation_year: number | null
          high_school: string | null
          id: string
          is_active: boolean
          last_name: string | null
          practice_test_v2_imported_at: string | null
          role: string
          sat_test_date: string | null
          start_date: string | null
          subscription_exempt: boolean
          target_sat_score: number | null
          teacher_invite_code: string | null
          tutor_name: string | null
          ui_version: string
          user_type: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          graduation_year?: number | null
          high_school?: string | null
          id: string
          is_active?: boolean
          last_name?: string | null
          practice_test_v2_imported_at?: string | null
          role?: string
          sat_test_date?: string | null
          start_date?: string | null
          subscription_exempt?: boolean
          target_sat_score?: number | null
          teacher_invite_code?: string | null
          tutor_name?: string | null
          ui_version?: string
          user_type?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          graduation_year?: number | null
          high_school?: string | null
          id?: string
          is_active?: boolean
          last_name?: string | null
          practice_test_v2_imported_at?: string | null
          role?: string
          sat_test_date?: string | null
          start_date?: string | null
          subscription_exempt?: boolean
          target_sat_score?: number | null
          teacher_invite_code?: string | null
          tutor_name?: string | null
          ui_version?: string
          user_type?: string | null
        }
        Relationships: []
      }
      question_assignment_students: {
        Row: {
          assignment_id: string
          created_at: string | null
          student_id: string
        }
        Insert: {
          assignment_id: string
          created_at?: string | null
          student_id: string
        }
        Update: {
          assignment_id?: string
          created_at?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_assignment_students_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "question_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_assignment_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_assignment_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_assignment_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      question_assignments: {
        Row: {
          completed_at: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          filter_criteria: Json | null
          id: string
          question_ids: string[]
          teacher_id: string
          title: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          filter_criteria?: Json | null
          id?: string
          question_ids?: string[]
          teacher_id: string
          title: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          filter_criteria?: Json | null
          id?: string
          question_ids?: string[]
          teacher_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      question_availability: {
        Row: {
          difficulty: number
          domain_name: string
          question_count: number
          skill_name: string
        }
        Insert: {
          difficulty?: number
          domain_name: string
          question_count?: number
          skill_name: string
        }
        Update: {
          difficulty?: number
          domain_name?: string
          question_count?: number
          skill_name?: string
        }
        Relationships: []
      }
      question_concept_tags: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          question_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          question_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          question_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_concept_tags_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_concept_tags_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_current"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "question_concept_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "concept_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      question_content_drafts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          options: Json | null
          promoted_at: string | null
          promoted_by: string | null
          question_id: string
          rationale_html: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          stem_html: string | null
          stimulus_html: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          options?: Json | null
          promoted_at?: string | null
          promoted_by?: string | null
          question_id: string
          rationale_html?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          stem_html?: string | null
          stimulus_html?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          options?: Json | null
          promoted_at?: string | null
          promoted_by?: string | null
          question_id?: string
          rationale_html?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          stem_html?: string | null
          stimulus_html?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_content_drafts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      question_id_map: {
        Row: {
          migrated_at: string
          new_question_id: string
          old_question_id: string
          old_version_id: string | null
        }
        Insert: {
          migrated_at?: string
          new_question_id: string
          old_question_id: string
          old_version_id?: string | null
        }
        Update: {
          migrated_at?: string
          new_question_id?: string
          old_question_id?: string
          old_version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_id_map_new_question_id_fkey"
            columns: ["new_question_id"]
            isOneToOne: false
            referencedRelation: "questions_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_id_map_old_question_id_fkey"
            columns: ["old_question_id"]
            isOneToOne: true
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_id_map_old_question_id_fkey"
            columns: ["old_question_id"]
            isOneToOne: true
            referencedRelation: "questions_current"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "question_id_map_old_version_id_fkey"
            columns: ["old_version_id"]
            isOneToOne: false
            referencedRelation: "question_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_id_map_old_version_id_fkey"
            columns: ["old_version_id"]
            isOneToOne: false
            referencedRelation: "questions_current"
            referencedColumns: ["question_version_id"]
          },
        ]
      }
      question_notes: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          question_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          question_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          question_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "question_notes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_notes_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_current"
            referencedColumns: ["question_id"]
          },
        ]
      }
      question_status: {
        Row: {
          attempts_count: number
          correct_attempts_count: number
          created_at: string
          is_broken: boolean
          is_done: boolean
          last_attempt_at: string | null
          last_is_correct: boolean | null
          marked_for_review: boolean
          notes: string | null
          question_id: string
          status_json: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts_count?: number
          correct_attempts_count?: number
          created_at?: string
          is_broken?: boolean
          is_done?: boolean
          last_attempt_at?: string | null
          last_is_correct?: boolean | null
          marked_for_review?: boolean
          notes?: string | null
          question_id: string
          status_json?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts_count?: number
          correct_attempts_count?: number
          created_at?: string
          is_broken?: boolean
          is_done?: boolean
          last_attempt_at?: string | null
          last_is_correct?: boolean | null
          marked_for_review?: boolean
          notes?: string | null
          question_id?: string
          status_json?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_status_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_status_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_current"
            referencedColumns: ["question_id"]
          },
        ]
      }
      question_taxonomy: {
        Row: {
          difficulty: number
          domain_code: string | null
          domain_name: string | null
          ibn: string | null
          ppcc: string | null
          program: string
          question_id: string
          score_band: number | null
          score_band_range_cd: number | null
          skill_code: string | null
          skill_name: string | null
          source_created_ms: number | null
          source_updated_ms: number | null
        }
        Insert: {
          difficulty: number
          domain_code?: string | null
          domain_name?: string | null
          ibn?: string | null
          ppcc?: string | null
          program: string
          question_id: string
          score_band?: number | null
          score_band_range_cd?: number | null
          skill_code?: string | null
          skill_name?: string | null
          source_created_ms?: number | null
          source_updated_ms?: number | null
        }
        Update: {
          difficulty?: number
          domain_code?: string | null
          domain_name?: string | null
          ibn?: string | null
          ppcc?: string | null
          program?: string
          question_id?: string
          score_band?: number | null
          score_band_range_cd?: number | null
          skill_code?: string | null
          skill_name?: string | null
          source_created_ms?: number | null
          source_updated_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "question_taxonomy_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_taxonomy_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "questions_current"
            referencedColumns: ["question_id"]
          },
        ]
      }
      question_versions: {
        Row: {
          attempt_count: number
          correct_count: number
          created_at: string
          id: string
          is_current: boolean
          metadata: Json | null
          question_id: string
          question_type: string
          rationale_html: string | null
          stem_html: string
          stimulus_html: string | null
          version: number
        }
        Insert: {
          attempt_count?: number
          correct_count?: number
          created_at?: string
          id: string
          is_current?: boolean
          metadata?: Json | null
          question_id: string
          question_type: string
          rationale_html?: string | null
          stem_html: string
          stimulus_html?: string | null
          version: number
        }
        Update: {
          attempt_count?: number
          correct_count?: number
          created_at?: string
          id?: string
          is_current?: boolean
          metadata?: Json | null
          question_id?: string
          question_type?: string
          rationale_html?: string | null
          stem_html?: string
          stimulus_html?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_versions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_versions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "questions_current"
            referencedColumns: ["question_id"]
          },
        ]
      }
      questions: {
        Row: {
          broken_at: string | null
          broken_by: string | null
          created_at: string
          id: string
          is_broken: boolean
          is_test_only: boolean
          question_id: string | null
          source: string
          source_external_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          broken_at?: string | null
          broken_by?: string | null
          created_at?: string
          id: string
          is_broken?: boolean
          is_test_only?: boolean
          question_id?: string | null
          source?: string
          source_external_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          broken_at?: string | null
          broken_by?: string | null
          created_at?: string
          id?: string
          is_broken?: boolean
          is_test_only?: boolean
          question_id?: string | null
          source?: string
          source_external_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      questions_v2: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attempt_count: number
          correct_answer: Json | null
          correct_count: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          difficulty: number | null
          display_code: string | null
          domain_code: string | null
          domain_name: string | null
          id: string
          is_broken: boolean
          is_published: boolean
          last_fixed_at: string | null
          last_fixed_by: string | null
          options: Json | null
          options_rendered: Json | null
          question_type: string
          rationale_html: string | null
          rationale_rendered: string | null
          rendered_at: string | null
          rendered_source_hash: string | null
          score_band: number | null
          skill_code: string | null
          skill_name: string | null
          source: string
          source_external_id: string | null
          source_id: string | null
          stem_html: string
          stem_rendered: string | null
          stimulus_html: string | null
          stimulus_rendered: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attempt_count?: number
          correct_answer?: Json | null
          correct_count?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          difficulty?: number | null
          display_code?: string | null
          domain_code?: string | null
          domain_name?: string | null
          id?: string
          is_broken?: boolean
          is_published?: boolean
          last_fixed_at?: string | null
          last_fixed_by?: string | null
          options?: Json | null
          options_rendered?: Json | null
          question_type: string
          rationale_html?: string | null
          rationale_rendered?: string | null
          rendered_at?: string | null
          rendered_source_hash?: string | null
          score_band?: number | null
          skill_code?: string | null
          skill_name?: string | null
          source?: string
          source_external_id?: string | null
          source_id?: string | null
          stem_html: string
          stem_rendered?: string | null
          stimulus_html?: string | null
          stimulus_rendered?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attempt_count?: number
          correct_answer?: Json | null
          correct_count?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          difficulty?: number | null
          display_code?: string | null
          domain_code?: string | null
          domain_name?: string | null
          id?: string
          is_broken?: boolean
          is_published?: boolean
          last_fixed_at?: string | null
          last_fixed_by?: string | null
          options?: Json | null
          options_rendered?: Json | null
          question_type?: string
          rationale_html?: string | null
          rationale_rendered?: string | null
          rendered_at?: string | null
          rendered_source_hash?: string | null
          score_band?: number | null
          skill_code?: string | null
          skill_name?: string | null
          source?: string
          source_external_id?: string | null
          source_id?: string | null
          stem_html?: string
          stem_rendered?: string | null
          stimulus_html?: string | null
          stimulus_rendered?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      questions_v2_fix_suggestions: {
        Row: {
          batch_id: string | null
          collected_at: string | null
          custom_id: string | null
          diff_classification: string | null
          error_message: string | null
          id: string
          model: string | null
          question_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_options: Json | null
          source_stem_html: string | null
          source_stimulus_html: string | null
          status: string
          submitted_at: string
          suggested_options: Json | null
          suggested_stem_html: string | null
          suggested_stimulus_html: string | null
        }
        Insert: {
          batch_id?: string | null
          collected_at?: string | null
          custom_id?: string | null
          diff_classification?: string | null
          error_message?: string | null
          id?: string
          model?: string | null
          question_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_options?: Json | null
          source_stem_html?: string | null
          source_stimulus_html?: string | null
          status?: string
          submitted_at?: string
          suggested_options?: Json | null
          suggested_stem_html?: string | null
          suggested_stimulus_html?: string | null
        }
        Update: {
          batch_id?: string | null
          collected_at?: string | null
          custom_id?: string | null
          diff_classification?: string | null
          error_message?: string | null
          id?: string
          model?: string | null
          question_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_options?: Json | null
          source_stem_html?: string | null
          source_stimulus_html?: string | null
          status?: string
          submitted_at?: string
          suggested_options?: Json | null
          suggested_stem_html?: string | null
          suggested_stimulus_html?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questions_v2_fix_suggestions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      sat_official_scores: {
        Row: {
          composite_score: number
          created_at: string | null
          created_by: string | null
          domain_alg: number | null
          domain_atm: number | null
          domain_cas: number | null
          domain_eoi: number | null
          domain_geo: number | null
          domain_ini: number | null
          domain_pam: number | null
          domain_sec: number | null
          id: string
          math_score: number
          rw_score: number
          student_id: string
          test_date: string
          test_type: string | null
        }
        Insert: {
          composite_score: number
          created_at?: string | null
          created_by?: string | null
          domain_alg?: number | null
          domain_atm?: number | null
          domain_cas?: number | null
          domain_eoi?: number | null
          domain_geo?: number | null
          domain_ini?: number | null
          domain_pam?: number | null
          domain_sec?: number | null
          id?: string
          math_score: number
          rw_score: number
          student_id: string
          test_date: string
          test_type?: string | null
        }
        Update: {
          composite_score?: number
          created_at?: string | null
          created_by?: string | null
          domain_alg?: number | null
          domain_atm?: number | null
          domain_cas?: number | null
          domain_eoi?: number | null
          domain_geo?: number | null
          domain_ini?: number | null
          domain_pam?: number | null
          domain_sec?: number | null
          id?: string
          math_score?: number
          rw_score?: number
          student_id?: string
          test_date?: string
          test_type?: string | null
        }
        Relationships: []
      }
      sat_test_registrations: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          student_id: string
          test_date: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          student_id: string
          test_date: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          student_id?: string
          test_date?: string
        }
        Relationships: []
      }
      sat_vocabulary: {
        Row: {
          definition: string
          example: string | null
          id: number
          set_number: number
          word: string
        }
        Insert: {
          definition: string
          example?: string | null
          id?: number
          set_number: number
          word: string
        }
        Update: {
          definition?: string
          example?: string | null
          id?: number
          set_number?: number
          word?: string
        }
        Relationships: []
      }
      sat_vocabulary_progress: {
        Row: {
          last_reviewed_at: string | null
          mastery: number
          user_id: string
          vocabulary_id: number
        }
        Insert: {
          last_reviewed_at?: string | null
          mastery?: number
          user_id: string
          vocabulary_id: number
        }
        Update: {
          last_reviewed_at?: string | null
          mastery?: number
          user_id?: string
          vocabulary_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sat_vocabulary_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sat_vocabulary_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sat_vocabulary_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sat_vocabulary_progress_vocabulary_id_fkey"
            columns: ["vocabulary_id"]
            isOneToOne: false
            referencedRelation: "sat_vocabulary"
            referencedColumns: ["id"]
          },
        ]
      }
      score_conversion: {
        Row: {
          id: string
          module1_correct: number
          module2_correct: number
          scaled_score: number
          section: string
          test_id: string
          test_name: string
        }
        Insert: {
          id?: string
          module1_correct: number
          module2_correct: number
          scaled_score: number
          section: string
          test_id: string
          test_name: string
        }
        Update: {
          id?: string
          module1_correct?: number
          module2_correct?: number
          scaled_score?: number
          section?: string
          test_id?: string
          test_name?: string
        }
        Relationships: []
      }
      skill_learnability: {
        Row: {
          learnability: number
          skill_code: string
          updated_at: string
        }
        Insert: {
          learnability?: number
          skill_code: string
          updated_at?: string
        }
        Update: {
          learnability?: number
          skill_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      stg_answer_options_new: {
        Row: {
          label: string | null
          option_html: string | null
          ordinal: number
          source_external_id: string
          version: number
        }
        Insert: {
          label?: string | null
          option_html?: string | null
          ordinal: number
          source_external_id: string
          version?: number
        }
        Update: {
          label?: string | null
          option_html?: string | null
          ordinal?: number
          source_external_id?: string
          version?: number
        }
        Relationships: []
      }
      stg_correct_answers_new: {
        Row: {
          answer_json: Json | null
          correct_option_ordinal: number | null
          source_external_id: string
          version: number
        }
        Insert: {
          answer_json?: Json | null
          correct_option_ordinal?: number | null
          source_external_id: string
          version?: number
        }
        Update: {
          answer_json?: Json | null
          correct_option_ordinal?: number | null
          source_external_id?: string
          version?: number
        }
        Relationships: []
      }
      stg_practice_test_module_items: {
        Row: {
          module_number: number
          ordinal: number
          practice_test_code: string
          route_code: string
          source: string | null
          source_external_id: string
          subject_code: string
          version: number
        }
        Insert: {
          module_number: number
          ordinal: number
          practice_test_code: string
          route_code: string
          source?: string | null
          source_external_id: string
          subject_code: string
          version?: number
        }
        Update: {
          module_number?: number
          ordinal?: number
          practice_test_code?: string
          route_code?: string
          source?: string | null
          source_external_id?: string
          subject_code?: string
          version?: number
        }
        Relationships: []
      }
      stg_practice_test_modules: {
        Row: {
          created_at: string | null
          id: string | null
          module_number: number
          practice_test_code: string
          route_code: string
          subject_code: string
          time_limit_seconds: number
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          module_number: number
          practice_test_code: string
          route_code: string
          subject_code: string
          time_limit_seconds: number
        }
        Update: {
          created_at?: string | null
          id?: string | null
          module_number?: number
          practice_test_code?: string
          route_code?: string
          subject_code?: string
          time_limit_seconds?: number
        }
        Relationships: []
      }
      stg_practice_test_routing_rules: {
        Row: {
          created_at: string | null
          from_module_number: number
          metric: string
          operator: string
          practice_test_code: string
          subject_code: string
          threshold: number
          to_route_code: string
        }
        Insert: {
          created_at?: string | null
          from_module_number: number
          metric: string
          operator: string
          practice_test_code: string
          subject_code: string
          threshold: number
          to_route_code: string
        }
        Update: {
          created_at?: string | null
          from_module_number?: number
          metric?: string
          operator?: string
          practice_test_code?: string
          subject_code?: string
          threshold?: number
          to_route_code?: string
        }
        Relationships: []
      }
      stg_practice_tests: {
        Row: {
          adaptive_version: string | null
          code: string
          created_at: string | null
          id: string | null
          is_adaptive: boolean | null
          is_frozen: boolean | null
          is_published: boolean | null
          name: string
        }
        Insert: {
          adaptive_version?: string | null
          code: string
          created_at?: string | null
          id?: string | null
          is_adaptive?: boolean | null
          is_frozen?: boolean | null
          is_published?: boolean | null
          name: string
        }
        Update: {
          adaptive_version?: string | null
          code?: string
          created_at?: string | null
          id?: string | null
          is_adaptive?: boolean | null
          is_frozen?: boolean | null
          is_published?: boolean | null
          name?: string
        }
        Relationships: []
      }
      stg_pt11_corrected_taxonomy: {
        Row: {
          domain_code: string | null
          external_id: string | null
          skill_code: string | null
        }
        Insert: {
          domain_code?: string | null
          external_id?: string | null
          skill_code?: string | null
        }
        Update: {
          domain_code?: string | null
          external_id?: string | null
          skill_code?: string | null
        }
        Relationships: []
      }
      stg_pt6_id_reconciliation: {
        Row: {
          alt_source_external_id: string | null
          module_number: number | null
          ordinal: number | null
          route_code: string | null
          source_external_id: string | null
          subject_code: string | null
        }
        Insert: {
          alt_source_external_id?: string | null
          module_number?: number | null
          ordinal?: number | null
          route_code?: string | null
          source_external_id?: string | null
          subject_code?: string | null
        }
        Update: {
          alt_source_external_id?: string | null
          module_number?: number | null
          ordinal?: number | null
          route_code?: string | null
          source_external_id?: string | null
          subject_code?: string | null
        }
        Relationships: []
      }
      stg_pt7_id_reconciliation: {
        Row: {
          har_source_external_id: string | null
          ids_differ: boolean | null
          matched_by_text: boolean | null
          module_number: number | null
          ordinal: number | null
          route_code: string | null
          stem_preview: string | null
          stimulus_preview: string | null
          subject_code: string | null
          txt_source_external_id: string | null
        }
        Insert: {
          har_source_external_id?: string | null
          ids_differ?: boolean | null
          matched_by_text?: boolean | null
          module_number?: number | null
          ordinal?: number | null
          route_code?: string | null
          stem_preview?: string | null
          stimulus_preview?: string | null
          subject_code?: string | null
          txt_source_external_id?: string | null
        }
        Update: {
          har_source_external_id?: string | null
          ids_differ?: boolean | null
          matched_by_text?: boolean | null
          module_number?: number | null
          ordinal?: number | null
          route_code?: string | null
          stem_preview?: string | null
          stimulus_preview?: string | null
          subject_code?: string | null
          txt_source_external_id?: string | null
        }
        Relationships: []
      }
      stg_question_versions_new: {
        Row: {
          metadata: Json
          question_type: string
          rationale_html: string | null
          source_external_id: string
          stem_html: string | null
          stimulus_html: string | null
          version: number
        }
        Insert: {
          metadata?: Json
          question_type: string
          rationale_html?: string | null
          source_external_id: string
          stem_html?: string | null
          stimulus_html?: string | null
          version?: number
        }
        Update: {
          metadata?: Json
          question_type?: string
          rationale_html?: string | null
          source_external_id?: string
          stem_html?: string | null
          stimulus_html?: string | null
          version?: number
        }
        Relationships: []
      }
      stg_questions_new: {
        Row: {
          source: string
          source_external_id: string
        }
        Insert: {
          source: string
          source_external_id: string
        }
        Update: {
          source?: string
          source_external_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string | null
          trial_end: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string | null
          trial_end?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      teacher_codes: {
        Row: {
          code: string
          created_at: string | null
          id: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teacher_codes_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_codes_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_codes_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      teacher_student_assignments: {
        Row: {
          created_at: string | null
          student_id: string
          teacher_id: string
        }
        Insert: {
          created_at?: string | null
          student_id: string
          teacher_id: string
        }
        Update: {
          created_at?: string | null
          student_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_student_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_student_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_student_assignments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "teacher_student_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_student_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_student_assignments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
    }
    Views: {
      profile_cards: {
        Row: {
          first_name: string | null
          id: string | null
          last_name: string | null
          role: string | null
          tutor_name: string | null
        }
        Insert: {
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          role?: string | null
          tutor_name?: string | null
        }
        Update: {
          first_name?: string | null
          id?: string | null
          last_name?: string | null
          role?: string | null
          tutor_name?: string | null
        }
        Relationships: []
      }
      questions_current: {
        Row: {
          difficulty: number | null
          domain_code: string | null
          domain_name: string | null
          program: string | null
          question_id: string | null
          question_type: string | null
          question_version_id: string | null
          rationale_html: string | null
          score_band_range_cd: number | null
          skill_code: string | null
          skill_name: string | null
          source: string | null
          source_external_id: string | null
          stem_html: string | null
          stimulus_html: string | null
        }
        Relationships: []
      }
      student_practice_stats: {
        Row: {
          correct_attempts: number | null
          email: string | null
          first_name: string | null
          graduation_year: number | null
          high_school: string | null
          last_activity_at: string | null
          last_name: string | null
          sat_test_date: string | null
          target_sat_score: number | null
          total_attempts: number | null
          user_id: string | null
          week_attempts: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      backfill_questions_v2_correct_labels: { Args: never; Returns: number }
      backfill_questions_v2_display_codes: { Args: never; Returns: number }
      can_view: { Args: { target: string }; Returns: boolean }
      can_view_from: {
        Args: { target: string; viewer: string }
        Returns: boolean
      }
      can_view_lesson: { Args: { p_lesson_id: string }; Returns: boolean }
      get_practice_volume_by_week: {
        Args: { weeks?: number }
        Returns: {
          practice_count: number
          test_count: number
          week_start: string
        }[]
      }
      get_question_neighbors:
        | {
            Args: {
              current_question_id: string
              p_difficulty?: number
              p_domain_name?: string
              p_marked_only?: boolean
              p_program?: string
              p_score_bands?: number[]
              p_skill_name?: string
            }
            Returns: {
              next_id: string
              prev_id: string
            }[]
          }
        | {
            Args: {
              current_question_id: string
              p_difficulty?: number
              p_domain_name?: string
              p_marked_only?: boolean
              p_program?: string
              p_score_bands?: number[]
              p_skill_name?: string
              p_user_id: string
            }
            Returns: {
              next_id: string
              prev_id: string
            }[]
          }
      get_question_outline_counts:
        | {
            Args: {
              p_difficulty?: number
              p_marked_only?: boolean
              p_score_band?: number
            }
            Returns: {
              domain: string
              question_count: number
              skill_desc: string
            }[]
          }
        | {
            Args: {
              p_difficulty?: number
              p_marked_only?: boolean
              p_score_bands?: number[]
            }
            Returns: {
              domain: string
              question_count: number
              skill_desc: string
            }[]
          }
      get_question_outline_counts_v2: {
        Args: {
          p_difficulty?: number
          p_marked_only?: boolean
          p_score_bands?: number[]
          p_user_id: string
        }
        Returns: {
          domain: string
          question_count: number
          skill_desc: string
        }[]
      }
      get_user_practice_summary: {
        Args: never
        Returns: {
          marked_count: number
          percent_correct: number
          total_attempts: number
          total_correct: number
          total_unique_attempted: number
        }[]
      }
      import_student_practice_history: {
        Args: { p_student_id: string }
        Returns: Json
      }
      increment_version_accuracy: {
        Args: { entries: Json }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_assignment_teacher: {
        Args: { p_assignment_id: string; p_teacher_id: string }
        Returns: boolean
      }
      is_lesson_assignment_student: {
        Args: { p_assignment_id: string; p_student_id: string }
        Returns: boolean
      }
      is_lesson_assignment_teacher: {
        Args: { p_assignment_id: string; p_teacher_id: string }
        Returns: boolean
      }
      is_lesson_author: { Args: { p_lesson_id: string }; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
      is_student_assigned: {
        Args: { p_assignment_id: string; p_student_id: string }
        Returns: boolean
      }
      is_teacher: { Args: never; Returns: boolean }
      is_v2_assignment_student: {
        Args: { p_assignment_id: string; p_student_id: string }
        Returns: boolean
      }
      is_v2_assignment_teacher: {
        Args: { p_assignment_id: string; p_teacher_id: string }
        Returns: boolean
      }
      list_visible_users: {
        Args: { role_filter?: string }
        Returns: {
          role: string
          user_id: string
        }[]
      }
      migrate_questions_batch: {
        Args: { batch_size?: number }
        Returns: {
          migrated_count: number
          total_remaining: number
        }[]
      }
      migration_status: {
        Args: never
        Returns: {
          migrated_questions: number
          questions_without_current_version: number
          remaining_questions: number
          total_questions: number
        }[]
      }
      questions_v2_section_prefix: {
        Args: { domain_code: string }
        Returns: string
      }
      redeem_class_invite: { Args: { invite_code: string }; Returns: string }
      set_question_broken: {
        Args: { broken: boolean; question_uuid: string }
        Returns: undefined
      }
      stg_clear_practice_test: { Args: { p_code: string }; Returns: undefined }
      student_has_lesson_assignment: {
        Args: { p_lesson_id: string; p_student_id: string }
        Returns: boolean
      }
      submit_attempt: {
        Args: { p_question_id: string; p_selected_answer: string }
        Returns: {
          is_correct: boolean
        }[]
      }
      teacher_can_view_student: {
        Args: { target_student_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
