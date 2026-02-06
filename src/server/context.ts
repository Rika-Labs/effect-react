import { Context, Layer } from "effect";

export interface RequestContextValue {
  readonly request: Request;
  readonly url: URL;
  readonly method: string;
  readonly headers: Headers;
  readonly cookies: Readonly<Record<string, string>>;
}

export class RequestContext extends Context.Tag("RequestContext")<
  RequestContext,
  RequestContextValue
>() {}

const parseCookies = (cookieHeader: string): Readonly<Record<string, string>> => {
  if (cookieHeader.length === 0) {
    return {};
  }
  const result: Record<string, string> = {};
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const eqIndex = pair.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }
    const key = pair.slice(0, eqIndex).trim();
    const value = pair.slice(eqIndex + 1).trim();
    if (key.length > 0) {
      result[key] = value;
    }
  }
  return result;
};

export const RequestContextLive = (request: Request): Layer.Layer<RequestContext> =>
  Layer.succeed(RequestContext, {
    request,
    url: new URL(request.url),
    method: request.method,
    headers: request.headers,
    cookies: parseCookies(request.headers.get("cookie") ?? ""),
  });
