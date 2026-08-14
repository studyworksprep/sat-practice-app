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
      act_import_jobs: {
        Row: {
          answer_key_url: string | null
          created_at: string
          created_by: string
          english_status: string
          id: string
          log_json: Json
          math_html_url: string | null
          math_status: string
          reading_status: string
          scale_status: string
          scale_url: string | null
          science_html_url: string | null
          science_status: string
          source_test: string
          status: string
          test_pdf_url: string | null
          updated_at: string
        }
        Insert: {
          answer_key_url?: string | null
          created_at?: string
          created_by: string
          english_status?: string
          id?: string
          log_json?: Json
          math_html_url?: string | null
          math_status?: string
          reading_status?: string
          scale_status?: string
          scale_url?: string | null
          science_html_url?: string | null
          science_status?: string
          source_test: string
          status?: string
          test_pdf_url?: string | null
          updated_at?: string
        }
        Update: {
          answer_key_url?: string | null
          created_at?: string
          created_by?: string
          english_status?: string
          id?: string
          log_json?: Json
          math_html_url?: string | null
          math_status?: string
          reading_status?: string
          scale_status?: string
          scale_url?: string | null
          science_html_url?: string | null
          science_status?: string
          source_test?: string
          status?: string
          test_pdf_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      act_practice_test_attempts: {
        Row: {
          composite_score: number | null
          created_at: string
          english_scaled: number | null
          finished_at: string | null
          id: string
          math_scaled: number | null
          practice_session_id: string | null
          reading_scaled: number | null
          science_scaled: number | null
          source_test: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          composite_score?: number | null
          created_at?: string
          english_scaled?: number | null
          finished_at?: string | null
          id?: string
          math_scaled?: number | null
          practice_session_id?: string | null
          reading_scaled?: number | null
          science_scaled?: number | null
          source_test: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          composite_score?: number | null
          created_at?: string
          english_scaled?: number | null
          finished_at?: string | null
          id?: string
          math_scaled?: number | null
          practice_session_id?: string | null
          reading_scaled?: number | null
          science_scaled?: number | null
          source_test?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "act_practice_test_attempts_practice_session_id_fkey"
            columns: ["practice_session_id"]
            isOneToOne: false
            referencedRelation: "practice_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      act_question_drafts: {
        Row: {
          approved_to_id: string | null
          category: string | null
          category_code: string | null
          created_at: string
          difficulty: number | null
          id: string
          import_job_id: string
          needs_figure: boolean
          options_json: Json
          parse_warnings: Json
          rationale_html: string | null
          section: string
          source_ordinal: number
          source_test: string
          status: string
          stem_html: string
          stimulus_html: string | null
          subcategory: string | null
          subcategory_code: string | null
          updated_at: string
        }
        Insert: {
          approved_to_id?: string | null
          category?: string | null
          category_code?: string | null
          created_at?: string
          difficulty?: number | null
          id?: string
          import_job_id: string
          needs_figure?: boolean
          options_json?: Json
          parse_warnings?: Json
          rationale_html?: string | null
          section: string
          source_ordinal: number
          source_test: string
          status?: string
          stem_html: string
          stimulus_html?: string | null
          subcategory?: string | null
          subcategory_code?: string | null
          updated_at?: string
        }
        Update: {
          approved_to_id?: string | null
          category?: string | null
          category_code?: string | null
          created_at?: string
          difficulty?: number | null
          id?: string
          import_job_id?: string
          needs_figure?: boolean
          options_json?: Json
          parse_warnings?: Json
          rationale_html?: string | null
          section?: string
          source_ordinal?: number
          source_test?: string
          status?: string
          stem_html?: string
          stimulus_html?: string | null
          subcategory?: string | null
          subcategory_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "act_question_drafts_approved_to_id_fkey"
            columns: ["approved_to_id"]
            isOneToOne: false
            referencedRelation: "act_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "act_question_drafts_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "act_import_jobs"
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
      act_score_conversion: {
        Row: {
          created_at: string
          raw_score: number
          scaled_score: number
          section: string
          source_test: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          raw_score: number
          scaled_score: number
          section: string
          source_test: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          raw_score?: number
          scaled_score?: number
          section?: string
          source_test?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_prompt_templates: {
        Row: {
          created_at: string
          id: string
          name: string
          template: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          template: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          template?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_prompt_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_prompt_templates_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      assignment_students_v2: {
        Row: {
          assignment_id: string
          completed_at: string | null
          created_at: string
          student_id: string
          test_type: string
        }
        Insert: {
          assignment_id: string
          completed_at?: string | null
          created_at?: string
          student_id: string
          test_type?: string
        }
        Update: {
          assignment_id?: string
          completed_at?: string | null
          created_at?: string
          student_id?: string
          test_type?: string
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
      assignment_templates: {
        Row: {
          assignment_type: string
          created_at: string
          filter_criteria: Json
          id: string
          name: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          assignment_type?: string
          created_at?: string
          filter_criteria: Json
          id?: string
          name: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          assignment_type?: string
          created_at?: string
          filter_criteria?: Json
          id?: string
          name?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: []
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
          lesson_pack_id: string | null
          practice_test_id: string | null
          question_ids: string[] | null
          teacher_id: string
          test_type: string
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
          lesson_pack_id?: string | null
          practice_test_id?: string | null
          question_ids?: string[] | null
          teacher_id: string
          test_type?: string
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
          lesson_pack_id?: string | null
          practice_test_id?: string | null
          question_ids?: string[] | null
          teacher_id?: string
          test_type?: string
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
            foreignKeyName: "assignments_v2_lesson_pack_id_fkey"
            columns: ["lesson_pack_id"]
            isOneToOne: false
            referencedRelation: "lesson_packs"
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
          context_id: string | null
          context_type: string | null
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
          context_id?: string | null
          context_type?: string | null
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
          context_id?: string | null
          context_type?: string | null
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
      bluebook_calibration_campaigns: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          practice_test_id: string
          requires_html_report: boolean
          requires_score_image: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          is_active?: boolean
          name: string
          practice_test_id: string
          requires_html_report?: boolean
          requires_score_image?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          practice_test_id?: string
          requires_html_report?: boolean
          requires_score_image?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bluebook_calibration_campaigns_practice_test_id_fkey"
            columns: ["practice_test_id"]
            isOneToOne: false
            referencedRelation: "practice_tests_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      bluebook_calibration_responses: {
        Row: {
          captured_at: string
          chosen: string | null
          difficulty: number | null
          domain_code: string | null
          domain_name: string | null
          is_correct: boolean
          module_number: number
          ordinal: number
          question_id: string
          question_type: string
          route_code: string
          score_band: number | null
          section: string
          skill_code: string | null
          skill_name: string | null
          submission_id: string
        }
        Insert: {
          captured_at?: string
          chosen?: string | null
          difficulty?: number | null
          domain_code?: string | null
          domain_name?: string | null
          is_correct: boolean
          module_number: number
          ordinal: number
          question_id: string
          question_type: string
          route_code: string
          score_band?: number | null
          section: string
          skill_code?: string | null
          skill_name?: string | null
          submission_id: string
        }
        Update: {
          captured_at?: string
          chosen?: string | null
          difficulty?: number | null
          domain_code?: string | null
          domain_name?: string | null
          is_correct?: boolean
          module_number?: number
          ordinal?: number
          question_id?: string
          question_type?: string
          route_code?: string
          score_band?: number | null
          section?: string
          skill_code?: string | null
          skill_name?: string | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bluebook_calibration_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bluebook_calibration_responses_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "bluebook_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      bluebook_submissions: {
        Row: {
          attempt_id: string | null
          auto_verified_at: string | null
          campaign_id: string | null
          contributor_id: string
          created_at: string
          entry_method: string
          form_fingerprint: string | null
          html_artifact_path: string | null
          id: string
          math_m1_correct: number | null
          math_m2_correct: number | null
          math_m2_route: string | null
          math_scaled: number | null
          planned_pattern_id: string | null
          practice_test_id: string
          promoted_at: string | null
          report_date: string | null
          response_snapshot: Json
          responses: Json
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rw_m1_correct: number | null
          rw_m2_correct: number | null
          rw_m2_route: string | null
          rw_scaled: number | null
          score_summary_artifact_path: string | null
          status: string
          subject_label: string | null
          updated_at: string
          validation_flags: Json
        }
        Insert: {
          attempt_id?: string | null
          auto_verified_at?: string | null
          campaign_id?: string | null
          contributor_id: string
          created_at?: string
          entry_method: string
          form_fingerprint?: string | null
          html_artifact_path?: string | null
          id?: string
          math_m1_correct?: number | null
          math_m2_correct?: number | null
          math_m2_route?: string | null
          math_scaled?: number | null
          planned_pattern_id?: string | null
          practice_test_id: string
          promoted_at?: string | null
          report_date?: string | null
          response_snapshot?: Json
          responses?: Json
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rw_m1_correct?: number | null
          rw_m2_correct?: number | null
          rw_m2_route?: string | null
          rw_scaled?: number | null
          score_summary_artifact_path?: string | null
          status?: string
          subject_label?: string | null
          updated_at?: string
          validation_flags?: Json
        }
        Update: {
          attempt_id?: string | null
          auto_verified_at?: string | null
          campaign_id?: string | null
          contributor_id?: string
          created_at?: string
          entry_method?: string
          form_fingerprint?: string | null
          html_artifact_path?: string | null
          id?: string
          math_m1_correct?: number | null
          math_m2_correct?: number | null
          math_m2_route?: string | null
          math_scaled?: number | null
          planned_pattern_id?: string | null
          practice_test_id?: string
          promoted_at?: string | null
          report_date?: string | null
          response_snapshot?: Json
          responses?: Json
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rw_m1_correct?: number | null
          rw_m2_correct?: number | null
          rw_m2_route?: string | null
          rw_scaled?: number | null
          score_summary_artifact_path?: string | null
          status?: string
          subject_label?: string | null
          updated_at?: string
          validation_flags?: Json
        }
        Relationships: [
          {
            foreignKeyName: "bluebook_submissions_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "practice_test_attempts_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bluebook_submissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "bluebook_calibration_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bluebook_submissions_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bluebook_submissions_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bluebook_submissions_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "bluebook_submissions_practice_test_id_fkey"
            columns: ["practice_test_id"]
            isOneToOne: false
            referencedRelation: "practice_tests_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bluebook_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bluebook_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bluebook_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
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
      contributor_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          note: string | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          note?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          note?: string | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contributor_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributor_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributor_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "contributor_codes_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributor_codes_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributor_codes_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      curriculum_units: {
        Row: {
          created_at: string
          domain_code: string
          expected_minutes: number
          id: string
          mastery_threshold: number
          prerequisite_unit_ids: string[]
          sequence: number
          skill_code: string
          test_type: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain_code: string
          expected_minutes?: number
          id?: string
          mastery_threshold?: number
          prerequisite_unit_ids?: string[]
          sequence: number
          skill_code: string
          test_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain_code?: string
          expected_minutes?: number
          id?: string
          mastery_threshold?: number
          prerequisite_unit_ids?: string[]
          sequence?: number
          skill_code?: string
          test_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      desmos_saved_states: {
        Row: {
          created_at: string
          id: string
          question_id: string
          saved_by: string
          state_json: Json
          test_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          question_id: string
          saved_by: string
          state_json: Json
          test_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          question_id?: string
          saved_by?: string
          state_json?: Json
          test_type?: string
          updated_at?: string
        }
        Relationships: [
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
      entitlements: {
        Row: {
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          note: string | null
          plan: string
          source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          note?: string | null
          plan: string
          source: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          note?: string | null
          plan?: string
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      feature_efficacy: {
        Row: {
          lesson_id: string
          post_accuracy: number | null
          post_attempts: number
          post_correct: number
          pre_accuracy: number | null
          pre_attempts: number
          pre_correct: number
          refreshed_at: string
          skill_code: string
          students: number
        }
        Insert: {
          lesson_id: string
          post_accuracy?: number | null
          post_attempts?: number
          post_correct?: number
          pre_accuracy?: number | null
          pre_attempts?: number
          pre_correct?: number
          refreshed_at?: string
          skill_code: string
          students?: number
        }
        Update: {
          lesson_id?: string
          post_accuracy?: number | null
          post_attempts?: number
          post_correct?: number
          pre_accuracy?: number | null
          pre_attempts?: number
          pre_correct?: number
          refreshed_at?: string
          skill_code?: string
          students?: number
        }
        Relationships: [
          {
            foreignKeyName: "feature_efficacy_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
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
      item_stats: {
        Row: {
          avg_time_ms: number | null
          computed_at: string
          discrimination: number | null
          distractor_dist: Json | null
          key_label: string | null
          modal_label: string | null
          n_attempts: number
          n_correct: number
          n_timed: number
          p_value: number | null
          question_id: string
        }
        Insert: {
          avg_time_ms?: number | null
          computed_at?: string
          discrimination?: number | null
          distractor_dist?: Json | null
          key_label?: string | null
          modal_label?: string | null
          n_attempts?: number
          n_correct?: number
          n_timed?: number
          p_value?: number | null
          question_id: string
        }
        Update: {
          avg_time_ms?: number | null
          computed_at?: string
          discrimination?: number | null
          distractor_dist?: Json | null
          key_label?: string | null
          modal_label?: string | null
          n_attempts?: number
          n_correct?: number
          n_timed?: number
          p_value?: number | null
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_stats_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "questions_v2"
            referencedColumns: ["id"]
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
      lesson_pack_questions: {
        Row: {
          added_at: string
          pack_id: string
          position: number
          question_id: string
        }
        Insert: {
          added_at?: string
          pack_id: string
          position: number
          question_id: string
        }
        Update: {
          added_at?: string
          pack_id?: string
          position?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_pack_questions_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "lesson_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_pack_questions_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_packs: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_packs_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_packs_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_packs_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
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
      lesson_publication_history: {
        Row: {
          created_at: string
          created_by: string
          id: string
          lesson_id: string
          revision_id: string | null
          snapshot: Json
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          lesson_id: string
          revision_id?: string | null
          snapshot: Json
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          lesson_id?: string
          revision_id?: string | null
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lesson_publication_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_publication_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_publication_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "lesson_publication_history_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_publication_history_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "lesson_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_revision_blocks: {
        Row: {
          block_type: string
          content: Json
          created_at: string
          id: string
          revision_id: string
          sort_order: number
          source_block_id: string | null
        }
        Insert: {
          block_type: string
          content?: Json
          created_at?: string
          id?: string
          revision_id: string
          sort_order?: number
          source_block_id?: string | null
        }
        Update: {
          block_type?: string
          content?: Json
          created_at?: string
          id?: string
          revision_id?: string
          sort_order?: number
          source_block_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_revision_blocks_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "lesson_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_revision_topics: {
        Row: {
          domain_name: string | null
          id: string
          pattern_id: string | null
          revision_id: string
          section: string | null
          skill_code: string | null
          source_topic_id: string | null
        }
        Insert: {
          domain_name?: string | null
          id?: string
          pattern_id?: string | null
          revision_id: string
          section?: string | null
          skill_code?: string | null
          source_topic_id?: string | null
        }
        Update: {
          domain_name?: string | null
          id?: string
          pattern_id?: string | null
          revision_id?: string
          section?: string | null
          skill_code?: string | null
          source_topic_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_revision_topics_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "question_patterns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_revision_topics_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "lesson_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_revisions: {
        Row: {
          base_lesson_id: string | null
          base_lesson_updated_at: string | null
          change_summary: string | null
          created_at: string
          description: string | null
          foundation_sequence: number | null
          id: string
          kind: string
          owner_id: string
          published_lesson_id: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          state: string
          submitted_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          base_lesson_id?: string | null
          base_lesson_updated_at?: string | null
          change_summary?: string | null
          created_at?: string
          description?: string | null
          foundation_sequence?: number | null
          id?: string
          kind?: string
          owner_id: string
          published_lesson_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          state?: string
          submitted_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          base_lesson_id?: string | null
          base_lesson_updated_at?: string | null
          change_summary?: string | null
          created_at?: string
          description?: string | null
          foundation_sequence?: number | null
          id?: string
          kind?: string
          owner_id?: string
          published_lesson_id?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          state?: string
          submitted_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_revisions_base_lesson_id_fkey"
            columns: ["base_lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_revisions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_revisions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_revisions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "lesson_revisions_published_lesson_id_fkey"
            columns: ["published_lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_revisions_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_revisions_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_revisions_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      lesson_topics: {
        Row: {
          domain_name: string | null
          id: string
          lesson_id: string
          pattern_id: string | null
          section: string | null
          skill_code: string | null
        }
        Insert: {
          domain_name?: string | null
          id?: string
          lesson_id: string
          pattern_id?: string | null
          section?: string | null
          skill_code?: string | null
        }
        Update: {
          domain_name?: string | null
          id?: string
          lesson_id?: string
          pattern_id?: string | null
          section?: string | null
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
          {
            foreignKeyName: "lesson_topics_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "question_patterns"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          author_id: string
          created_at: string | null
          description: string | null
          foundation_sequence: number | null
          id: string
          kind: string
          status: string
          title: string
          updated_at: string | null
          visibility: string
        }
        Insert: {
          author_id: string
          created_at?: string | null
          description?: string | null
          foundation_sequence?: number | null
          id?: string
          kind?: string
          status?: string
          title: string
          updated_at?: string | null
          visibility?: string
        }
        Update: {
          author_id?: string
          created_at?: string | null
          description?: string | null
          foundation_sequence?: number | null
          id?: string
          kind?: string
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
      plan_tasks: {
        Row: {
          completed_at: string | null
          completed_via: string | null
          created_at: string
          id: string
          payload: Json
          plan_id: string
          scheduled_date: string | null
          source: string
          status: string
          task_type: string
          updated_at: string
          week_index: number
        }
        Insert: {
          completed_at?: string | null
          completed_via?: string | null
          created_at?: string
          id?: string
          payload?: Json
          plan_id: string
          scheduled_date?: string | null
          source?: string
          status?: string
          task_type: string
          updated_at?: string
          week_index?: number
        }
        Update: {
          completed_at?: string | null
          completed_via?: string | null
          created_at?: string
          id?: string
          payload?: Json
          plan_id?: string
          scheduled_date?: string | null
          source?: string
          status?: string
          task_type?: string
          updated_at?: string
          week_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_tasks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "study_plans"
            referencedColumns: ["id"]
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
          marked_positions: number[]
          mode: string
          plan_task_id: string | null
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
          marked_positions?: number[]
          mode?: string
          plan_task_id?: string | null
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
          marked_positions?: number[]
          mode?: string
          plan_task_id?: string | null
          question_ids?: Json
          status?: string
          test_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_sessions_plan_task_id_fkey"
            columns: ["plan_task_id"]
            isOneToOne: false
            referencedRelation: "plan_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_test_attempts_v2: {
        Row: {
          adaptive_version: string | null
          composite_score: number | null
          finished_at: string | null
          id: string
          math_scaled: number | null
          official_source: string | null
          officialized_at: string | null
          plan_task_id: string | null
          practice_test_id: string
          rw_scaled: number | null
          sections_only: string | null
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
          official_source?: string | null
          officialized_at?: string | null
          plan_task_id?: string | null
          practice_test_id: string
          rw_scaled?: number | null
          sections_only?: string | null
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
          official_source?: string | null
          officialized_at?: string | null
          plan_task_id?: string | null
          practice_test_id?: string
          rw_scaled?: number | null
          sections_only?: string | null
          source?: string
          started_at?: string
          status?: string
          time_multiplier?: number
          uploaded_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_test_attempts_v2_plan_task_id_fkey"
            columns: ["plan_task_id"]
            isOneToOne: false
            referencedRelation: "plan_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_test_attempts_v2_practice_test_id_fkey"
            columns: ["practice_test_id"]
            isOneToOne: false
            referencedRelation: "practice_tests_v2"
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
      practice_test_module_attempts_v2: {
        Row: {
          correct_count: number | null
          finished_at: string | null
          id: string
          paused_at: string | null
          paused_at_position: number | null
          practice_test_attempt_id: string
          practice_test_module_id: string
          raw_score: number | null
          started_at: string
        }
        Insert: {
          correct_count?: number | null
          finished_at?: string | null
          id?: string
          paused_at?: string | null
          paused_at_position?: number | null
          practice_test_attempt_id: string
          practice_test_module_id: string
          raw_score?: number | null
          started_at?: string
        }
        Update: {
          correct_count?: number | null
          finished_at?: string | null
          id?: string
          paused_at?: string | null
          paused_at_position?: number | null
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
          banned_at: string | null
          created_at: string | null
          email: string | null
          first_name: string | null
          graduation_year: number | null
          high_school: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          last_name: string | null
          lessonworks_organization_id: string | null
          lessonworks_student_id: string | null
          practice_detours_enabled: boolean | null
          practice_test_v2_imported_at: string | null
          role: string
          sat_test_date: string | null
          start_date: string | null
          subscription_exempt: boolean
          target_sat_score: number | null
          teacher_invite_code: string | null
          tutor_name: string | null
          user_type: string | null
          welcome_email_sent_at: string | null
        }
        Insert: {
          banned_at?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          graduation_year?: number | null
          high_school?: string | null
          id: string
          is_active?: boolean
          is_demo?: boolean
          last_name?: string | null
          lessonworks_organization_id?: string | null
          lessonworks_student_id?: string | null
          practice_detours_enabled?: boolean | null
          practice_test_v2_imported_at?: string | null
          role?: string
          sat_test_date?: string | null
          start_date?: string | null
          subscription_exempt?: boolean
          target_sat_score?: number | null
          teacher_invite_code?: string | null
          tutor_name?: string | null
          user_type?: string | null
          welcome_email_sent_at?: string | null
        }
        Update: {
          banned_at?: string | null
          created_at?: string | null
          email?: string | null
          first_name?: string | null
          graduation_year?: number | null
          high_school?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          last_name?: string | null
          lessonworks_organization_id?: string | null
          lessonworks_student_id?: string | null
          practice_detours_enabled?: boolean | null
          practice_test_v2_imported_at?: string | null
          role?: string
          sat_test_date?: string | null
          start_date?: string | null
          subscription_exempt?: boolean
          target_sat_score?: number | null
          teacher_invite_code?: string | null
          tutor_name?: string | null
          user_type?: string | null
          welcome_email_sent_at?: string | null
        }
        Relationships: []
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
            referencedRelation: "questions_v2"
            referencedColumns: ["id"]
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
          hints: Json | null
          id: string
          notes: string | null
          options: Json | null
          pattern_id: string | null
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
          hints?: Json | null
          id?: string
          notes?: string | null
          options?: Json | null
          pattern_id?: string | null
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
          hints?: Json | null
          id?: string
          notes?: string | null
          options?: Json | null
          pattern_id?: string | null
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
            foreignKeyName: "question_content_drafts_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "question_patterns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_content_drafts_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      question_content_history: {
        Row: {
          correct_answer: Json | null
          difficulty: number | null
          domain_code: string | null
          edited_by: string | null
          id: string
          options: Json | null
          prior_updated_at: string | null
          question_id: string
          question_type: string | null
          rationale_html: string | null
          score_band: number | null
          skill_code: string | null
          snapshotted_at: string
          stem_html: string | null
          stimulus_html: string | null
        }
        Insert: {
          correct_answer?: Json | null
          difficulty?: number | null
          domain_code?: string | null
          edited_by?: string | null
          id?: string
          options?: Json | null
          prior_updated_at?: string | null
          question_id: string
          question_type?: string | null
          rationale_html?: string | null
          score_band?: number | null
          skill_code?: string | null
          snapshotted_at?: string
          stem_html?: string | null
          stimulus_html?: string | null
        }
        Update: {
          correct_answer?: Json | null
          difficulty?: number | null
          domain_code?: string | null
          edited_by?: string | null
          id?: string
          options?: Json | null
          prior_updated_at?: string | null
          question_id?: string
          question_type?: string | null
          rationale_html?: string | null
          score_band?: number | null
          skill_code?: string | null
          snapshotted_at?: string
          stem_html?: string | null
          stimulus_html?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "question_content_history_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      question_error_notes: {
        Row: {
          body: string
          created_at: string
          question_id: string
          test_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          question_id: string
          test_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          question_id?: string
          test_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      question_notes: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          question_id: string
          test_type: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          question_id: string
          test_type?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          question_id?: string
          test_type?: string
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
        ]
      }
      question_patterns: {
        Row: {
          created_at: string | null
          domain_code: string
          id: string
          name: string
          process_summary: string | null
          recognition_cue: string
          sequence: number
          skill_code: string
          test_type: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          domain_code: string
          id?: string
          name: string
          process_summary?: string | null
          recognition_cue: string
          sequence?: number
          skill_code: string
          test_type?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          domain_code?: string
          id?: string
          name?: string
          process_summary?: string | null
          recognition_cue?: string
          sequence?: number
          skill_code?: string
          test_type?: string
          updated_at?: string | null
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
          hints: Json
          id: string
          is_broken: boolean
          is_published: boolean
          last_fixed_at: string | null
          last_fixed_by: string | null
          options: Json | null
          options_rendered: Json | null
          pattern_id: string | null
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
          hints?: Json
          id?: string
          is_broken?: boolean
          is_published?: boolean
          last_fixed_at?: string | null
          last_fixed_by?: string | null
          options?: Json | null
          options_rendered?: Json | null
          pattern_id?: string | null
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
          hints?: Json
          id?: string
          is_broken?: boolean
          is_published?: boolean
          last_fixed_at?: string | null
          last_fixed_by?: string | null
          options?: Json | null
          options_rendered?: Json | null
          pattern_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "questions_v2_pattern_id_fkey"
            columns: ["pattern_id"]
            isOneToOne: false
            referencedRelation: "question_patterns"
            referencedColumns: ["id"]
          },
        ]
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
      reading_coach_choices: {
        Row: {
          choice_html: string
          error_code: string | null
          id: string
          is_correct: boolean
          item_version_id: string
          label: string
          rationale_html: string
          sort_order: number
        }
        Insert: {
          choice_html: string
          error_code?: string | null
          id?: string
          is_correct: boolean
          item_version_id: string
          label: string
          rationale_html: string
          sort_order: number
        }
        Update: {
          choice_html?: string
          error_code?: string | null
          id?: string
          is_correct?: boolean
          item_version_id?: string
          label?: string
          rationale_html?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "reading_coach_choices_item_version_id_fkey"
            columns: ["item_version_id"]
            isOneToOne: false
            referencedRelation: "reading_coach_item_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_coach_item_versions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          item_id: string
          passage_html: string
          processing_mode: string
          published_at: string | null
          question_stem_html: string
          rubric: Json
          task_type: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          item_id: string
          passage_html: string
          processing_mode: string
          published_at?: string | null
          question_stem_html: string
          rubric: Json
          task_type: string
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          item_id?: string
          passage_html?: string
          processing_mode?: string
          published_at?: string | null
          question_stem_html?: string
          rubric?: Json
          task_type?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "reading_coach_item_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_coach_item_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_coach_item_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reading_coach_item_versions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "reading_coach_items"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_coach_items: {
        Row: {
          created_at: string
          created_by: string
          current_version_id: string | null
          difficulty: number
          genre: string
          id: string
          slug: string
          source_metadata: Json
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          current_version_id?: string | null
          difficulty: number
          genre: string
          id?: string
          slug: string
          source_metadata?: Json
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          current_version_id?: string | null
          difficulty?: number
          genre?: string
          id?: string
          slug?: string
          source_metadata?: Json
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_coach_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_coach_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_coach_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reading_coach_items_current_version_fk"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "reading_coach_item_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_coach_sessions: {
        Row: {
          choice_correct: boolean | null
          completed_at: string | null
          completion_mode: string | null
          id: string
          item_version_id: string
          last_activity_at: string
          selected_choice_id: string | null
          source: string
          source_id: string | null
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          choice_correct?: boolean | null
          completed_at?: string | null
          completion_mode?: string | null
          id?: string
          item_version_id: string
          last_activity_at?: string
          selected_choice_id?: string | null
          source?: string
          source_id?: string | null
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          choice_correct?: boolean | null
          completed_at?: string | null
          completion_mode?: string | null
          id?: string
          item_version_id?: string
          last_activity_at?: string
          selected_choice_id?: string | null
          source?: string
          source_id?: string | null
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_coach_sessions_item_version_id_fkey"
            columns: ["item_version_id"]
            isOneToOne: false
            referencedRelation: "reading_coach_item_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_coach_sessions_selected_choice_id_fkey"
            columns: ["selected_choice_id"]
            isOneToOne: false
            referencedRelation: "reading_coach_choices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_coach_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_coach_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_coach_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      reading_coach_turn_reviews: {
        Row: {
          disposition: string
          notes: string | null
          reviewed_at: string
          reviewer_id: string
          turn_id: string
        }
        Insert: {
          disposition: string
          notes?: string | null
          reviewed_at?: string
          reviewer_id: string
          turn_id: string
        }
        Update: {
          disposition?: string
          notes?: string | null
          reviewed_at?: string
          reviewer_id?: string
          turn_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reading_coach_turn_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_coach_turn_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_coach_turn_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "reading_coach_turn_reviews_turn_id_fkey"
            columns: ["turn_id"]
            isOneToOne: true
            referencedRelation: "reading_coach_turns"
            referencedColumns: ["id"]
          },
        ]
      }
      reading_coach_turns: {
        Row: {
          attempt_number: number
          cache_read_tokens: number | null
          client_request_id: string
          completed_at: string | null
          created_at: string
          error_code: string | null
          evaluation_json: Json | null
          evidence: Json | null
          feedback_text: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model_id: string | null
          output_tokens: number | null
          prompt_version: string | null
          session_id: string
          stage: string
          status: string
          student_text: string
          unit_key: string | null
          user_id: string
          verdict: string | null
        }
        Insert: {
          attempt_number: number
          cache_read_tokens?: number | null
          client_request_id: string
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          evaluation_json?: Json | null
          evidence?: Json | null
          feedback_text?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model_id?: string | null
          output_tokens?: number | null
          prompt_version?: string | null
          session_id: string
          stage: string
          status?: string
          student_text: string
          unit_key?: string | null
          user_id: string
          verdict?: string | null
        }
        Update: {
          attempt_number?: number
          cache_read_tokens?: number | null
          client_request_id?: string
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          evaluation_json?: Json | null
          evidence?: Json | null
          feedback_text?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model_id?: string | null
          output_tokens?: number | null
          prompt_version?: string | null
          session_id?: string
          stage?: string
          status?: string
          student_text?: string
          unit_key?: string | null
          user_id?: string
          verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reading_coach_turns_session_id_user_id_fkey"
            columns: ["session_id", "user_id"]
            isOneToOne: false
            referencedRelation: "reading_coach_sessions"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "reading_coach_turns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_coach_turns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_coach_turns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      review_queue: {
        Row: {
          created_at: string
          due_at: string
          ease: number
          id: string
          interval_days: number
          item_ref: string
          item_type: string
          lapses: number
          last_result: string | null
          last_reviewed_at: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_at?: string
          ease?: number
          id?: string
          interval_days?: number
          item_ref: string
          item_type: string
          lapses?: number
          last_result?: string | null
          last_reviewed_at?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_at?: string
          ease?: number
          id?: string
          interval_days?: number
          item_ref?: string
          item_type?: string
          lapses?: number
          last_result?: string | null
          last_reviewed_at?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: []
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
          attempt_id: string | null
          created_at: string | null
          flagged_at: string | null
          id: string
          module1_correct: number
          module2_correct: number
          scaled_score: number
          section: string
          submission_id: string | null
          test_id: string
          test_name: string
        }
        Insert: {
          attempt_id?: string | null
          created_at?: string | null
          flagged_at?: string | null
          id?: string
          module1_correct: number
          module2_correct: number
          scaled_score: number
          section: string
          submission_id?: string | null
          test_id: string
          test_name: string
        }
        Update: {
          attempt_id?: string | null
          created_at?: string | null
          flagged_at?: string | null
          id?: string
          module1_correct?: number
          module2_correct?: number
          scaled_score?: number
          section?: string
          submission_id?: string | null
          test_id?: string
          test_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "score_conversion_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "practice_test_attempts_v2"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "score_conversion_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "bluebook_submissions"
            referencedColumns: ["id"]
          },
        ]
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
      skill_mastery_snapshots: {
        Row: {
          attempts_count: number
          avg_difficulty: number | null
          correct_count: number
          created_at: string
          domain_code: string
          id: string
          mastery: number
          skill_code: string
          snapshot_date: string
          student_id: string
          test_type: string
        }
        Insert: {
          attempts_count?: number
          avg_difficulty?: number | null
          correct_count?: number
          created_at?: string
          domain_code: string
          id?: string
          mastery: number
          skill_code: string
          snapshot_date: string
          student_id: string
          test_type?: string
        }
        Update: {
          attempts_count?: number
          avg_difficulty?: number | null
          correct_count?: number
          created_at?: string
          domain_code?: string
          id?: string
          mastery?: number
          skill_code?: string
          snapshot_date?: string
          student_id?: string
          test_type?: string
        }
        Relationships: []
      }
      student_invite_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          email: string
          id: string
          teacher_id: string
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          teacher_id: string
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          teacher_id?: string
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_invite_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_invite_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_invite_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "student_invite_codes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_invite_codes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_invite_codes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "student_invite_codes_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profile_cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_invite_codes_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_invite_codes_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "student_practice_stats"
            referencedColumns: ["user_id"]
          },
        ]
      }
      student_notes: {
        Row: {
          body_json: Json
          body_text: string
          created_at: string
          domain_code: string | null
          domain_name: string | null
          id: string
          question_id: string | null
          skill_code: string | null
          skill_name: string | null
          subject_code: string | null
          tags: string[]
          test_type: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body_json?: Json
          body_text?: string
          created_at?: string
          domain_code?: string | null
          domain_name?: string | null
          id?: string
          question_id?: string | null
          skill_code?: string | null
          skill_name?: string | null
          subject_code?: string | null
          tags?: string[]
          test_type?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body_json?: Json
          body_text?: string
          created_at?: string
          domain_code?: string | null
          domain_name?: string | null
          id?: string
          question_id?: string | null
          skill_code?: string | null
          skill_name?: string | null
          subject_code?: string | null
          tags?: string[]
          test_type?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      study_plans: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          goal_score: number | null
          id: string
          starting_score: number | null
          status: string
          student_id: string
          test_date: string | null
          test_type: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          goal_score?: number | null
          id?: string
          starting_score?: number | null
          status?: string
          student_id: string
          test_date?: string | null
          test_type?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          goal_score?: number | null
          id?: string
          starting_score?: number | null
          status?: string
          student_id?: string
          test_date?: string | null
          test_type?: string
          updated_at?: string
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
      tutor_notes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          session_at: string
          student_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          session_at?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          session_at?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      item_miskey_audit: {
        Row: {
          discrimination: number | null
          display_code: string | null
          distractor_dist: Json | null
          domain_code: string | null
          flag: string | null
          key_label: string | null
          modal_label: string | null
          n_attempts: number | null
          p_value: number | null
          question_id: string | null
          skill_code: string | null
        }
        Relationships: [
          {
            foreignKeyName: "item_stats_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: true
            referencedRelation: "questions_v2"
            referencedColumns: ["id"]
          },
        ]
      }
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
      published_question_taxonomy: {
        Row: {
          difficulties: number[] | null
          domain_code: string | null
          domain_name: string | null
          question_count: number | null
          score_bands: number[] | null
          skill_name: string | null
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
      activate_study_plan: { Args: { p_plan_id: string }; Returns: string }
      assignment_has_visible_student: {
        Args: { p_assignment_id: string }
        Returns: boolean
      }
      assignment_teacher_visible: {
        Args: { p_assignment_id: string }
        Returns: boolean
      }
      backfill_questions_v2_display_codes: { Args: never; Returns: number }
      backfill_skill_mastery_snapshots: {
        Args: { p_test_type?: string }
        Returns: number
      }
      can_contribute: { Args: never; Returns: boolean }
      can_edit_lesson_revision: {
        Args: { p_revision_id: string }
        Returns: boolean
      }
      can_view: { Args: { target: string }; Returns: boolean }
      can_view_from: {
        Args: { target: string; viewer: string }
        Returns: boolean
      }
      can_view_lesson: { Args: { p_lesson_id: string }; Returns: boolean }
      can_view_lesson_revision: {
        Args: { p_revision_id: string }
        Returns: boolean
      }
      compute_mastery_score: {
        Args: {
          p_attempts_count: number
          p_recent_correct: number
          p_recent_total: number
          p_weighted_correct: number
          p_weighted_total: number
        }
        Returns: number
      }
      create_lesson_revision: {
        Args: { p_base_lesson_id?: string; p_title?: string }
        Returns: string
      }
      effective_plan: { Args: { p_user: string }; Returns: string }
      get_plan_inputs: {
        Args: { p_student: string; p_test_type?: string }
        Returns: {
          attempts_count: number
          coverage_status: string
          domain_code: string
          expected_minutes: number
          has_lesson: boolean
          learnability: number
          mastery: number
          mastery_threshold: number
          questions_available: number
          section: string
          sequence: number
          skill_code: string
        }[]
      }
      get_practice_streak: {
        Args: { p_user: string }
        Returns: {
          current_streak: number
          practiced_today: boolean
        }[]
      }
      get_practice_volume_by_week: {
        Args: { weeks?: number }
        Returns: {
          practice_count: number
          test_count: number
          week_start: string
        }[]
      }
      get_predicted_score_band: {
        Args: { p_student: string; p_test_type?: string }
        Returns: {
          math_accuracy: number
          math_attempts: number
          math_scaled: number
          rw_accuracy: number
          rw_attempts: number
          rw_scaled: number
          total_high: number
          total_low: number
          total_scaled: number
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
      get_roster_skill_performance: {
        Args: {
          p_min_skill_attempts?: number
          p_min_student_attempts?: number
          p_roster: string[]
          p_since: string
          p_struggling_threshold?: number
        }
        Returns: {
          accuracy: number
          attempts: number
          correct: number
          domain_code: string
          domain_name: string
          missed: number
          skill_code: string
          skill_name: string
          students_below_60: number
          students_touched: number
        }[]
      }
      get_roster_skill_trend: {
        Args: { p_days?: number; p_roster: string[]; p_test_type?: string }
        Returns: {
          avg_delta: number
          avg_mastery_now: number
          avg_mastery_then: number
          domain_code: string
          skill_code: string
          students: number
        }[]
      }
      get_roster_weekly_trend: {
        Args: { p_num_weeks?: number; p_roster: string[] }
        Returns: {
          accuracy: number
          attempts: number
          correct: number
          end_iso: string
          start_iso: string
        }[]
      }
      get_skill_mastery_asof: {
        Args: { p_asof: string; p_student: string; p_test_type?: string }
        Returns: {
          attempts_count: number
          avg_difficulty: number
          correct_count: number
          domain_code: string
          mastery: number
          skill_code: string
          test_type: string
        }[]
      }
      get_student_coverage: {
        Args: { p_student: string; p_test_type?: string }
        Returns: {
          attempts_count: number
          domain_code: string
          mastery: number
          mastery_4w_ago: number
          mastery_threshold: number
          peak_mastery: number
          questions_available: number
          sequence: number
          skill_code: string
          status: string
          title: string
          trend_4w: number
        }[]
      }
      get_student_dashboard_stats: {
        Args: {
          p_lookback_start: string
          p_user_id: string
          p_week_ago: string
        }
        Returns: {
          correct_attempts: number
          per_domain: Json
          total_attempts: number
          week_attempts: number
        }[]
      }
      get_student_extended_stats: {
        Args: { p_lookback_start: string; p_user_id: string }
        Returns: {
          by_day: Json
          by_difficulty: Json
          by_score_band: Json
        }[]
      }
      get_tutor_mastery_movement: {
        Args: { p_days?: number; p_teachers: string[]; p_test_type?: string }
        Returns: {
          avg_mastery_delta: number
          avg_mastery_now: number
          skills_worked: number
          students_measured: number
          teacher_id: string
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
      has_plan: {
        Args: { p_min_plan: string; p_user: string }
        Returns: boolean
      }
      import_student_practice_history: {
        Args: { p_student_id: string }
        Returns: Json
      }
      increment_act_attempt_time: {
        Args: { p_attempt_id: string; p_delta_ms: number }
        Returns: undefined
      }
      increment_attempt_time: {
        Args: { p_attempt_id: string; p_delta_ms: number }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
      is_contributor: { Args: never; Returns: boolean }
      is_demo: { Args: never; Returns: boolean }
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
      is_teacher: { Args: never; Returns: boolean }
      is_v2_assignment_student: {
        Args: { p_assignment_id: string; p_student_id: string }
        Returns: boolean
      }
      is_v2_assignment_teacher: {
        Args: { p_assignment_id: string; p_teacher_id: string }
        Returns: boolean
      }
      link_self_to_teacher_by_code: { Args: { p_code: string }; Returns: Json }
      list_visible_users: {
        Args: { role_filter?: string }
        Returns: {
          role: string
          user_id: string
        }[]
      }
      mastery_weight: {
        Args: { p_difficulty: number; p_score_band: number }
        Returns: number
      }
      merge_concept_tags: {
        Args: { p_source_tag_id: string; p_target_tag_id: string }
        Returns: Json
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
      plan_rank: { Args: { p_plan: string }; Returns: number }
      publish_lesson_revision: {
        Args: { p_force?: boolean; p_revision_id: string }
        Returns: string
      }
      question_edited_since: {
        Args: { p_question: string; p_since: string }
        Returns: boolean
      }
      questions_v2_section_prefix: {
        Args: { domain_code: string }
        Returns: string
      }
      redeem_class_invite: { Args: { invite_code: string }; Returns: string }
      refresh_feature_efficacy: { Args: never; Returns: number }
      refresh_item_stats: { Args: never; Returns: number }
      sat_scaled_for_raw: {
        Args: { p_raw: number; p_section: string }
        Returns: number
      }
      snapshot_all_skill_mastery: {
        Args: { p_asof?: string; p_test_type?: string }
        Returns: number
      }
      snapshot_student_skill_mastery: {
        Args: { p_asof?: string; p_student: string; p_test_type?: string }
        Returns: number
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
