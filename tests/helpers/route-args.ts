import { type ActionFunctionArgs, RouterContextProvider } from 'react-router';

type RouteParams = Record<string, string | undefined>;

export function routeArgs(input: { request: Request }): ActionFunctionArgs;
export function routeArgs<Params extends RouteParams>(input: {
  params: Params;
  request: Request;
}): ActionFunctionArgs & { params: Params };

/** Supply the same explicit URL, pattern, params and context required by Router Framework. */
export function routeArgs(input: { params?: RouteParams; request: Request }): ActionFunctionArgs {
  const url = new URL(input.request.url);
  return {
    context: new RouterContextProvider(),
    params: input.params ?? {},
    pattern: url.pathname,
    request: input.request,
    url,
  };
}
