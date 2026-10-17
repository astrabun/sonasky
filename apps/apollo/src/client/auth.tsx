import { useCallback, useEffect, useState } from "react";
import type { MeResponse } from "../shared/dto.ts";
import { api } from "./api.ts";

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
    api
      .me()
      .then(setMe)
      .catch(() => setMe({ authenticated: false }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(refresh, [refresh]);

  return { loading, me, refresh };
}
