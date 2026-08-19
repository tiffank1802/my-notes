import Dexie, { type Table } from 'dexie' // ✅ Utilisation de 'type Table' pour verbatimModuleSyntax

// Setup pour la base de données
interface SnapshotRecord {
  id: string // ID fixe pour l'historique
  data: any // Le snapshot JSON de tldraw
  notebookId: string // lier la sauvegarde à un notebook spécifique
  ownerId?: string // ID de l'utilisateur (optionel)
  timestamp: number // Timestamp de la dernière modification
  
}
// 2. Création de la classe de base de données
class NotesDatabase extends Dexie {
    // Déclaraton de la t able avec ses types (Record, clé primaire string)
  snapshots!: Table<SnapshotRecord, string>

  constructor() {
    super('notesDB')
    this.version(1).stores({
        // 3. Définition du schéma (version 1)
        // ON indexe notebookId et timestamp pour pouvoiir faire des requêtes rapides
    // Définir le schéma. Le '!' signifie que ce champ est requis pour le cloud
      snapshots: 'id, notebookId, timestamp'
    })
  }
}

export const db = new NotesDatabase()
