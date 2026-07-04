import { Link } from 'react-router-dom'

export default function Verify() {
  return (
    <div className="mx-auto max-w-sm text-center">
      <h1 className="mb-4 text-xl font-semibold">Email confirmation</h1>
      <p className="mb-6 text-sm text-gray-600">
        If you just confirmed your email, you can now log in.
      </p>
      <Link to="/login" className="rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-700">Go to login</Link>
    </div>
  )
}
