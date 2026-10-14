/* eslint-disable no-console */
import type { MappedResponseType } from 'ofetch';
import type { HttpClientOptions, ResponseType } from '../shared/http/http-client';
import { joinUrlPaths } from '@corentinth/chisels';
import { router } from './demo-api-mock';
import { ensureDemoStorageSeeded } from './demo.storage';

export async function demoHttpClient<A, R extends ResponseType = 'json'>(options: HttpClientOptions<R>): Promise<MappedResponseType<R, A>> {
  await ensureDemoStorageSeeded();

  // Routes are matched on the bare path: a query string written in the url is moved to the query option
  const [urlPath = options.url, queryString] = options.url.split('?');
  const query = { ...Object.fromEntries(new URLSearchParams(queryString ?? '')), ...options.query };
  const path = `/${joinUrlPaths(options.method ?? 'GET', urlPath)}`;
  const matchedRoute = router.lookup(path);

  if (!matchedRoute) {
    console.warn(`[demo] No route found for ${options.method} ${options.url}`);
    return {} as any;
  }

  const params = matchedRoute.params;

  const data = await matchedRoute.handler({ params, ...options, query });

  console.log(`[demo] ${options.method} ${options.url} `, data);

  return data;
}
