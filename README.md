## Apollo Link HTTP

```
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
