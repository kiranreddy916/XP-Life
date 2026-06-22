-- ===================================================
-- FITQUEST AVATAR DELETION MIGRATION
-- Run this in your Supabase SQL Editor to completely
-- delete 3D/NiceAvatar avatar columns and update functions.
-- ===================================================

-- 1. Drop avatar columns from profiles table
ALTER TABLE profiles DROP COLUMN IF EXISTS avatar_url;
ALTER TABLE profiles DROP COLUMN IF EXISTS avatar_config;

-- 2. Drop existing functions to prevent return type conflict issues
DROP FUNCTION IF EXISTS get_friends();
DROP FUNCTION IF EXISTS get_pending_requests();
DROP FUNCTION IF EXISTS get_leaderboard(TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS search_user_by_code(TEXT);

-- 3. Recreate get_friends RPC to exclude avatar_config
CREATE OR REPLACE FUNCTION get_friends()
RETURNS TABLE (
  friendship_id UUID,
  friend_profile_id UUID,
  username TEXT,
  gender TEXT,
  level INT,
  current_streak INT,
  total_xp INT,
  profile_image_url TEXT,
  status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  RETURN QUERY
  SELECT 
    f.id AS friendship_id,
    p.id AS friend_profile_id,
    p.username,
    p.gender,
    p.level,
    p.current_streak,
    p.total_xp,
    p.profile_image_url,
    f.status,
    f.created_at
  FROM friendships f
  JOIN profiles p ON (
    (f.user_id = v_user_id AND f.friend_id = p.id) OR
    (f.friend_id = v_user_id AND f.user_id = p.id)
  )
  WHERE f.status = 'accepted';
END;
$$;

-- 4. Recreate get_pending_requests RPC to exclude avatar_config
CREATE OR REPLACE FUNCTION get_pending_requests()
RETURNS TABLE (
  friendship_id UUID,
  sender_profile_id UUID,
  username TEXT,
  gender TEXT,
  level INT,
  total_xp INT,
  profile_image_url TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  RETURN QUERY
  SELECT 
    f.id AS friendship_id,
    p.id AS sender_profile_id,
    p.username,
    p.gender,
    p.level,
    p.total_xp,
    p.profile_image_url,
    f.created_at
  FROM friendships f
  JOIN profiles p ON f.user_id = p.id
  WHERE f.friend_id = v_user_id AND f.status = 'pending';
END;
$$;

-- 5. Recreate get_leaderboard RPC to exclude avatar_config and avatar_url
CREATE OR REPLACE FUNCTION get_leaderboard(
  p_week_start TIMESTAMPTZ,
  p_month_start TIMESTAMPTZ
)
RETURNS TABLE (
  profile_id UUID,
  username TEXT,
  gender TEXT,
  level INT,
  current_streak INT,
  total_xp INT,
  weekly_xp INT,
  monthly_xp INT,
  profile_image_url TEXT,
  is_user BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  RETURN QUERY
  -- Current User row
  SELECT 
    p.id AS profile_id,
    p.username,
    p.gender,
    p.level,
    p.current_streak,
    p.total_xp,
    COALESCE((
      SELECT SUM(xp_earned)::INT 
      FROM activity_logs 
      WHERE user_id = p.id 
        AND activity_date >= p_week_start::date
    ), 0) AS weekly_xp,
    COALESCE((
      SELECT SUM(xp_earned)::INT 
      FROM activity_logs 
      WHERE user_id = p.id 
        AND activity_date >= p_month_start::date
    ), 0) AS monthly_xp,
    p.profile_image_url,
    TRUE AS is_user
  FROM profiles p
  WHERE p.id = v_user_id
  
  UNION
  
  -- Friends rows
  SELECT 
    p.id AS profile_id,
    p.username,
    p.gender,
    p.level,
    p.current_streak,
    p.total_xp,
    COALESCE((
      SELECT SUM(xp_earned)::INT 
      FROM activity_logs 
      WHERE user_id = p.id 
        AND activity_date >= p_week_start::date
    ), 0) AS weekly_xp,
    COALESCE((
      SELECT SUM(xp_earned)::INT 
      FROM activity_logs 
      WHERE user_id = p.id 
        AND activity_date >= p_month_start::date
    ), 0) AS monthly_xp,
    p.profile_image_url,
    FALSE AS is_user
  FROM friendships f
  JOIN profiles p ON (
    (f.user_id = v_user_id AND f.friend_id = p.id) OR
    (f.friend_id = v_user_id AND f.user_id = p.id)
  )
  WHERE f.status = 'accepted'
  
  ORDER BY total_xp DESC;
END;
$$;

-- 6. Recreate search_user_by_code RPC to return profile_image_url instead of avatar_config
CREATE OR REPLACE FUNCTION search_user_by_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile RECORD;
BEGIN
  -- Perform a case-insensitive search for the user by friend code
  SELECT id, username, level, total_xp, gender, profile_image_url INTO v_profile
  FROM profiles
  WHERE UPPER(friend_code) = UPPER(p_code);

  -- If no user is found, return NULL
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Return the profile data needed to display the search result
  RETURN jsonb_build_object(
    'id', v_profile.id,
    'username', v_profile.username,
    'level', v_profile.level,
    'total_xp', v_profile.total_xp,
    'gender', v_profile.gender,
    'profile_image_url', v_profile.profile_image_url,
    'friend_code', UPPER(p_code)
  );
END;
$$;
