import queryString from 'query-string';

function stripTokenFromUrl(href: string): string {
  //= > {url: 'https://foo.bar', query: {foo: 'bar'}}
  const parsedUrl = queryString.parseUrl(href, { parseFragmentIdentifier: true });
  const { url, query, fragmentIdentifier } = parsedUrl;
  const { token, ...params } = query;
  return queryString.stringifyUrl({ url, query: params, fragmentIdentifier });
}

export { stripTokenFromUrl };
