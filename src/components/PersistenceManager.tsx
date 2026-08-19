import { type TLEditorSnapshot } from 'tldraw'
import { useEffect, useState } from 'react'
import { getSnapshot, loadSnapshot, useEditor } from 'tldraw'
import { db } from '../db'
import Dexie from 'dexie'

const SNAPSHOT_KEY = 'current'

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

  // ---- Phase 2 : sauvegarde automatique à chaque changement ------------
  useEffect(() => {
    if (!isLoaded) return

    const unsubscribe = editor.store.listen(
      async () => {
        try {
          const fullSnapshot = getSnapshot(editor.store)

          await db.snapshots.put({
            id: SNAPSHOT_KEY,
            data: fullSnapshot,
            notebookId,
            timestamp: Date.now(),
          })
        } catch (error) {
          console.error('Erreur lors de la sauvegarde :', error)
        }
      },
      { source: 'user', scope: 'document' }
    )

    return () => unsubscribe()
  }, [editor, isLoaded, notebookId])

  return null
}

export default PersistenceManager