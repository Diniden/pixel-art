// index.css MUST stay the first import: it emits the design tokens and the
// global reset, which must land BEFORE any component's rules in the bundle.
// Importing it after App reverses that order (task 09).
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

