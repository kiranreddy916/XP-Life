-- Create sync_user_streak function to automatically sync and reset the user's own streak on page load
CREATE OR REPLACE FUNCTION sync_user_streak(p_client_date DATE) RETURNS INT AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_last_activity_date DATE;
  v_current_streak INT;
BEGIN
  -- Find last logged activity date (workout or rest)
  SELECT activity_date INTO v_last_activity_date 
  FROM activity_logs 
  WHERE user_id = v_user_id AND activity_type IN ('workout', 'rest')
  ORDER BY activity_date DESC LIMIT 1;
  
  IF NOT FOUND THEN
    -- No activity logged ever: streak is 0
    UPDATE profiles SET current_streak = 0 WHERE id = v_user_id;
    RETURN 0;
  END IF;
  
  -- If the last activity was before yesterday, the streak is broken and reset to 0
  IF v_last_activity_date < p_client_date - 1 THEN
    UPDATE profiles SET current_streak = 0 WHERE id = v_user_id;
    RETURN 0;
  ELSE
    SELECT current_streak INTO v_current_streak FROM profiles WHERE id = v_user_id;
    RETURN COALESCE(v_current_streak, 0);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
