import { db } from '../db'
import { useObservable } from 'dexie-react-hooks'
import { useState } from 'react'

const AuthManager = () => {
  const currentUser = useObservable(() => db.cloud.currentUser)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)

  // ⚠️ CORRECTION : isLoggedIn, pas userId !
  // (un utilisateur anonyme a AUSSI un userId, mais isLoggedIn = false)
  const isLoggedIn = currentUser?.isLoggedIn === true

  const loginWithEmail = async () => {
    setLoading(true)
    try {
      // La fenêtre OTP de Dexie Cloud s'ouvre automatiquement
      // et gère la saisie du code reçu par email
      await db.cloud.login({
        grant_type: 'otp',
        email,
      })
    } catch (error) {
      console.error('Erreur de connexion:', error)
      alert('Erreur lors de la connexion')
    } finally {
      setLoading(false)
    }
  }

  const loginDemo = async () => {
    setLoading(true)
    try {
      await db.cloud.login({ grant_type: 'demo' })
    } catch (error) {
      console.error('Erreur de connexion démo:', error)
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    await db.cloud.logout()
  }

  if (!isLoggedIn) {
    return (
      <div style={{
        padding: '20px',
        background: '#f5f5f5',
        borderBottom: '1px solid #ddd',
        display: 'flex',
        gap: '10px',
        alignItems: 'center'
      }}>
        <h3 style={{ margin: 0 }}>Connexion requise pour synchroniser</h3>
        <input
          type="email"
          placeholder="votre@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: '8px', flex: 1, maxWidth: '300px' }}
        />
        <button
          onClick={loginWithEmail}
          disabled={loading || !email}
          style={{ padding: '8px 16px' }}
        >
          {loading ? 'Envoi...' : 'Connexion par email'}
        </button>
        <button
          onClick={loginDemo}
          disabled={loading}
          style={{ padding: '8px 16px', background: '#999' }}
        >
          Mode démo
        </button>
      </div>
    )
  }

  return (
    <div style={{
      padding: '10px 20px',
      background: '#e8f5e9',
      borderBottom: '1px solid #4caf50',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <span>
        ✅ Connecté: <strong>{currentUser.name || currentUser.email || 'Utilisateur démo'}</strong>
      </span>
      <button onClick={logout} style={{ padding: '6px 12px' }}>
        Déconnexion
      </button>
    </div>
  )
}

export default AuthManager