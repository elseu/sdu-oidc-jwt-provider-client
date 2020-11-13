import { useEffect, useState } from 'react';

import { useOidcJwtContext } from './OidcJwtProvider';
import { ClaimsBase, Params } from './store';

interface OidcAuthControls {
  authorize(params?: Params): void;
  logout(params?: Params): void;
}

interface OidcAuthSessionInfo {
  hasSession: boolean;
  hasValidSession: boolean;
}

function usePromiseResult<T>(
  f: () => Promise<T> | null,
  deps: unknown[],
): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    f()?.then((result) => {
      setValue(result);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

function useAuthControls(): OidcAuthControls {
  const { useStore } = useOidcJwtContext();
  const authorize = useStore(state => state.methods.authorize);
  const logout = useStore(state => state.methods.logout);
  return { authorize, logout };
}

function useAuthUserInfo<T>(): T | null {
  const { useStore } = useOidcJwtContext();
  const getUserInfo = useStore(state => state.methods.getUserInfo);
  const { hasValidSession } = useAuthSessionInfo();

  return usePromiseResult<T | null>(() => {
    if (!hasValidSession) {
      return Promise.resolve(null);
    }
    return getUserInfo<T>();
  }, []);
}

function useAuthAccessClaims<T extends ClaimsBase>(): T | null {
  const { useStore } = useOidcJwtContext();
  const getAccessToken = useStore(state => state.methods.getAccessToken);
  const { hasValidSession } = useAuthSessionInfo();

  return usePromiseResult<T | null>(() => {
    if (!hasValidSession) {
      return Promise.resolve(null);
    }
    return getAccessToken<T>().then(info => info?.claims ?? null);
  }, []);
}

function useAuthSessionInfo(): OidcAuthSessionInfo {
  const { useStore } = useOidcJwtContext();
  const hasSession = useStore(state => state.hasSessionToken());
  const hasValidSession = useStore(state => state.hasValidSession());

  return {
    hasSession,
    hasValidSession,
  };
}

function useAuthAccessToken(): { (): Promise<string | null> } {
  const { useStore } = useOidcJwtContext();
  const getAccessToken = useStore(state => state.methods.getAccessToken);
  return () => getAccessToken().then(result => result?.token ?? null);
}

export {
  useAuthControls,
  useAuthUserInfo,
  useAuthAccessClaims,
  useAuthSessionInfo,
  useAuthAccessToken,
};