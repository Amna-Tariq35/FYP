import { createClient } from '@supabase/supabase-js';

export async function verifyAdmin(request: Request) {
  // 1. Request se token nikalna
  const authHeader = request.headers.get('Authorization');
  
  if (!authHeader) {
    return { isAdmin: false, error: "Unauthorized: No token provided", status: 401 };
  }

  const token = authHeader.replace('Bearer ', '');
  
  // 2. Supabase se token verify karna
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);

  // 3. Check karna ke user admin hai ya nahi
  if (error || !user || user.email !== "admin@makeup.com") {
    return { isAdmin: false, error: "Forbidden: Admin access required", status: 403 };
  }

  // Agar sab theek hai toh true return karein
  return { isAdmin: true, user };
}