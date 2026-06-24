-- Migration to update checklist functionality:
-- 1. Adds the 'is_system' column to the 'checklist_tasks' table.
-- 2. Scans existing tasks and marks only the oldest (original) task of each system title as 'is_system = true'.
--    Any duplicate user-created tasks will remain 'is_system = false' and will immediately show up in General Tasks, allowing them to be deleted.
-- 3. Fixes the General Tasks bug where one-off tasks would still show up on subsequent days after being completed.
-- 4. Restricts the checklist completion XP award check to only 'is_system = true' tasks.
-- 5. Returns level-up details directly in the toggle_task response to eliminate redundant client-side queries.

-- Step 1: Add is_system column if it doesn't exist
ALTER TABLE checklist_tasks ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;

-- Step 2: Mark the original default tasks as is_system = true
-- If a user has duplicate "Sleep" tasks, only the oldest one (rn = 1) will be marked as is_system.
-- All other duplicates will remain is_system = false, which places them in General Tasks so they can be deleted.
WITH ranked_tasks AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY user_id, title ORDER BY created_at ASC) as rn
  FROM checklist_tasks
  WHERE title IN ('Sleep', 'Sun Light', 'Exercise', 'Eat Clean', 'Hydrate', 'Learn', 'No Porn', 'No Alcohol', 'SM Detox')
)
UPDATE checklist_tasks
SET is_system = true
FROM ranked_tasks
WHERE checklist_tasks.id = ranked_tasks.id AND ranked_tasks.rn = 1;


-- Step 3: Update get_checklist_tasks (with daily reset and one-off task filtration)
CREATE OR REPLACE FUNCTION get_checklist_tasks(p_client_date DATE DEFAULT current_date) RETURNS SETOF checklist_tasks AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  -- Reset daily tasks that weren't completed today
  UPDATE checklist_tasks
  SET completed = false, last_completed_at = NULL
  WHERE user_id = v_user_id 
    AND is_daily = true 
    AND completed = true 
    AND (last_completed_at IS NULL OR last_completed_at < p_client_date);

  RETURN QUERY 
  SELECT * FROM checklist_tasks 
  WHERE user_id = v_user_id 
    AND (
      is_daily = true 
      OR 
      (is_daily = false AND (completed = false OR last_completed_at IS NULL OR last_completed_at = p_client_date))
    )
  ORDER BY created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Step 4: Update create_profile (to set is_system = true for default tasks)
CREATE OR REPLACE FUNCTION create_profile(
  p_user_id UUID,
  p_username TEXT,
  p_gender TEXT,
  p_height INT,
  p_weight INT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO profiles (id, username, gender, height, weight, level, xp, total_xp, current_streak, longest_streak)
  VALUES (p_user_id, p_username, p_gender, p_height, p_weight, 1, 0, 0, 0, 0);

  -- Insert Default Tasks with is_system = true
  INSERT INTO checklist_tasks (user_id, title, is_daily, completed, is_system)
  VALUES 
    (p_user_id, 'Sleep', true, false, true),
    (p_user_id, 'Sun Light', true, false, true),
    (p_user_id, 'Exercise', true, false, true),
    (p_user_id, 'Eat Clean', true, false, true),
    (p_user_id, 'Hydrate', true, false, true),
    (p_user_id, 'Learn', true, false, true),
    (p_user_id, 'No Porn', true, false, true),
    (p_user_id, 'No Alcohol', true, false, true),
    (p_user_id, 'SM Detox', true, false, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Step 5: Update toggle_task (rely on is_system = true instead of hardcoded titles, and return level_up details)
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
      AND is_system = true;
    
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
