import { createClient } from '@supabase/supabase-js';

// Uses Vite environment variables. Replace placeholders in your .env file.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'YOUR_ANON_KEY';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default supabase;
