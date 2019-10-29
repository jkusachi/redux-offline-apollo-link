import { ApolloLink, Observable } from "apollo-link";
import {
  createSignalIfSupported,
  fallbackHttpConfig,
  parseAndCheckHttpResponse,
  selectHttpOptionsAndBody,
  selectURI,
  serializeFetchParameter
} from "apollo-link-http-common";

import { extractFiles } from "extract-files";
import get from "lodash/get";
import omit from "lodash/omit";

interface Options {
  uri?: string;
  fetch?: any;
  fetchOptions?: any;
  credentials?: any;
  headers?: any;
  includeExtensions?: any;
  globalErrorsCheck?: any;
  onCatchErrors?: any;
}

/**
 * check and display errors
 * @param result
 */
function debugErrors(result, globalErrorsCheck) {
  if (result.errors && result.errors.length > 0) {
    if (typeof globalErrorsCheck === "function") {
      globalErrorsCheck(result);
    }

    console.group("GraphQL Errors");
    result.errors.map(console.log);
    console.groupEnd();
  }
  console.log("result", result);
  return result;
}

/**
 * checks for errors and throws if they are available.
 * @param result
 */
function errorsCheck(result) {
  if (result.errors && result.errors.length > 0) {
    throw result;
  }
  return result;
}

const reduxOfflineApolloLink = (
  {
    uri: fetchUri = "/graphql",
    fetch: linkFetch = fetch,
    fetchOptions,
    credentials,
    headers,
    includeExtensions,
    globalErrorsCheck,
    onCatchErrors
  }: Options = {},
  store
) => {
  console.log("globalErrorsCheck", globalErrorsCheck);
  const linkConfig = {
    http: { includeExtensions },
    options: fetchOptions,
    credentials,
    headers
  };

  return new ApolloLink((operation, forward) => {
    const state = store.getState();
    const uri = selectURI(operation, fetchUri);
    const context = operation.getContext();
    const contextConfig = {
      http: context.http,
      options: context.fetchOptions,
      credentials: context.credentials,
      headers: context.headers
    };

    const isOnline = state.offline.online;

    const { options, body } = selectHttpOptionsAndBody(operation, fallbackHttpConfig, linkConfig, contextConfig);

    const { clone, files } = extractFiles(body);
    const payload = serializeFetchParameter(clone, "Payload");

    const linkFetchOptions = get(operation, "variables.options", {});
    const reduxActionName = get(operation, "variables.actionType");
    const reduxCommitSuffix = get(operation, "variables.actionCommitSuffix", "COMMIT");
    const reduxRollbackSuffix = get(operation, "variables.actionRollbackSuffix", "ROLLBACK");

    let contentType;
    if (files.size) {
      delete options.headers["content-type"];
      // GraphQL multipart request spec:
      // https://github.com/jaydenseric/graphql-multipart-request-spec

      const form = new FormData();
      form.append("operations", payload);
      const map = {};
      let i = 0;
      files.forEach(paths => {
        map[++i] = paths;
      });
      form.append("map", JSON.stringify(map));

      i = 0;
      files.forEach((paths, file) => {
        form.append(String(++i), file, file.name);
      });

      options.body = form;
      contentType = "multipart/form-data;";
    } else {
      options.body = payload;
      contentType = "application/json";
    }

    const action = {
      type: reduxActionName,
      meta: {
        offline: {
          effect: {
            url: uri,
            method: "POST",
            body: options.body,
            headers: {
              ...context.headers,
              "content-type": contentType
            }
          },
          // action to dispatch when effect succeeds:
          commit: { type: `${reduxActionName}_${reduxCommitSuffix}` },
          // action to dispatch if network action fails permanently:
          rollback: { type: `${reduxActionName}_${reduxRollbackSuffix}` }
        }
      },
      payload: {
        variables: operation.variables
      }
    };

    const commitAction = get(action, "meta.offline.commit");
    const rollbackAction = get(action, "meta.offline.rollback");

    if (!reduxActionName) {
      throw new Error(
        `This custom link requires you to specify an \`options.variables.actionType\`
         to handle redux offline actions in the event the device is offline`
      );
    }

    if (!Boolean(linkFetchOptions.skipOffline)) {
      if (!isOnline) {
        store.dispatch(action);
        return new Observable(observer => {
          const { controller /*, signal */ } = createSignalIfSupported();
          controller.abort();
        });
      }
    }

    // if online, we can dispatch the initial action without the .meta
    store.dispatch(omit(action, ["meta"]));

    return new Observable(observer => {
      // Allow aborting fetch, if supported.
      const { controller, signal } = createSignalIfSupported();
      if (controller) {
        options.signal = signal;
      }

      console.log("uri", uri);
      linkFetch(uri, options)
        .then(response => {
          console.log("response", response);
          console.log("- calls", linkFetch.mock.calls);
          // Forward the response on the context.
          operation.setContext({ response });
          return response;
        })
        .then(response => {
          console.log("in response");
          if (
            linkFetchOptions.parseAndHandleHttpResponse &&
            typeof linkFetchOptions.parseAndHandleHttpResponse === "function"
          ) {
            return response
              .text()
              .then(bodyText => {
                console.log("calling", JSON.parse(bodyText));
                try {
                  return JSON.parse(bodyText);
                } catch (err) {
                  const parseError = err;
                  parseError.name = "ServerParseError";
                  parseError.response = response;
                  parseError.statusCode = response.status;
                  parseError.bodyText = bodyText;
                  return Promise.reject(parseError);
                }
              })
              .then(result => {
                return linkFetchOptions.parseAndHandleHttpResponse(operation, result);
              });
          }
          console.log(" - parseAndCheckHttpResponse", response);
          return parseAndCheckHttpResponse(operation)(response);
        })
        .then(data => {
          console.log("...received data", data);

          return data;
        })
        .then(errors => debugErrors(errors, globalErrorsCheck))
        .then(result => {
          console.log("got a result, ", result);
          if (linkFetchOptions.errorsCheck && typeof linkFetchOptions.errorsCheck === "function") {
            return linkFetchOptions.errorsCheck(result);
          }
          return errorsCheck(result);
        })
        .then(result => {
          if (linkFetchOptions.payloadFormatter && typeof linkFetchOptions.payloadFormatter === "function") {
            if (linkFetchOptions.debug) {
              console.group("Payload Formatter");
              console.log("Raw: ", result);
              console.log("Formatted: ", linkFetchOptions.payloadFormatter(result));
              console.groupEnd();
            }
            return { data: linkFetchOptions.payloadFormatter(result) };
          }
          return result;
        })
        .then(result => {
          if (linkFetchOptions.debug) {
            console.group("Redux Result: ");
            console.log("Dispatching: ", commitAction);
            console.log("result.data", result.data);
            console.groupEnd();
          }

          store.dispatch({
            ...commitAction,
            payload: result
          });
          observer.next(result);
          observer.complete();
        })
        .catch(error => {
          console.log("caught something", error);
          store.dispatch({
            type: rollbackAction.type,
            payload: {
              error,
              variables: operation.variables
            }
          });

          if (typeof onCatchErrors === "function") {
            onCatchErrors(error);
          }

          console.warn("Error During GraphQL linkFetch\n", error);

          if (error.name === "AbortError") {
            // Fetch was aborted.
            return;
          }

          if (error.result && error.result.errors && error.result.data) {
            // There is a GraphQL result to forward.
            observer.next(error.result);
          }

          observer.error(error);
        });

      // Cleanup function.
      return () => {
        // Abort fetch.
        if (controller) {
          controller.abort();
        }
      };
    });
  });
};

export { reduxOfflineApolloLink };
