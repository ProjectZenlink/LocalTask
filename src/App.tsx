import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Signup from './pages/Signup'
import Login from './pages/Login'
import Verify from './pages/Verify'
import BuildProfile from './pages/BuildProfile'
import OnboardingKYC from './pages/OnboardingKYC'
import Offers from './pages/Offers'
import Tasks from './pages/Tasks'
import TaskDetail from './pages/TaskDetail'
import Earnings from './pages/Earnings'
import Profile from './pages/Profile'
import Admin from './pages/Admin'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/offers" replace />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/verify" element={<Verify />} />

        <Route path="/build-profile" element={<ProtectedRoute><BuildProfile /></ProtectedRoute>} />
        <Route path="/onboarding/kyc" element={<ProtectedRoute><OnboardingKYC /></ProtectedRoute>} />

        <Route path="/offers" element={<ProtectedRoute requireOnboarded><Offers /></ProtectedRoute>} />
        <Route path="/tasks" element={<ProtectedRoute requireOnboarded><Tasks /></ProtectedRoute>} />
        <Route path="/tasks/:id" element={<ProtectedRoute requireOnboarded><TaskDetail /></ProtectedRoute>} />
        <Route path="/earnings" element={<ProtectedRoute requireOnboarded><Earnings /></ProtectedRoute>} />
        <Route path="/me" element={<ProtectedRoute requireOnboarded><Profile /></ProtectedRoute>} />

        <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
