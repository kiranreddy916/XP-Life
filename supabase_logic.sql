-- 1. Create tables
CREATE TABLE IF NOT EXISTS activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  activity_type TEXT NOT NULL, -- 'workout', 'rest', 'all_tasks'
  xp_earned INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, activity_date, activity_type)
);

CREATE TABLE IF NOT EXISTS checklist_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  title TEXT NOT NULL,
  is_daily BOOLEAN DEFAULT false,
  completed BOOLEAN DEFAULT false,
  last_completed_at DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  target_muscle_group TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workout_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_log_id UUID REFERENCES activity_logs(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  sets JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{"weight": 50, "reps": 10}, ...]
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exercise_prs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_name TEXT NOT NULL,
  best_weight NUMERIC DEFAULT 0,
  best_reps INT DEFAULT 0,
  best_volume NUMERIC DEFAULT 0, -- best single-set volume = weight * reps
  achieved_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, exercise_name)
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_prs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own tasks" ON checklist_tasks;
CREATE POLICY "Users can manage their own tasks"
  ON checklist_tasks
  FOR ALL
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own activity" ON activity_logs;
CREATE POLICY "Users can view their own activity"
  ON activity_logs
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Exercises are readable by everyone" ON exercises;
CREATE POLICY "Exercises are readable by everyone" 
  ON exercises FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can view their own workout exercises" ON workout_exercises;
CREATE POLICY "Users can view their own workout exercises" 
  ON workout_exercises FOR SELECT USING (
    EXISTS (SELECT 1 FROM activity_logs WHERE activity_logs.id = workout_exercises.activity_log_id AND activity_logs.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can insert their own workout exercises" ON workout_exercises;
CREATE POLICY "Users can insert their own workout exercises" 
  ON workout_exercises FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM activity_logs WHERE activity_logs.id = workout_exercises.activity_log_id AND activity_logs.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can manage their own PRs" ON exercise_prs;
CREATE POLICY "Users can manage their own PRs"
  ON exercise_prs
  FOR ALL
  USING (auth.uid() = user_id);

-- 3. Core Logic Functions

-- Level Threshold Logic
CREATE OR REPLACE FUNCTION get_level_threshold(current_level INT) RETURNS INT AS $$
BEGIN
  IF current_level < 10 THEN RETURN 100;
  ELSIF current_level < 30 THEN RETURN 150;
  ELSIF current_level < 50 THEN RETURN 200;
  ELSIF current_level < 70 THEN RETURN 250;
  ELSE RETURN 300;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Add XP Logic (Handles Level Ups)
CREATE OR REPLACE FUNCTION add_xp(p_user_id UUID, p_amount INT) RETURNS VOID AS $$
DECLARE
  v_profile RECORD;
  v_new_xp INT;
  v_new_total_xp INT;
  v_new_level INT;
  v_threshold INT;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;
  IF NOT FOUND THEN RETURN; END IF;
  
  v_new_xp := COALESCE(v_profile.xp, 0) + p_amount;
  v_new_total_xp := COALESCE(v_profile.total_xp, 0) + p_amount;
  v_new_level := COALESCE(v_profile.level, 1);
  
  v_threshold := get_level_threshold(v_new_level);
  
  WHILE v_new_xp >= v_threshold LOOP
    v_new_xp := v_new_xp - v_threshold;
    v_new_level := v_new_level + 1;
    v_threshold := get_level_threshold(v_new_level);
  END LOOP;
  
  UPDATE profiles 
  SET xp = v_new_xp, 
      total_xp = v_new_total_xp, 
      level = v_new_level
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create Profile with Default Tasks
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

  -- Insert Default Tasks
  INSERT INTO checklist_tasks (user_id, title, is_daily, completed)
  VALUES 
    (p_user_id, 'Sleep', true, false),
    (p_user_id, 'Sun Light', true, false),
    (p_user_id, 'Exercise', true, false),
    (p_user_id, 'Eat Clean', true, false),
    (p_user_id, 'Hydrate', true, false),
    (p_user_id, 'Learn', true, false),
    (p_user_id, 'No Porn', true, false),
    (p_user_id, 'No Alcohol', true, false),
    (p_user_id, 'SM Detox', true, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Log Workout (Rewards Base XP + Streak Bonus XP + PR Bonus XP and saves workout data)
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
  
  -- If they already took a rest day today, prevent them from logging a workout to avoid duplicate XP
  IF EXISTS (SELECT 1 FROM activity_logs WHERE user_id = v_user_id AND activity_date = p_client_date AND activity_type = 'rest') THEN
    RETURN jsonb_build_object('success', false, 'error', 'You already took a rest day today!');
  END IF;
  
  -- Calculate Streak
  SELECT activity_date INTO v_last_activity_date 
  FROM activity_logs 
  WHERE user_id = v_user_id AND activity_type IN ('workout', 'rest')
  ORDER BY activity_date DESC LIMIT 1;
  
  IF v_last_activity_date = p_client_date - 1 THEN
    v_streak := COALESCE(v_profile.current_streak, 0) + 1;
  ELSIF v_last_activity_date = p_client_date THEN
    v_streak := COALESCE(v_profile.current_streak, 1);
  ELSE
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
      
      -- Find best set volume (weight * reps) for this exercise in this workout
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
      
      -- Compare with stored PR
      v_is_pr := false;
      SELECT * INTO v_existing_pr FROM exercise_prs
        WHERE user_id = v_user_id AND exercise_name = v_ex_name;
      
      IF NOT FOUND THEN
        -- First time logging this exercise — it's automatically a PR
        IF v_max_volume > 0 THEN
          INSERT INTO exercise_prs (user_id, exercise_name, best_weight, best_reps, best_volume, achieved_at)
          VALUES (v_user_id, v_ex_name, v_max_weight, v_max_reps, v_max_volume, now());
          v_is_pr := true;
        END IF;
      ELSIF v_max_volume > v_existing_pr.best_volume THEN
        -- New PR!
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
  
  -- Add PR XP on top of workout XP
  v_total_earned := v_total_earned + v_pr_xp;
  
  -- Update activity log with final XP (including PR bonuses)
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

-- Log Rest Day
CREATE OR REPLACE FUNCTION log_rest_day(p_client_date DATE DEFAULT current_date) RETURNS JSONB AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile RECORD;
  v_last_activity_date DATE;
  v_streak INT;
  v_rests_this_week INT;
  v_week_start DATE;
BEGIN
  IF EXISTS (SELECT 1 FROM activity_logs WHERE user_id = v_user_id AND activity_date = p_client_date AND activity_type = 'workout') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot take rest day after finishing a workout today');
  END IF;
  
  IF EXISTS (SELECT 1 FROM activity_logs WHERE user_id = v_user_id AND activity_date = p_client_date AND activity_type = 'rest') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already rested today');
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = v_user_id;
  
  -- Monday of current week using ISO day of week (Monday = 1)
  v_week_start := p_client_date - (EXTRACT(ISODOW FROM p_client_date)::INT - 1);

  -- Count rest days used this Mon–Sun week
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
    -- Valid rest day — MAINTAIN current streak, do NOT increment
    SELECT activity_date INTO v_last_activity_date 
    FROM activity_logs 
    WHERE user_id = v_user_id AND activity_type IN ('workout', 'rest')
    ORDER BY activity_date DESC LIMIT 1;

    IF v_last_activity_date = p_client_date - 1 OR v_last_activity_date = p_client_date THEN
      -- Yesterday was active: maintain streak as-is
      v_streak := COALESCE(v_profile.current_streak, 0);
    ELSE
      -- Gap detected — streak was already broken, reset to 0
      v_streak := 0;
    END IF;
  END IF;
  
  INSERT INTO activity_logs (user_id, activity_date, activity_type, xp_earned)
  VALUES (v_user_id, p_client_date, 'rest', 0);
  
  UPDATE profiles SET current_streak = v_streak WHERE id = v_user_id;
  
  RETURN jsonb_build_object('success', true, 'streak', v_streak, 'rests_this_week', v_rests_this_week + 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get Checklist Tasks (with automatic daily reset)
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

  RETURN QUERY SELECT * FROM checklist_tasks WHERE user_id = v_user_id ORDER BY created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Toggle Task and Handle +50 XP Reward
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
