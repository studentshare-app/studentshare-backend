import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import envConfig from '../config/env.js';

dotenv.config();
const { loadEnv } = envConfig
const env = loadEnv()

const supabase = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey
);

export default supabase;
