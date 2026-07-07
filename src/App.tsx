import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import AdminLayout from './admin/AdminLayout'
import AdminTasks from './admin/Tasks'
import AdminTaskNew from './admin/TaskNew'
import AdminTaskDetail from './admin/TaskDetail'
import AdminAms from './admin/Ams'
import AdminPool from './admin/Pool'
import AdminKyc from './admin/Kyc'
import FreelancerDetail from './admin/FreelancerDetail'
import ShareTask from './pages/ShareTask'
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

function Shell() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}

export default function App() {
  return (
    <Routes>
      {/* 客户只读分享页:无需登录,独立外壳 */}
      <Route path="/share/:token" element={<ShareTask />} />

      {/* 控制台:admin 专属,自带外壳,与 freelancer 界面完全分离 */}
      <Route path="/admin" element={<ProtectedRoute adminOnly><AdminLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/admin/tasks" replace />} />
        <Route path="tasks" element={<AdminTasks />} />
        <Route path="tasks/new" element={<AdminTaskNew />} />
        <Route path="tasks/:id" element={<AdminTaskDetail />} />
        <Route path="ams" element={<AdminAms />} />
        <Route path="pool" element={<AdminPool />} />
        <Route path="pool/:id" element={<FreelancerDetail />} />
        <Route path="kyc" element={<AdminKyc />} />
      </Route>

      {/* Freelancer / 公共外壳 */}
      <Route element={<Shell />}>
        <Route path="/" element={<Navigate to="/offers" replace />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/verify" element={<Verify />} />

        <Route path="/build-profile" element={<ProtectedRoute freelancerOnly><BuildProfile /></ProtectedRoute>} />
        <Route path="/onboarding/kyc" element={<ProtectedRoute freelancerOnly><OnboardingKYC /></ProtectedRoute>} />

        <Route path="/offers" element={<ProtectedRoute freelancerOnly requireOnboarded><Offers /></ProtectedRoute>} />
        <Route path="/tasks" element={<ProtectedRoute freelancerOnly requireOnboarded><Tasks /></ProtectedRoute>} />
        <Route path="/tasks/:id" element={<ProtectedRoute freelancerOnly requireOnboarded><TaskDetail /></ProtectedRoute>} />
        <Route path="/earnings" element={<ProtectedRoute freelancerOnly requireOnboarded><Earnings /></ProtectedRoute>} />
        <Route path="/me" element={<ProtectedRoute freelancerOnly requireOnboarded><Profile /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
