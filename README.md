# Redux Offline Apollo Link

*NOTE* This is still TBD. Use at your own risk!!

This is a close fork of [https://github.com/jaydenseric/apollo-upload-client](apollo-upload-client), and acts as a drop in replacement.

I needed a way to get customized actions dispatched from apollo as network activity occured (request, success, failures).

This is closely tied with Redux Offline.

Redux Offline offers actions to be dispatched when a device is offline and go to a queue _(aka outbox)_.

[https://github.com/redux-offline/redux-offline](Read more about Redux Offline)

### Requirements

- `@redux-offline/redux-offline: ^2.0.0`
- `apollo-client: ^2.4.8`

### Installation

```js
import { ApolloClient } from "apollo-client";
import { customUploadLink } from "../../apollo/upload-client";
import { store } from "../../store";

export const client = new ApolloClient({
  link: ApolloLink.from([
    customUploadLink(
      {
        uri: "http://your.graphql.server.com:3001/graphql"
      },
      store
    )
  ]),
  cache: new InMemoryCache()
});
```

### Usage in Components

In order to use the redux actions, you need to provide an `options.variables.actionType` to your `graphql` higher order component call.

* `options.variables.actionType` REQUIRED - The name of the request action
* `options.variables.actionCommitSuffix` - Suffix of the action type when a success occurs _Default: "COMMIT"_
* `options.variables.actionRollbackSuffix` - Suffix of the action type when a rollback occurs _Default: "ROLLBACK"_


**graphql Query HoC Example**

```js
export default compose(
  graphql(
    gql`
      query uploads {
        uploads {
          id
          filename
          mimetype
          path
        }
      }
    `,
    {
      options: {
        variables: {
          actionType: "DEMO_QUERY",
          actionCommitSuffix: "COMMIT",
          actionRollbackSuffix: "ROLLBACK"
        }
      }
    }
  ),
  connect(state => ({}))
)(DemoQuery);

```

**graphql Mutation Example**

```js
export default compose(
  graphql(
    gql`
      mutation($file: Upload!) {
        singleUpload(file: $file) {
          id
          filename
          mimetype
          path
        }
      }
    `,
    {
      options: {
        variables: {
          actionType: "DEMO_MUTATION"
        }
      }
    }
  ),
  connect(state => ({
    images: state.images.images
  }))
)(Mutation);
```