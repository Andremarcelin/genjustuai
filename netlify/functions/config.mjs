export default async () => {
  const supabaseUrl =
    (typeof Netlify !== "undefined" && Netlify.env ? Netlify.env.get("SUPABASE_URL") : null) ||
    process.env.SUPABASE_URL ||
    null;

  const supabaseAnonKey =
    (typeof Netlify !== "undefined" && Netlify.env ? Netlify.env.get("SUPABASE_ANON_KEY") : null) ||
    process.env.SUPABASE_ANON_KEY ||
    null;

  return Response.json(
    {
      supabaseUrl,
      supabaseAnonKey,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    }
  );
};

export const config = {
  path: "/api/config",
};
