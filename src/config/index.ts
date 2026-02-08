export interface EffectReactConfig {
  readonly appDir?: string;
  readonly adapters?: readonly ("node" | "bun")[];
  readonly ssr?: {
    readonly streaming?: boolean;
  };
  readonly cache?: {
    readonly defaultPolicy?: "no-store" | "force-cache";
    readonly routeSegmentDefaults?: "explicit";
  };
  readonly strict?: {
    readonly boundarySchemas?: boolean;
    readonly typedErrors?: boolean;
  };
}

export interface EffectReactResolvedConfig {
  readonly appDir: string;
  readonly adapters: readonly ("node" | "bun")[];
  readonly ssr: {
    readonly streaming: boolean;
  };
  readonly cache: {
    readonly defaultPolicy: "no-store" | "force-cache";
    readonly routeSegmentDefaults: "explicit";
  };
  readonly strict: {
    readonly boundarySchemas: boolean;
    readonly typedErrors: boolean;
  };
}

const defaultConfig: EffectReactResolvedConfig = {
  appDir: "app",
  adapters: ["node", "bun"],
  ssr: {
    streaming: true,
  },
  cache: {
    defaultPolicy: "no-store",
    routeSegmentDefaults: "explicit",
  },
  strict: {
    boundarySchemas: true,
    typedErrors: true,
  },
};

export const defineConfig = (config: EffectReactConfig): EffectReactConfig => config;

export const resolveConfig = (
  config: EffectReactConfig = {},
): EffectReactResolvedConfig => ({
  appDir: config.appDir ?? defaultConfig.appDir,
  adapters: config.adapters ?? defaultConfig.adapters,
  ssr: {
    streaming: config.ssr?.streaming ?? defaultConfig.ssr.streaming,
  },
  cache: {
    defaultPolicy: config.cache?.defaultPolicy ?? defaultConfig.cache.defaultPolicy,
    routeSegmentDefaults:
      config.cache?.routeSegmentDefaults ?? defaultConfig.cache.routeSegmentDefaults,
  },
  strict: {
    boundarySchemas:
      config.strict?.boundarySchemas ?? defaultConfig.strict.boundarySchemas,
    typedErrors: config.strict?.typedErrors ?? defaultConfig.strict.typedErrors,
  },
});
