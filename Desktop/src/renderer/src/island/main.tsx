import React from 'react';
import ReactDOM from 'react-dom/client';
import IslandApp from './IslandApp';
import '../index.css';

const rootEl = document.getElementById('island-root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <IslandApp />
    </React.StrictMode>
  );
}
