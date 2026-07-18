-- ===================================================
-- FITQUEST FRIEND PROFILE PAGE MIGRATION
-- Run this in your Supabase SQL Editor
-- ===================================================

-- 1. Add name column to public.profiles if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'name'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN name TEXT;
  END IF;
END $$;

-- 2. Create RPC: unfriend_user
-- Symmetrically deletes friendships, streak invites, and friend streaks
CREATE OR REPLACE FUNCTION public.unfriend_user(p_friend_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  -- Check if authenticated
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Delete friendships (both directions)
  DELETE FROM friendships 
  WHERE (user_id = v_user_id AND friend_id = p_friend_id)
     OR (user_id = p_friend_id AND friend_id = v_user_id);
     
  -- Delete streak invites
  DELETE FROM streak_invites
  WHERE (sender_id = v_user_id AND receiver_id = p_friend_id)
     OR (sender_id = p_friend_id AND receiver_id = v_user_id);

  -- Delete friend streaks (both active and broken)
  DELETE FROM friend_streaks
  WHERE (sender_id = v_user_id AND receiver_id = p_friend_id)
     OR (sender_id = p_friend_id AND receiver_id = v_user_id);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. Create RPC: get_friend_badges
-- Fetches monthly badge statuses for a targeted friend ID
CREATE OR REPLACE FUNCTION public.get_friend_badges(p_user_id UUID)
RETURNS TABLE (
  year        INT,
  month       INT,
  image_url   TEXT,
  status      TEXT,
  days_done   INT,
  days_needed INT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_joined_at    TIMESTAMPTZ;
  v_first_month  DATE;
  v_today        DATE := current_date;
BEGIN
  -- Get user creation date from auth.users
  SELECT created_at INTO v_joined_at FROM auth.users WHERE id = p_user_id;

  -- Default fallback if joined date isn't found
  IF v_joined_at IS NULL THEN
    v_joined_at := now() - INTERVAL '1 month';
  END IF;

  -- Always start from the current month of their join date
  v_first_month := date_trunc('month', v_joined_at)::DATE;

  RETURN QUERY
  SELECT
    mb.year,
    mb.month,
    mb.image_url,
    CASE
      -- If the month is the current month or a future month, it's locked (cannot be achieved yet)
      WHEN make_date(mb.year, mb.month, 1) >= date_trunc('month', v_today) THEN
        'locked'
      -- If they joined mid-month and this is their first month, they missed it (can never achieve it)
      WHEN EXTRACT(DAY FROM v_joined_at) != 1 AND date_trunc('month', v_joined_at)::DATE = make_date(mb.year, mb.month, 1) THEN
        'missed'
      -- Otherwise, check if they completed 'all_tasks' for every day of that month
      ELSE
        CASE WHEN (
          SELECT COUNT(*)::INT
          FROM activity_logs al
          WHERE al.user_id = p_user_id
            AND al.activity_type = 'all_tasks'
            AND date_trunc('month', al.activity_date::timestamp) = make_date(mb.year, mb.month, 1)
        ) = EXTRACT(DAY FROM (make_date(mb.year, mb.month, 1) + INTERVAL '1 month - 1 day'))::INT 
        THEN 'achieved' 
        ELSE 'missed' 
        END
    END AS status,
    (
      SELECT COUNT(*)::INT
      FROM activity_logs al
      WHERE al.user_id = p_user_id
        AND al.activity_type = 'all_tasks'
        AND date_trunc('month', al.activity_date::timestamp) = make_date(mb.year, mb.month, 1)
    ) AS days_done,
    EXTRACT(DAY FROM (make_date(mb.year, mb.month, 1) + INTERVAL '1 month - 1 day'))::INT AS days_needed
  FROM monthly_badges mb
  WHERE make_date(mb.year, mb.month, 1) >= v_first_month
    AND mb.year <= EXTRACT(YEAR FROM v_today)
  ORDER BY mb.year DESC, mb.month DESC;
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.unfriend_user(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_friend_badges(UUID) TO authenticated;

-- 4. Enable RLS and add SELECT policy for authenticated users on profiles table
-- This allows friends to view each other's profiles in the app
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are readable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles are readable by authenticated users" 
ON public.profiles 
FOR SELECT 
TO authenticated 
USING (true);

-- 5. Add SELECT policy for authenticated users on activity_logs table
-- This allows friends to view each other's weekly XP progress curves
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Activity logs are readable by authenticated users" ON public.activity_logs;
CREATE POLICY "Activity logs are readable by authenticated users" 
ON public.activity_logs 
FOR SELECT 
TO authenticated 
USING (true);

-- 6. Add SELECT policy for authenticated users on exercise_prs table
-- This allows friends to view each other's Personal Records
ALTER TABLE public.exercise_prs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "PRs are readable by authenticated users" ON public.exercise_prs;
CREATE POLICY "PRs are readable by authenticated users" 
ON public.exercise_prs 
FOR SELECT 
TO authenticated 
USING (true);
