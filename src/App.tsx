import { useEffect, useState } from 'react'
import { Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'
import PersistenceManager from './components/PersistenceManager'
import { db } from './db'
import type { SyncState, UserLogin } from 'dexie-cloud-addon'

/** Notebook actif — l'application gère un seul carnet de notes pour l'instant. */
const ACTIVE_NOTEBOOK_ID = 'default'

// ---------------------------------------------------------------------------
// Indicateur de synchronisation Dexie Cloud
// ---------------------------------------------------------------------------
const SyncStatus = () => {
  const [syncState, setSyncState] = useState<SyncState>(
    () => db.cloud.syncState.value
  )
  const [user, setUser] = useState<UserLogin>(
    () => db.cloud.currentUser.value
  )
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const syncSub = db.cloud.syncState.subscribe(setSyncState)
    const userSub = db.cloud.currentUser.subscribe(setUser)

    return () => {
      syncSub.unsubscribe()
      userSub.unsubscribe()
    }
  }, [])

  const handleAuth = async () => {
    setBusy(true)
    try {
      if (user.isLoggedIn) {
        await db.cloud.logout()
      } else {
        await db.cloud.login()
      }
    } catch (error) {
      // La connexion peut échouer si le serveur est injoignable (CORS, hors ligne…)
      // Ce n'est pas bloquant — l'app fonctionne en local.
      console.warn('Connexion au cloud impossible :', error)
    } finally {
      setBusy(false)
    }
  }

  // ---- État de la sync -------------------------------------------------
  const { status, phase } = syncState

  let statusClass = 'sync-status__dot'
  let label: string

  if (status === 'connected' || status === 'disconnected') {
    if (phase === 'in-sync') {
      statusClass += ' sync-status__dot--ok'
      label = 'Synchronisé'
    } else if (phase === 'pushing' || phase === 'pulling') {
      statusClass += ' sync-status__dot--syncing'
      label = 'Synchronisation…'
    } else if (phase === 'not-in-sync') {
      statusClass += ' sync-status__dot--syncing'
      label = 'En attente…'
    } else if (phase === 'error') {
      statusClass += ' sync-status__dot--error'
      label = 'Erreur'
    } else {
      statusClass += ' sync-status__dot--ok'
      label = 'Connecté'
    }
  } else if (status === 'connecting' || status === 'not-started') {
    statusClass += ' sync-status__dot--syncing'
    label = 'Connexion…'
  } else if (status === 'error') {
    statusClass += ' sync-status__dot--error'
    label = 'Cloud inaccessible'
  } else {
    statusClass += ' sync-status__dot--error'
    label = 'Hors ligne'
  }

  const userName = user.isLoggedIn
    ? user.email ?? user.name ?? 'Connecté'
    : 'Anonyme'

  return (
    <div className="sync-status">
      <span className={statusClass} />
      <span className="sync-status__label">{label}</span>
      <span className="sync-status__user">— {userName}</span>
      <button
        className="sync-status__btn"
        onClick={handleAuth}
        disabled={busy}
      >
        {user.isLoggedIn ? 'Se déconnecter' : 'Se connecter'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------
function App() {
  return (
    <div className="app-container">
      <Tldraw
        licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY}
      >
        <PersistenceManager notebookId={ACTIVE_NOTEBOOK_ID} />
      </Tldraw>

      <SyncStatus />
    </div>
  )
}

export default App