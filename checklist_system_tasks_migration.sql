-- Migration to update checklist completion:
-- 1. Evaluates completion using only System Tasks (not General Tasks)
-- 2. Returns level_up information directly in the response to eliminate redundant client-side queries

CREATE OR REPLACE FUNCTION toggle_task(p_task_id UUID, p_completed BOOLEAN, p_client_date DATE DEFAULT current_date) RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_all_completed BOOLEAN;
  v_total_tasks INT;
  v_completed_tasks INT;
  v_old_level INT;
  v_new_level INT;
BEGIN
  -- Get old level before update
  SELECT COALESCE(level, 1) INTO v_old_level FROM profiles WHERE id = v_user_id;

  UPDATE checklist_tasks 
  SET completed = p_completed, 
      last_completed_at = CASE WHEN p_completed THEN p_client_date ELSE NULL END
  WHERE id = p_task_id AND user_id = v_user_id;
  
  IF p_completed THEN
    -- Verify if ALL System Tasks are now checked
    SELECT COUNT(*), COUNT(NULLIF(completed, false)) INTO v_total_tasks, v_completed_tasks 
    FROM checklist_tasks 
    WHERE user_id = v_user_id 
      AND title IN ('Sleep', 'Sun Light', 'Exercise', 'Eat Clean', 'Hydrate', 'Learn', 'No Porn', 'No Alcohol', 'SM Detox');
    
    IF v_total_tasks > 0 AND v_total_tasks = v_completed_tasks THEN
      -- Give 50 XP if not already claimed today
      IF NOT EXISTS (SELECT 1 FROM activity_logs WHERE user_id = v_user_id AND activity_date = p_client_date AND activity_type = 'all_tasks') THEN
        INSERT INTO activity_logs (user_id, activity_date, activity_type, xp_earned) VALUES (v_user_id, p_client_date, 'all_tasks', 50);
        PERFORM add_xp(v_user_id, 50);
        
        -- Get new level after adding XP
        SELECT COALESCE(level, 1) INTO v_new_level FROM profiles WHERE id = v_user_id;
        
        RETURN jsonb_build_object(
          'success', true, 
          'all_completed', true, 
          'xp_awarded', 50,
          'level_up', CASE WHEN v_new_level > v_old_level THEN v_new_level ELSE 0 END
        );
      END IF;
    END IF;
  END IF;
  
  RETURN jsonb_build_object('success', true, 'all_completed', false, 'xp_awarded', 0, 'level_up', 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
