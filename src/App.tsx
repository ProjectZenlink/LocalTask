import ForceWizard from './components/ForceWizard'
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
import AdminAccounts from './admin/Accounts'
import AdminMessages from './admin/Messages'
import AdminPayouts from './admin/Payouts'
import AdminMe from './admin/Me'
import AmMessages from './am/Messages'
import FreelancerMessages from './pages/Messages'
import FreelancerDetail from './admin/FreelancerDetail'
import AmLayout from './am/AmLayout'
import AmFreelancers from './am/Freelancers'
import AmBoard from './am/FreelancerBoard'
import AmPool from './am/Pool'
import AmFreelancerProfile from './am/FreelancerProfile'
import AmWallet from './am/Wallet'
import AmMe from './am/Me'
import AmLeads from './am/Leads'
import AdminLeads from './admin/Leads'
import ShareTask from './pages/ShareTask'
import StaffJoin from './pages/StaffJoin'
import StaffWaiting from './pages/StaffWaiting'
import CommissionReview from './admin/CommissionReview'
import AmTasks from './am/Tasks'
import AmTaskNew from './am/TaskNew'
import AmTaskDetail from './am/TaskDetail'
import Signup from './pages/Signup'
import Join from './pages/Join'
import Login from './pages/Login'
import Landing from './pages/Landing'
import Terms from './pages/Terms'
import Privacy from './pages/Privacy'
import Verify from './pages/Verify'
import Confirm from './pages/Confirm'
import Forgot from './pages/Forgot'
import ResetPassword from './pages/ResetPassword'
import BuildProfile from './pages/BuildProfile'
import OnboardingKYC from './pages/OnboardingKYC'
import Tasks from './pages/Tasks'
import TaskDetail from './pages/TaskDetail'
import Earnings from './pages/Earnings'
import Profile from './pages/Profile'
import EnhancedKyc from './pages/EnhancedKyc'

function Shell() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  )
}

export default function App() {
  return (
    <>
      <ForceWizard />
    <Routes>
      {/* 客户只读分享页:无需登录,独立外壳 */}
      <Route path="/share/:token" element={<ShareTask />} />

      {/* 员工通道:隐藏注册页(全站无入口链接) + 等待激活页,独立外壳 */}
      <Route path="/staff/join" element={<StaffJoin />} />
      <Route path="/staff/waiting" element={<StaffWaiting />} />

      {/* 控制台:admin 专属,自带外壳,与 freelancer 界面完全分离 */}
      <Route path="/admin" element={<ProtectedRoute adminOnly><AdminLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/admin/tasks" replace />} />
        <Route path="tasks" element={<AdminTasks />} />
        <Route path="tasks/new" element={<AdminTaskNew />} />
        <Route path="tasks/:id" element={<AdminTaskDetail />} />
        <Route path="ams" element={<AdminAms />} />
        <Route path="pool" element={<AdminPool />} />
        <Route path="pool/:id" element={<FreelancerDetail />} />
        <Route path="leads" element={<AdminLeads />} />
        <Route path="kyc" element={<AdminKyc />} />
        <Route path="companies" element={<Navigate to="/admin/accounts?cat=companies" replace />} />
        <Route path="accounts" element={<AdminAccounts />} />
        <Route path="messages" element={<AdminMessages />} />
        <Route path="payouts" element={<AdminPayouts />} />
        <Route path="me" element={<AdminMe />} />
        <Route path="review" element={<CommissionReview />} />
      </Route>

      {/* AM 工作台:账户经理专属 */}
      <Route path="/am" element={<ProtectedRoute amOnly><AmLayout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/am/my" replace />} />
        <Route path="tasks" element={<AmTasks />} />
        <Route path="tasks/new" element={<AmTaskNew />} />
        <Route path="tasks/:id" element={<AmTaskDetail />} />
        <Route path="my" element={<AmFreelancers />} />
        <Route path="f/:id" element={<AmBoard />} />
        <Route path="pool" element={<AmPool />} />
        <Route path="pool/:id" element={<AmFreelancerProfile />} />
        <Route path="leads" element={<AmLeads />} />
        <Route path="kyc" element={<AdminKyc />} />
        <Route path="accounts" element={<AdminAccounts />} />
        <Route path="companies" element={<Navigate to="/am/accounts?cat=companies" replace />} />
        <Route path="messages" element={<AmMessages />} />
        <Route path="payouts" element={<AdminPayouts />} />
        <Route path="wallet" element={<AmWallet />} />
        <Route path="me" element={<AmMe />} />
      </Route>

      {/* 独立公开页:自带页头页脚,不进应用外壳 */}
      <Route path="/" element={<Landing />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />

      {/* 公开线索引导页:免注册直连顾问(v62) */}
      <Route path="/join" element={<Join />} />

      {/* 独立认证页:无站点导航(m24/C1) */}
      <Route path="/signup" element={<Signup />} />
      <Route path="/login" element={<Login />} />

      {/* Freelancer / 公共外壳 */}
      <Route element={<Shell />}>
        <Route path="/verify" element={<Verify />} />
        <Route path="/confirm" element={<Confirm />} />
        <Route path="/forgot" element={<Forgot />} />
        <Route path="/reset" element={<ResetPassword />} />

        <Route path="/build-profile" element={<ProtectedRoute freelancerOnly><BuildProfile /></ProtectedRoute>} />
        <Route path="/onboarding/kyc" element={<ProtectedRoute freelancerOnly><OnboardingKYC /></ProtectedRoute>} />

        <Route path="/tasks" element={<ProtectedRoute freelancerOnly requireOnboarded><Tasks /></ProtectedRoute>} />
        <Route path="/tasks/:id" element={<ProtectedRoute freelancerOnly requireOnboarded><TaskDetail /></ProtectedRoute>} />
        <Route path="/earnings" element={<ProtectedRoute freelancerOnly requireOnboarded><Earnings /></ProtectedRoute>} />
        <Route path="/enhanced-kyc" element={<ProtectedRoute freelancerOnly requireOnboarded><EnhancedKyc /></ProtectedRoute>} />
        <Route path="/me" element={<ProtectedRoute freelancerOnly requireOnboarded><Profile /></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute freelancerOnly requireOnboarded><FreelancerMessages /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </>
  )
}
