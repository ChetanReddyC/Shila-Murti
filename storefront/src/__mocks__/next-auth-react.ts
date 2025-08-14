export const useSession = () => ({ data: { user: { email: 'test@example.com' } }, status: 'authenticated' })
export const SessionProvider = ({ children }: { children: React.ReactNode }) => children as any
export const signIn = jest.fn()
export const signOut = jest.fn()


