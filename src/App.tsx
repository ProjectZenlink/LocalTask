import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import Signup from './pages/Signup'
import Login from './pages/Login'
import Verify from './pages/Verify'
import BuildProfile from './pages/BuildProfile'
import OnboardingPhone from './pages/OnboardingPhone'
import OnboardingKYC from './pages/OnboardingKYC'
import Settings from './pages/Settings'
import PostTask from './pages/PostTask'
import TaskBoard from './pages/TaskBoard'
import TaskDetail from './pages/TaskDetail'
import Dashboard from './pages/Dashboard'
import Admin from './pages/Admin'

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/build-profile" element={<ProtectedRoute><BuildProfile /></ProtectedRoute>} />
        <Route path="/onboarding/phone" element={<ProtectedRoute><OnboardingPhone /></ProtectedRoute>} />
        <Route path="/onboarding/kyc" element={<ProtectedRoute><OnboardingKYC /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
        <Route path="/post" element={<ProtectedRoute><PostTask /></ProtectedRoute>} />
        <Route path="/tasks" element={<ProtectedRoute><TaskBoard /></ProtectedRoute>} />
        <Route path="/tasks/:id" element={<ProtectedRoute><TaskDetail /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
      </Routes>
    </Layout>
  )
}
