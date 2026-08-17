// index.css MUST stay the first import: it emits the design tokens and the
// global reset, which must land BEFORE any component's rules in the bundle.
// Importing it after App reverses that order (task 09).
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ApplicationStore } from './stores/ApplicationStore'
import { StoreProvider } from './stores/context'
import { installBridge } from './stores/bridge/zustandBridge'

// The ONE ApplicationStore of the app, constructed here and passed in — never
// a module-level singleton (task 14). Tests and Storybook build their own.
const store = new ApplicationStore({ autoSaveEnabled: true })

// Phase A bridge: MobX mirrors Zustand until each slice flips (tasks 14-38).
// App-lifetime — the disposer is intentionally unused here.
installBridge(store)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider store={store}>
      <App />
    </StoreProvider>
  </StrictMode>,
)
