-- ===================================================
-- FITQUEST LEADERBOARD & FRIENDS SYSTEM MIGRATION
-- Run this in your Supabase SQL Editor
-- ===================================================

-- 1. Helper function to generate an 8-character unique alphanumeric friend code
CREATE OR REPLACE FUNCTION generate_unique_friend_code() 
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result TEXT := '';
  i INT;
  done BOOLEAN := FALSE;
BEGIN
  WHILE NOT done LOOP
    result := '';
    FOR i IN 1..8 LOOP
      result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    -- Check uniqueness in profiles table
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE friend_code = result) THEN
      done := TRUE;
    END IF;
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;


-- 2. Alter profiles table to add unique friend_code column
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'friend_code'
  ) THEN
    ALTER TABLE profiles ADD COLUMN friend_code TEXT UNIQUE;
  END IF;
END $$;


-- 3. Backfill friend codes for existing profiles
UPDATE profiles 
SET friend_code = generate_unique_friend_code() 
WHERE friend_code IS NULL;


-- 4. Make friend_code column NOT NULL now that everything is backfilled
ALTER TABLE profiles ALTER COLUMN friend_code SET NOT NULL;


-- 5. Update create_profile RPC function to generate unique friend codes for new users
CREATE OR REPLACE FUNCTION create_profile(
  p_user_id UUID,
  p_username TEXT,
  p_gender TEXT,
  p_height INT,
  p_weight INT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO profiles (id, username, gender, height, weight, level, xp, total_xp, current_streak, longest_streak, friend_code)
  VALUES (p_user_id, p_username, p_gender, p_height, p_weight, 1, 0, 0, 0, 0, generate_unique_friend_code());

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


-- 6. Create friendships table for managing requests and accepted relationships
CREATE TABLE IF NOT EXISTS friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  friend_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, friend_id)
);


-- 7. Enable Row Level Security (RLS) on friendships
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- Allow select for involved users
DROP POLICY IF EXISTS "Users can read their own friendships" ON friendships;
CREATE POLICY "Users can read their own friendships"
  ON friendships FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() = friend_id);

-- Allow inserting for authenticated sender
DROP POLICY IF EXISTS "Users can insert friendships" ON friendships;
CREATE POLICY "Users can insert friendships"
  ON friendships FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Allow updates (e.g. accepting requests) for involved users
DROP POLICY IF EXISTS "Users can update their own friendships" ON friendships;
CREATE POLICY "Users can update their own friendships"
  ON friendships FOR UPDATE
  USING (auth.uid() = friend_id OR auth.uid() = user_id);

-- Allow deleting (declining or unfriending) for involved users
DROP POLICY IF EXISTS "Users can delete their own friendships" ON friendships;
CREATE POLICY "Users can delete their own friendships"
  ON friendships FOR DELETE
  USING (auth.uid() = user_id OR auth.uid() = friend_id);


-- 8. RPC: send_friend_request
CREATE OR REPLACE FUNCTION send_friend_request(p_friend_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_friend_id UUID;
  v_friend_username TEXT;
  v_existing RECORD;
BEGIN
  -- Resolve user by code (case-insensitive check)
  SELECT id, username INTO v_friend_id, v_friend_username 
  FROM profiles 
  WHERE UPPER(friend_code) = UPPER(p_friend_code);
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid code. User not found.');
  END IF;

  -- Prevent adding oneself
  IF v_friend_id = v_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'You cannot add yourself as a friend.');
  END IF;

  -- Check for existing request or accepted friendship
  SELECT * INTO v_existing 
  FROM friendships
  WHERE (user_id = v_user_id AND friend_id = v_friend_id)
     OR (user_id = v_friend_id AND friend_id = v_user_id);

  IF FOUND THEN
    IF v_existing.status = 'accepted' THEN
      RETURN jsonb_build_object('success', false, 'error', 'You are already friends with @' || v_friend_username || '.');
    ELSIF v_existing.user_id = v_user_id THEN
      RETURN jsonb_build_object('success', false, 'error', 'Friend request already sent to @' || v_friend_username || '.');
    ELSE
      -- Mutual add: they sent us a request first, so auto-accept it!
      UPDATE friendships SET status = 'accepted' WHERE id = v_existing.id;
      RETURN jsonb_build_object('success', true, 'message', 'You accepted @' || v_friend_username || '''s request!', 'status', 'accepted');
    END IF;
  END IF;

  -- Create new pending friendship request
  INSERT INTO friendships (user_id, friend_id, status)
  VALUES (v_user_id, v_friend_id, 'pending');

  RETURN jsonb_build_object('success', true, 'message', 'Friend request sent to @' || v_friend_username || '!', 'status', 'pending');
END;
$$;


-- 9. RPC: accept_friend_request
CREATE OR REPLACE FUNCTION accept_friend_request(p_friendship_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_friendship RECORD;
  v_sender_username TEXT;
BEGIN
  -- Verify the friendship request is pending and destined for current user
  SELECT * INTO v_friendship 
  FROM friendships 
  WHERE id = p_friendship_id AND friend_id = v_user_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Friend request not found or unauthorized.');
  END IF;

  -- Accept request
  UPDATE friendships SET status = 'accepted' WHERE id = p_friendship_id;

  -- Fetch friend username
  SELECT username INTO v_sender_username FROM profiles WHERE id = v_friendship.user_id;

  RETURN jsonb_build_object('success', true, 'message', 'You are now friends with @' || v_sender_username || '!');
END;
$$;


-- 10. RPC: reject_friend_request
CREATE OR REPLACE FUNCTION reject_friend_request(p_friendship_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_friendship RECORD;
BEGIN
  -- Verify ownership of friendship row
  SELECT * INTO v_friendship 
  FROM friendships 
  WHERE id = p_friendship_id AND (friend_id = v_user_id OR user_id = v_user_id);
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found or unauthorized.');
  END IF;

  -- Delete pending request or friend relationship
  DELETE FROM friendships WHERE id = p_friendship_id;

  RETURN jsonb_build_object('success', true, 'message', 'Friend request deleted.');
END;
$$;


-- 11. RPC: get_friends
CREATE OR REPLACE FUNCTION get_friends()
RETURNS TABLE (
  friendship_id UUID,
  friend_profile_id UUID,
  username TEXT,
  gender TEXT,
  level INT,
  current_streak INT,
  total_xp INT,
  avatar_config JSONB,
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
    p.avatar_config,
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


-- 12. RPC: get_pending_requests
CREATE OR REPLACE FUNCTION get_pending_requests()
RETURNS TABLE (
  friendship_id UUID,
  sender_profile_id UUID,
  username TEXT,
  gender TEXT,
  level INT,
  total_xp INT,
  avatar_config JSONB,
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
    p.avatar_config,
    f.created_at
  FROM friendships f
  JOIN profiles p ON f.user_id = p.id
  WHERE f.friend_id = v_user_id AND f.status = 'pending';
END;
$$;


-- 13. RPC: get_leaderboard (Combines current user and their friends, ranked by total_xp)
CREATE OR REPLACE FUNCTION get_leaderboard()
RETURNS TABLE (
  profile_id UUID,
  username TEXT,
  gender TEXT,
  level INT,
  current_streak INT,
  total_xp INT,
  avatar_config JSONB,
  is_user BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  RETURN QUERY
  -- Current User row
  SELECT 
    id AS profile_id,
    username,
    gender,
    level,
    current_streak,
    total_xp,
    avatar_config,
    TRUE AS is_user
  FROM profiles
  WHERE id = v_user_id
  
  UNION
  
  -- Friends rows
  SELECT 
    p.id AS profile_id,
    p.username,
    p.gender,
    p.level,
    p.current_streak,
    p.total_xp,
    p.avatar_config,
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
