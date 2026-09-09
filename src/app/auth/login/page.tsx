import { LoginForm } from './LoginForm'

type SearchParams = Promise<{ invite?: string; error?: string; next?: string }>

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { invite, error, next } = await searchParams
  return <LoginForm invite={invite ?? null} error={error ?? null} next={next ?? null} />
}
