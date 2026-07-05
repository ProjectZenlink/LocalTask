import { Link } from 'react-router-dom'
import { PageHeading, Card, Button } from '../components/ui'

export default function OnboardingPhone() {
  return (
    <div className="mx-auto max-w-md">
      <PageHeading sub="We verify each phone number to keep the marketplace free of duplicate and fake accounts.">
        Phone verification
      </PageHeading>
      <Card className="p-5">
        <p className="text-sm text-muted">
          Phone verification is being set up and will be required here soon. For now you can continue to the next step.
        </p>
      </Card>
      <Link to="/onboarding/kyc">
        <Button className="mt-5 w-full">Continue</Button>
      </Link>
    </div>
  )
}
