export interface GraphQLErrors {
  result: [any];
}

export interface GQLResponse {
  data: any | null;
  errors?: [any];
}

export type ErrorsCheck = (response: GQLResponse) => void;

export interface LinkFetchOptions {
  skipOffline?: boolean;
  errorsCheck?: ErrorsCheck;
  payloadFormatter?: ErrorsCheck;
  debug?: boolean;
}
