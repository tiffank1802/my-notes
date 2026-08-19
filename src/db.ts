import Dexie, { type Table } from 'dexie' // ✅ Utilisation de 'type Table' pour verbatimModuleSyntax
import { dexieCloud } from 'dexie-cloud-addon';

// Setup pour la base de données
interface SnapshotRecord {
  id: string // ID fixe pour l'historique
  data: any // Le snapshot JSON de tldraw
  notebookId: string // lier la sauvegarde à un notebook spécifique
  ownerId?: string // ID de l'utilisateur (optionel)
  updatedAt:number // Timestamp de la dernière modification
  
}
// 2. Création de la classe de base de données
class NotesDatabase extends Dexie {
    // Déclaraton de la t able avec ses types (Record, clé primaire string)
  snapshots!: Table<SnapshotRecord, string>

  constructor() {
    // Ajout de l'addon dexieCloud
    super('notesDB',{addons:[dexieCloud]})
    this.version(1).stores({
        // 3. Définition du schéma (version 1)
        // ON indexe notebookId et updateAt pour pouvoiir faire des requêtes rapides
    // Définir le schéma. Le '!' signifie que ce champ est requis pour le cloud
      snapshots: 'id, notebookId, updatedAt'
      // Configurer la connexion au cloud
    })
    
    this.cloud.configure({
      databaseUrl:'https://z66l856yx.dexie.cloud',
      requireAuth: false,
    })
  }
}

export const db = new NotesDatabase()
