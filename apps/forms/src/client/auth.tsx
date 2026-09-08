import { useCallback, useEffect, useState } from "react";
import type { MeResponse } from "../shared/dto.ts";
import { getMe } from "./api.ts";

export interface AuthState {
  loading: boolean;
  me: MeResponse | null;
  refresh: () => void;
}

export function useAuth(): AuthState {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<MeResponse | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    getMe()
      .then(setMe)
      .catch(() => setMe({ authenticated: false }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  return { loading, me, refresh };
}
