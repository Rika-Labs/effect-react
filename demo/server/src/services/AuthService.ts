import { Context, Effect, Layer } from "effect";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as jose from "jose";
import type { AuthToken, CreateUser, LoginRequest, User } from "@twitter-demo/shared";
import { BadRequest, Conflict, Unauthorized } from "@twitter-demo/shared";
import { Db } from "../db/client.js";
import { users } from "../db/schema.js";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET ?? "dev-secret-change-in-production",
);

const signToken = (user: { readonly id: string; readonly handle: string }) =>
  Effect.promise(() =>
    new jose.SignJWT({ sub: user.id, handle: user.handle })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(JWT_SECRET),
  );

const toUser = (row: typeof users.$inferSelect): User =>
  ({
    id: row.id,
    handle: row.handle,
    displayName: row.displayName,
    bio: row.bio,
    avatarUrl: row.avatarUrl,
    followersCount: Number(row.followersCount),
    followingCount: Number(row.followingCount),
    createdAt: row.createdAt,
  }) as User;

export class AuthService extends Context.Tag("AuthService")<
  AuthService,
  {
    readonly register: (input: CreateUser) => Effect.Effect<AuthToken, Conflict | BadRequest>;
    readonly login: (input: LoginRequest) => Effect.Effect<AuthToken, Unauthorized>;
    readonly getMe: (userId: string) => Effect.Effect<User, Unauthorized>;
  }
>() {}

export const AuthServiceLive = Layer.effect(
  AuthService,
  Effect.gen(function* () {
    const db = yield* Db;

    return AuthService.of({
      register: (input) =>
        Effect.gen(function* () {
          const existing = yield* Effect.tryPromise({
            try: () => db.query.users.findFirst({ where: eq(users.handle, input.handle) }),
            catch: () => new BadRequest({ message: "Database error" }),
          });
          if (existing) {
            return yield* new Conflict({ message: "Handle already taken" });
          }
          const passwordHash = yield* Effect.tryPromise({
            try: () => bcrypt.hash(input.password, 10),
            catch: () => new BadRequest({ message: "Failed to hash password" }),
          });
          const id = crypto.randomUUID();
          const now = new Date();
          yield* Effect.tryPromise({
            try: () =>
              db.insert(users).values({
                id,
                handle: input.handle,
                displayName: input.displayName,
                passwordHash,
                createdAt: now,
              }),
            catch: () => new BadRequest({ message: "Failed to create user" }),
          });
          const user = toUser({
            id,
            handle: input.handle,
            displayName: input.displayName,
            bio: "",
            avatarUrl: null,
            passwordHash,
            followersCount: "0",
            followingCount: "0",
            createdAt: now,
          });
          const token = yield* signToken(user);
          return { token, user } as AuthToken;
        }),

      login: (input) =>
        Effect.gen(function* () {
          const row = yield* Effect.tryPromise({
            try: () => db.query.users.findFirst({ where: eq(users.handle, input.handle) }),
            catch: () => new Unauthorized({ message: "Invalid credentials" }),
          });
          if (!row) {
            return yield* new Unauthorized({ message: "Invalid credentials" });
          }
          const valid = yield* Effect.tryPromise({
            try: () => bcrypt.compare(input.password, row.passwordHash),
            catch: () => new Unauthorized({ message: "Invalid credentials" }),
          });
          if (!valid) {
            return yield* new Unauthorized({ message: "Invalid credentials" });
          }
          const user = toUser(row);
          const token = yield* signToken(user);
          return { token, user } as AuthToken;
        }),

      getMe: (userId) =>
        Effect.gen(function* () {
          const row = yield* Effect.tryPromise({
            try: () => db.query.users.findFirst({ where: eq(users.id, userId) }),
            catch: () => new Unauthorized({ message: "User not found" }),
          });
          if (!row) {
            return yield* new Unauthorized({ message: "User not found" });
          }
          return toUser(row);
        }),
    });
  }),
);
