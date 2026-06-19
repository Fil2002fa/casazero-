import { LoginForm } from './LoginForm'

type SearchParams = Promise<{ invite?: string; error?: string }>

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { invite, error } = await searchParams
  return <LoginForm invite={invite ?? null} error={error ?? null} />
}
