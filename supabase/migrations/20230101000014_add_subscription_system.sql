-- Phase 1: Subscription database setup
-- Creates the subscriptions table, adds subscription_exempt to profiles,
-- grandfathers all existing users, and updates signup trigger logic.

-- ═══════════════════════════════════════════════════════════════════
-- 1. Subscriptions table
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL,
  stripe_subscription_id text UNIQUE,
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'trialing',
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_plan CHECK (plan IN ('free', 'student', 'teacher', 'school')),
  CONSTRAINT valid_status CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid'))
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- RLS: users can read their own subscription
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_select_own" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Service role handles all writes (via webhook handler), no user write policies needed.

-- ═══════════════════════════════════════════════════════════════════
-- 2. Add subscription_exempt to profiles
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_exempt boolean NOT NULL DEFAULT false;

-- Grandfather all existing users
UPDATE public.profiles SET subscription_exempt = true WHERE subscription_exempt = false;

-- ═══════════════════════════════════════════════════════════════════
-- 3. Update handle_new_user trigger to set subscription_exempt
--    Teachers (via teacher code) and students (via teacher invite code)
--    are exempt. The signup API route sets a metadata flag.
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_meta jsonb;
  v_user_type text;
  v_role text;
  v_exempt boolean;
BEGIN
  v_meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_user_type := v_meta->>'user_type';
  v_exempt := coalesce((v_meta->>'subscription_exempt')::boolean, false);

  -- Map user_type to role
  CASE v_user_type
    WHEN 'student' THEN v_role := 'student';
    WHEN 'teacher' THEN v_role := 'teacher';
    ELSE v_role := 'practice';
  END CASE;

  INSERT INTO public.profiles (
    id, email, role, first_name, last_name, user_type,
    high_school, graduation_year, target_sat_score, tutor_name,
    subscription_exempt
  )
  VALUES (
    new.id,
    new.email,
    v_role,
    v_meta->>'first_name',
    v_meta->>'last_name',
    v_user_type,
    v_meta->>'high_school',
    (v_meta->>'graduation_year')::int,
    (v_meta->>'target_sat_score')::int,
    v_meta->>'tutor_name',
    v_exempt
  )
  ON CONFLICT (id) DO UPDATE SET
    email = excluded.email,
    role = coalesce(excluded.role, profiles.role),
    first_name = coalesce(excluded.first_name, profiles.first_name),
    last_name = coalesce(excluded.last_name, profiles.last_name),
    user_type = coalesce(excluded.user_type, profiles.user_type),
    high_school = coalesce(excluded.high_school, profiles.high_school),
    graduation_year = coalesce(excluded.graduation_year, profiles.graduation_year),
    target_sat_score = coalesce(excluded.target_sat_score, profiles.target_sat_score),
    tutor_name = coalesce(excluded.tutor_name, profiles.tutor_name),
    subscription_exempt = coalesce(excluded.subscription_exempt, profiles.subscription_exempt);

  RETURN new;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 4. Auto-exempt students when assigned to an exempt teacher
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.exempt_student_on_teacher_assignment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- If the teacher is exempt, make the student exempt too
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = NEW.teacher_id AND subscription_exempt = true
  ) THEN
    UPDATE public.profiles
    SET subscription_exempt = true
    WHERE id = NEW.student_id AND subscription_exempt = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exempt_student_on_assignment ON public.teacher_student_assignments;
CREATE TRIGGER trg_exempt_student_on_assignment
  AFTER INSERT ON public.teacher_student_assignments
  FOR EACH ROW EXECUTE FUNCTION public.exempt_student_on_teacher_assignment();

-- ═══════════════════════════════════════════════════════════════════
-- 5. Updated_at trigger for subscriptions
-- ═══════════════════════════════════════════════════════════════════
CREATE TRIGGER set_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
