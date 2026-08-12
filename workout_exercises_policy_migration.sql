-- Migration to allow authenticated users to view friend's workout exercises details
DROP POLICY IF EXISTS "Users can view their own workout exercises" ON public.workout_exercises;
DROP POLICY IF EXISTS "Workout exercises are readable by authenticated users" ON public.workout_exercises;

CREATE POLICY "Workout exercises are readable by authenticated users" 
  ON public.workout_exercises FOR SELECT 
  TO authenticated 
  USING (true);

-- Re-add insert policy to restrict users to inserting their own exercises
DROP POLICY IF EXISTS "Users can insert their own workout exercises" ON public.workout_exercises;
CREATE POLICY "Users can insert their own workout exercises" 
  ON public.workout_exercises FOR INSERT 
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.activity_logs 
      WHERE activity_logs.id = workout_exercises.activity_log_id 
      AND activity_logs.user_id = auth.uid()
    )
  );
