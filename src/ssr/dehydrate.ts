import type { QueryCache } from "../query/QueryCache";
import type { DehydratedState } from "../query/types";
import { dehydrate as queryDehydrate } from "../query/ssr";

export const dehydrate = (cache: QueryCache): DehydratedState => queryDehydrate(cache);
