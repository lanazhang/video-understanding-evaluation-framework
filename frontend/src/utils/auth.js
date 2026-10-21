// Single-user local mode: there is no sign-in. The same names the Cognito/Amplify calls used to provide,
// so the components that read the current user keep working.
export const LOCAL_USER = { username: import.meta.env.VITE_LOCAL_USER || 'local-user' }

export async function fetchUserAttributes() {
  return { email: LOCAL_USER.username, preferred_username: LOCAL_USER.username, sub: LOCAL_USER.username }
}

export async function signOut() {}
