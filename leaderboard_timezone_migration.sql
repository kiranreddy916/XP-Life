-- ===================================================
-- FITQUEST LEADERBOARD TIMEZONE MIGRATION
-- Supports local timezone-based Weekly and Monthly XP,
-- and removes the Yearly XP column.
-- ===================================================

-- 1. Drop existing parameterless get_leaderboard function
DROP FUNCTION IF EXISTS get_leaderboard();

-- 2. Create the new get_leaderboard with timezone start parameters
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
  avatar_config JSONB,
  profile_image_url TEXT,
  avatar_url TEXT,
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
    p.avatar_config,
    p.profile_image_url,
    p.avatar_url,
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
    p.avatar_config,
    p.profile_image_url,
    p.avatar_url,
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
