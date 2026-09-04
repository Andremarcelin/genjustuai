export default async () => {
  return new Response(
    JSON.stringify({
      supabaseUrl: process.env.SUPABASE_URL || null,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null
    }),
    { headers: { "Content-Type": "application/json" } }
  );
};

export const config = { path: "/api/config" };
