-- ===================================================
-- FITQUEST FRIEND STREAK SYSTEM MIGRATION
-- Run this in your Supabase SQL Editor
-- ===================================================

-- 1. Create streak_invites table
CREATE TABLE IF NOT EXISTS streak_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  accepted_at TIMESTAMPTZ
);

-- Ensure only one pending invite can exist between two users
CREATE UNIQUE INDEX IF NOT EXISTS unique_pending_streak_invite
ON streak_invites (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id))
WHERE status = 'pending';

-- 2. Create friend_streaks table
CREATE TABLE IF NOT EXISTS friend_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  current_streak INT DEFAULT 0,
  started_at TIMESTAMPTZ,
  last_completed_date DATE,
  streak_status TEXT NOT NULL CHECK (streak_status IN ('active', 'broken')),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure only one active streak can exist between two users
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_friend_streak 
ON friend_streaks (LEAST(sender_id, receiver_id), GREATEST(sender_id, receiver_id)) 
WHERE streak_status = 'active';

-- Enable Row Level Security (RLS)
ALTER TABLE streak_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE friend_streaks ENABLE ROW LEVEL SECURITY;

-- Allow select for involved users
DROP POLICY IF EXISTS "Users can read their own invites" ON streak_invites;
CREATE POLICY "Users can read their own invites" ON streak_invites
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "Users can read their own friend streaks" ON friend_streaks;
CREATE POLICY "Users can read their own friend streaks" ON friend_streaks
  FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- 3. Helper function: check if activity is valid for streak (with 2 rest day ISO week limit)
CREATE OR REPLACE FUNCTION is_activity_valid_for_streak(p_user_id UUID, p_date DATE)
RETURNS BOOLEAN AS $$
DECLARE
  v_activity_type TEXT;
  v_week_start DATE;
  v_rests_count INT;
BEGIN
  SELECT activity_type INTO v_activity_type
  FROM activity_logs
  WHERE user_id = p_user_id AND activity_date = p_date;
  
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  
  IF v_activity_type = 'workout' THEN
    RETURN TRUE;
  ELSIF v_activity_type = 'rest' THEN
    v_week_start := p_date - (EXTRACT(ISODOW FROM p_date)::INT - 1);
    
    SELECT COUNT(*) INTO v_rests_count
    FROM activity_logs
    WHERE user_id = p_user_id
      AND activity_type = 'rest'
      AND activity_date >= v_week_start
      AND activity_date <= p_date;
      
    IF v_rests_count > 2 THEN
      RETURN FALSE;
    ELSE
      RETURN TRUE;
    END IF;
  END IF;
  
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- 4. Core logic: Sync active friend streaks for a specific user
CREATE OR REPLACE FUNCTION sync_friend_streaks_for_user(p_user_id UUID, p_client_date DATE)
RETURNS VOID AS $$
DECLARE
  v_streak RECORD;
  v_date DATE;
  v_current_streak INT;
  v_a_valid BOOLEAN;
  v_b_valid BOOLEAN;
  v_a_type TEXT;
  v_b_type TEXT;
  v_broken BOOLEAN;
BEGIN
  FOR v_streak IN 
    SELECT * FROM friend_streaks 
    WHERE streak_status = 'active'
      AND (sender_id = p_user_id OR receiver_id = p_user_id)
  LOOP
    v_current_streak := 0;
    v_broken := FALSE;
    
    FOR v_date IN 
      SELECT generate_series(v_streak.accepted_at::date, p_client_date, '1 day')::date
    LOOP
      v_a_valid := is_activity_valid_for_streak(v_streak.sender_id, v_date);
      v_b_valid := is_activity_valid_for_streak(v_streak.receiver_id, v_date);
      
      IF v_date = p_client_date THEN
        -- Today: if both logged, check if they both satisfied requirements
        IF v_a_valid AND v_b_valid THEN
          SELECT activity_type INTO v_a_type FROM activity_logs WHERE user_id = v_streak.sender_id AND activity_date = v_date;
          SELECT activity_type INTO v_b_type FROM activity_logs WHERE user_id = v_streak.receiver_id AND activity_date = v_date;
          
          IF v_a_type = 'workout' AND v_b_type = 'workout' THEN
            v_current_streak := v_current_streak + 1;
          ELSE
            -- Maintained
            v_current_streak := v_current_streak;
          END IF;
        ELSE
          -- Today is not complete yet, maintain yesterday's streak
          NULL;
        END IF;
      ELSE
        -- Past day: both MUST be valid
        IF v_a_valid AND v_b_valid THEN
          SELECT activity_type INTO v_a_type FROM activity_logs WHERE user_id = v_streak.sender_id AND activity_date = v_date;
          SELECT activity_type INTO v_b_type FROM activity_logs WHERE user_id = v_streak.receiver_id AND activity_date = v_date;
          
          IF v_a_type = 'workout' AND v_b_type = 'workout' THEN
            v_current_streak := v_current_streak + 1;
          ELSE
            v_current_streak := v_current_streak;
          END IF;
        ELSE
          -- Missed past day: streak broken
          v_broken := TRUE;
          EXIT;
        END IF;
      END IF;
    END LOOP;
    
    IF v_broken THEN
      UPDATE friend_streaks 
      SET current_streak = 0, 
          streak_status = 'broken'
      WHERE id = v_streak.id;
    ELSE
      UPDATE friend_streaks 
      SET current_streak = v_current_streak, 
          last_completed_date = CASE WHEN v_a_valid AND v_b_valid THEN p_client_date ELSE last_completed_date END
      WHERE id = v_streak.id;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 5. RPC: sync_my_friend_streaks (called on Profile page load)
CREATE OR REPLACE FUNCTION sync_my_friend_streaks(p_client_date DATE)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM sync_friend_streaks_for_user(auth.uid(), p_client_date);
END;
$$;

-- 6. Trigger: Automatically sync streaks on new activity_logs entries
CREATE OR REPLACE FUNCTION trigger_sync_friend_streaks()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM sync_friend_streaks_for_user(NEW.user_id, NEW.activity_date);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_friend_streaks ON activity_logs;
CREATE TRIGGER trg_sync_friend_streaks
AFTER INSERT ON activity_logs
FOR EACH ROW
EXECUTE FUNCTION trigger_sync_friend_streaks();

-- 7. RPC: send_streak_invite
CREATE OR REPLACE FUNCTION send_streak_invite(p_receiver_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sender_id UUID := auth.uid();
  v_existing_active BOOLEAN;
  v_existing_pending BOOLEAN;
BEGIN
  -- Check if they are friends
  IF NOT EXISTS (
    SELECT 1 FROM friendships 
    WHERE status = 'accepted' 
      AND ((user_id = v_sender_id AND friend_id = p_receiver_id) 
        OR (user_id = p_receiver_id AND friend_id = v_sender_id))
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You must be friends to start a streak.');
  END IF;

  -- Check if an active streak already exists
  SELECT EXISTS (
    SELECT 1 FROM friend_streaks 
    WHERE streak_status = 'active'
      AND ((sender_id = v_sender_id AND receiver_id = p_receiver_id) 
        OR (sender_id = p_receiver_id AND receiver_id = v_sender_id))
  ) INTO v_existing_active;

  IF v_existing_active THEN
    RETURN jsonb_build_object('success', false, 'error', 'An active streak already exists with this friend.');
  END IF;

  -- Check if a pending invite already exists
  SELECT EXISTS (
    SELECT 1 FROM streak_invites 
    WHERE status = 'pending'
      AND ((sender_id = v_sender_id AND receiver_id = p_receiver_id) 
        OR (sender_id = p_receiver_id AND receiver_id = v_sender_id))
  ) INTO v_existing_pending;

  IF v_existing_pending THEN
    RETURN jsonb_build_object('success', false, 'error', 'A pending streak invite already exists.');
  END IF;

  -- Insert invite
  INSERT INTO streak_invites (sender_id, receiver_id, status)
  VALUES (v_sender_id, p_receiver_id, 'pending');

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 8. RPC: accept_streak_invite
CREATE OR REPLACE FUNCTION accept_streak_invite(p_invite_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_invite RECORD;
  v_streak_id UUID;
BEGIN
  SELECT * INTO v_invite FROM streak_invites WHERE id = p_invite_id AND receiver_id = v_user_id AND status = 'pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invite not found or unauthorized.');
  END IF;

  -- Update invite status
  UPDATE streak_invites SET status = 'accepted', accepted_at = now() WHERE id = p_invite_id;

  -- Deactivate any other active streaks between these two users
  UPDATE friend_streaks 
  SET streak_status = 'broken', current_streak = 0
  WHERE streak_status = 'active'
    AND ((sender_id = v_invite.sender_id AND receiver_id = v_invite.receiver_id)
      OR (sender_id = v_invite.receiver_id AND receiver_id = v_invite.sender_id));

  -- Create a new active friend streak
  INSERT INTO friend_streaks (sender_id, receiver_id, current_streak, started_at, streak_status, accepted_at)
  VALUES (v_invite.sender_id, v_invite.receiver_id, 0, now(), 'active', now())
  RETURNING id INTO v_streak_id;

  -- Recalculate streak immediately for this new relationship
  PERFORM sync_friend_streaks_for_user(v_invite.sender_id, current_date);

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 9. RPC: reject_streak_invite
CREATE OR REPLACE FUNCTION reject_streak_invite(p_invite_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  UPDATE streak_invites 
  SET status = 'rejected'
  WHERE id = p_invite_id AND receiver_id = v_user_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invite not found or unauthorized.');
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 10. RPC: get_active_friend_streaks
CREATE OR REPLACE FUNCTION get_active_friend_streaks()
RETURNS TABLE (
  streak_id UUID,
  friend_profile_id UUID,
  username TEXT,
  profile_image_url TEXT,
  current_streak INT,
  streak_status TEXT,
  accepted_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  RETURN QUERY
  SELECT 
    fs.id AS streak_id,
    p.id AS friend_profile_id,
    p.username,
    p.profile_image_url,
    fs.current_streak,
    fs.streak_status,
    fs.accepted_at
  FROM friend_streaks fs
  JOIN profiles p ON (
    (fs.sender_id = v_user_id AND fs.receiver_id = p.id) OR
    (fs.receiver_id = v_user_id AND fs.sender_id = p.id)
  )
  WHERE fs.streak_status = 'active';
END;
$$;

-- 11. RPC: get_friends_streak_statuses
CREATE OR REPLACE FUNCTION get_friends_streak_statuses()
RETURNS TABLE (
  friend_profile_id UUID,
  username TEXT,
  profile_image_url TEXT,
  invite_status TEXT, -- 'pending_sent', 'pending_received', 'none'
  invite_id UUID
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  RETURN QUERY
  SELECT 
    p.id AS friend_profile_id,
    p.username,
    p.profile_image_url,
    COALESCE(
      (SELECT 
         CASE 
           WHEN si.status = 'pending' AND si.sender_id = v_user_id THEN 'pending_sent'
           WHEN si.status = 'pending' AND si.receiver_id = v_user_id THEN 'pending_received'
         END
       FROM streak_invites si
       WHERE ((si.sender_id = v_user_id AND si.receiver_id = p.id)
          OR (si.sender_id = p.id AND si.receiver_id = v_user_id))
         AND si.status = 'pending'
       LIMIT 1
      ),
      'none'
    ) AS invite_status,
    (SELECT si.id 
     FROM streak_invites si
     WHERE ((si.sender_id = v_user_id AND si.receiver_id = p.id)
        OR (si.sender_id = p.id AND si.receiver_id = v_user_id))
       AND si.status = 'pending'
     LIMIT 1
    ) AS invite_id
  FROM friendships f
  JOIN profiles p ON (
    (f.user_id = v_user_id AND f.friend_id = p.id) OR
    (f.friend_id = v_user_id AND f.user_id = p.id)
  )
  WHERE f.status = 'accepted'
    -- Exclude friends with whom we already have an active streak
    AND NOT EXISTS (
      SELECT 1 FROM friend_streaks fs
      WHERE fs.streak_status = 'active'
        AND ((fs.sender_id = v_user_id AND fs.receiver_id = p.id)
          OR (fs.receiver_id = v_user_id AND fs.sender_id = p.id))
    );
END;
$$;
