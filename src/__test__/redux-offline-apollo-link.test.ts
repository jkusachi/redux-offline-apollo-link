import { execute } from "apollo-link";
import gql from "graphql-tag";
import configureStore from "redux-mock-store";
import { reduxOfflineApolloLink } from "..";

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

// const sampleMutation = gql`
//   mutation SampleMutation {
//     stub {
//       id
//     }
//   }
// `;

// const makeCallback = (done, body) => {
//   return (...args) => {
//     try {
//       body(...args);
//       done();
//     } catch (error) {
//       done.fail(error);
//     }
//   };
// };

describe("#reduxOfflineApolloLink", () => {
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

  describe("#Options", () => {
    it("parseAndHandleHttpResponse - Called if provided in options", done => {
      const mockResponse = {
        data: "success"
      };
      fetchMock.mockResolvedValueOnce({
        status: 200,
        text() {
          return Promise.resolve(JSON.stringify(mockResponse));
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
          actionType: "ACTION_TYPE",
          options: {
            parseAndHandleHttpResponse: jest.fn(() => mockResponse)
          }
        }
      };

      const observable = execute(link, operation);

      observable.subscribe({
        next: jest.fn(),
        error: error => expect(false),
        complete: () => {
          expect(
            operation.variables.options.parseAndHandleHttpResponse
          ).toHaveBeenCalledWith(
            expect.objectContaining(operation),
            mockResponse
          );
          done();
        }
      });
    });

    it(`globalErrorsCheck - Called if response has any errors in it, and main result throws
     using default errorsCheck`, done => {
      const mockResponse = {
        data: "success",
        errors: ["error one"]
      };

      fetchMock.mockResolvedValueOnce({
        status: 200,
        text() {
          return Promise.resolve(JSON.stringify(mockResponse));
        }
      });

      const globalErrorsCheck = jest.fn();

      const link = reduxOfflineApolloLink(
        {
          uri: "https://www.example.com",
          fetch: fetchMock,
          globalErrorsCheck
        },
        store
      );

      const operation = {
        query: sampleQuery,
        variables: {
          actionType: "ACTION_TYPE"
        }
      };

      const observable = execute(link, operation);

      observable.subscribe({
        next: jest.fn(),
        error: error => {
          expect(globalErrorsCheck).toHaveBeenCalledWith(mockResponse);
          expect(error).toEqual(mockResponse);
          done();
        },
        complete: () => {
          done();
        }
      });
    });

    // In this test, we do have an error but sometimes for GraphQL, having errors is OK and we don't want to throw
    // "errorsCheck" allows you to override on a per-call basis, allowing you dedide if you should throw or continue
    // If you return inside this method, the pipeline will continue on, therefore in this test we simply return the
    // result, even if it has errors
    it("errorsCheck - Option called if provided, and can continue if function does not throw inside", done => {
      const mockResponse = {
        data: "success",
        errors: ["error one"]
      };

      fetchMock.mockResolvedValueOnce({
        status: 200,
        text() {
          return Promise.resolve(JSON.stringify(mockResponse));
        }
      });

      const errorsCheck = jest.fn(res => {
        return res;
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
          actionType: "ACTION_TYPE",
          options: {
            errorsCheck
          }
        }
      };

      const observable = execute(link, operation);

      observable.subscribe({
        next: jest.fn(),
        error: error => {
          done();
        },
        complete: () => {
          expect(errorsCheck).toHaveBeenCalledWith(mockResponse);
          done();
        }
      });
    });
  });
});
