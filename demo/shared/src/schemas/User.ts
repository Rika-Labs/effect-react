import { Schema } from "effect";
import { Timestamp } from "./common.js";

export const UserId = Schema.String.pipe(Schema.brand("UserId"));
export type UserId = typeof UserId.Type;

export const User = Schema.Struct({
  id: UserId,
  handle: Schema.String,
  displayName: Schema.String,
  bio: Schema.String,
  avatarUrl: Schema.NullOr(Schema.String),
  followersCount: Schema.Number,
  followingCount: Schema.Number,
  createdAt: Timestamp,
});
export type User = typeof User.Type;

export const UserProfile = Schema.Struct({
  ...User.fields,
  isFollowing: Schema.Boolean,
});
export type UserProfile = typeof UserProfile.Type;

export const CreateUser = Schema.Struct({
  handle: Schema.String.pipe(
    Schema.minLength(3),
    Schema.maxLength(20),
    Schema.pattern(/^[a-zA-Z0-9_]+$/),
  ),
  displayName: Schema.String.pipe(Schema.minLength(1), Schema.maxLength(50)),
  password: Schema.String.pipe(Schema.minLength(8)),
});
export type CreateUser = typeof CreateUser.Type;

export const LoginRequest = Schema.Struct({
  handle: Schema.String.pipe(Schema.minLength(1)),
  password: Schema.String.pipe(Schema.minLength(1)),
});
export type LoginRequest = typeof LoginRequest.Type;

export const AuthToken = Schema.Struct({
  token: Schema.String,
  user: User,
});
export type AuthToken = typeof AuthToken.Type;
