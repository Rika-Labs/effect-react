export const invariant = (condition: boolean, message: string): asserts condition => {
  if (!condition) {
    throw new Error(message);
  }
};

export const unreachable = (_value: never): never => {
  throw new Error("Unreachable");
};
