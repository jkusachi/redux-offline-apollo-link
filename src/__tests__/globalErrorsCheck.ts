import { reduxOfflineApolloLink } from "../";
import { ApolloLink } from "apollo-link";
import fetch from "node-fetch";

interface Store {
  hello: string;
}

const store: Store = {
  hello: "world"
};

describe("globalErrorsCheck", () => {
  test("it says hello", () => {
    const link: ApolloLink = reduxOfflineApolloLink(
      {
        uri: "http://localhost/graphql",
        fetch
      },
      store
    );

    console.log("link", link);

    expect(true).toEqual(true);
  });
});
