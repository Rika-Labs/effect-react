import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform";
import { Schema } from "effect";
import {
  MarkReadRequest,
  NotificationList,
} from "../schemas/Notification.js";
import { PaginationCursor } from "../schemas/common.js";
import { AuthMiddleware } from "./middleware.js";

export class NotificationsApi extends HttpApiGroup.make("notifications")
  .add(
    HttpApiEndpoint.get("list", "/notifications")
      .setUrlParams(PaginationCursor)
      .addSuccess(NotificationList),
  )
  .add(
    HttpApiEndpoint.patch("markRead", "/notifications/read")
      .setPayload(MarkReadRequest)
      .addSuccess(Schema.Void),
  )
  .middleware(AuthMiddleware) {}
