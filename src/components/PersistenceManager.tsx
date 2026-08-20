import { type TLEditorSnapshot } from 'tldraw'
import { useEffect, useState } from 'react'
import { getSnapshot, loadSnapshot, useEditor } from 'tldraw'
import { db } from '../db'
import Dexie from 'dexie'

const SNAPSHOT_KEY = 'current'

/** Délai de debounce avant écriture en base (évite d'écrire à chaque frame de caméra). */
const SAVE_DEBOUNCE_MS = 1000

// ---------------------------------------------------------------------------
// Migration one-shot depuis l'ancienne base locale (avant Dexie Cloud)
// ---------------------------------------------------------------------------
async function migrateLegacySnapshot(notebookId: string): Promise<void> {
  try {
    // On ne migre QUE si aucun snapshot n'existe encore pour ce notebook
    const hasData = await db.snapshots
      .where('notebookId')
      .equals(notebookId)
      .count()

    if (hasData > 0) return

    // Ouvre l'ancienne base (sans cloud addon) et tente de lire 'current'
    const legacyDb = new Dexie('notesDB')
    legacyDb.version(1).stores({ snapshots: 'id, timestamp' })
    const legacy = await legacyDb.table('snapshots').get(SNAPSHOT_KEY)
    legacyDb.close()

    if (!legacy?.data) return

    // Copie dans la nouvelle base avec le champ notebookId
    await db.snapshots.put({
      id: SNAPSHOT_KEY,
      data: legacy.data as TLEditorSnapshot,
      notebookId,
      timestamp:
        typeof legacy.timestamp === 'number' ? legacy.timestamp : Date.now(),
    })

    console.info(
      `[Persistence] Anciennes données migrées vers le notebook « ${notebookId} ».`
    )
  } catch (error) {
    // Échec silencieux : l'utilisateur repart avec une base neuve
    console.warn(
      '[Persistence] Migration des anciennes données impossible :',
      error
    )
  }
}

// ---------------------------------------------------------------------------
// Composant de persistance (sauvegarde / restauration)
// ---------------------------------------------------------------------------
interface PersistenceManagerProps {
  /** ID du carnet de notes actif. */
  notebookId: string
}

/**
 * Gère le chargement et la sauvegarde automatique du document tldraw
 * dans la base de données locale (IndexedDB) + synchronisation Dexie Cloud.
 */
const PersistenceManager = ({ notebookId }: PersistenceManagerProps) => {
  const editor = useEditor()
  const [isLoaded, setIsLoaded] = useState(false)

  // ---- Phase 1 : chargement au démarrage --------------------------------
  useEffect(() => {
    let cancelled = false

    const loadSavedData = async () => {
      try {
        // Migration one-shot depuis l'ancienne base locale
        await migrateLegacySnapshot(notebookId)

        // Charge le snapshot 'current' pour ce notebook
        const saved = await db.snapshots.get({
          id: SNAPSHOT_KEY,
          notebookId,
        })

        if (saved?.data) {
          loadSnapshot(editor.store, saved.data)
        }
      } catch (error) {
        console.error('Erreur lors du chargement des données :', error)
      } finally {
        if (!cancelled) setIsLoaded(true)
      }
    }

    loadSavedData()

    return () => {
      cancelled = true
    }
  }, [editor, notebookId])

  // ---- Phase 2 : sauvegarde automatique (debounced) --------------------
  // On écoute TOUS les changements utilisateur (document + session) :
  // document  → formes, dessins, texte…
  // session   → caméra (zoom/pan), outil actif, sélection, page courante…
  // Un debounce évite d'écrire en base à chaque mouvement de caméra.
  useEffect(() => {
    if (!isLoaded) return

    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    let isSaving = false
    let pendingSave = false

    const persist = async () => {
      if (isSaving) {
        // Une sauvegarde est en cours : on en relancera une à la fin
        pendingSave = true
        return
      }
      isSaving = true
      try {
        // getSnapshot capture le document ET l'état de session (caméra, outil…)
        const fullSnapshot = getSnapshot(editor.store)

        await db.snapshots.put({
          id: SNAPSHOT_KEY,
          data: fullSnapshot,
          notebookId,
          timestamp: Date.now(),
        })
      } catch (error) {
        console.error('Erreur lors de la sauvegarde :', error)
      } finally {
        isSaving = false
        // Des changements sont arrivés pendant l'écriture : on re-sauvegarde
        if (pendingSave) {
          pendingSave = false
          void persist()
        }
      }
    }

    const scheduleSave = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => void persist(), SAVE_DEBOUNCE_MS)
    }

    // source: 'user' + scope: 'all' → document ET session
    const unsubscribe = editor.store.listen(scheduleSave, {
      source: 'user',
      scope: 'all',
    })

    // Sauvegarde immédiate quand la page est masquée/fermée
    // (on capture ainsi la toute dernière position de caméra, même sans debounce)
    const flushOnExit = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      void persist()
    }
    document.addEventListener('pagehide', flushOnExit)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushOnExit()
    })

    return () => {
      unsubscribe()
      document.removeEventListener('pagehide', flushOnExit)
      document.removeEventListener('visibilitychange', flushOnExit)
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [editor, isLoaded, notebookId])

  return null
}

export default PersistenceManager