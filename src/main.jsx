import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Inject SDK dynamically to prevent Vite from analyzing it during build phase
const sdkScript = document.createElement('script');
sdkScript.src = '/js/discord-sdk.js';
document.head.appendChild(sdkScript);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
