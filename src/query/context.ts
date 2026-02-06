import { createContext, useContext } from "react";
import type { QueryCache } from "./QueryCache";

export const QueryCacheContext = createContext<QueryCache | null>(null);

export const useQueryCache = (): QueryCache => {
  const cache = useContext(QueryCacheContext);
  if (cache === null) {
    throw new Error("Missing EffectProvider query cache context");
  }
  return cache;
};
