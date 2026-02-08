import { Effect, Ref, Stream } from "effect";
import { createChannel, publish, subscribe } from "./channel";

export type PresenceEvent<MemberId extends string, Member> =
  | {
      readonly _tag: "join";
      readonly memberId: MemberId;
      readonly member: Member;
      readonly timestamp: number;
    }
  | {
      readonly _tag: "leave";
      readonly memberId: MemberId;
      readonly timestamp: number;
    };

export interface CreatePresenceOptions<MemberId extends string, Member> {
  readonly identify: (member: Member) => MemberId;
}

export interface Presence<MemberId extends string, Member> {
  readonly events: Stream.Stream<PresenceEvent<MemberId, Member>>;
  readonly members: Stream.Stream<ReadonlyMap<MemberId, Member>>;
  readonly getMembers: Effect.Effect<ReadonlyMap<MemberId, Member>>;
  readonly join: (member: Member) => Effect.Effect<void>;
  readonly leave: (memberId: MemberId) => Effect.Effect<void>;
}

const cloneMembers = <MemberId extends string, Member>(
  members: ReadonlyMap<MemberId, Member>,
): ReadonlyMap<MemberId, Member> => new Map(members);

const applyPresenceEvent = <MemberId extends string, Member>(
  members: ReadonlyMap<MemberId, Member>,
  event: PresenceEvent<MemberId, Member>,
): ReadonlyMap<MemberId, Member> => {
  const next = new Map(members);
  if (event._tag === "join") {
    next.set(event.memberId, event.member);
  } else {
    next.delete(event.memberId);
  }
  return next;
};

export const createPresence = <MemberId extends string, Member>(
  options: CreatePresenceOptions<MemberId, Member>,
): Effect.Effect<Presence<MemberId, Member>> =>
  Effect.gen(function* () {
    const channel = yield* createChannel<PresenceEvent<MemberId, Member>>();
    const membersRef = yield* Ref.make(new Map<MemberId, Member>());

    const getMembers: Effect.Effect<ReadonlyMap<MemberId, Member>> = Ref.get(membersRef).pipe(
      Effect.map((members) => cloneMembers(members)),
    );

    const events = subscribe(channel);

    const members = Stream.flatMap(
      Stream.fromEffect(getMembers),
      (initialMembers) =>
        events.pipe(
          Stream.scan(initialMembers, (current, event) =>
            applyPresenceEvent(current, event),
          ),
        ),
    );

    const join = (member: Member): Effect.Effect<void> => {
      const memberId = options.identify(member);
      const event: PresenceEvent<MemberId, Member> = {
        _tag: "join",
        memberId,
        member,
        timestamp: Date.now(),
      };

      return Ref.update(membersRef, (current) => {
        const next = new Map(current);
        next.set(memberId, member);
        return next;
      }).pipe(Effect.zipRight(publish(channel, event)));
    };

    const leave = (memberId: MemberId): Effect.Effect<void> => {
      const event: PresenceEvent<MemberId, Member> = {
        _tag: "leave",
        memberId,
        timestamp: Date.now(),
      };

      return Ref.update(membersRef, (current) => {
        const next = new Map(current);
        next.delete(memberId);
        return next;
      }).pipe(Effect.zipRight(publish(channel, event)));
    };

    return {
      events,
      members,
      getMembers,
      join,
      leave,
    };
  });
