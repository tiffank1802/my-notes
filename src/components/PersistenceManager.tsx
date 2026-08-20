import { type TLEditorSnapshot } from 'tldraw'
import { useEffect, useRef, useState } from 'react'
import { getSnapshot, loadSnapshot, useEditor } from 'tldraw'
import { db } from '../db'
import Dexie from 'dexie'

const SNAPSHOT_KEY = 'current'

/** Délai de debounce avant écriture en base (évite d'écrire à chaque frame de caméra). */
const SAVE_DEBOUNCE_MS = 1000

// ---------------------------------------------------------------------------
// Récupérer les données depuis l'ancienne base locale (avant Dexie Cloud)
// ---------------------------------------------------------------------------
/**
 * Essaie de récupérer un snapshot depuis l'ancienne base `notesDB`
 * (celle qui existait avant le passage à Dexie Cloud, sans addon).
 * Retourne le snapshot ou `undefined`.
 */
async function pullLegacySnapshot(): Promise<TLEditorSnapshot | undefined> {
  try {
    const legacyDb = new Dexie('notesDB')
    legacyDb.version(1).stores({ snapshots: 'id, timestamp' })
    const legacy = await legacyDb.table('snapshots').get(SNAPSHOT_KEY)
    legacyDb.close()
    if (legacy?.data) {
      return legacy.data as TLEditorSnapshot
    }
  } catch {
    // L'ancienne base n'existe pas ou est illisible → ignore
  }
  return undefined
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
 *
 * Problème résolu : quand l'utilisateur passe du mode anonyme → connecté,
 * les données existantes (propriétaire = anonyme) deviennent invisibles car
 * Dexie Cloud filtre par owner. On force une sauvegarde immédiate lors de
 * la connexion pour réécrire le snapshot sous le nouveau propriétaire.
 */
const PersistenceManager = ({ notebookId }: PersistenceManagerProps) => {
  const editor = useEditor()
  const [isLoaded, setIsLoaded] = useState(false)
  // Référence partagée vers la fonction persist (utilisée par l'autosave ET le login)
  const persistRef = useRef<(() => Promise<void>) | undefined>(undefined)

  // ---- Phase 1 : chargement au démarrage --------------------------------
  useEffect(() => {
    let cancelled = false

    const loadSavedData = async () => {
      try {
        // 1 — Essayer de charger le snapshot pour l'utilisateur courant
        let saved = await db.snapshots.get({
          id: SNAPSHOT_KEY,
          notebookId,
        })

        // 2 — Si rien trouvé (première connexion, ou après login sans données),
        //     essayer l'ancienne base pré-cloud
        if (!saved?.data) {
          const legacy = await pullLegacySnapshot()
          if (legacy) {
            await db.snapshots.put({
              id: SNAPSHOT_KEY,
              data: legacy,
              notebookId,
              timestamp: Date.now(),
            })
            console.info(
              '[Persistence] Anciennes données migrées vers le notebook « ' +
                notebookId +
                ' ».'
            )

            // Re-essayer la lecture (maintenant le record a le bon owner)
            saved = await db.snapshots.get({
              id: SNAPSHOT_KEY,
              notebookId,
            })
          }
        }

        // 3 — Restaurer le document dans l'éditeur
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

    // Stocke la fonction pour que Phase 3 (login) puisse l'appeler
    persistRef.current = persist

    const scheduleSave = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => void persist(), SAVE_DEBOUNCE_MS)
    }

    // source: 'user' + scope: 'all' → document ET session
    const unsubscribe = editor.store.listen(scheduleSave, {
      source: 'user',
      scope: 'all',
    })

    // Sauvegarde immédiate à la fermeture de la page
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

  // ---- Phase 3 : transfert des données lors de la connexion ------------
  // Quand l'utilisateur passe d'anonyme → connecté, on force une
  // sauvegarde immédiate pour réécrire le snapshot sous le nouveau
  // propriétaire (owner = email).
  // Sans ça, les données restent invisibles car encore attachées à l'ID
  // anonyme, et le même compte email verrait des documents différents
  // sur chaque appareil.
  useEffect(() => {
    let wasLoggedIn = Boolean(db.cloud.currentUser.value.isLoggedIn)

    const sub = db.cloud.currentUser.subscribe((user) => {
      const isNowLoggedIn = Boolean(user.isLoggedIn)

      // Transition : anonyme → connecté
      if (isNowLoggedIn && !wasLoggedIn && persistRef.current) {
        console.info(
          '[Persistence] Connexion détectée → sauvegarde sous le nouveau compte'
        )
        void persistRef.current()
      }

      wasLoggedIn = isNowLoggedIn
    })

    return () => sub.unsubscribe()
  }, [])

  return null
}

export default PersistenceManager