-- ===================================================
-- FITQUEST 3D AVATAR & PROFILE PICTURE SYSTEM MIGRATION
-- Run this in your Supabase SQL Editor
-- ===================================================

-- 1. Add columns to profiles table if they do not exist
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE profiles ADD COLUMN avatar_url TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'profiles' AND column_name = 'profile_image_url'
  ) THEN
    ALTER TABLE profiles ADD COLUMN profile_image_url TEXT;
  END IF;
END $$;

-- 2. Create the storage bucket for profile pictures if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profile-pictures', 
  'profile-pictures', 
  true, 
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE 
SET public = true, 
    file_size_limit = 5242880, 
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

-- 3. Set up Storage RLS Policies for the profile-pictures bucket

-- Allow public access to read profile pictures
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'profile-pictures');

-- Allow authenticated users to upload their own profile pictures
DROP POLICY IF EXISTS "Authenticated User Upload" ON storage.objects;
CREATE POLICY "Authenticated User Upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-pictures' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to update their own profile pictures
DROP POLICY IF EXISTS "Authenticated User Update" ON storage.objects;
CREATE POLICY "Authenticated User Update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-pictures' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to delete their own profile pictures
DROP POLICY IF EXISTS "Authenticated User Delete" ON storage.objects;
CREATE POLICY "Authenticated User Delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-pictures' AND 
    (storage.foldername(name))[1] = auth.uid()::text
  );


-- 4. Drop existing functions to allow altering their return table structures
DROP FUNCTION IF EXISTS get_friends();
DROP FUNCTION IF EXISTS get_pending_requests();
DROP FUNCTION IF EXISTS get_leaderboard();

-- 5. Recreate get_friends RPC to return profile_image_url
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
  profile_image_url TEXT,
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
    p.profile_image_url,
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


-- 6. Recreate get_pending_requests RPC to return profile_image_url
CREATE OR REPLACE FUNCTION get_pending_requests()
RETURNS TABLE (
  friendship_id UUID,
  sender_profile_id UUID,
  username TEXT,
  gender TEXT,
  level INT,
  total_xp INT,
  avatar_config JSONB,
  profile_image_url TEXT,
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
    p.profile_image_url,
    f.created_at
  FROM friendships f
  JOIN profiles p ON f.user_id = p.id
  WHERE f.friend_id = v_user_id AND f.status = 'pending';
END;
$$;


-- 7. Recreate get_leaderboard RPC to return profile_image_url and avatar_url
CREATE OR REPLACE FUNCTION get_leaderboard()
RETURNS TABLE (
  profile_id UUID,
  username TEXT,
  gender TEXT,
  level INT,
  current_streak INT,
  total_xp INT,
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
    id AS profile_id,
    username,
    gender,
    level,
    current_streak,
    total_xp,
    avatar_config,
    profile_image_url,
    avatar_url,
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
