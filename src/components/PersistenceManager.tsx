import  { useEffect, useState } from 'react'
import { getSnapshot, loadSnapshot, useEditor } from 'tldraw'
import { db } from '../db'

interface PersistenceManagerProps{
    notebookId: string // On passe l'ID du carnet de notes actif
}
const PersistenceManager = ({notebookId}:PersistenceManagerProps) => {
    const editor=useEditor()
    const [isLoaded,setIsLoaded]=useState(false)

    // Phase1: Chargement au démarrage

    useEffect(()=>{
        const loadSavedData=async ()=>{
            try{
                // On cherche le snapshot avec l'ID 'current' pour ce notebook
                const saved= await db.snapshots.get({id:'current',notebookId})

                if(saved?.data){
                    // On injecte les données dans le store de tldraw
                    loadSnapshot(editor.store, saved.data)
                }
            }catch(error){
                console.error("Erreur lors du chargement des données:", error)
            }finally{
                // On marque le chargement comme terminé, qu'il y ait des données ou pas
                setIsLoaded(true)
            }
        }
        loadSavedData()
    },[editor,notebookId]) // se ré-exécute si le notebook ou l'éditeur change

    // Phase 2: Sauvegarde automatique
    useEffect(()=>{
        // On n'écoute les changements QUE si les données initiales sont chargées
        if(!isLoaded) return
        const unsubscribe=editor.store.listen(
            async () => {
                // 1. On récupère l'état COMPLET et actuel du canvas
                const fullSnapshot=getSnapshot(editor.store)

                // 2. On recupère l'ID utilisateur de manière sécurisée (si Dexie Cloud est actif)
                const currentUserId=(db.cloud as any)?.id || 'anonymous'

                // 3. On sauvegarde (ou met à jour) le record.
                // IMPORTANT: On utilise .put() et on .add().
                // .put() écrase l'ancien record 'current' s'il existe, evitant les doublons infinis
                await db.snapshots.put({
                    id:'current',
                    data:fullSnapshot,
                    notebookId,
                    ownerId:currentUserId,
                    updatedAt:Date.now()
                })
            },
            // On écoute uniquement les actions de l'utilisateur sur le document
            {source:'user',scope:'document'}
        )
        // Nettoyage: on arrête d'écouter quand le composant est détruit
        return()=> unsubscribe()
    },[editor,isLoaded,notebookId])
  return null
}
export default PersistenceManager