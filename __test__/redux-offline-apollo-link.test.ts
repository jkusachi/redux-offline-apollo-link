import { Observable, ApolloLink, execute } from "apollo-link";
import gql from "graphql-tag";
import configureStore from "redux-mock-store";
import { reduxOfflineApolloLink } from "../src";

const middlewares = [];
const store = configureStore(middlewares)({
  offline: {
    online: true
  }
});

const sampleQuery = gql`
  query SampleQuery {
    stub {
      id
    }
  }
`;

const sampleMutation = gql`
  mutation SampleMutation {
    stub {
      id
    }
  }
`;

const makeCallback = (done, body) => {
  return (...args) => {
    try {
      body(...args);
      done();
    } catch (error) {
      done.fail(error);
    }
  };
};

describe("HttpLink", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockClear();
  });

  it("Doesn't throw error on basic constructor", () => {
    expect(() =>
      reduxOfflineApolloLink(
        {
          uri: "https://www.example.com",
          fetch: fetchMock
        },
        store
      )
    ).not.toThrow();
  });

  it("constructor creates link that can call next and then complete", done => {
    fetchMock.mockResolvedValueOnce({
      status: 200,
      text() {
        return Promise.resolve(
          JSON.stringify({
            data: "success"
          })
        );
      }
    });
    const link = reduxOfflineApolloLink(
      {
        uri: "https://www.example.com",
        fetch: fetchMock
      },
      store
    );

    const operation = {
      query: sampleQuery,
      variables: {
        actionType: "TEST"
      }
    };

    const observable = execute(link, operation);

    observable.subscribe({
      next: jest.fn(),
      error: error => expect(false),
      complete: () => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
        done();
      }
    });
  });

  it("Throws an error is redux variables.actionType is not supplied", done => {
    const link = reduxOfflineApolloLink(
      {
        uri: "https://www.example.com",
        fetch: fetchMock
      },
      store
    );

    const operation = {
      query: sampleQuery
    };

    expect(() => execute(link, operation)).toThrowError(
      `This custom link requires you to specify an \`options.variables.actionType\`
         to handle redux offline actions in the event the device is offline`
    );

    done();
  });
});
