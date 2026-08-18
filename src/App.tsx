import { Tldraw, useEditor, getSnapshot, loadSnapshot } from 'tldraw' // ✅ Ajout de getSnapshot et loadSnapshot
import 'tldraw/tldraw.css'
import { useEffect, useState } from 'react'
import Dexie, { type Table } from 'dexie' // ✅ Utilisation de 'type Table' pour verbatimModuleSyntax

// Setup pour la base de données
interface SnapshotRecord {
  id: string
  data: any
  timestamp: number
}

class NotesDatabase extends Dexie {
  snapshots!: Table<SnapshotRecord, string>

  constructor() {
    super('notesDB')
    this.version(1).stores({
      snapshots: 'id, timestamp'
    })
  }
}

const db = new NotesDatabase()

// Composante qui charge et sauvegarde les données
const PersistenceManager = () => {
  const editor = useEditor()
  const [isLoaded, setIsLoaded] = useState(false)

  // Chargement au démarrage
  useEffect(() => {
    const loadSavedData = async () => {
      const saved = await db.snapshots.get('current')
      if (saved?.data) {
        // ✅ Correction : loadSnapshot est une fonction qui prend le store en argument
        loadSnapshot(editor.store, saved.data)
      }
      setIsLoaded(true)
    }
    loadSavedData()
  }, [editor])

  // Sauvegarde à chaque changement
  useEffect(() => {
    if (!isLoaded) return

    const unsubscribe = editor.store.listen(
      async () => {
        // ✅ Correction : getSnapshot est une fonction qui prend le store en argument
        const fullSnapshot = getSnapshot(editor.store)
        
        await db.snapshots.put({
          id: 'current',
          data: fullSnapshot,
          timestamp: Date.now()
        })
      },
      { source: 'user', scope: 'document' }
    )
    
    return () => unsubscribe()
  }, [editor, isLoaded])
  
  return null
}

const App = () => {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Tldraw licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY}>
        <PersistenceManager />
      </Tldraw>
    </div>
  )
}

export default App