/**
 * Superfície pública do adapter de API/auth (ENG-239). O app resolve o `AuthProvider`
 * pela porta 'auth' do register.ts; estes exports servem a testes, à camada de wiring
 * (login/dashboard) e aos adapters reais que constroem um `HttpApiClient` por dentro.
 */

export {
  ApiError,
  AuthError,
  type ApiClient,
  type ApiRequestOptions,
  type AuthProvider,
  type AuthUser,
  type Credentials,
  type ResponseValidator,
  type Role,
  type Unsubscribe,
} from './types';
export {
  HttpApiClient,
  HttpAuthProvider,
  type HttpApiClientOptions,
  type HttpAuthProviderOptions,
} from './client';
export {
  DEFAULT_FIXTURE_USERS,
  FixtureApiClient,
  FixtureAuthProvider,
  type FixtureApiClientOptions,
  type FixtureAuthProviderOptions,
  type FixtureRoute,
  type FixtureUser,
} from './fixture';
