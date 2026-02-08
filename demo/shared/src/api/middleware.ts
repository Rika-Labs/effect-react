import { Context } from "effect";
import { HttpApiMiddleware, HttpApiSecurity } from "@effect/platform";
import { Unauthorized } from "../schemas/Errors.js";

export class CurrentUser extends Context.Tag("CurrentUser")<
  CurrentUser,
  { readonly id: string; readonly handle: string }
>() {}

export const security = HttpApiSecurity.bearer;

export class AuthMiddleware extends HttpApiMiddleware.Tag<AuthMiddleware>()(
  "AuthMiddleware",
  {
    failure: Unauthorized,
    provides: CurrentUser,
    security: { bearer: security },
  },
) {}
