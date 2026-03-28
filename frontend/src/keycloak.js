import Keycloak from 'keycloak-js';

console.log('KC URL =', import.meta.env.VITE_KEYCLOAK_URL);
console.log('KC REALM =', import.meta.env.VITE_KEYCLOAK_REALM);
console.log('KC CLIENT =', import.meta.env.VITE_KEYCLOAK_CLIENT);

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL,
  realm: import.meta.env.VITE_KEYCLOAK_REALM,
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT
});

export default keycloak;