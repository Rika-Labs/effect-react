import { Effect, PubSub, Stream } from "effect";

export interface CreateChannelOptions {
  readonly replay?: number;
}

export interface RealtimeChannel<Message> {
  readonly publish: (message: Message) => Effect.Effect<void>;
  readonly publishAll: (messages: Iterable<Message>) => Effect.Effect<void>;
  readonly subscribe: () => Stream.Stream<Message>;
  readonly stream: Stream.Stream<Message>;
  readonly shutdown: Effect.Effect<void>;
}

export const createChannel = <Message>(
  options: CreateChannelOptions = {},
): Effect.Effect<RealtimeChannel<Message>> =>
  Effect.map(PubSub.unbounded<Message>(options), (pubsub) => {
    const subscribe = (): Stream.Stream<Message> => Stream.fromPubSub(pubsub);

    return {
      publish: (message) => PubSub.publish(pubsub, message).pipe(Effect.asVoid),
      publishAll: (messages) => PubSub.publishAll(pubsub, messages).pipe(Effect.asVoid),
      subscribe,
      stream: subscribe(),
      shutdown: PubSub.shutdown(pubsub),
    };
  });

export const publish = <Message>(
  channel: RealtimeChannel<Message>,
  message: Message,
): Effect.Effect<void> => channel.publish(message);

export const publishAll = <Message>(
  channel: RealtimeChannel<Message>,
  messages: Iterable<Message>,
): Effect.Effect<void> => channel.publishAll(messages);

export const subscribe = <Message>(channel: RealtimeChannel<Message>): Stream.Stream<Message> =>
  channel.subscribe();
