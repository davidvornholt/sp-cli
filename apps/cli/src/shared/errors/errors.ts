import { Schema } from 'effect';

export class TokenUnavailable extends Schema.TaggedError<TokenUnavailable>()(
  'TokenUnavailable',
  { message: Schema.String },
) {}

export class SshTunnelFailed extends Schema.TaggedError<SshTunnelFailed>()(
  'SshTunnelFailed',
  { message: Schema.String },
) {}

export type ConnectionError = TokenUnavailable | SshTunnelFailed;

// The app answered with an error envelope, e.g. an unknown task id.
export class ApiError extends Schema.TaggedError<ApiError>()('ApiError', {
  status: Schema.Number,
  code: Schema.String,
  message: Schema.String,
  details: Schema.optional(Schema.Unknown),
}) {}

// Nothing usable answered: the app is closed, the API is off, or something
// else holds the port.
export class AppUnreachable extends Schema.TaggedError<AppUnreachable>()(
  'AppUnreachable',
  { message: Schema.String },
) {}

export type ApiFailure = ApiError | AppUnreachable;
