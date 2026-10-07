import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  console.log("Signing up dummy user...");
  const { data, error } = await supabase.auth.signUp({
    email: `testuser${Date.now()}@gmail.com`,
    password: 'Password123!',
  });

  if (error) {
    console.error("Sign up error:", error);
    return;
  }

  const userId = data.user.id;
  console.log("User ID:", userId);

  console.log("Calling create_profile...");
  const { error: dbError } = await supabase.rpc('create_profile', {
    p_user_id: userId,
    p_username: `testuser${Date.now()}`,
    p_gender: 'Male',
    p_height: 180,
    p_weight: 75
  });

  if (dbError) {
    console.error("Profile creation error:", dbError);
  } else {
    console.log("Profile created successfully!");
  }
}

test();
