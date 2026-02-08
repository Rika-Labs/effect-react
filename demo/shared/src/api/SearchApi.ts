import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { SearchQuery, SearchResults } from "../schemas/Search.js";
import { Unauthorized } from "../schemas/Errors.js";
import { AuthMiddleware } from "./middleware.js";

export class SearchApi extends HttpApiGroup.make("search")
  .add(
    HttpApiEndpoint.get("search", "/search")
      .setUrlParams(SearchQuery)
      .addSuccess(SearchResults),
  )
  .addError(Unauthorized)
  .middleware(AuthMiddleware) {}
