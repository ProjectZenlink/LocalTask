import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import ForceWizard from './components/ForceWizard'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Landing from './pages/Landing'

/* v85.7 · 路由分包:访客首载只含 Landing/Login/Signup 与公共壳;
 * 三角色工作区与重页面各自成块,首次进入时按需加载。 */
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const AdminLayout = lazy(() => import('./admin/AdminLayout'))
const AdminTasks = lazy(() => import('./admin/Tasks'))
const AdminTaskNew = lazy(() => import('./admin/TaskNew'))
const AdminTaskDetail = lazy(() => import('./admin/TaskDetail'))
const AdminAms = lazy(() => import('./admin/Ams'))
const AdminPool = lazy(() => import('./admin/Pool'))
const AdminKyc = lazy(() => import('./admin/Kyc'))
const AdminAccounts = lazy(() => import('./admin/Accounts'))
const AdminMessages = lazy(() => import('./admin/Messages'))
const AdminPayouts = lazy(() => import('./admin/Payouts'))
const AdminMe = lazy(() => import('./admin/Me'))
const AdminLeads = lazy(() => import('./admin/Leads'))
const FreelancerDetail = lazy(() => import('./admin/FreelancerDetail'))
const CommissionReview = lazy(() => import('./admin/CommissionReview'))
const AmLayout = lazy(() => import('./am/AmLayout'))
const AmFreelancers = lazy(() => import('./am/Freelancers'))
const AmBoard = lazy(() => import('./am/FreelancerBoard'))
const AmPool = lazy(() => import('./am/Pool'))
const AmFreelancerProfile = lazy(() => import('./am/FreelancerProfile'))
const AmWallet = lazy(() => import('./am/Wallet'))
const AmMe = lazy(() => import('./am/Me'))
const AmLeads = lazy(() => import('./am/Leads'))
const AmMessages = lazy(() => import('./am/Messages'))
const AmTasks = lazy(() => import('./am/Tasks'))
const AmTaskNew = lazy(() => import('./am/TaskNew'))
const AmTaskDetail = lazy(() => import('./am/TaskDetail'))
const FreelancerMessages = lazy(() => import('./pages/Messages'))
const ShareTask = lazy(() => import('./pages/ShareTask'))
const StaffJoin = lazy(() => import('./pages/StaffJoin'))
const StaffWaiting = lazy(() => import('./pages/StaffWaiting'))
const Join = lazy(() => import('./pages/Join'))
const Terms = lazy(() => import('./pages/Terms'))
const Privacy = lazy(() => import('./pages/Privacy'))
const Verify = lazy(() => import('./pages/Verify'))
const Confirm = lazy(() => import('./pages/Confirm'))
const Forgot = lazy(() => import('./pages/Forgot'))
const ResetPassword = lazy(() => import('./pages/ResetPassword'))
const BuildProfile = lazy(() => import('./pages/BuildProfile'))
const OnboardingKYC = lazy(() => import('./pages/OnboardingKYC'))
const Tasks = lazy(() => import('./pages/Tasks'))
const TaskDetail = lazy(() => import('./pages/TaskDetail'))
const Earnings = lazy(() => import('./pages/Earnings'))
const Profile = lazy(() => import('./pages/Profile'))
const EnhancedKyc = lazy(() => import('./pages/EnhancedKyc'))
const ChangePassword = lazy(() => import('./pages/ChangePassword'))

/** 分块加载间隙的安静回退:纸色 + 单点呼吸,与启动屏同族。 */
function RouteFall() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-petrol/60" />
      <span className="sr-only">Loading</span>
    </div>
  )
}

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
    <Suspense fallback={<RouteFall />}>
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
        <Route path="/change-password" element={<ProtectedRoute><ChangePassword /></ProtectedRoute>} />
        <Route path="/me" element={<ProtectedRoute freelancerOnly requireOnboarded><Profile /></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute freelancerOnly requireOnboarded><FreelancerMessages /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </Suspense>
    </>
  )
}
