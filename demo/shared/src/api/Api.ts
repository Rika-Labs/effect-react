import { HttpApi } from "@effect/platform";
import { AuthApi } from "./AuthApi.js";
import { TweetsApi } from "./TweetsApi.js";
import { UsersApi } from "./UsersApi.js";
import { InteractionsApi } from "./InteractionsApi.js";
import { NotificationsApi } from "./NotificationsApi.js";
import { SearchApi } from "./SearchApi.js";

export class TwitterApi extends HttpApi.make("twitter")
  .add(AuthApi)
  .add(TweetsApi)
  .add(UsersApi)
  .add(InteractionsApi)
  .add(NotificationsApi)
  .add(SearchApi) {}
