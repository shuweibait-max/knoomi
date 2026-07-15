import { createContext, useContext, useState, useEffect } from 'react'
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { auth, db } from '../config/firebase'
import api from '../utils/api'
import { connectSocket, disconnectSocket } from '../utils/socket'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null)
  const [profile, setProfile]           = useState(null)
  const [loading, setLoading]           = useState(true)

  // Single source of truth for "are we logged in" — replaces the old
  // localStorage token bookkeeping.
  useEffect(() => {
    return onAuthStateChanged(auth, (fbUser) => {
      setFirebaseUser(fbUser)
      if (!fbUser) {
        setProfile(null)
        disconnectSocket()
        setLoading(false)
      }
    })
  }, [])

  // Extra profile fields (username, role, ai_name, ai_avatar) live in
  // Firestore, not in Firebase Auth itself — keep them reactive.
  useEffect(() => {
    if (!firebaseUser) return
    return onSnapshot(doc(db, 'users', firebaseUser.uid), (snap) => {
      setProfile(snap.exists() ? { id: firebaseUser.uid, ...snap.data() } : null)
      setLoading(false)
      if (snap.exists()) connectSocket()
    })
  }, [firebaseUser])

  const login = async (email, password) => {
    await signInWithEmailAndPassword(auth, email, password)
  }

  const register = async (username, email, password, role = 'user') => {
    await createUserWithEmailAndPassword(auth, email, password)
    const { data } = await api.post('/auth/profile-init', { username, role })
    // Set immediately so `user` is correct as soon as register() resolves,
    // rather than waiting on the Firestore listener round-trip.
    setProfile(data.user)
    return data.user
  }

  const logout = async () => {
    await firebaseSignOut(auth)
  }

  const updateUser = (updatedFields) => {
    setProfile(prev => (prev ? { ...prev, ...updatedFields } : prev))
  }

  const user = firebaseUser && profile ? { ...profile, email: firebaseUser.email } : null

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
