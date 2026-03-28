import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import keycloak from './keycloak';

keycloak
  .init({
    onLoad: 'check-sso',
    checkLoginIframe: false,
    pkceMethod: 'S256'
  })
  .then(() => {
    ReactDOM.createRoot(document.getElementById('root')).render(
      <React.StrictMode>
        <App keycloak={keycloak} />
      </React.StrictMode>
    );
  })
  .catch((error) => {
    console.error('Errore inizializzazione Keycloak:', error);
  });