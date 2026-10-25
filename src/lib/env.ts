function req(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Falta ${name} en .env`);
  return value;
}

export const env = {
  supabaseUrl: req('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: req('EXPO_PUBLIC_SUPABASE_ANON_KEY', process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY),
  powersyncUrl: req('EXPO_PUBLIC_POWERSYNC_URL', process.env.EXPO_PUBLIC_POWERSYNC_URL),
};
