/**
 * Seed script for the Twitter/X demo.
 *
 * Seeds accounts from the Effect, React, and TypeScript communities
 * with realistic profile images, bios, and posts about the ecosystem.
 *
 * Usage: bun run seed (from demo/server or demo root)
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import * as schema from "./schema.js";

const sql = postgres(
  process.env.DATABASE_URL ?? "postgres://twitter:twitter@localhost:5432/twitter",
);
const db = drizzle(sql, { schema });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const uuid = () => crypto.randomUUID();

const hashPassword = (pw: string) => bcrypt.hashSync(pw, 10);

/** Stagger timestamps so tweets appear in a natural feed order. */
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);

// All seeded accounts share the same password for demo purposes.
const DEFAULT_PASSWORD = hashPassword("effectdemo");

// ---------------------------------------------------------------------------
// User data — real community members
// ---------------------------------------------------------------------------

interface SeedUser {
  id: string;
  handle: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
}

const seedUsers: SeedUser[] = [
  {
    id: uuid(),
    handle: "mikearnaldi",
    displayName: "Michael Arnaldi",
    bio: "Creator of Effect. Building production-grade TypeScript. CEO @EffectfulTech",
    avatarUrl: "https://github.com/mikearnaldi.png",
  },
  {
    id: uuid(),
    handle: "timsmart",
    displayName: "Tim Smart",
    bio: "Founding Engineer at Effectful Technologies. Core contributor to Effect-TS.",
    avatarUrl: "https://github.com/tim-smart.png",
  },
  {
    id: uuid(),
    handle: "imax153",
    displayName: "Maxwell Brown",
    bio: "Founding Engineer at Effectful Technologies. Effect-TS core team.",
    avatarUrl: "https://github.com/IMax153.png",
  },
  {
    id: uuid(),
    handle: "gcanti",
    displayName: "Giulio Canti",
    bio: "Author of fp-ts. Functional programming in TypeScript. Now part of the Effect ecosystem.",
    avatarUrl: "https://github.com/gcanti.png",
  },
  {
    id: uuid(),
    handle: "schickling",
    displayName: "Johannes Schickling",
    bio: "Founder of Prisma. Building with Effect. Passionate about developer tools and type safety.",
    avatarUrl: "https://github.com/schickling.png",
  },
  {
    id: uuid(),
    handle: "dan_abramov",
    displayName: "Dan Abramov",
    bio: "Working on React. Co-author of Redux. Trying to make UI programming less painful.",
    avatarUrl: "https://github.com/gaearon.png",
  },
  {
    id: uuid(),
    handle: "sebmarkbage",
    displayName: "Sebastian Markbåge",
    bio: "React core team. Architect of React Fiber and Concurrent Mode at Vercel.",
    avatarUrl: "https://github.com/sebmarkbage.png",
  },
  {
    id: uuid(),
    handle: "kentcdodds",
    displayName: "Kent C. Dodds",
    bio: "Helping people make the world better through quality software. Epic Web Dev.",
    avatarUrl: "https://github.com/kentcdodds.png",
  },
  {
    id: uuid(),
    handle: "tannerlinsley",
    displayName: "Tanner Linsley",
    bio: "Creator of TanStack (React Query, React Table, React Router). OSS enthusiast.",
    avatarUrl: "https://github.com/tannerlinsley.png",
  },
  {
    id: uuid(),
    handle: "mattpocockuk",
    displayName: "Matt Pocock",
    bio: "TypeScript educator. Creator of Total TypeScript. Making TS wizardry accessible.",
    avatarUrl: "https://github.com/mattpocock.png",
  },
  {
    id: uuid(),
    handle: "leerob",
    displayName: "Lee Robinson",
    bio: "VP of Product at Vercel. Next.js, React, and the future of the web.",
    avatarUrl: "https://github.com/leerob.png",
  },
  {
    id: uuid(),
    handle: "jaborpalmer",
    displayName: "Jared Palmer",
    bio: "Creator of Formik. Building AI at Vercel. TypeScript maximalist.",
    avatarUrl: "https://github.com/jaredpalmer.png",
  },
  {
    id: uuid(),
    handle: "ryanflorence",
    displayName: "Ryan Florence",
    bio: "Co-founder of Remix. Creator of React Router. Web standards advocate.",
    avatarUrl: "https://github.com/ryanflorence.png",
  },
  {
    id: uuid(),
    handle: "t3dotgg",
    displayName: "Theo Browne",
    bio: "Creator of T3 Stack and UploadThing. TypeScript YouTuber. Ship more, suffer less.",
    avatarUrl: "https://github.com/t3dotgg.png",
  },
  {
    id: uuid(),
    handle: "sophiebits",
    displayName: "Sophie Alpert",
    bio: "Former React team lead. Engineering leader. Building great developer experiences.",
    avatarUrl: "https://github.com/sophiebits.png",
  },
];

// ---------------------------------------------------------------------------
// Tweets — realistic posts about Effect, React, TypeScript, @effect-react
// ---------------------------------------------------------------------------

type TweetSeed = { authorHandle: string; content: string; minutesAgo: number };

const seedTweets: TweetSeed[] = [
  // Michael Arnaldi — Effect creator
  {
    authorHandle: "mikearnaldi",
    content:
      "Effect 3.19 just landed! Structured concurrency, typed errors, dependency injection — all in one library. The TypeScript ecosystem deserves better error handling.",
    minutesAgo: 5,
  },
  {
    authorHandle: "mikearnaldi",
    content:
      "The key insight behind Effect: errors should be typed, resources should be managed, and concurrency should be structured. No exceptions (pun intended).",
    minutesAgo: 180,
  },
  {
    authorHandle: "mikearnaldi",
    content:
      "Really excited about @effect-react/react — someone finally built the React integration we always wanted. useQuery with typed errors, SubscriptionRef-based state management. This is the way.",
    minutesAgo: 600,
  },

  // Tim Smart
  {
    authorHandle: "timsmart",
    content:
      "Just shipped HttpApiBuilder improvements in @effect/platform. Defining your API once in the shared package and getting type-safe clients for free is still magical.",
    minutesAgo: 15,
  },
  {
    authorHandle: "timsmart",
    content:
      "People ask why Effect uses generators instead of async/await. The answer: generators give us typed errors, interruption, and resource safety. async/await gives you Promise<T>.",
    minutesAgo: 300,
  },

  // Maxwell Brown
  {
    authorHandle: "imax153",
    content:
      "Schema in Effect is underrated. Runtime validation + static types + JSON serialization from a single declaration. Goodbye zod + manual types.",
    minutesAgo: 25,
  },
  {
    authorHandle: "imax153",
    content:
      "The Effect Layer system is basically compile-time dependency injection that's actually ergonomic. No decorators, no magic strings, just types.",
    minutesAgo: 500,
  },

  // Giulio Canti
  {
    authorHandle: "gcanti",
    content:
      "From fp-ts to Effect — the evolution of typed functional programming in TypeScript. Effect takes everything we learned and makes it production-ready.",
    minutesAgo: 45,
  },
  {
    authorHandle: "gcanti",
    content:
      "Type-level programming in TypeScript has come so far. Effect.Effect<A, E, R> encodes success, failure, AND requirements in the type signature. Beautiful.",
    minutesAgo: 800,
  },

  // Johannes Schickling
  {
    authorHandle: "schickling",
    content:
      "Been using Effect at scale for 6 months now. The structured concurrency primitives alone have prevented dozens of resource leak bugs. This is how you build reliable systems in TypeScript.",
    minutesAgo: 60,
  },
  {
    authorHandle: "schickling",
    content:
      "Effect + React is the stack I've been waiting for. Typed errors propagating from your API to your UI components? Yes please. @effect-react/react makes this seamless.",
    minutesAgo: 400,
  },

  // Dan Abramov
  {
    authorHandle: "dan_abramov",
    content:
      "Interesting to see how the Effect community is approaching React integration. The idea of bridging Effect's runtime into useSyncExternalStore is clever — avoids tearing while keeping the Effect model intact.",
    minutesAgo: 90,
  },
  {
    authorHandle: "dan_abramov",
    content:
      "React 19 + typed async operations is an area I'm excited about. Libraries like @effect-react/react are exploring the right design space — making effects first-class in the component model.",
    minutesAgo: 720,
  },

  // Sebastian Markbåge
  {
    authorHandle: "sebmarkbage",
    content:
      "The move toward typed errors in the JavaScript ecosystem is long overdue. TypeScript's union types make it possible. Effect's approach of Effect<A, E, R> nails the ergonomics.",
    minutesAgo: 120,
  },

  // Kent C. Dodds
  {
    authorHandle: "kentcdodds",
    content:
      "Just tried @effect-react/react for a side project. The useQuery hook with automatic cache invalidation and typed errors is really well done. It's like React Query but with full type safety on the error channel.",
    minutesAgo: 35,
  },
  {
    authorHandle: "kentcdodds",
    content:
      "Testing tip: when your hooks use Effect under the hood, you can provide test Layers that swap out real services for mocks. Dependency injection at the framework level. Game changer.",
    minutesAgo: 450,
  },

  // Tanner Linsley
  {
    authorHandle: "tannerlinsley",
    content:
      "As the React Query creator, I have to say — the approach @effect-react/react takes with Effect programs as queries is genuinely innovative. Different paradigm, same great caching semantics.",
    minutesAgo: 150,
  },
  {
    authorHandle: "tannerlinsley",
    content:
      "The future of data fetching in React is typed end-to-end. Whether it's TanStack Query, @effect-react/react, or something else — type safety from database to component is the goal.",
    minutesAgo: 900,
  },

  // Matt Pocock
  {
    authorHandle: "mattpocockuk",
    content:
      "Effect's type system usage is one of the most sophisticated I've seen in the TypeScript ecosystem. The way they encode errors and dependencies in the type signature is a masterclass in TypeScript generics.",
    minutesAgo: 75,
  },
  {
    authorHandle: "mattpocockuk",
    content:
      "🧵 TypeScript tip: Effect uses branded types for IDs (like UserId, TweetId). This prevents you from accidentally passing a UserId where a TweetId is expected. Zero runtime cost, massive type safety win.",
    minutesAgo: 350,
  },
  {
    authorHandle: "mattpocockuk",
    content:
      "If you haven't looked at Schema from Effect yet, you're missing out. Single source of truth for: TypeScript types, runtime validation, JSON encoding/decoding, and OpenAPI schemas. One declaration.",
    minutesAgo: 1200,
  },

  // Lee Robinson
  {
    authorHandle: "leerob",
    content:
      "The React ecosystem is maturing in exciting ways. Libraries like @effect-react/react are showing what's possible when you bring proper effect systems to the frontend. Type-safe queries, mutations, forms — all from one paradigm.",
    minutesAgo: 200,
  },

  // Jared Palmer
  {
    authorHandle: "jaborpalmer",
    content:
      "useForm in @effect-react/react with Schema validation is what Formik should have been. Schema-first validation that's both the runtime check AND the TypeScript type. No more form type mismatches.",
    minutesAgo: 110,
  },

  // Ryan Florence
  {
    authorHandle: "ryanflorence",
    content:
      "The web platform keeps getting better, and so do our tools. Effect brings algebraic effects to TypeScript, @effect-react/react bridges them to React. We're living in the golden age of web dev.",
    minutesAgo: 250,
  },

  // Theo Browne
  {
    authorHandle: "t3dotgg",
    content:
      "OK I finally tried Effect and I get it now. The learning curve is real, but once it clicks... typed errors, dependency injection, structured concurrency. It's like TypeScript on steroids.",
    minutesAgo: 30,
  },
  {
    authorHandle: "t3dotgg",
    content:
      "Hot take: @effect-react/react might be the most ambitious React library since React Query. It's not just data fetching — it's a full state management + query + forms + routing solution built on Effect.",
    minutesAgo: 480,
  },
  {
    authorHandle: "t3dotgg",
    content:
      "SubscriptionRef from Effect as a state management primitive in React is genius. It's like Zustand but with Effect's composability. useSubscriptionRef just works.",
    minutesAgo: 1000,
  },

  // Sophie Alpert
  {
    authorHandle: "sophiebits",
    content:
      "What I love about the Effect-React integration: it doesn't fight React's model. It uses useSyncExternalStore for state, Effects for async — clean separation of concerns.",
    minutesAgo: 170,
  },
  {
    authorHandle: "sophiebits",
    content:
      "ManagedRuntime + React context is the right pattern for providing Effect services to components. @effect-react/react's EffectProvider nails this.",
    minutesAgo: 650,
  },
];

// ---------------------------------------------------------------------------
// Follow relationships — create a realistic social graph
// ---------------------------------------------------------------------------

const followPairs: [string, string][] = [
  // Everyone follows Mike (Effect creator)
  ["timsmart", "mikearnaldi"],
  ["imax153", "mikearnaldi"],
  ["gcanti", "mikearnaldi"],
  ["schickling", "mikearnaldi"],
  ["kentcdodds", "mikearnaldi"],
  ["mattpocockuk", "mikearnaldi"],
  ["t3dotgg", "mikearnaldi"],
  ["tannerlinsley", "mikearnaldi"],
  ["dan_abramov", "mikearnaldi"],
  ["sophiebits", "mikearnaldi"],
  ["leerob", "mikearnaldi"],

  // Effect team follows each other
  ["mikearnaldi", "timsmart"],
  ["mikearnaldi", "imax153"],
  ["mikearnaldi", "gcanti"],
  ["timsmart", "imax153"],
  ["imax153", "timsmart"],
  ["timsmart", "gcanti"],

  // React people follow each other
  ["dan_abramov", "sebmarkbage"],
  ["sebmarkbage", "dan_abramov"],
  ["dan_abramov", "sophiebits"],
  ["sophiebits", "dan_abramov"],
  ["kentcdodds", "dan_abramov"],
  ["ryanflorence", "dan_abramov"],
  ["tannerlinsley", "kentcdodds"],
  ["leerob", "dan_abramov"],
  ["leerob", "kentcdodds"],

  // Cross-community follows
  ["mikearnaldi", "dan_abramov"],
  ["mikearnaldi", "mattpocockuk"],
  ["schickling", "dan_abramov"],
  ["schickling", "tannerlinsley"],
  ["kentcdodds", "mattpocockuk"],
  ["t3dotgg", "mattpocockuk"],
  ["t3dotgg", "kentcdodds"],
  ["t3dotgg", "tannerlinsley"],
  ["mattpocockuk", "gcanti"],
  ["mattpocockuk", "dan_abramov"],
  ["jaborpalmer", "dan_abramov"],
  ["jaborpalmer", "kentcdodds"],
  ["ryanflorence", "kentcdodds"],
];

// ---------------------------------------------------------------------------
// Likes — sprinkle realistic likes across tweets
// ---------------------------------------------------------------------------

type LikePair = { likerHandle: string; tweetIndex: number };

const seedLikes: LikePair[] = [
  // Mike's announcement gets lots of love
  { likerHandle: "timsmart", tweetIndex: 0 },
  { likerHandle: "imax153", tweetIndex: 0 },
  { likerHandle: "gcanti", tweetIndex: 0 },
  { likerHandle: "schickling", tweetIndex: 0 },
  { likerHandle: "kentcdodds", tweetIndex: 0 },
  { likerHandle: "mattpocockuk", tweetIndex: 0 },
  { likerHandle: "t3dotgg", tweetIndex: 0 },
  { likerHandle: "dan_abramov", tweetIndex: 0 },

  // Theo's "I finally tried Effect" — relatable
  { likerHandle: "mikearnaldi", tweetIndex: 24 },
  { likerHandle: "timsmart", tweetIndex: 24 },
  { likerHandle: "kentcdodds", tweetIndex: 24 },
  { likerHandle: "mattpocockuk", tweetIndex: 24 },
  { likerHandle: "schickling", tweetIndex: 24 },

  // Matt Pocock's TypeScript tips
  { likerHandle: "t3dotgg", tweetIndex: 18 },
  { likerHandle: "kentcdodds", tweetIndex: 18 },
  { likerHandle: "mikearnaldi", tweetIndex: 18 },
  { likerHandle: "gcanti", tweetIndex: 18 },
  { likerHandle: "dan_abramov", tweetIndex: 19 },
  { likerHandle: "timsmart", tweetIndex: 20 },
  { likerHandle: "imax153", tweetIndex: 20 },

  // Kent's @effect-react review
  { likerHandle: "mikearnaldi", tweetIndex: 14 },
  { likerHandle: "timsmart", tweetIndex: 14 },
  { likerHandle: "tannerlinsley", tweetIndex: 14 },
  { likerHandle: "t3dotgg", tweetIndex: 14 },

  // Tanner's endorsement
  { likerHandle: "mikearnaldi", tweetIndex: 16 },
  { likerHandle: "kentcdodds", tweetIndex: 16 },
  { likerHandle: "leerob", tweetIndex: 16 },

  // Dan's observations
  { likerHandle: "mikearnaldi", tweetIndex: 11 },
  { likerHandle: "timsmart", tweetIndex: 11 },
  { likerHandle: "sebmarkbage", tweetIndex: 11 },
  { likerHandle: "sophiebits", tweetIndex: 11 },
  { likerHandle: "kentcdodds", tweetIndex: 12 },

  // Tim's HttpApiBuilder post
  { likerHandle: "mikearnaldi", tweetIndex: 3 },
  { likerHandle: "imax153", tweetIndex: 3 },
  { likerHandle: "schickling", tweetIndex: 3 },

  // Maxwell's Schema post
  { likerHandle: "mikearnaldi", tweetIndex: 5 },
  { likerHandle: "timsmart", tweetIndex: 5 },
  { likerHandle: "mattpocockuk", tweetIndex: 5 },

  // Theo's hot take on effect-react
  { likerHandle: "mikearnaldi", tweetIndex: 25 },
  { likerHandle: "timsmart", tweetIndex: 25 },
  { likerHandle: "imax153", tweetIndex: 25 },
  { likerHandle: "kentcdodds", tweetIndex: 25 },
  { likerHandle: "tannerlinsley", tweetIndex: 25 },
  { likerHandle: "leerob", tweetIndex: 25 },
];

// ---------------------------------------------------------------------------
// Replies — threaded conversations
// ---------------------------------------------------------------------------

type ReplySeed = {
  authorHandle: string;
  content: string;
  /** Index into seedTweets that this is replying to */
  replyToTweetIndex: number;
  /** Offset from parent tweet's minutesAgo */
  minutesAfterParent: number;
};

const seedReplies: ReplySeed[] = [
  // Replies to Mike's "Effect 3.19 just landed" (index 0)
  {
    authorHandle: "timsmart",
    content: "The new Stream improvements are my favorite part. Backpressure handling is so much cleaner now.",
    replyToTweetIndex: 0,
    minutesAfterParent: 2,
  },
  {
    authorHandle: "imax153",
    content: "The Schema.TaggedError refinements are huge too. Error modeling has never been this ergonomic in TypeScript.",
    replyToTweetIndex: 0,
    minutesAfterParent: 4,
  },
  {
    authorHandle: "mattpocockuk",
    content: "Just spent an hour reading the changelog. The type inference improvements alone are worth the upgrade. Incredible work from the team.",
    replyToTweetIndex: 0,
    minutesAfterParent: 8,
  },
  {
    authorHandle: "t3dotgg",
    content: "Every release you all somehow make the DX even better. The learning curve is getting shorter with each version. Effect 4 when? 😄",
    replyToTweetIndex: 0,
    minutesAfterParent: 15,
  },
  {
    authorHandle: "schickling",
    content: "Already upgrading our production systems. The migration guide is excellent as always.",
    replyToTweetIndex: 0,
    minutesAfterParent: 20,
  },

  // Replies to Theo's "I finally tried Effect" (index 24)
  {
    authorHandle: "mikearnaldi",
    content: "Welcome to the Effect side! Happy to hear it clicked. The Discord community is great if you have questions along the way.",
    replyToTweetIndex: 24,
    minutesAfterParent: 5,
  },
  {
    authorHandle: "mattpocockuk",
    content: "The moment it clicks is unforgettable. For me it was when I realized Effect.gen gives you the same feel as async/await but with typed errors and DI built in.",
    replyToTweetIndex: 24,
    minutesAfterParent: 10,
  },
  {
    authorHandle: "kentcdodds",
    content: "Same experience here. The first week was rough, then suddenly everything made sense. Now I can't go back to raw Promises.",
    replyToTweetIndex: 24,
    minutesAfterParent: 18,
  },

  // Replies to Dan's observation about Effect-React integration (index 11)
  {
    authorHandle: "mikearnaldi",
    content: "Thanks Dan! The useSyncExternalStore bridge was key — it lets us keep Effect's fiber model intact while playing nice with React's concurrent features.",
    replyToTweetIndex: 11,
    minutesAfterParent: 10,
  },
  {
    authorHandle: "sophiebits",
    content: "This is exactly the right approach. useSyncExternalStore was designed for exactly this kind of external state integration. Glad to see it being used well.",
    replyToTweetIndex: 11,
    minutesAfterParent: 25,
  },
  {
    authorHandle: "sebmarkbage",
    content: "The fiber lifecycle mapping to React's commit/unmount phases is elegant. Would love to see how this handles Suspense boundaries.",
    replyToTweetIndex: 11,
    minutesAfterParent: 40,
  },

  // Replies to Matt's TypeScript branded types tip (index 19)
  {
    authorHandle: "t3dotgg",
    content: "This is the kind of TypeScript pattern more people need to know about. Zero runtime cost, catches real bugs at compile time.",
    replyToTweetIndex: 19,
    minutesAfterParent: 5,
  },
  {
    authorHandle: "gcanti",
    content: "Branded types were one of the first patterns we established in fp-ts. Great to see Effect taking them to the next level with Schema integration.",
    replyToTweetIndex: 19,
    minutesAfterParent: 15,
  },
  {
    authorHandle: "schickling",
    content: "We use branded types for every entity ID in our codebase now. Caught at least 5 bugs in the first week that would have been silent runtime errors.",
    replyToTweetIndex: 19,
    minutesAfterParent: 30,
  },

  // Replies to Kent's @effect-react review (index 14)
  {
    authorHandle: "tannerlinsley",
    content: "The typed error channel is really what sets it apart. In React Query we catch everything as unknown — having typed errors propagate through the UI is next level.",
    replyToTweetIndex: 14,
    minutesAfterParent: 8,
  },
  {
    authorHandle: "timsmart",
    content: "The cache invalidation works great with Effect's SubscriptionRef too — you get reactive updates without manual refetching in most cases.",
    replyToTweetIndex: 14,
    minutesAfterParent: 20,
  },

  // Replies to Tanner's endorsement (index 16)
  {
    authorHandle: "mikearnaldi",
    content: "That means a lot coming from you, Tanner! React Query was a huge inspiration. We wanted to bring the same great DX but with Effect's type safety guarantees.",
    replyToTweetIndex: 16,
    minutesAfterParent: 12,
  },
  {
    authorHandle: "leerob",
    content: "I'd love to see this integrated with Next.js server components. The Effect program model maps really well to RSC data loading.",
    replyToTweetIndex: 16,
    minutesAfterParent: 30,
  },

  // Replies to Tim's HttpApiBuilder post (index 3)
  {
    authorHandle: "schickling",
    content: "The type-safe client generation is genuinely magical. Define the API once, get full type inference on both sides. No codegen step needed.",
    replyToTweetIndex: 3,
    minutesAfterParent: 6,
  },
  {
    authorHandle: "ryanflorence",
    content: "This is the dream. One API definition, shared between server and client, with full type safety. Web standards + TypeScript at their best.",
    replyToTweetIndex: 3,
    minutesAfterParent: 20,
  },

  // Replies to Maxwell's Schema post (index 5)
  {
    authorHandle: "mattpocockuk",
    content: "Schema is genuinely one of the best validation libraries in the ecosystem. The dual encoding/decoding with type inference is chef's kiss.",
    replyToTweetIndex: 5,
    minutesAfterParent: 10,
  },
  {
    authorHandle: "jaborpalmer",
    content: "The form validation integration with @effect-react/react is what sold me. Schema as the single source of truth for both frontend and backend validation.",
    replyToTweetIndex: 5,
    minutesAfterParent: 25,
  },

  // Replies to Theo's hot take about effect-react (index 25)
  {
    authorHandle: "kentcdodds",
    content: "It's ambitious for sure, but the pieces fit together really well. The SubscriptionRef-based state management is surprisingly simple once you get it.",
    replyToTweetIndex: 25,
    minutesAfterParent: 5,
  },
  {
    authorHandle: "tannerlinsley",
    content: "The query caching alone is solid, but combining it with forms, routing, and state management in one typed system is what makes it special.",
    replyToTweetIndex: 25,
    minutesAfterParent: 12,
  },
  {
    authorHandle: "mikearnaldi",
    content: "The Effect ecosystem is what enables this — when your primitives compose well, building higher-level abstractions becomes natural.",
    replyToTweetIndex: 25,
    minutesAfterParent: 20,
  },
];

// ---------------------------------------------------------------------------
// Seed execution
// ---------------------------------------------------------------------------

async function seed() {
  console.log("🌱 Seeding database...\n");

  // 1. Clear existing data (order matters for FK constraints)
  console.log("  Clearing existing data...");
  await db.delete(schema.notifications);
  await db.delete(schema.retweets);
  await db.delete(schema.likes);
  await db.delete(schema.follows);
  await db.delete(schema.tweets);
  await db.delete(schema.users);

  // 2. Insert users
  console.log(`  Inserting ${seedUsers.length} users...`);
  for (const u of seedUsers) {
    await db.insert(schema.users).values({
      id: u.id,
      handle: u.handle,
      displayName: u.displayName,
      bio: u.bio,
      avatarUrl: u.avatarUrl,
      passwordHash: DEFAULT_PASSWORD,
      followersCount: "0",
      followingCount: "0",
      createdAt: minutesAgo(1440 + Math.random() * 10000), // 1-8 days ago
    });
  }

  // 3. Build handle→id map
  const handleToId = new Map(seedUsers.map((u) => [u.handle, u.id]));

  // 4. Insert follows and update counts
  console.log(`  Inserting ${followPairs.length} follow relationships...`);
  for (const [followerHandle, followingHandle] of followPairs) {
    const followerId = handleToId.get(followerHandle);
    const followingId = handleToId.get(followingHandle);
    if (!followerId || !followingId) continue;

    await db.insert(schema.follows).values({
      followerId,
      followingId,
      createdAt: minutesAgo(1000 + Math.random() * 5000),
    });
  }

  // Update follower/following counts
  for (const u of seedUsers) {
    const followingCount = followPairs.filter(([f]) => f === u.handle).length;
    const followersCount = followPairs.filter(([, f]) => f === u.handle).length;
    await db
      .update(schema.users)
      .set({
        followersCount: String(followersCount),
        followingCount: String(followingCount),
      })
      .where(eq(schema.users.id, u.id));
  }

  // 5. Insert tweets
  console.log(`  Inserting ${seedTweets.length} tweets...`);
  const tweetIds: string[] = [];
  for (const t of seedTweets) {
    const authorId = handleToId.get(t.authorHandle);
    if (!authorId) continue;
    const tweetId = uuid();
    tweetIds.push(tweetId);
    await db.insert(schema.tweets).values({
      id: tweetId,
      content: t.content,
      authorId,
      replyToId: null,
      likesCount: "0",
      retweetsCount: "0",
      repliesCount: "0",
      createdAt: minutesAgo(t.minutesAgo),
    });
  }

  // 6. Insert likes and update counts
  console.log(`  Inserting ${seedLikes.length} likes...`);
  const likesPerTweet = new Map<number, number>();
  for (const like of seedLikes) {
    const userId = handleToId.get(like.likerHandle);
    const tweetId = tweetIds[like.tweetIndex];
    if (!userId || !tweetId) continue;
    await db.insert(schema.likes).values({
      userId,
      tweetId,
      createdAt: minutesAgo(Math.random() * 300),
    });
    likesPerTweet.set(like.tweetIndex, (likesPerTweet.get(like.tweetIndex) ?? 0) + 1);
  }

  // Update like counts on tweets
  for (const [tweetIndex, count] of likesPerTweet) {
    const tweetId = tweetIds[tweetIndex];
    if (!tweetId) continue;
    await sql`UPDATE tweets SET likes_count = ${String(count)} WHERE id = ${tweetId}`;
  }

  // 7. Insert some retweets
  console.log("  Inserting retweets...");
  const retweetPairs: { handle: string; tweetIndex: number }[] = [
    { handle: "timsmart", tweetIndex: 0 },
    { handle: "imax153", tweetIndex: 0 },
    { handle: "schickling", tweetIndex: 0 },
    { handle: "kentcdodds", tweetIndex: 14 },
    { handle: "t3dotgg", tweetIndex: 16 },
    { handle: "mikearnaldi", tweetIndex: 24 },
    { handle: "mattpocockuk", tweetIndex: 25 },
    { handle: "leerob", tweetIndex: 21 },
    { handle: "dan_abramov", tweetIndex: 18 },
    { handle: "timsmart", tweetIndex: 5 },
  ];

  const retweetsPerTweet = new Map<number, number>();
  for (const rt of retweetPairs) {
    const userId = handleToId.get(rt.handle);
    const tweetId = tweetIds[rt.tweetIndex];
    if (!userId || !tweetId) continue;
    await db.insert(schema.retweets).values({
      userId,
      tweetId,
      createdAt: minutesAgo(Math.random() * 200),
    });
    retweetsPerTweet.set(rt.tweetIndex, (retweetsPerTweet.get(rt.tweetIndex) ?? 0) + 1);
  }

  for (const [tweetIndex, count] of retweetsPerTweet) {
    const tweetId = tweetIds[tweetIndex];
    if (!tweetId) continue;
    await sql`UPDATE tweets SET retweets_count = ${String(count)} WHERE id = ${tweetId}`;
  }

  // 8. Insert replies
  console.log(`  Inserting ${seedReplies.length} replies...`);
  const repliesPerTweet = new Map<number, number>();
  for (const reply of seedReplies) {
    const authorId = handleToId.get(reply.authorHandle);
    const parentTweetId = tweetIds[reply.replyToTweetIndex];
    if (!authorId || !parentTweetId) continue;

    const replyId = uuid();
    const parentTweet = seedTweets[reply.replyToTweetIndex]!;
    const replyTime = minutesAgo(parentTweet.minutesAgo - reply.minutesAfterParent);

    await db.insert(schema.tweets).values({
      id: replyId,
      content: reply.content,
      authorId,
      replyToId: parentTweetId,
      likesCount: "0",
      retweetsCount: "0",
      repliesCount: "0",
      createdAt: replyTime,
    });

    repliesPerTweet.set(
      reply.replyToTweetIndex,
      (repliesPerTweet.get(reply.replyToTweetIndex) ?? 0) + 1,
    );
  }

  // Update replies counts on parent tweets
  for (const [tweetIndex, count] of repliesPerTweet) {
    const tweetId = tweetIds[tweetIndex];
    if (!tweetId) continue;
    await sql`UPDATE tweets SET replies_count = ${String(count)} WHERE id = ${tweetId}`;
  }

  // 9. Insert some notifications
  console.log("  Inserting notifications...");
  const notificationData = [
    { type: "like", recipientHandle: "mikearnaldi", actorHandle: "dan_abramov", tweetIndex: 0 },
    { type: "like", recipientHandle: "mikearnaldi", actorHandle: "kentcdodds", tweetIndex: 0 },
    { type: "like", recipientHandle: "mikearnaldi", actorHandle: "t3dotgg", tweetIndex: 0 },
    { type: "follow", recipientHandle: "mikearnaldi", actorHandle: "t3dotgg", tweetIndex: null },
    { type: "follow", recipientHandle: "mikearnaldi", actorHandle: "kentcdodds", tweetIndex: null },
    { type: "retweet", recipientHandle: "mikearnaldi", actorHandle: "timsmart", tweetIndex: 0 },
    { type: "like", recipientHandle: "t3dotgg", actorHandle: "mikearnaldi", tweetIndex: 24 },
    { type: "follow", recipientHandle: "mattpocockuk", actorHandle: "mikearnaldi", tweetIndex: null },
    { type: "like", recipientHandle: "kentcdodds", actorHandle: "tannerlinsley", tweetIndex: 14 },
    { type: "retweet", recipientHandle: "kentcdodds", actorHandle: "t3dotgg", tweetIndex: 16 },
  ];

  for (const n of notificationData) {
    const recipientId = handleToId.get(n.recipientHandle);
    const actorId = handleToId.get(n.actorHandle);
    if (!recipientId || !actorId) continue;
    await db.insert(schema.notifications).values({
      id: uuid(),
      type: n.type,
      recipientId,
      actorId,
      tweetId: n.tweetIndex !== null ? (tweetIds[n.tweetIndex] ?? null) : null,
      read: false,
      createdAt: minutesAgo(Math.random() * 500),
    });
  }

  console.log("\n✅ Seed complete!");
  console.log(`   ${seedUsers.length} users`);
  console.log(`   ${seedTweets.length} tweets`);
  console.log(`   ${seedReplies.length} replies`);
  console.log(`   ${followPairs.length} follows`);
  console.log(`   ${seedLikes.length} likes`);
  console.log(`   ${retweetPairs.length} retweets`);
  console.log(`   ${notificationData.length} notifications`);
  console.log(`\n   All accounts use password: "effectdemo"`);

  await sql.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
