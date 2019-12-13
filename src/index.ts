import { ApolloLink, Observable } from "apollo-link";
import {
  createSignalIfSupported,
  fallbackHttpConfig,
  parseAndCheckHttpResponse,
  selectHttpOptionsAndBody,
  selectURI,
  serializeFetchParameter
} from "apollo-link-http-common";
import { GQLResponse, ErrorsCheck, LinkFetchOptions } from "./types";

import { extractFiles } from "extract-files";
import get from "lodash/get";
import omit from "lodash/omit";

import AbortEffectsError from "./AbortEffectsError";

interface Options {
  uri?: string;
  fetch?: any;
  fetchOptions?: any;
  credentials?: any;
  headers?: any;
  includeExtensions?: any;
  globalErrorsCheck?: ErrorsCheck;
  onCatchErrors?: any;
}

/**
 * check and display errors
 * @param result
 */
function debugErrors(result: GQLResponse, globalErrorsCheck: ErrorsCheck) {
  if (result.errors && result.errors.length > 0) {
    if (typeof globalErrorsCheck === "function") {
      globalErrorsCheck(result);
    }

    console.group("GraphQL Errors");
    result.errors.map(console.log);
    console.groupEnd();
  }
  return result;
}

/**
 * checks for errors and throws if they are available.
 * @param result
 */
function errorsCheck(result: GQLResponse) {
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

    const isOnline: boolean = state.offline.online;

    const { options, body } = selectHttpOptionsAndBody(
      operation,
      fallbackHttpConfig,
      linkConfig,
      contextConfig
    );

    const { clone, files } = extractFiles(body);
    const payload = serializeFetchParameter(clone, "Payload");

    const linkFetchOptions: LinkFetchOptions = get(
      operation,
      "variables.options",
      {}
    );
    const reduxActionName = get(operation, "variables.actionType");
    const reduxCommitSuffix = get(
      operation,
      "variables.actionCommitSuffix",
      "COMMIT"
    );
    const reduxRollbackSuffix = get(
      operation,
      "variables.actionRollbackSuffix",
      "ROLLBACK"
    );

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

      linkFetch(uri, options)
        .then(response => {
          // Forward the response on the context.
          operation.setContext({ response });
          return response;
        })
        .then(response => {
          if (
            linkFetchOptions.parseAndHandleHttpResponse &&
            typeof linkFetchOptions.parseAndHandleHttpResponse === "function"
          ) {
            return response
              .text()
              .then(bodyText => {
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
                return linkFetchOptions.parseAndHandleHttpResponse(
                  operation,
                  result
                );
              });
          }
          return parseAndCheckHttpResponse(operation)(response);
        })
        .then(errors => debugErrors(errors, globalErrorsCheck))
        .then((result: GQLResponse) => {
          if (
            linkFetchOptions.errorsCheck &&
            typeof linkFetchOptions.errorsCheck === "function"
          ) {
            return linkFetchOptions.errorsCheck(result);
          }
          return errorsCheck(result);
        })
        .then(result => {
          if (
            linkFetchOptions.payloadFormatter &&
            typeof linkFetchOptions.payloadFormatter === "function"
          ) {
            if (linkFetchOptions.debug) {
              console.group("ReduxOfflineApolloLink: Payload Formatter");
              console.log("- result: ", result);
              console.log(
                "- formatted: ",
                linkFetchOptions.payloadFormatter(result)
              );
              console.groupEnd();
            }
            return { data: linkFetchOptions.payloadFormatter(result) };
          }
          return result;
        })
        .then((result: GQLResponse) => {
          if (linkFetchOptions.debug) {
            console.group("ReduxOfflineApolloLink: Redux Result: ");
            console.log("- dispatch action: ", commitAction);
            console.log("- result.data", result.data);
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
          if (error instanceof AbortEffectsError) {
            return observer.complete();
          }

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

export { reduxOfflineApolloLink, AbortEffectsError };
