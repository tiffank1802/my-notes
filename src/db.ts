import Dexie from 'dexie'
import dexieCloud from 'dexie-cloud-addon'
import type { DexieCloudTable } from 'dexie-cloud-addon'
import type { TLEditorSnapshot } from 'tldraw'
import { dbUrl } from '../dexie-cloud.json'

/** Record d'un snapshot tldraw sauvegardé. */
export interface SnapshotRecord {
  /** ID fixe ('current') pour ce notebook — chaque utilisateur a son propre 'current' grâce à owner. */
  id: string
  /** Snapshot complet du document tldraw. */
  data: TLEditorSnapshot
  /** Lie la sauvegarde à un notebook spécifique. */
  notebookId: string
  /** Timestamp de la dernière modification. */
  timestamp: number
}

class NotesDatabase extends Dexie {
  /**
   * Table des snapshots.
   *
   * `DexieCloudTable` ajoute automatiquement les propriétés `owner` et `realmId`
   * gérées par Dexie Cloud pour la synchronisation multi-utilisateur.
   */
  snapshots!: DexieCloudTable<SnapshotRecord, 'id'>

  constructor() {
    super('notesDB', {
      addons: [dexieCloud],
    })

    this.version(1).stores({
      // id = clé primaire ; notebookId et timestamp indexés pour les requêtes rapides
      snapshots: 'id, notebookId, timestamp',
    })

    // Connexion à la base Dexie Cloud distante
    this.cloud.configure({
      databaseUrl: dbUrl,
      // requireAuth: false → l'app fonctionne immédiatement (mode anonyme),
      // l'utilisateur peut se connecter plus tard pour lier ses données à son compte
      requireAuth: false,
    })
  }
}

/** Instance unique de la base de données. */
export const db = new NotesDatabase()