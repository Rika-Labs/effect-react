import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { AuthToken, CreateUser, LoginRequest } from "../schemas/User.js";
import { BadRequest, Conflict, Unauthorized } from "../schemas/Errors.js";

export class AuthApi extends HttpApiGroup.make("auth")
  .add(
    HttpApiEndpoint.post("register", "/auth/register")
      .setPayload(CreateUser)
      .addSuccess(AuthToken),
  )
  .add(
    HttpApiEndpoint.post("login", "/auth/login")
      .setPayload(LoginRequest)
      .addSuccess(AuthToken),
  )
  .addError(Unauthorized)
  .addError(Conflict)
  .addError(BadRequest) {}
