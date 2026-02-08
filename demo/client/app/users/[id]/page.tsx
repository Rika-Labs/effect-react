import {
  definePage,
  defineRoute,
} from "@effect-react/react/framework";

const route = defineRoute({
  id: "users.show",
  path: "/users/:id",
});

const readPathId = (): string => {
  if (typeof window === "undefined") {
    return "unknown";
  }

  const [, users, id] = window.location.pathname.split("/");
  return users === "users" && id !== undefined ? id : "unknown";
};

const UserPage = () => (
  <>
    <h2 className="title">User Route</h2>
    <p className="muted">
      Dynamic segment extracted from path: <code>{readPathId()}</code>
    </p>
  </>
);

export const page = definePage({
  id: "users.show.page",
  route,
  component: UserPage,
});

export default page;
