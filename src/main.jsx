import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './auth/AuthContext.jsx';
import { ContentProvider } from './data/ContentContext.jsx';
import App from './App.jsx';
import './styles/base.css';
import './styles/batbox.css';
import './styles/tycoon.css';

// Clic derecho desactivado (regla 3DBAT), salvo en enlaces, campos y videos
// para poder "abrir en pestaña nueva" o copiar.
document.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('a, input, textarea, iframe')) e.preventDefault();
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <ContentProvider>
        <App />
      </ContentProvider>
    </AuthProvider>
  </React.StrictMode>,
);
