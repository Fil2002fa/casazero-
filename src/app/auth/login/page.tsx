import { LoginForm } from './LoginForm'

type SearchParams = Promise<{ invite?: string }>

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { invite } = await searchParams
  return <LoginForm invite={invite ?? null} />
}
