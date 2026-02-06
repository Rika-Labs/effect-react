import { defineRoute } from "../router";
import type { AnyRoute, DefineRouteOptions, RouteDefinition } from "../router";

export interface FileRouteModule<TPath extends string = string, TSearch = Record<never, never>> {
  readonly id: string;
  readonly route: RouteDefinition<TPath, TSearch>;
  readonly sourcePath: string;
}

export type AnyFileRouteModule = FileRouteModule<string, unknown>;

const stripExtension = (path: string): string => path.replace(/\.[^.]+$/, "");

const normalizePath = (path: string): string => path.replace(/\\/g, "/");

const stripToRoutesDirectory = (path: string): string => {
  const normalized = normalizePath(path);
  const marker = "/routes/";
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex === -1) {
    return normalized;
  }
  return normalized.slice(markerIndex + marker.length);
};

const isRouteGroup = (segment: string): boolean => /^\(.+\)$/.test(segment);

const isLayoutFile = (filename: string): boolean => {
  const base = stripExtension(filename);
  return base === "_layout" || base === "layout";
};

const segmentToPathPart = (segment: string): string => {
  if (segment === "index") {
    return "";
  }

  if (isRouteGroup(segment)) {
    return "";
  }

  const optionalCatchAll = segment.match(/^\[\[\.\.\.(.+)\]\]$/);
  if (optionalCatchAll) {
    return `:${optionalCatchAll[1]}*`;
  }

  const catchAll = segment.match(/^\[\.\.\.(.+)\]$/);
  if (catchAll) {
    return `:${catchAll[1]}*`;
  }

  const dynamic = segment.match(/^\[(.+)\]$/);
  if (dynamic) {
    return `:${dynamic[1]}`;
  }

  return segment;
};

export const filePathToRoutePath = (filePath: string): string => {
  const stripped = stripExtension(stripToRoutesDirectory(filePath));
  const segments = stripped
    .split("/")
    .filter((segment) => segment.length > 0)
    .map(segmentToPathPart)
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return "/";
  }

  return `/${segments.join("/")}`;
};

export interface DefineFileRouteOptions<TPath extends string, TSearch> extends Omit<
  DefineRouteOptions<TPath, TSearch>,
  "path"
> {
  readonly filePath: string;
}

export const defineFileRoute = <TPath extends string, TSearch = Record<never, never>>(
  options: DefineFileRouteOptions<TPath, TSearch>,
): FileRouteModule<TPath, TSearch> => {
  const path = filePathToRoutePath(options.filePath) as TPath;
  return {
    id: options.id,
    sourcePath: options.filePath,
    route: defineRoute({
      id: options.id,
      path,
      ...(options.search !== undefined ? { search: options.search } : {}),
    }),
  };
};

export const createFileRouteManifest = (
  modules: Readonly<Record<string, AnyFileRouteModule>>,
): readonly AnyFileRouteModule[] =>
  Object.values(modules).sort((left, right) => left.route.path.localeCompare(right.route.path));

export interface FileRouteTreeNode {
  readonly id: string;
  readonly route: AnyRoute;
  readonly sourcePath: string;
  readonly children: readonly FileRouteTreeNode[];
}

interface MutableTreeNode {
  id: string;
  sourcePath: string;
  route: AnyRoute | null;
  children: MutableTreeNode[];
  isLayout: boolean;
  isGroup: boolean;
  segmentName: string;
}

const createMutableNode = (segmentName: string): MutableTreeNode => ({
  id: "",
  sourcePath: "",
  route: null,
  children: [],
  isLayout: false,
  isGroup: isRouteGroup(segmentName),
  segmentName,
});

const getOrCreateChild = (parent: MutableTreeNode, segmentName: string): MutableTreeNode => {
  const existing = parent.children.find((child) => child.segmentName === segmentName);
  if (existing !== undefined) return existing;
  const child = createMutableNode(segmentName);
  parent.children.push(child);
  return child;
};

const resolveSegmentPath = (segment: string): string => {
  if (isRouteGroup(segment)) return "/";
  const part = segmentToPathPart(segment);
  return part.length === 0 ? "/" : `/${part}`;
};

const buildRouteTree = (node: MutableTreeNode): FileRouteTreeNode | null => {
  const builtChildren: FileRouteTreeNode[] = [];

  for (const child of node.children) {
    const built = buildRouteTree(child);
    if (built !== null) {
      builtChildren.push(built);
    }
  }

  if (node.route === null && builtChildren.length === 0) return null;

  if (node.route === null && builtChildren.length > 0) {
    if (builtChildren.length === 1) return builtChildren[0]!;
    const groupRoute = defineRoute({
      id: `group:${node.segmentName}`,
      path: "/",
      layout: true,
      children: builtChildren.map((child) => child.route),
    });
    return {
      id: groupRoute.id,
      route: groupRoute,
      sourcePath: "",
      children: builtChildren,
    };
  }

  const route = node.route!;
  if (builtChildren.length > 0) {
    const withChildren = defineRoute({
      id: route.id,
      path: route.path,
      layout: node.isLayout,
      children: builtChildren.map((child) => child.route),
    });
    return {
      id: withChildren.id,
      route: withChildren,
      sourcePath: node.sourcePath,
      children: builtChildren,
    };
  }

  return {
    id: route.id,
    route,
    sourcePath: node.sourcePath,
    children: [],
  };
};

export const createNestedFileRouteTree = (
  filePaths: readonly string[],
): readonly FileRouteTreeNode[] => {
  const root = createMutableNode("");

  for (const filePath of filePaths) {
    const stripped = stripExtension(stripToRoutesDirectory(filePath));
    const segments = stripped.split("/").filter((s) => s.length > 0);

    if (segments.length === 0) continue;

    const filename = segments[segments.length - 1]!;
    const dirSegments = segments.slice(0, -1);

    let current = root;
    for (const dirSeg of dirSegments) {
      current = getOrCreateChild(current, dirSeg);
    }

    if (isLayoutFile(filename)) {
      current.isLayout = true;
      const layoutPath = resolveSegmentPath(current.segmentName);
      current.id = `layout:${dirSegments.join("/")}`;
      current.sourcePath = filePath;
      current.route = defineRoute({
        id: current.id,
        path: layoutPath,
        layout: true,
      });
    } else {
      const routePath = filePathToRoutePath(filePath);
      const id = stripped.replace(/\//g, ".");
      const childNode = getOrCreateChild(current, filename);
      childNode.id = id;
      childNode.sourcePath = filePath;
      childNode.route = defineRoute({ id, path: routePath });
    }
  }

  const results: FileRouteTreeNode[] = [];
  for (const child of root.children) {
    const built = buildRouteTree(child);
    if (built !== null) {
      results.push(built);
    }
  }
  return results;
};
