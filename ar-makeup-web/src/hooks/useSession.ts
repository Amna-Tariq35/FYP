"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/src/lib/supabase/client";

export type SessionStatus = "loading" | "signed_in" | "signed_out";

export function useSession() {
  const [status, setStatus] = useState<SessionStatus>("loading");

  useEffect(() => {
    // initial check
    supabase.auth.getSession().then(({ data }) => {
      setStatus(data.session ? "signed_in" : "signed_out");
    });

    // subscribe to changes
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setStatus(session ? "signed_in" : "signed_out");
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  return { status, isSignedIn: status === "signed_in" };
}
