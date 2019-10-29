export interface GraphQLErrors {
  result: [any];
}

export type GlobalErrorsCheck = (errors: GraphQLErrors) => void;

export interface CustomOperationVariables {
  name: "james";
}
