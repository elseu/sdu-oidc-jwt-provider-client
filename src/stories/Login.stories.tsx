import { Meta, Story } from '@storybook/react';
import React, { useState } from 'react';

import {
  useAuthAccessClaims,
  useAuthAccessToken,
  useAuthControls,
  useAuthInitialized,
  useAuthIsLoggedIn,
  useAuthSessionInfo,
  useAuthUserInfo,
} from '../hooks';
import { OidcJwtProvider } from '../OidcJwtProvider';

interface TemplateProps {
  url: string;
  shouldAttemptLogin: boolean;
  shouldMonitorAccessTokens: boolean;
  testApiUrl?: string;
}

const Template: Story<TemplateProps> = (props: TemplateProps) => {
  const {
    url,
    shouldAttemptLogin = false,
    shouldMonitorAccessTokens = false,
    testApiUrl,
  } = props;
  return (
    <OidcJwtProvider
      client={{ url }}
      shouldAttemptLogin={shouldAttemptLogin}
      shouldMonitorAccessTokens={shouldMonitorAccessTokens}
    >
      <Content testApiUrl={testApiUrl} />
    </OidcJwtProvider>
  );
};

interface ContentProps {
  testApiUrl?: string;
}

interface UserInfo {
  cn: string
  email: string
  givenName: string
  login: string
  name: string
  sn: string
  sub: string
  updated_at: number
}

interface Orig {
  iss: string;
  aud: string;
  nbf: number;
  exp: number;
}

interface Claims {
  iss: string;
  aud: string;
  orig: Orig;
  scope: string[];
  anon: boolean;
  sub: string;
  role: string;
  amr: string;
  givenName: string;
  MFA: boolean;
  externalId: string;
  cn: string;
  login: string;
  sid: string;
  idp: string;
  updated_at: string;
  auth_time: number;
  sn: string;
  email: string;
  iat: number;
  exp: number;
}

const Content = (props: ContentProps) => {
  const { testApiUrl } = props;
  const sessionInfo = useAuthSessionInfo();
  const { value: userInfo } = useAuthUserInfo<UserInfo>();
  const [token, setToken] = useState<null | string>(null);
  const [apiResult, setApiResult] = useState<null | string>(null);
  const { value: claims } = useAuthAccessClaims<Claims>();
  const { authorize, logout } = useAuthControls();
  const fetchAccessToken = useAuthAccessToken();
  const isLoggedIn = useAuthIsLoggedIn();
  const initializedData = useAuthInitialized();

  const onClickFetchToken = React.useCallback(() => {
    fetchAccessToken().then((token) => {
      setToken(token);
    });
  }, [fetchAccessToken, setToken]);

  const onClickCallApi = React.useCallback(() => {
    if (!testApiUrl) {
      alert('No API url');
      setApiResult(null);
      return;
    }

    fetchAccessToken().then((token) => {
      fetch(testApiUrl, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
        .then((response) => response.json())
        .then((json) => {
          setApiResult(JSON.stringify(json, undefined, 4));
        });
    });
  }, [fetchAccessToken, testApiUrl]);

  const onClickLogout = React.useCallback(() => {
    logout();
  }, [logout]);

  const onClickLogin = React.useCallback(() => {
    authorize();
  }, [authorize]);
  return (
    <>
      <div>
        {isLoggedIn && <button onClick={onClickLogout}>Log out</button>}
        {isLoggedIn && (
          <button onClick={onClickFetchToken}>Fetch token</button>
        )}
        {testApiUrl && (
          <button onClick={onClickCallApi}>Call API</button>
        )}
        {!isLoggedIn && <button onClick={onClickLogin}>Log in</button>}
        {token && (
          <>
            <h2>Token</h2>
            <LargeTextArea value={token}></LargeTextArea>
          </>
        )}
        {apiResult && (
          <>
            <h2>API result</h2>
            <LargeTextArea value={apiResult}></LargeTextArea>
          </>
        )}
      </div>
      <hr />
      <h1>Initialized data</h1>
      <LargeTextArea value={JSON.stringify(initializedData, undefined, 4)}></LargeTextArea>
      <h1>Session info</h1>
      <LargeTextArea value={JSON.stringify(sessionInfo, undefined, 4)}></LargeTextArea>
      <h1>User info</h1>
      <LargeTextArea value={JSON.stringify(userInfo, undefined, 4)}></LargeTextArea>
      <h1>Access token claims</h1>
      <LargeTextArea value={JSON.stringify(claims, undefined, 4)}></LargeTextArea>
      <h1>User is logged in?</h1>
      <LargeTextArea value={JSON.stringify(isLoggedIn, undefined, 4)}></LargeTextArea>
    </>
  );
};

interface LargeTextAreaProps {
  value: string;
}

const LargeTextArea = (props: LargeTextAreaProps) => {
  return (
    <textarea
      style={{ height: '250px', width: '100%' }}
      value={props.value}
      onChange={(e) => console.log(e.target.value)}
    />
  );
};

export const Login = Template.bind({});

Login.args = {
  url: 'https://api-auth.acc.titan.awssdu.nl',
  testApiUrl: 'https://api-auth-test.acc.titan.awssdu.nl',
  shouldAttemptLogin: true,
  shouldMonitorAccessTokens: true,
};

export default {
  title: 'Example/Login',
  component: Login,
} as Meta;
