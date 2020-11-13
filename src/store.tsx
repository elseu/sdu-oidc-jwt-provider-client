import create, { UseStore } from 'zustand';

import { buildQuerystring, Http, HttpError, stripTokenFromUrl } from './utils';

interface AnyObject {
  [key:string]: string
}
export type Params = AnyObject
export interface ClaimsBase {
  iat: number
  exp: number
}
interface AccessTokenInfo<T extends ClaimsBase> {
  token: string | null;
  claims: T | null;
}
interface AccessTokenCache<T extends ClaimsBase> {
  value: AccessTokenInfo<T>;
  validUntil: number | null;
  isError: boolean;
}

interface StoreMethods {
  logout: (params?: Params) => void;
  authorize: (params?: Params) => void;

  /**
   * Read the session token from the URL. Remove it from the URL if possible.
   * @param redirect If true (the default), redirect to the same page without the token.
   * @returns Whether a redirect is taking place.
   */
  receiveSessionToken(redirect?: boolean): boolean

  /**
   * Get a valid access token. If we already have one that's valid, we will not fetch a new one.
   * @returns Promise of access token info, or null.
   */

  getAccessToken<T extends ClaimsBase>(): Promise<AccessTokenInfo<T> | null>;
  /**
   * Get user info. If we already have user info, we will not fetch new info.
   * @returns Promise of user info.
   */

  getUserInfo<T>(): Promise<T | null>;

  /**
   * Fetch fresh user info.
   * @returns A promise of the user info.
   */
  fetchUserInfo<T>(): Promise<T | null>;

  /**
   * Monitor our access token and keep it up-to-date, so getAccessToken() is always fast.
   */
  monitorAccessToken(): void;

  /**
   * Stop monitoring for new access token.
   */
  stopMonitoringAccessToken(): void;

  /**
   * Validate the AccessTokenCache. If cache is valid return value otherwise clean cache
   * @returns null, AccessTokenInfo or Promise of AccessTokenInfo
   */
  // eslint-disable-next-line max-len
  validateAccessTokenCache<T extends ClaimsBase>(cache: AccessTokenCache<T>, currentAccessTokenCache: Promise<AccessTokenCache<T>>): null | AccessTokenInfo<T> | Promise<AccessTokenInfo<T> | null>

  /**
   * Set our session token.
   * @param token
   */
  setSessionToken(token: string): void;

  /**
   * Fetch a fresh access token.
   * @returns A promise of the access token info.
   */
  fetchAccessToken<T extends ClaimsBase>(): Promise<AccessTokenInfo<T>>;
  fetchAccessTokenSuccess<T extends ClaimsBase>(value: AccessTokenInfo<T>, fetchedAt: number): AccessTokenCache<T>;
  fetchAccessTokenError(error: HttpError): AccessTokenCache<any>;
}

export type UseOidcJwtClientStore = {
  baseUrl: string
  csrfToken: string | null
  defaultAuthConfig: AnyObject
  monitorAccessTokenTimeout: ReturnType<typeof setTimeout> | null

  accessTokenCache?: Promise<AccessTokenCache<any>> | null;
  userInfoCache: any

  isLastAccessTokenInvalid: boolean

  hasSessionToken: () => boolean
  hasValidSession: () => boolean

  methods: StoreMethods
};

export interface OidcJwtClientOptions {
  url: string;
  defaultAuthConfig?: Params
}

const CSRF_TOKEN_STORAGE_KEY = 'oidc_jwt_provider_token';
function createOidcJwtClientStore (options: OidcJwtClientOptions): UseStore<UseOidcJwtClientStore> {
  return create<UseOidcJwtClientStore>((set, get) => ({
    baseUrl: options.url.replace(/\/$/, ''),
    csrfToken: localStorage.getItem(CSRF_TOKEN_STORAGE_KEY) ?? null,
    defaultAuthConfig: options.defaultAuthConfig ?? {},
    monitorAccessTokenTimeout: null,

    accessTokenCache: undefined,
    userInfoCache: undefined,

    isLastAccessTokenInvalid: false,

    hasSessionToken: () => !!get().csrfToken,
    hasValidSession: () => {
      const { csrfToken, isLastAccessTokenInvalid } = get();
      return !!csrfToken && !isLastAccessTokenInvalid;
    },

    methods: {

      authorize(params: Params = {}) {
        const { defaultAuthConfig, baseUrl } = get();
        // eslint-disable-next-line max-len
        const redirect_uri = defaultAuthConfig.redirect_uri || params.redirect_uri || stripTokenFromUrl(window.location.href);

        const queryParams = {
          ...defaultAuthConfig,
          ...params,
          redirect_uri,
        };
        window.location.href = baseUrl + '/authorize?' + buildQuerystring(queryParams);
      },

      logout: (params: Params = {}) => {
        const { baseUrl } = get();
        if (!params.post_logout_redirect_uri) {
          params.post_logout_redirect_uri = window.location.href;
        }
        window.location.href = baseUrl + '/logout?' + buildQuerystring(params);
      },

      receiveSessionToken(redirect = true): boolean {
        const { methods: { setSessionToken } } = get();

        const tokenMatch = window.location.search.match(/[?&]token=([^&]+)/);
        if (!tokenMatch) return false;

        setSessionToken(tokenMatch[1]);
        if (!redirect) {
          // TODO: Still need to figure out why #. is appearing in url
          window.location.href = stripTokenFromUrl(window.location.href).replace(/\?$/, '').replace(/#\.$/, '');
          return true;
        }
        return false;
      },

      validateAccessTokenCache<T extends ClaimsBase>(
        cache: AccessTokenCache<T>,
        currentAccessTokenCache: Promise<AccessTokenCache<T>>,
      ): null | AccessTokenInfo<T> | Promise<AccessTokenInfo<T> | null> {
        const { accessTokenCache, methods: { getAccessToken } } = get();
        const now = new Date().getTime();

        if (cache.isError) {
          return null;
        }

        if (cache.validUntil && cache.validUntil > now) {
          return cache.value;
        }

        // Cache is no longer valid; go again.
        if (accessTokenCache === currentAccessTokenCache) {
          // Remove the cache, but only if it hasn't already been removed and recreated by someone else.
          set({ accessTokenCache: null });
        }
        return getAccessToken();
      },

      getAccessToken<T extends ClaimsBase>(): Promise<AccessTokenInfo<T> | null> {
        const { accessTokenCache, methods: { fetchAccessToken }, methods: { validateAccessTokenCache } } = get();

        if (!accessTokenCache) {
          return fetchAccessToken<T>();
        }

        const currentAccessTokenCache = accessTokenCache;

        return accessTokenCache.then((cache) => validateAccessTokenCache<T>(cache, currentAccessTokenCache));
      },

      getUserInfo<T>(): Promise<T | null> {
        const { userInfoCache, methods: { fetchUserInfo } } = get();

        if (userInfoCache) {
          return userInfoCache;
        }

        return fetchUserInfo<T>();
      },

      monitorAccessToken(): void {
        const { accessTokenCache, methods: { fetchAccessToken } } = get();

        const updateToken = () => {
          console.log('updateToken');
          fetchAccessToken();
          accessTokenCache?.then(cache => {
            if (!cache.validUntil) return;

            // Update the token some 10 seconds before it expires.
            const now = new Date().getTime();
            const tokenUpdateTimestamp = cache.validUntil - 1000;
            const timeoutMs = Math.max(10000, tokenUpdateTimestamp - now);

            // Set a timeout to fetch a new token in X seconds.
            set({ monitorAccessTokenTimeout: setTimeout(updateToken, timeoutMs) });
          });
        };

        updateToken();
      },

      stopMonitoringAccessToken(): void {
        const { monitorAccessTokenTimeout } = get();
        if (!monitorAccessTokenTimeout) return;
        clearTimeout(monitorAccessTokenTimeout);
      },

      setSessionToken(token: string): void {
        set({ csrfToken: token });
        localStorage.setItem(CSRF_TOKEN_STORAGE_KEY, token);
      },

      fetchUserInfo<T>(): Promise<T | null> {
        const { baseUrl, csrfToken } = get();

        if (!csrfToken) {
          return Promise.resolve(null);
        }

        const userInfoCacheError = (error: HttpError) => {
          if (error.statusCode === 403) {
            throw new Error('Unknown error fetching userinfo');
          }
          return null;
        };

        const userInfoCache = Http.get<T>(`${baseUrl}/userinfo`, csrfToken)
          .then(result => result, userInfoCacheError);

        set({ userInfoCache });
        return userInfoCache;
      },

      fetchAccessToken<T extends ClaimsBase>(): Promise<AccessTokenInfo<T>> {
        const { baseUrl, csrfToken } = get();
        const { methods: { fetchAccessTokenSuccess, fetchAccessTokenError } } = get();

        const fetchedAt = new Date().getTime();
        if (!csrfToken) {
          return Promise.resolve({ token: null, claims: null });
        }

        const accessTokenCache = Http.get<AccessTokenInfo<T>>(`${baseUrl}/token`, csrfToken)
          .then(
            result => fetchAccessTokenSuccess<T>(result, fetchedAt),
            fetchAccessTokenError,
          );

        set({ accessTokenCache });
        return accessTokenCache.then((result) => result.value);
      },

      fetchAccessTokenSuccess<T extends ClaimsBase>(value: AccessTokenInfo<T>, fetchedAt: number) {
        const { isLastAccessTokenInvalid } = get();
        const { claims, token } = value;

        let validUntil = null;

        if (isLastAccessTokenInvalid) {
          set({ isLastAccessTokenInvalid: false });
        }

        if (!token) {
          return { value, validUntil, isError: false };
        }

        if (claims && typeof claims.iat === 'number' && typeof claims.exp === 'number') {
          validUntil = fetchedAt + 1000 * (claims.exp - claims.iat);
        }
        return { value, validUntil, isError: false };
      },

      fetchAccessTokenError(error: HttpError): AccessTokenCache<any> {
        const { isLastAccessTokenInvalid } = get();
        const emptyErrorToken = { value: { token: null, claims: null }, validUntil: null, isError: true };

        if (error.statusCode !== 403) return emptyErrorToken;

        if (!isLastAccessTokenInvalid) {
          set({ isLastAccessTokenInvalid: true });
        }
        return emptyErrorToken;
      },

    },
  }));
}

export { createOidcJwtClientStore };
