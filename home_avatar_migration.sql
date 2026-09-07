-- ===================================================
-- FITQUEST HOME AVATAR MIGRATION
-- Run this in your Supabase SQL Editor to add the
-- home_avatar column to the profiles table.
-- ===================================================

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS home_avatar TEXT DEFAULT '/sticker.webp';
