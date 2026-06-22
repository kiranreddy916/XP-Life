-- ===================================================
-- FITQUEST STREAK FIX MIGRATION
-- Fixes:
-- 1. Broken streak resets to 0 (not 1)
-- 2. Rest day MAINTAINS streak (does NOT increment it)
-- 3. Exceeding 2 rest days per week breaks streak to 0
-- 4. Week boundary follows Monday–Sunday (ISO week)
-- ===================================================

-- Fix log_rest_day function
CREATE OR REPLACE FUNCTION log_rest_day(p_client_date DATE DEFAULT current_date) RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile RECORD;
  v_last_activity_date DATE;
  v_streak INT;
  v_rests_this_week INT;
  v_week_start DATE;
BEGIN
  -- Block if already worked out today
  IF EXISTS (SELECT 1 FROM activity_logs WHERE user_id = v_user_id AND activity_date = p_client_date AND activity_type = 'workout') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot take rest day after finishing a workout today');
  END IF;
  
  -- Block if already rested today
  IF EXISTS (SELECT 1 FROM activity_logs WHERE user_id = v_user_id AND activity_date = p_client_date AND activity_type = 'rest') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already rested today');
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = v_user_id;
  
  -- Calculate Monday of current week (ISO week: Monday = day 1)
  v_week_start := p_client_date - (EXTRACT(ISODOW FROM p_client_date)::INT - 1);

  -- Count rest days already used this week (Mon–Sun)
  SELECT COUNT(*) INTO v_rests_this_week 
  FROM activity_logs 
  WHERE user_id = v_user_id 
    AND activity_type = 'rest' 
    AND activity_date >= v_week_start
    AND activity_date < v_week_start + 7;

  IF v_rests_this_week >= 2 THEN
    -- Exceeded shield limit — streak breaks to 0
    v_streak := 0;
  ELSE
    -- Valid rest day — only MAINTAIN the current streak, do NOT add to it
    -- First find the last logged activity date
    SELECT activity_date INTO v_last_activity_date 
    FROM activity_logs 
    WHERE user_id = v_user_id AND activity_type IN ('workout', 'rest')
    ORDER BY activity_date DESC LIMIT 1;

    IF v_last_activity_date = p_client_date - 1 OR v_last_activity_date = p_client_date THEN
      -- Yesterday was active or same day (safety): maintain streak as-is
      v_streak := COALESCE(v_profile.current_streak, 0);
    ELSE
      -- Gap in activity — streak already broken, reset to 0
      v_streak := 0;
    END IF;
  END IF;
  
  INSERT INTO activity_logs (user_id, activity_date, activity_type, xp_earned)
  VALUES (v_user_id, p_client_date, 'rest', 0);
  
  UPDATE profiles SET current_streak = v_streak WHERE id = v_user_id;
  
  RETURN jsonb_build_object('success', true, 'streak', v_streak, 'rests_this_week', v_rests_this_week + 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Fix log_workout streak calculation too
-- When streak is broken (no activity yesterday), it should start fresh at 1 (earned a new day)
-- When streak was maintained via rest days, carry current streak + 1
CREATE OR REPLACE FUNCTION log_workout(p_workout_data JSONB DEFAULT '[]'::jsonb, p_client_date DATE DEFAULT current_date) RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile RECORD;
  v_last_activity_date DATE;
  v_streak INT;
  v_bonus_xp INT := 0;
  v_total_earned INT := 0;
  v_activity_log_id UUID;
  v_ex JSONB;
  v_set JSONB;
  v_ex_name TEXT;
  v_set_weight NUMERIC;
  v_set_reps INT;
  v_set_volume NUMERIC;
  v_max_weight NUMERIC;
  v_max_reps INT;
  v_max_volume NUMERIC;
  v_existing_pr RECORD;
  v_is_pr BOOLEAN;
  v_prs_hit JSONB := '[]'::jsonb;
  v_pr_xp INT := 0;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = v_user_id;
  
  IF EXISTS (SELECT 1 FROM activity_logs WHERE user_id = v_user_id AND activity_date = p_client_date AND activity_type = 'workout') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Workout already logged today');
  END IF;
  
  IF EXISTS (SELECT 1 FROM activity_logs WHERE user_id = v_user_id AND activity_date = p_client_date AND activity_type = 'rest') THEN
    RETURN jsonb_build_object('success', false, 'error', 'You already took a rest day today!');
  END IF;
  
  -- Find last logged activity date
  SELECT activity_date INTO v_last_activity_date 
  FROM activity_logs 
  WHERE user_id = v_user_id AND activity_type IN ('workout', 'rest')
  ORDER BY activity_date DESC LIMIT 1;
  
  IF v_last_activity_date = p_client_date - 1 THEN
    -- Yesterday was active: increment streak
    v_streak := COALESCE(v_profile.current_streak, 0) + 1;
  ELSIF v_last_activity_date = p_client_date THEN
    -- Same day (edge case safety): keep current streak
    v_streak := COALESCE(v_profile.current_streak, 1);
  ELSE
    -- Gap: start fresh at 1 (this workout day counts as day 1)
    v_streak := 1;
  END IF;
  
  -- Calculate Streak Bonus XP
  IF v_streak >= 30 THEN v_bonus_xp := 20;
  ELSIF v_streak >= 15 THEN v_bonus_xp := 15;
  ELSIF v_streak >= 7 THEN v_bonus_xp := 10;
  ELSIF v_streak >= 3 THEN v_bonus_xp := 5;
  ELSE v_bonus_xp := 0;
  END IF;
  
  v_total_earned := 30 + v_bonus_xp;
  
  INSERT INTO activity_logs (user_id, activity_date, activity_type, xp_earned)
  VALUES (v_user_id, p_client_date, 'workout', v_total_earned)
  RETURNING id INTO v_activity_log_id;
  
  -- Store detailed workout data and detect PRs
  IF jsonb_typeof(p_workout_data) = 'array' AND jsonb_array_length(p_workout_data) > 0 THEN
    FOR v_ex IN SELECT * FROM jsonb_array_elements(p_workout_data)
    LOOP
      v_ex_name := v_ex->>'name';
      
      INSERT INTO workout_exercises (activity_log_id, exercise_name, sets)
      VALUES (v_activity_log_id, v_ex_name, v_ex->'sets');
      
      v_max_volume := 0;
      v_max_weight := 0;
      v_max_reps := 0;
      
      FOR v_set IN SELECT * FROM jsonb_array_elements(v_ex->'sets')
      LOOP
        v_set_weight := COALESCE((v_set->>'weight')::NUMERIC, 0);
        v_set_reps   := COALESCE((v_set->>'reps')::INT, 0);
        v_set_volume := v_set_weight * v_set_reps;
        
        IF v_set_volume > v_max_volume THEN
          v_max_volume := v_set_volume;
          v_max_weight := v_set_weight;
          v_max_reps   := v_set_reps;
        END IF;
      END LOOP;
      
      v_is_pr := false;
      SELECT * INTO v_existing_pr FROM exercise_prs
        WHERE user_id = v_user_id AND exercise_name = v_ex_name;
      
      IF NOT FOUND THEN
        IF v_max_volume > 0 THEN
          INSERT INTO exercise_prs (user_id, exercise_name, best_weight, best_reps, best_volume, achieved_at)
          VALUES (v_user_id, v_ex_name, v_max_weight, v_max_reps, v_max_volume, now());
          v_is_pr := true;
        END IF;
      ELSIF v_max_volume > v_existing_pr.best_volume THEN
        UPDATE exercise_prs
        SET best_weight = v_max_weight,
            best_reps   = v_max_reps,
            best_volume = v_max_volume,
            achieved_at = now()
        WHERE user_id = v_user_id AND exercise_name = v_ex_name;
        v_is_pr := true;
      END IF;
      
      IF v_is_pr THEN
        v_prs_hit  := v_prs_hit || jsonb_build_array(v_ex_name);
        v_pr_xp    := v_pr_xp + 10;
      END IF;
    END LOOP;
  END IF;
  
  v_total_earned := v_total_earned + v_pr_xp;
  UPDATE activity_logs SET xp_earned = v_total_earned WHERE id = v_activity_log_id;
  UPDATE profiles SET current_streak = v_streak WHERE id = v_user_id;
  PERFORM add_xp(v_user_id, v_total_earned);
  
  RETURN jsonb_build_object(
    'success', true,
    'xp_earned', v_total_earned,
    'base_xp', 30,
    'bonus_xp', v_bonus_xp,
    'streak', v_streak,
    'prs_hit', v_prs_hit,
    'pr_xp', v_pr_xp
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
