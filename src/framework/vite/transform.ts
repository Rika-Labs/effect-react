import { transformServerActionCallsAst } from "./astTransform";

export const transformServerActionCalls = (source: string): string =>
  transformServerActionCallsAst(source);
