export const useRouter = () => ({
  push: jest.fn(),
  replace: jest.fn(),
  refresh: jest.fn(),
})

export const useSearchParams = () => ({
  get: (key: string) => null,
})


