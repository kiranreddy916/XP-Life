-- Run this in your Supabase SQL Editor to fix the Friend Code Search issue
CREATE OR REPLACE FUNCTION search_user_by_code(p_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile RECORD;
BEGIN
  -- Perform a case-insensitive search for the user by friend code
  SELECT id, username, level, total_xp, gender, avatar_config INTO v_profile
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
    'avatar_config', v_profile.avatar_config,
    'friend_code', UPPER(p_code)
  );
END;
$$;
