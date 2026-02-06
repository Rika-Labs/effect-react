type ExportRecord = Record<string, unknown>;

const exportTarget = exports as ExportRecord;
const hasOwn = (record: ExportRecord, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(record, key);

const exportStar = (modulePath: string): void => {
  const mod = require(modulePath) as ExportRecord;
  for (const key of Object.keys(mod)) {
    if (key === "default" || key === "__esModule") {
      continue;
    }
    if (hasOwn(exportTarget, key)) {
      continue;
    }
    Object.defineProperty(exportTarget, key, {
      enumerable: true,
      get: () => mod[key],
    });
  }
};

const exportNamespace = (name: string, modulePath: string): void => {
  Object.defineProperty(exportTarget, name, {
    enumerable: true,
    get: (): ExportRecord => require(modulePath) as ExportRecord,
  });
};

exportStar("./internal/duration.cjs");
exportStar("./internal/effectRunner.cjs");
exportStar("./internal/externalStore.cjs");
exportStar("./internal/invariant.cjs");
exportStar("./internal/keyHash.cjs");
exportStar("./internal/pathUtils.cjs");
exportStar("./async/index.cjs");
exportStar("./concurrency/index.cjs");
exportStar("./browser/index.cjs");
exportStar("./events/index.cjs");
exportStar("./error-boundary/index.cjs");
exportStar("./forms/index.cjs");
exportStar("./mutation/index.cjs");
exportStar("./optimistic/index.cjs");
exportStar("./persistence/index.cjs");
exportStar("./policies/index.cjs");
exportStar("./provider/index.cjs");
exportStar("./query/index.cjs");
exportStar("./router/index.cjs");
exportStar("./scheduling/index.cjs");
exportStar("./server/index.cjs");
exportStar("./state/index.cjs");
exportStar("./streams/index.cjs");
exportStar("./table/index.cjs");
exportStar("./url-state/index.cjs");
exportStar("./virtual/index.cjs");
exportStar("./framework/index.cjs");
exportNamespace("ssr", "./ssr/index.cjs");
