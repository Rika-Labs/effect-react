export class RedirectError extends Error {
  readonly _tag = "RedirectError";

  constructor(
    readonly to: string,
    readonly replace: boolean = false,
  ) {
    super(`Redirect to ${to}`);
    this.name = "RedirectError";
  }
}

export class NotFoundError extends Error {
  readonly _tag = "NotFoundError";

  constructor(readonly pathname: string) {
    super(`Route not found: ${pathname}`);
    this.name = "NotFoundError";
  }
}

export const redirect = (to: string, options?: { readonly replace?: boolean }): never => {
  throw new RedirectError(to, options?.replace ?? false);
};

export const notFound = (pathname: string): never => {
  throw new NotFoundError(pathname);
};
