import { useAuth } from '../context/AuthContext'
import { AppLayout, Button } from '../styles'

export default function DashboardPage() {
  const { user, logout } = useAuth()
  return (
    <AppLayout>
      <div style={{ textAlign:'center', paddingTop:'4rem' }}>
        <h1 style={{ fontSize:'1.875rem', fontWeight:800, color:'#111827', marginBottom:'0.5rem' }}>
          Welcome, {user?.fullName}
        </h1>
        <p style={{ color:'#6b7280', marginBottom:'2rem' }}>
          Dashboard coming soon. Role: <strong>{user?.role}</strong>
        </p>
        <Button variant="secondary" onClick={logout}>Sign out</Button>
      </div>
    </AppLayout>
  )
}
